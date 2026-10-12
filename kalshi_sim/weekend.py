"""¿Por qué perdió el bot el fin de semana del 10 y 11 de octubre de 2026?

  fetch   descarga los partidos y el clima ya decididos de los últimos días, con todas sus
          operaciones en la ventana en la que opera el bot y el nombre de cada mercado.
  report  día a día, lo que habría comprado el bot con las reglas de ese fin de semana
          (partidos: hasta 6 h antes del final; clima: hasta 40 h antes del cierre; el favorito
          entre 88 y 97¢; uno por partido o por ciudad y día; 5 contratos): cuántas veces falló
          el favorito, cuánto costó y si fue raro frente a las 6 semanas anteriores.

Igual que las otras pruebas, la compra del bot es la primera venta del favorito a quien
esperaba en el libro. El bot de verdad, con unos 25 $, solo puede tener unas pocas apuestas a
la vez, así que no hace todas estas: lo que cuenta es la proporción de fallos.

Solo lee datos públicos de mercados ya liquidados: no usa ninguna clave ni envía órdenes.
"""

from __future__ import annotations

import argparse
import bisect
import gzip
import json
import math
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
from bankroll import GAME_SERIES, WEATHER_SERIES, WINDOW_HOURS  # noqa: E402
from timeline import CONTRACTS, Market, entries, line  # noqa: E402

TZ = ZoneInfo("America/Chicago")
WEEKEND = (date(2026, 10, 9), date(2026, 10, 10), date(2026, 10, 11))
WEEKDAYS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")
MONTHS = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
LEAGUE = {
    "KXNCAAFGAME": "universitario",
    "KXNFLGAME": "NFL",
    "KXMLBGAME": "béisbol",
    "KXNHLGAME": "hockey",
    "KXNBAGAME": "baloncesto",
}


# --------------------------------------------------------------------------
# Descarga (GitHub Actions, con la librería del bot)
# --------------------------------------------------------------------------


def fetch(group: str, days: int, out: str) -> None:
    sys.path.insert(0, str(Path.cwd()))
    from kalshi_bot.config import load_settings
    from kalshi_bot.models import parse_time, to_decimal
    from kalshi_bot.names import market_name

    client = load_settings().client()
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    hours = WINDOW_HOURS[group]
    rows = []
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
            if tl:
                tl.sort()
                rows.append({"t": m.ticker, "e": m.event_ticker, "s": series, "r": m.result, "c": end, "tl": tl,
                             "n": market_name(m.ticker, m.title, m.subtitle), "ti": m.title})
    with gzip.open(out, "wt") as fh:
        json.dump({"group": group, "days": days, "generated": now.isoformat(), "markets": rows}, fh)
    print(f"{group}: {len(rows)} mercados", file=sys.stderr)


# --------------------------------------------------------------------------
# Informe (sin dependencias)
# --------------------------------------------------------------------------


def event_day(event: str):
    """El día del partido o de la temperatura, del ticker del evento (…-26OCT10…)."""
    found = re.search(r"-(\d{2})([A-Z]{3})(\d{2})", event)
    if not found or found.group(2) not in MONTHS:
        return None
    return date(2000 + int(found.group(1)), MONTHS[found.group(2)], int(found.group(3)))


def day_text(d: date) -> str:
    return f"{WEEKDAYS[d.weekday()]} {d.day:>2}/{d.month:02d}"


def load(paths: list) -> dict:
    """Mercados de todos los ficheros; si un mercado está en varios, vale el del último."""
    raw, group_of = {}, {}
    for path in paths:
        with gzip.open(path, "rt") as fh:
            data = json.load(fh)
        for r in data["markets"]:
            raw[r["t"]] = r
            group_of[r["t"]] = data["group"]
        print(f"{path}: {len(data['markets'])} mercados ({data['group']}, generado {data.get('generated', '?')[:16]})")
    out = {"games": [], "weather": []}
    for ticker, r in raw.items():
        m = Market(r, group_of[ticker])
        m.name = r.get("n") or ticker
        m.title = r.get("ti") or ""
        m.day = event_day(r["e"])
        m.volume = sum(t[3] for t in r["tl"])  # contratos negociados en la ventana del bot
        if m.day is not None:
            out[m.group].append(m)
    return out


def rule(hours: float, floor: int):
    return lambda m, i, s, p: m.ts[i] >= m.close - hours * 3600 and p >= floor


def bets_for(markets: dict, games_rule, weather_rule) -> list:
    return entries(markets["games"], games_rule) + entries(markets["weather"], weather_rule)


def tally(rows: list) -> tuple:
    n = len(rows)
    lost = sum(1 for b in rows if not b["won"])
    net = sum(b["net"] for b in rows)
    cost = sum(b["cost"] for b in rows)
    return n, lost, net, cost


def part(rows: list) -> str:
    n, lost, net, _ = tally(rows)
    if not n:
        return f"{'—':>24}"
    return f"{n:>3} · {lost:>2} perdidas · {net:+7.2f} $"


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def cents(price_milli: int) -> str:
    return f"{price_milli / 10:.0f}¢"


def describe(b: dict) -> str:
    m, i, side = b["m"], b["i"], b["side"]
    when = datetime.fromtimestamp(m.ts[i], TZ)
    hours = (m.close - m.ts[i]) / 3600
    after = [m.price(j, side) for j in range(i + 1, len(m.ts)) if m.ts[j] < m.close - 15 * 60]
    top = max(after) if after else m.price(i, side)
    j = bisect.bisect_right(m.ts, m.close - 3600) - 1
    hour_before = cents(m.price(j, side)) if j >= i else "—"
    what = LEAGUE.get(m.series, "clima")
    lado = "SÍ" if side == "yes" else "NO"
    title = f" ({m.title})" if m.title and m.group == "games" else ""
    return (
        f"  {WEEKDAYS[when.weekday()]} {when:%H:%M} · {what:<13} {lado} a {b['p'] * 100:.0f}¢ · {m.name}{title}\n"
        f"      {hours:4.1f} h antes del final · después llegó a {cents(top)} · 1 h antes del final valía "
        f"{hour_before} · {b['net']:+.2f} $ · {m.volume} contratos negociados"
    )


def binom_tail(n: int, k: int, p: float) -> float:
    """Probabilidad de k o más fallos en n apuestas si cada una falla con probabilidad p."""
    return sum(math.comb(n, j) * p**j * (1 - p) ** (n - j) for j in range(k, n + 1))


def weekend_report(bets: list) -> None:
    print("\n=== Los favoritos que fallaron el fin de semana (reglas de entonces: partidos 6 h, clima 40 h, desde 88¢) ===")
    for day in WEEKEND:
        todays = [b for b in bets if b["m"].day == day]
        lost = [b for b in todays if not b["won"]]
        n, k, net, _ = tally(todays)
        print(f"\n{day_text(day)}: {n} apuestas posibles, {plural(k, 'fallada', 'falladas')}, {net:+.2f} $ con {CONTRACTS} contratos en cada una")
        for series, label in list(LEAGUE.items()) + [("KXHIGH", "clima")]:
            rows = [b for b in todays if b["m"].series.startswith(series)]
            if rows:
                print(f"    {label:<13} {part(rows)}")
        for b in sorted(lost, key=lambda b: b["m"].ts[b["i"]]):
            print(describe(b))


def daily_report(bets: list) -> None:
    print(f"\n=== Día a día con las reglas de entonces ({CONTRACTS} contratos por apuesta; apuestas · perdidas · neto) ===")
    days = sorted({b["m"].day for b in bets})
    for d in days:
        g = [b for b in bets if b["m"].day == d and b["m"].group == "games"]
        w = [b for b in bets if b["m"].day == d and b["m"].group == "weather"]
        net = sum(b["net"] for b in g + w)
        mark = " ◀" if d in WEEKEND else ""
        print(f"  {day_text(d)}  partidos {part(g)}   clima {part(w)}   total {net:+7.2f} ${mark}")


def weekends_report(bets: list) -> None:
    print("\n=== Fines de semana (sábado y domingo) frente a los días entre semana ===")
    by_day = defaultdict(list)
    for b in bets:
        by_day[b["m"].day].append(b)
    for d in sorted(by_day):
        if d.weekday() != 5 or (d + timedelta(days=1)) not in by_day:
            continue
        rows = by_day[d] + by_day[d + timedelta(days=1)]
        n, k, net, _ = tally(rows)
        ncaaf = [b for b in by_day[d] if b["m"].series == "KXNCAAFGAME"]
        n2, k2, net2, _ = tally(ncaaf)
        mark = " ◀" if d in WEEKEND else ""
        print(
            f"  {day_text(d)} y dom: {n:>3} apuestas, {k:>2} perdidas ({k / n * 100:4.1f} %), {net:+7.2f} $ · "
            f"universitario el sábado: {n2:>3}, {k2:>2} perdidos, {net2:+7.2f} ${mark}"
        )
    weekdays = [b for b in bets if b["m"].day.weekday() < 5]
    n, k, net, _ = tally(weekdays)
    days = len({b["m"].day for b in weekdays})
    if n:
        print(f"  entre semana: {n} apuestas en {days} días, {k} perdidas ({k / n * 100:4.1f} %), {net / days:+.2f} $ al día de media")


def luck_report(bets: list) -> None:
    print("\n=== ¿Mala suerte o algo raro? (fallos del fin de semana frente a lo normal de las otras semanas) ===")
    weekend = (WEEKEND[1], WEEKEND[2])
    for label, pick in (
        ("todo", lambda b: True),
        ("partidos", lambda b: b["m"].group == "games"),
        ("universitario", lambda b: b["m"].series == "KXNCAAFGAME"),
        ("clima", lambda b: b["m"].group == "weather"),
    ):
        rows = [b for b in bets if pick(b)]
        now = [b for b in rows if b["m"].day in weekend]
        before = [b for b in rows if b["m"].day < WEEKEND[0]]
        n, k, _, _ = tally(now)
        n0, k0, _, _ = tally(before)
        if not n or not n0:
            continue
        p = k0 / n0
        print(
            f"  {label:<14} sáb y dom: {plural(k, 'fallo', 'fallos')} en {n} ({k / n * 100:4.1f} %) · lo normal antes: "
            f"{p * 100:4.1f} % ({k0} de {n0}), o sea {n * p:4.1f} esperables · que fallen {k} o más pasa el "
            f"{binom_tail(n, k, p) * 100:4.1f} % de las veces"
        )


def rules_report(markets: dict) -> None:
    print(f"\n=== El fin de semana y las 6 semanas con otras reglas ({CONTRACTS} contratos por apuesta) ===")
    variants = (
        ("como estaba (clima 40 h, desde 88¢)", rule(6, 880), rule(40, 880)),
        ("clima solo las últimas 12 h", rule(6, 880), rule(12, 880)),
        ("clima 12 h y todo desde 92¢", rule(6, 920), rule(12, 920)),
    )
    for label, g_rule, w_rule in variants:
        rows = bets_for(markets, g_rule, w_rule)
        weekend = [b for b in rows if b["m"].day in WEEKEND[1:]]
        n, k, net, _ = tally(weekend)
        n2, k2, net2, cost2 = tally(rows)
        days = len({b["m"].day for b in rows}) or 1
        print(
            f"  {label:<36} sáb y dom: {n:>3} apuestas, {k:>2} perdidas, {net:+7.2f} $ · "
            f"todo el periodo: {n2} apuestas, {k2} perdidas, {net2:+.2f} $ ({net2 / cost2 * 100:+.1f} %), "
            f"{net2 / days:+.2f} $ al día"
        )


def liquidity_report(bets: list) -> None:
    """¿Fallan más los partidos poco negociados? Cortes fijados con las semanas anteriores al finde."""
    print("\n=== Partidos según lo negociado en las 6 h antes del final (cortes por tercios, con las semanas anteriores) ===")
    for label, pick in (
        ("universitario", lambda b: b["m"].series == "KXNCAAFGAME"),
        ("todos los partidos", lambda b: b["m"].group == "games"),
    ):
        rows = [b for b in bets if pick(b)]
        before = [b for b in rows if b["m"].day < WEEKEND[0]]
        weekend = [b for b in rows if b["m"].day in WEEKEND[1:]]
        if len(before) < 30:
            continue
        vols = sorted(b["m"].volume for b in before)
        lo, hi = vols[len(vols) // 3], vols[2 * len(vols) // 3]
        tiers = (
            (f"poco negociados (< {lo} contratos)", lambda v: v < lo),
            (f"intermedios ({lo}–{hi})", lambda v: lo <= v < hi),
            (f"muy negociados (≥ {hi})", lambda v: v >= hi),
        )
        for when, chosen in (("6 semanas antes", before), ("sáb y dom 10–11", weekend)):
            print(f"  {label}, {when}:")
            for name, test in tiers:
                print(line(name, [b for b in chosen if test(b["m"].volume)]))


def report(paths: list) -> None:
    markets = load(paths)
    bets = bets_for(markets, rule(6, 880), rule(40, 880))
    first = min(b["m"].day for b in bets)
    last = max(b["m"].day for b in bets)
    print(f"Apuestas posibles con las reglas de entonces: {len(bets)}, del {first} al {last}.")
    weekend_report(bets)
    luck_report(bets)
    weekends_report(bets)
    liquidity_report(bets)
    rules_report(markets)
    daily_report(bets)
    print(
        "\nOjo: el bot de verdad, con unos 25 $, solo tiene unas pocas apuestas a la vez y no hace todas estas. "
        "Cuenta la proporción de fallos, no el total en dólares."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("fetch")
    p.add_argument("--group", choices=["games", "weather"], required=True)
    p.add_argument("--days", type=int, default=6)
    p.add_argument("--out", required=True)
    p = sub.add_parser("report")
    p.add_argument("files", nargs="+")
    args = parser.parse_args()
    if args.command == "fetch":
        fetch(args.group, args.days, args.out)
    else:
        report(args.files)


if __name__ == "__main__":
    main()
