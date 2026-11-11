"""Barrido de mercados: ¿dónde habría ganado el bot comprando favoritos como maker? Solo datos públicos.

Para cada serie baja los mercados ya decididos de las últimas 6 semanas y su histórico minuto a minuto
(velas de 1 minuto, pedidas por lotes) y simula la regla del bot: cuando un lado cotiza como favorito
(88–97¢ con poco hueco entre compra y venta) deja una orden 1¢ mejor que la mejor y la da por llenada
si en el minuto siguiente alguien vende a ese precio o más barato. Una compra por partido (o por día y
ciudad en el clima), la primera que se llena.

Variantes: tal cual, esperando a que el favorito lleve 10, 20 o 40 minutos seguidos por encima del
suelo, y con el suelo en 92¢.

    python kalshi_sim/favscan.py KXATPCHALLENGERMATCH KXUFCFIGHT

Imprime una línea `RESULT {...}` por serie con cada compra: [precio en milésimas, ganó, minutos hasta
el final, día].
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import time

import requests

API = "https://api.elections.kalshi.com/trade-api/v2"
END = dt.datetime(2026, 11, 10, 12, tzinfo=dt.timezone.utc)
START = END - dt.timedelta(days=42)
VARIANTS = {
    "base": {},
    "s10": {"stable": 10},
    "s20": {"stable": 20},
    "s40": {"stable": 40},
    "lo92": {"lo": 0.92},
    "lo92s10": {"lo": 0.92, "stable": 10},
}
session = requests.Session()
last_candles = [0.0]


def get(path: str, **params):
    params = {k: v for k, v in params.items() if v is not None}
    for attempt in range(80):
        try:
            resp = session.get(API + path, params=params, timeout=60)
        except requests.RequestException:
            time.sleep(2 + attempt)
            continue
        if resp.status_code == 429:
            time.sleep(1.5)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Kalshi no contesta: {path}")


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def ts(text):
    return int(dt.datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()) if text else None


def settled(series: str) -> list:
    out, cursor = [], None
    for _ in range(60):
        data = get(
            "/markets", series_ticker=series, limit=1000, cursor=cursor,
            min_close_ts=int(START.timestamp()), max_close_ts=int(END.timestamp()),
        )  # fmt: skip
        out.extend(data.get("markets") or [])
        cursor = data.get("cursor")
        if not cursor:
            break
        time.sleep(0.3)
    return [m for m in out if m.get("result") in ("yes", "no") and m.get("close_time")]


def candles(tickers: list, start: int, end: int) -> dict:
    wait = 1.2 - (time.time() - last_candles[0])
    if wait > 0:
        time.sleep(wait)
    data = get("/markets/candlesticks", market_tickers=",".join(tickers), start_ts=start, end_ts=end, period_interval=1)
    last_candles[0] = time.time()
    return {m.get("market_ticker"): m.get("candlesticks") or [] for m in data.get("markets") or []}


def history(markets: list, hours: int) -> dict:
    """ticker → minutos en los que un lado cotizaba a 80¢ o más: {ts: (bid, ask, mínimo, máximo)}."""
    markets = sorted(markets, key=lambda m: ts(m["close_time"]))
    parts, cur = [], []
    for m in markets:
        trial = cur + [m]
        minutes = (ts(trial[-1]["close_time"]) - ts(trial[0]["close_time"])) // 60 + hours * 60 + 2
        if cur and (minutes * len(trial) > 9500 or len(trial) > 90):
            parts.append(cur)
            cur = [m]
        else:
            cur = trial
    if cur:
        parts.append(cur)
    out = {}
    for part in parts:
        ends = [ts(m["close_time"]) for m in part]
        got = candles([m["ticker"] for m in part], min(ends) - hours * 3600, max(ends))
        for m in part:
            end, rows = ts(m["close_time"]), {}
            for c in got.get(m["ticker"]) or []:
                t = c["end_period_ts"]
                if t < end - hours * 3600:
                    continue
                bid, ask = num((c.get("yes_bid") or {}).get("close_dollars")), num((c.get("yes_ask") or {}).get("close_dollars"))
                if bid is None or ask is None or not (bid >= 0.80 or ask <= 0.20):
                    continue
                price = c.get("price") or {}
                rows[t] = (bid, ask, num(price.get("low_dollars")), num(price.get("high_dollars")))
            out[m["ticker"]] = rows
    return out


def entry(rows: dict, end: int, ref: int, window_h: float, lo=0.88, hi=0.97, spread=0.04, last_min=15, stable=0):
    """Primera compra que se habría llenado: (precio, lado, minutos hasta el final real)."""
    for t in sorted(rows):
        bid, ask = rows[t][0], rows[t][1]
        left = (ref - t) / 60
        if left > window_h * 60 or left < last_min:
            continue
        if bid > hi or 1 - ask > hi or ask - bid > spread + 1e-9:
            continue
        if lo - 1e-9 <= bid <= hi:
            side, paid = "yes", min(bid + 0.01 if bid + 0.01 < ask - 1e-9 else bid, hi)
        elif lo - 1e-9 <= 1 - ask <= hi:
            sell = max(ask - 0.01 if ask - 0.01 > bid + 1e-9 else ask, 1 - hi)
            side, paid = "no", 1 - sell
        else:
            continue
        steady = True
        for k in range(1, stable + 1):
            prev = rows.get(t - 60 * k)
            if prev is None or (prev[0] if side == "yes" else 1 - prev[1]) < lo - 1e-9:
                steady = False
                break
        if not steady:
            continue
        nxt = rows.get(t + 60)
        if nxt is None:
            if t + 60 >= end:
                continue
            filled = True  # en un minuto cayó por debajo de 80¢: le habrían vendido
        elif side == "yes":
            filled = nxt[2] is not None and nxt[2] <= paid + 1e-9
        else:
            filled = nxt[3] is not None and nxt[3] >= (1 - paid) - 1e-9
        if filled:
            return round(paid, 4), side, (end - t) / 60
    return None


def scan(series: str) -> dict:
    weather = series.startswith(("KXHIGH", "KXLOW"))
    markets = [m for m in settled(series) if (num(m.get("volume_fp")) or 0) >= 1000]
    if weather:
        chosen, hours, window = markets, 14, 12.0
    else:
        best: dict = {}
        for m in markets:  # un mercado por partido: el de más volumen
            event = m.get("event_ticker")
            if event not in best or (num(m.get("volume_fp")) or 0) > (num(best[event].get("volume_fp")) or 0):
                best[event] = m
        chosen, hours, window = list(best.values()), 8, 6.0
    print(f"{series}: {len(markets)} mercados decididos, {len(chosen)} a simular", file=sys.stderr, flush=True)
    rows = history(chosen, hours)
    result = {"series": series, "markets": len(chosen), "events": len({m.get("event_ticker") for m in chosen}), "trades": {}}
    for name, options in VARIANTS.items():
        by_event: dict = {}
        for m in chosen:
            end = ts(m["close_time"])
            expected = ts(m.get("expected_expiration_time"))
            ref = end if weather or not expected or expected < end - 12 * 3600 else min(expected, end)
            got = entry(rows.get(m["ticker"]) or {}, end, ref, window, **options)
            if not got:
                continue
            paid, side, to_end = got
            trade = [round(paid * 1000), int(m["result"] == side), round(to_end), (end - int(START.timestamp())) // 86400]
            key = m.get("event_ticker") if weather else m["ticker"]
            if key not in by_event or trade[2] > by_event[key][2]:  # en el clima, la primera del día
                by_event[key] = trade
        result["trades"][name] = list(by_event.values())
    return result


def main() -> None:
    for series in sys.argv[1:]:
        try:
            print("RESULT " + json.dumps(scan(series), separators=(",", ":")), flush=True)
        except Exception as exc:  # noqa: BLE001 - una serie que falla no para a las demás
            print(f"ERROR {series}: {exc}", flush=True)


if __name__ == "__main__":
    main()
