"""¿Le entran al bot las compras justo cuando el precio se da la vuelta?

El bot espera en el libro un tick por delante del resto. Si alguien sabe algo (un gol, un
cambio en la previsión del tiempo), vende el favorito de golpe y lo primero que se lleva es la
orden del bot. Este análisis mira el precio alrededor de cada compra posible del bot:

  fetch     descarga, de cada mercado ya liquidado, todas las operaciones de la ventana en la
            que opera el bot (partidos: 6 h antes del final; clima: 40 h antes del cierre).
  analyze   compara entrar en la primera ocasión (como ahora) con esperar si el precio del
            favorito acaba de caer (por ejemplo, 3¢ o más en los últimos 30 minutos), y mide
            hacia dónde va el precio después de cada compra.

No envía órdenes ni usa ninguna clave: solo lee datos públicos de mercados ya liquidados.
"""

from __future__ import annotations

import argparse
import bisect
import gzip
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bankroll import GAME_SERIES, MAKER_FEE, SKIP_LAST_MINUTES, WEATHER_SERIES, WINDOW_HOURS  # noqa: E402

LO, HI = 880, 970  # banda del bot, en milésimas de dólar
CONTRACTS = 5


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
    rows, checked, trades_total = [], 0, 0
    for series in GAME_SERIES if group == "games" else WEATHER_SERIES:
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
                print(f"  {checked} mercados, {trades_total} operaciones", file=sys.stderr, flush=True)
            end = int(m.close_time.timestamp())
            try:
                trades = client.get_trades(m.ticker, min_ts=end - hours * 3600, max_ts=end, max_pages=10)
            except Exception as exc:  # noqa: BLE001 - un mercado fallido no invalida el resto
                print(f"  {m.ticker}: {exc}", file=sys.stderr)
                continue
            tl = []
            for t in trades:
                if t.get("is_block_trade"):
                    continue
                price = to_decimal(t.get("yes_price_dollars"))
                count = to_decimal(t.get("count_fp"), to_decimal(t.get("count")))
                taker = t.get("taker_outcome_side") or t.get("taker_side")
                created = parse_time(t.get("created_time"))
                if price is None or count is None or count <= 0 or taker not in ("yes", "no") or created is None:
                    continue
                tl.append([int(created.timestamp()), int(round(price * 1000)), 1 if taker == "yes" else 0,
                           max(1, int(round(count)))])
            if not tl:
                continue
            tl.sort()
            trades_total += len(tl)
            rows.append({"t": m.ticker, "e": m.event_ticker, "s": series, "r": m.result, "c": end, "tl": tl})
    with gzip.open(out, "wt") as fh:
        json.dump({"group": group, "days": days, "generated": now.isoformat(), "markets": rows}, fh)
    print(f"{group}: {len(rows)} mercados, {trades_total} operaciones", file=sys.stderr)


# --------------------------------------------------------------------------
# Análisis (sin dependencias)
# --------------------------------------------------------------------------


def fee(price: float) -> float:
    return math.ceil(float(MAKER_FEE) * CONTRACTS * price * (1 - price) * 100 - 1e-9) / 100


class Market:
    """Las operaciones de un mercado y el precio de cada lado a lo largo del tiempo."""

    def __init__(self, raw: dict, group: str):
        self.ticker, self.event, self.series, self.result = raw["t"], raw["e"], raw["s"], raw["r"]
        self.close = raw["c"]
        self.group = group
        self.ts = [t[0] for t in raw["tl"]]
        self.yes = [t[1] for t in raw["tl"]]  # precio del SÍ en milésimas
        self.taker = [t[2] for t in raw["tl"]]
        self.start = self.close - WINDOW_HOURS[group] * 3600
        self.stop = self.close - SKIP_LAST_MINUTES * 60

    def price(self, i: int, side: str) -> int:
        return self.yes[i] if side == "yes" else 1000 - self.yes[i]

    def candidates(self):
        """Compras del favorito en la banda hechas por quien esperaba en el libro: (índice, lado, precio)."""
        for i, ts in enumerate(self.ts):
            if ts < self.start or ts >= self.stop:
                continue
            side = "no" if self.taker[i] == 1 else "yes"  # el maker compró el lado contrario al taker
            paid = self.price(i, side)
            if LO <= paid <= HI:
                yield i, side, paid

    def drop(self, i: int, side: str, minutes: int) -> int:
        """Cuánto ha caído el favorito hasta esta compra: lo más alto de los últimos minutos menos el precio."""
        lo = bisect.bisect_left(self.ts, self.ts[i] - minutes * 60)
        prior = [self.price(j, side) for j in range(lo, i)]
        return (max(prior) - self.price(i, side)) if prior else 0

    def later(self, i: int, side: str, minutes: int) -> int:
        """El precio del mismo lado un rato después (la última operación antes de ese momento)."""
        j = bisect.bisect_right(self.ts, self.ts[i] + minutes * 60) - 1
        return self.price(j, side)


def entries(markets: list, rule) -> list:
    """Una apuesta por evento: la primera compra posible que cumpla la regla."""
    found = []
    for m in markets:
        for i, side, paid in m.candidates():
            if rule(m, i, side, paid):
                found.append((m.ts[i], m, i, side, paid))
                break
    found.sort(key=lambda f: f[0])
    used, out = set(), []
    for ts, m, i, side, paid in found:
        if m.event in used:
            continue
        used.add(m.event)
        p = paid / 1000
        won = side == m.result
        cost = p * CONTRACTS
        net = (CONTRACTS if won else 0) - cost - fee(p)
        out.append({"m": m, "i": i, "side": side, "p": p, "won": won, "cost": cost, "fee": fee(p), "net": net})
    return out


def line(label: str, bets: list) -> str:
    if not bets:
        return f"  {label:<44} sin apuestas"
    n = len(bets)
    wins = sum(1 for b in bets if b["won"])
    cost = sum(b["cost"] for b in bets)
    net = sum(b["net"] for b in bets)
    need = (cost + sum(b["fee"] for b in bets)) / (CONTRACTS * n)
    z = 1.96
    p = wins / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    lo, hi = centre - half, centre + half
    verdict = "gana" if lo > need else ("pierde" if hi < need else "sin confirmar")
    sign = "+" if net > 0 else "−" if net < 0 else ""
    return (
        f"  {label:<44} {n:>4} apuestas · {n - wins:>3} perdidas · acierto {p * 100:5.1f} % "
        f"(necesita {need * 100:4.1f} %; margen {lo * 100:4.1f}–{hi * 100:4.1f} %) · "
        f"{sign}{abs(net):.2f} $ ({net / cost * 100:+.1f} %) · {verdict}"
    )


def drift_report(bets: list, label: str) -> None:
    for minutes in (5, 30, 120):
        win = [b["m"].later(b["i"], b["side"], minutes) / 1000 - b["p"] for b in bets if b["won"]]
        lost = [b["m"].later(b["i"], b["side"], minutes) / 1000 - b["p"] for b in bets if not b["won"]]
        avg = lambda xs: sum(xs) / len(xs) * 100 if xs else float("nan")  # noqa: E731
        allb = win + lost
        down = sum(1 for d in allb if d <= -0.03) / len(allb) * 100 if allb else float("nan")
        print(
            f"  {label}: {minutes:>3} min después el favorito vale {avg(allb):+5.1f}¢ de media "
            f"(en las que se ganaron {avg(win):+5.1f}¢, en las perdidas {avg(lost):+5.1f}¢); "
            f"ha caído 3¢ o más en el {down:4.1f} %"
        )


def analyze(paths: list) -> None:
    groups: dict = {"games": [], "weather": []}
    for path in paths:
        with gzip.open(path, "rt") as fh:
            data = json.load(fh)
        groups[data["group"]].extend(Market(raw, data["group"]) for raw in data["markets"])
        print(f"{path}: {len(data['markets'])} mercados ({data['group']}, {data['days']} días)")
    for group, label in (("weather", "Clima"), ("games", "Partidos")):
        markets = groups[group]
        if not markets:
            continue
        print(f"\n=== {label}: entrar en la primera ocasión o esperar si el favorito acaba de caer ===")
        print(f"  ({CONTRACTS} contratos por apuesta; una por {'ciudad y día' if group == 'weather' else 'partido'})")
        base = entries(markets, lambda m, i, s, p: True)
        print(line("como ahora (la primera ocasión)", base))
        for minutes in (10, 30, 60):
            for cents in (2, 3, 5):
                rule = lambda m, i, s, p, mi=minutes, c=cents: m.drop(i, s, mi) < c * 10  # noqa: E731
                print(line(f"saltar si ha caído {cents}¢ o más en {minutes} min", entries(markets, rule)))
        print(f"\n=== {label}: hacia dónde va el precio después de comprar (como ahora) ===")
        drift_report(base, label)
        knives = [b for b in base if b["m"].drop(b["i"], b["side"], 30) >= 30]
        calm = [b for b in base if b["m"].drop(b["i"], b["side"], 30) < 30]
        print(line("compras con caída de 3¢+ en 30 min antes", knives))
        print(line("compras sin esa caída", calm))
        if group == "games":
            print(f"\n=== {label} por liga (como ahora / saltando caídas de 3¢ en 30 min) ===")
            rule = lambda m, i, s, p: m.drop(i, s, 30) < 30  # noqa: E731
            guarded = entries(markets, rule)
            for code in GAME_SERIES:
                print(line(f"{code} como ahora", [b for b in base if b["m"].series == code]))
                print(line(f"{code} saltando caídas", [b for b in guarded if b["m"].series == code]))
    entry_rules(groups)
    print(
        "\nOjo: supone que el bot se lleva la compra que hizo quien esperaba en el libro. Sirve para comparar "
        "reglas entre sí, con las mismas operaciones."
    )


def entry_rules(groups: dict) -> None:
    """Cuándo y a qué precio entrar, con todas las operaciones (no solo las últimas)."""
    weather, games = groups["weather"], groups["games"]

    def rule(hours: float, floor: int):
        return lambda m, i, s, p: m.ts[i] >= m.close - hours * 3600 and p >= floor

    if weather:
        print("\n=== Clima: cuántas horas antes del cierre y desde qué precio ===")
        for hours in (40, 30, 24, 18, 12, 8):
            for floor in (880, 920, 940):
                label = f"hasta {hours} h antes, desde {floor // 10}¢"
                print(line(label, entries(weather, rule(hours, floor))))
        print("\n=== Clima por ciudad (como ahora: hasta 40 h, desde 88¢ / hasta 24 h, desde 92¢) ===")
        base = entries(weather, rule(40, 880))
        late = entries(weather, rule(24, 920))
        for code in WEATHER_SERIES:
            print(line(f"{code} como ahora", [b for b in base if b["m"].series == code]))
            print(line(f"{code} 24 h y 92¢", [b for b in late if b["m"].series == code]))
    if games:
        print("\n=== Partidos: desde qué precio y cuánto antes del final ===")
        for hours in (6, 3, 1):
            for floor in (880, 900, 920, 940):
                print(line(f"hasta {hours} h antes, desde {floor // 10}¢", entries(games, rule(hours, floor))))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("fetch")
    p.add_argument("--group", choices=["games", "weather"], required=True)
    p.add_argument("--days", type=int, default=42)
    p.add_argument("--out", required=True)
    p = sub.add_parser("analyze")
    p.add_argument("files", nargs="+")
    args = parser.parse_args()
    if args.command == "fetch":
        fetch(args.group, args.days, args.out)
    else:
        analyze(args.files)


if __name__ == "__main__":
    main()
