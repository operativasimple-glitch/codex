"""Simulación con dinero virtual: ¿cómo le habría ido al bot de Kalshi con un saldo dado?

No envía órdenes ni usa ninguna clave: solo lee datos públicos de mercados ya liquidados.

  fetch     descarga los mercados liquidados de los últimos N días y, de cada uno, las
            operaciones de la ventana en la que opera el bot (partidos: las 6 h antes del
            final; clima: las 40 h antes del cierre; nunca los últimos 15 minutos). Se
            guardan las compras del favorito entre 88 y 97¢ hechas por quien esperaba en
            el libro (maker), que son las que el bot podría haberse llevado.
  simulate  recorre todo en orden de tiempo con un saldo inicial y los límites del bot:
            contratos por orden y por mercado, dinero comprometido máximo, un mercado por
            partido y hasta 4 tramos por día de clima. El dinero se bloquea al comprar y
            vuelve con la liquidación.

Hipótesis optimista: el bot se lleva las primeras ventas del favorito en la banda (va
un tick por delante del resto). En la realidad compite con otros, así que compraría menos.
"""

from __future__ import annotations

import argparse
import heapq
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import ROUND_CEILING, Decimal
from pathlib import Path

GAME_SERIES = ["KXMLBGAME", "KXNFLGAME", "KXNHLGAME", "KXNBAGAME", "KXNCAAFGAME"]
WEATHER_SERIES = ["KXHIGHLAX", "KXHIGHNY", "KXHIGHCHI", "KXHIGHMIA", "KXHIGHAUS", "KXHIGHDEN", "KXHIGHPHIL"]
BAND = (Decimal("0.88"), Decimal("0.97"))
MAKER_FEE = Decimal("0.0175")
CENT = Decimal("0.01")
ONE = Decimal("1")
SKIP_LAST_MINUTES = 15
WINDOW_HOURS = {"games": 6, "weather": 40}
PER_EVENT = {"games": 1, "weather": 4}


def group_of(series: str) -> str:
    return "weather" if series.startswith("KXHIGH") else "games"


# --------------------------------------------------------------------------
# Descarga (GitHub Actions, con la librería del bot)
# --------------------------------------------------------------------------


def fetch(group: str, days: int, out: str) -> None:
    sys.path.insert(0, str(Path.cwd()))
    from kalshi_bot.config import load_settings
    from kalshi_bot.models import parse_time, to_decimal

    client = load_settings().client()
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    hours = WINDOW_HOURS[group]
    rows, checked = [], 0
    for series in GAME_SERIES if group == "games" else WEATHER_SERIES:
        # Los que cerraron en el periodo (Kalshi solo filtra por cierre sin indicar el estado).
        markets = client.get_markets(
            status=None,
            series_ticker=series,
            min_close_ts=int(since.timestamp()),
            max_close_ts=int(now.timestamp()),
            limit=1000,
            max_pages=10,
        )
        markets = [m for m in markets if m.result in ("yes", "no") and m.market_type == "binary" and m.close_time]
        print(f"{series}: {len(markets)} mercados liquidados en {days} días", file=sys.stderr, flush=True)
        for m in markets:
            checked += 1
            if checked % 200 == 0:
                print(f"  {checked} mercados revisados", file=sys.stderr, flush=True)
            end = int(m.close_time.timestamp())
            try:
                trades = client.get_trades(
                    m.ticker, min_ts=end - hours * 3600, max_ts=end - SKIP_LAST_MINUTES * 60, max_pages=3
                )
            except Exception as exc:  # noqa: BLE001 - un mercado fallido no invalida el resto
                print(f"  {m.ticker}: {exc}", file=sys.stderr)
                continue
            fills = []
            for t in trades:
                if t.get("is_block_trade"):
                    continue
                price = to_decimal(t.get("yes_price_dollars"))
                count = to_decimal(t.get("count_fp"), to_decimal(t.get("count")))
                taker = t.get("taker_outcome_side") or t.get("taker_side")
                created = parse_time(t.get("created_time"))
                if price is None or count is None or count <= 0 or taker not in ("yes", "no") or created is None:
                    continue
                side = "no" if taker == "yes" else "yes"  # el maker compró el otro lado
                paid = price if side == "yes" else ONE - price
                if BAND[0] <= paid <= BAND[1]:
                    fills.append([created.timestamp(), side, str(paid), str(count)])
            if not fills:
                continue
            settled = parse_time(m.raw.get("settlement_ts")) or m.expected_end or m.close_time
            rows.append(
                {
                    "ticker": m.ticker,
                    "event": m.event_ticker,
                    "series": series,
                    "result": m.result,
                    "close": end,
                    "settle": max(int(settled.timestamp()), end),
                    "has_settlement_ts": bool(m.raw.get("settlement_ts")),
                    "fills": sorted(fills),
                }
            )
    Path(out).write_text(json.dumps({"group": group, "days": days, "generated": now.isoformat(), "markets": rows}))
    print(f"{group}: {len(rows)} mercados con compras posibles de {checked} revisados", file=sys.stderr)


# --------------------------------------------------------------------------
# Simulación (sin dependencias)
# --------------------------------------------------------------------------


def maker_fee(count: Decimal, price: Decimal) -> Decimal:
    return (MAKER_FEE * count * price * (ONE - price)).quantize(CENT, rounding=ROUND_CEILING)


def simulate(markets: list, *, cash: Decimal, order_size: int, max_position: int, max_exposure: Decimal) -> dict:
    start_cash = cash
    opportunities = []
    for i, m in enumerate(markets):
        for ts, side, paid, count in m["fills"]:
            opportunities.append((ts, i, side, Decimal(paid), Decimal(count)))
    opportunities.sort(key=lambda o: (o[0], o[1]))

    held: dict = {}  # índice de mercado -> {side, count, cost, fees}
    per_event: dict = defaultdict(set)
    pending: list = []  # (liquidación, índice)
    locked = Decimal("0")
    closed = []
    missed_for_money: set = set()
    peak = equity = cash
    max_drawdown = Decimal("0")
    locked_time = 0.0
    last_t = opportunities[0][0] if opportunities else 0.0

    def advance(t: float) -> None:
        nonlocal locked_time, last_t
        if t > last_t:
            locked_time += float(locked) * (t - last_t)
            last_t = t

    def mark() -> None:
        nonlocal peak, equity, max_drawdown
        equity = cash + locked
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, peak - equity)

    def settle_until(t: float) -> None:
        nonlocal cash, locked
        while pending and pending[0][0] <= t:
            when, i = heapq.heappop(pending)
            advance(when)
            pos = held.pop(i)
            m = markets[i]
            won = pos["side"] == m["result"]
            payout = pos["count"] if won else Decimal("0")
            cash += payout
            locked -= pos["cost"]
            closed.append(
                {
                    "when": when,
                    "group": group_of(m["series"]),
                    "count": pos["count"],
                    "cost": pos["cost"],
                    "fees": pos["fees"],
                    "net": payout - pos["cost"] - pos["fees"],
                }
            )
            mark()

    for ts, i, side, price, count in opportunities:
        settle_until(ts)
        advance(ts)
        m = markets[i]
        group = group_of(m["series"])
        pos = held.get(i)
        if pos is None:
            used = per_event[m["event"]]
            if m["settle"] <= ts or i in used or len(used) >= PER_EVENT[group]:
                continue  # ya liquidado, ya cerrado o sin hueco en el evento
            room = max_position
        else:
            if pos["side"] != side:
                continue
            room = max_position - int(pos["count"])
        want = min(int(count), order_size, room)
        if want <= 0:
            continue
        n = want
        n = min(n, int(max((max_exposure - locked) / price, 0)))
        while n > 0 and n * price + maker_fee(Decimal(n), price) > cash:
            n -= 1
        if n < want:
            missed_for_money.add(i)
        if n <= 0:
            continue
        qty = Decimal(n)
        fee = maker_fee(qty, price)
        cash -= qty * price + fee
        locked += qty * price
        if pos is None:
            pos = held[i] = {"side": side, "count": Decimal("0"), "cost": Decimal("0"), "fees": Decimal("0")}
            per_event[m["event"]].add(i)
            heapq.heappush(pending, (m["settle"], i))
        pos["count"] += qty
        pos["cost"] += qty * price
        pos["fees"] += fee
        mark()
    settle_until(math.inf)

    first = opportunities[0][0] if opportunities else 0.0
    span = max(last_t - first, 1.0)
    return {
        "start_cash": start_cash,
        "final_cash": cash,
        "closed": closed,
        "max_drawdown": max_drawdown,
        "peak": peak,
        "missed_for_money": len(missed_for_money),
        "avg_locked": Decimal(str(round(locked_time / span, 2))),
        "first": first,
        "last": last_t,
    }


def money(value: Decimal, sign: bool = False) -> str:
    text = f"{abs(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    prefix = "−" if value < 0 else ("+" if sign and value > 0 else "")
    return f"{prefix}{text} $"


def pct(value: Decimal) -> str:
    text = f"{abs(value) * 100:.1f}".replace(".", ",")
    return ("−" if value < 0 else "+") + text + " %"


def local(ts: float) -> datetime:
    try:
        from zoneinfo import ZoneInfo

        return datetime.fromtimestamp(ts, ZoneInfo("America/Chicago"))
    except Exception:  # noqa: BLE001
        return datetime.fromtimestamp(ts, timezone.utc)


MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]


def day_text(d) -> str:
    return f"{d.day} {MONTHS[d.month - 1]}"


def report(title: str, r: dict) -> str:
    closed = r["closed"]
    lines = [f"=== {title} ==="]
    if not closed:
        return "\n".join(lines + ["Sin compras posibles en el periodo.", ""])
    net = sum((c["net"] for c in closed), Decimal("0"))
    cost = sum((c["cost"] for c in closed), Decimal("0"))
    fees = sum((c["fees"] for c in closed), Decimal("0"))
    contracts = sum((c["count"] for c in closed), Decimal("0"))
    wins = sum(1 for c in closed if c["net"] > 0)
    losses = sum(1 for c in closed if c["net"] < 0)
    start, end = local(r["first"]), local(r["last"])
    days = max((end.date() - start.date()).days, 1)
    lines.append(f"Periodo: {day_text(start)} – {day_text(end)} ({days} días)")
    lines.append(
        f"Mercados: {len(closed)} ({wins} ganados, {losses} perdidos) · contratos: {int(contracts)} · "
        f"dinero movido: {money(cost)} · comisiones: {money(fees)}"
    )
    lines.append(
        f"Resultado: {money(net, True)} → saldo final {money(r['final_cash'])} "
        f"({pct(net / r['start_cash'])} sobre {money(r['start_cash'])}; {pct(net / cost)} de lo movido)"
    )
    lines.append(f"Al mes (30 días): {money(net * 30 / days, True)}")
    dd = r["max_drawdown"]
    lines.append(f"Peor bajada desde un máximo: {money(-dd)} ({pct(-dd / r['peak'])} del saldo en ese momento)")
    by_group = defaultdict(list)
    for c in closed:
        by_group[c["group"]].append(c)
    parts = []
    for key, label in (("games", "partidos"), ("weather", "clima")):
        if by_group[key]:
            g_net = sum((c["net"] for c in by_group[key]), Decimal("0"))
            g_losses = sum(1 for c in by_group[key] if c["net"] < 0)
            parts.append(f"{label} {money(g_net, True)} ({len(by_group[key])} mercados, {g_losses} perdidos)")
    lines.append("Por tipo: " + " · ".join(parts))
    lines.append(
        f"Dinero en juego de media: {money(r['avg_locked'])} · mercados en los que faltó dinero para comprar "
        f"todo lo posible: {r['missed_for_money']}"
    )
    by_day = defaultdict(lambda: Decimal("0"))
    by_week = defaultdict(lambda: Decimal("0"))
    for c in closed:
        d = local(c["when"]).date()
        by_day[d] += c["net"]
        by_week[d - timedelta(days=d.weekday())] += c["net"]
    best_day = max(by_day.items(), key=lambda kv: kv[1])
    worst_day = min(by_day.items(), key=lambda kv: kv[1])
    lines.append(
        f"Mejor día: {day_text(best_day[0])} {money(best_day[1], True)} · peor día: {day_text(worst_day[0])} "
        f"{money(worst_day[1], True)} · días en pérdida: {sum(1 for v in by_day.values() if v < 0)} de {len(by_day)}"
    )
    lines.append("Por semanas (lunes a domingo):")
    for week in sorted(by_week):
        lines.append(f"  semana del {day_text(week):<8} {money(by_week[week], True):>12}")
    lines.append("")
    return "\n".join(lines)


SCENARIOS = [
    ("100 $ · partidos y clima · 10 contratos por mercado · hasta 80 $ en juego", 100, 10, 10, 80, None),
    ("100 $ · solo clima (si Missouri bloquea los partidos) · mismos límites", 100, 10, 10, 80, "weather"),
    ("100 $ · partidos y clima · 5 contratos por mercado · hasta 80 $ en juego", 100, 5, 5, 80, None),
    ("25 $ · partidos y clima · 5 contratos por mercado · hasta 20 $ (tu bot ahora)", 25, 5, 5, 20, None),
]


def run_simulations(paths: list) -> None:
    markets = []
    for path in paths:
        data = json.loads(Path(path).read_text())
        markets.extend(data["markets"])
        print(f"{path}: {len(data['markets'])} mercados ({data['group']}, {data['days']} días)")
    with_ts = sum(1 for m in markets if m.get("has_settlement_ts"))
    print(f"Mercados con hora de liquidación: {with_ts} de {len(markets)}\n")
    for title, cash, order, position, exposure, only in SCENARIOS:
        chosen = [m for m in markets if only is None or group_of(m["series"]) == only]
        result = simulate(
            chosen,
            cash=Decimal(cash),
            order_size=order,
            max_position=position,
            max_exposure=Decimal(exposure),
        )
        print(report(title, result))
    print(
        "Ojo: supone que el bot se habría llevado las primeras ventas del favorito entre 88 y 97¢ en cada "
        "mercado (va un tick por delante). En la realidad compite con otros y compraría menos, así que el "
        "resultado real será más bajo. Las comisiones de maker están incluidas."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("fetch")
    p.add_argument("--group", choices=["games", "weather"], required=True)
    p.add_argument("--days", type=int, default=60)
    p.add_argument("--out", required=True)
    p = sub.add_parser("simulate")
    p.add_argument("files", nargs="+")
    args = parser.parse_args()
    if args.command == "fetch":
        fetch(args.group, args.days, args.out)
    else:
        run_simulations(args.files)


if __name__ == "__main__":
    main()
