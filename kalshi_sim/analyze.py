"""Análisis por apuesta: ¿qué entradas del bot ganan y cuáles pierden?

Lee los mismos datos que la simulación (games.json y weather.json, de bankroll.py fetch) y,
para cada regla de entrada, calcula cómo habrían ido las apuestas una a una:

  - clima: según cuántas horas antes del cierre se entra, el precio mínimo y el lado (SÍ o NO);
  - partidos: según la liga, el precio mínimo y cuánto falta para el final;
  - y el saldo con distintos tamaños de apuesta y dinero máximo en juego.

La entrada de cada mercado es la primera compra del favorito (entre el precio mínimo y 97¢)
hecha por quien esperaba en el libro dentro de la ventana de la regla; una apuesta por
partido o por ciudad y día, como el bot. Igual que la simulación, es optimista: supone que el
bot se lleva esa primera venta.
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bankroll import group_of, maker_fee, money, pct, simulate  # noqa: E402

CONTRACTS = 5
CITY = {
    "KXHIGHNY": "Nueva York",
    "KXHIGHCHI": "Chicago",
    "KXHIGHLAX": "Los Ángeles",
    "KXHIGHMIA": "Miami",
    "KXHIGHAUS": "Austin",
    "KXHIGHDEN": "Denver",
    "KXHIGHPHIL": "Filadelfia",
}
LEAGUE = {
    "KXNCAAFGAME": "fútbol americano universitario",
    "KXNFLGAME": "NFL",
    "KXMLBGAME": "béisbol (MLB)",
    "KXNHLGAME": "hockey (NHL)",
    "KXNBAGAME": "baloncesto (NBA)",
}


def bets(markets: list, *, window_h: float, floor: Decimal, side: str = "", series: tuple = ()) -> list:
    """Una apuesta por evento con la regla dada (la primera que se habría llenado)."""
    found = []
    for m in markets:
        if series and m["series"] not in series:
            continue
        start = m["close"] - window_h * 3600
        for ts, s, paid, _count in m["fills"]:
            price = Decimal(paid)
            if ts >= start and price >= floor and (not side or s == side):
                found.append((ts, m, s, price))
                break
    found.sort(key=lambda f: f[0])
    used, out = set(), []
    for ts, m, s, price in found:
        if m["event"] in used:
            continue
        used.add(m["event"])
        fee = maker_fee(Decimal(CONTRACTS), price)
        won = s == m["result"]
        cost = price * CONTRACTS
        net = (Decimal(CONTRACTS) if won else Decimal(0)) - cost - fee
        out.append({"m": m, "side": s, "price": price, "won": won, "cost": cost, "fee": fee, "net": net,
                    "hours": (m["close"] - ts) / 3600})
    return out


def row(label: str, items: list) -> str:
    if not items:
        return f"  {label:<34} sin apuestas"
    n = len(items)
    wins = sum(1 for b in items if b["won"])
    cost = sum((b["cost"] for b in items), Decimal(0))
    net = sum((b["net"] for b in items), Decimal(0))
    avg = sum((b["price"] for b in items), Decimal(0)) / n
    need = (cost + sum((b["fee"] for b in items), Decimal(0))) / (CONTRACTS * n)
    rate = Decimal(wins) / n
    # Margen de error (95 %) del % de aciertos, con Wilson: con pocos fallos no da nada por seguro.
    z = 1.96
    p = wins / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    lo, hi = centre - half, centre + half
    verdict = "gana" if lo > float(need) else ("pierde" if hi < float(need) else "sin confirmar")
    return (
        f"  {label:<34} {n:>4} apuestas · {n - wins:>3} perdidas · acierto {rate * 100:5.1f} % "
        f"(necesita {need * 100:4.1f} %; margen {lo * 100:4.1f}–{hi * 100:4.1f} %) · paga {avg * 100:4.1f}¢ de media · "
        f"{money(net, True):>10} ({pct(net / cost)}) · {verdict}"
    )


def section(title: str) -> None:
    print(f"\n=== {title} ===")
    print(f"  (con {CONTRACTS} contratos por apuesta; «necesita» = acierto mínimo para no perder con ese precio y la comisión)")


def weather_report(weather: list) -> None:
    section("Clima: ¿cuánto antes del cierre conviene entrar?")
    for w in (40, 30, 24, 18, 12, 8, 6, 3):
        print(row(f"entrar como mucho {w} h antes", bets(weather, window_h=w, floor=Decimal("0.88"))))
    base = bets(weather, window_h=40, floor=Decimal("0.88"))
    section("Clima, como ahora (hasta 40 h antes): según cuándo se llenó la compra")
    for lo, hi in ((0, 6), (6, 12), (12, 24), (24, 41)):
        print(row(f"entre {lo} y {min(hi, 40)} h antes del cierre", [b for b in base if lo <= b["hours"] < hi]))
    section("Clima: precio mínimo")
    for floor in ("0.88", "0.90", "0.92", "0.94"):
        print(row(f"desde {int(Decimal(floor) * 100)}¢", bets(weather, window_h=40, floor=Decimal(floor))))
    section("Clima: SÍ (el tramo que más gusta) o NO (contra un tramo)")
    print(row("solo SÍ", bets(weather, window_h=40, floor=Decimal("0.88"), side="yes")))
    print(row("solo NO", bets(weather, window_h=40, floor=Decimal("0.88"), side="no")))
    print(row("como ahora (los dos)", base))
    section("Clima por ciudad (como ahora)")
    for code, name in CITY.items():
        print(row(name, [b for b in base if b["m"]["series"] == code]))
    section("Clima: las apuestas perdidas (como ahora)")
    lost = [b for b in base if not b["won"]]
    for b in sorted(lost, key=lambda b: b["m"]["close"])[-30:]:
        m = b["m"]
        side = "SÍ" if b["side"] == "yes" else "NO"
        print(f"  {m['ticker']:<28} {side} a {b['price'] * 100:.0f}¢, {b['hours']:4.1f} h antes del cierre")


def games_report(games: list) -> None:
    section("Partidos por liga (como ahora: hasta 6 h antes del final, desde 88¢)")
    base = bets(games, window_h=6, floor=Decimal("0.88"))
    for code, name in LEAGUE.items():
        print(row(name, [b for b in base if b["m"]["series"] == code]))
    print(row("todos", base))
    section("Partidos: precio mínimo")
    for floor in ("0.88", "0.90", "0.92", "0.94"):
        print(row(f"desde {int(Decimal(floor) * 100)}¢", bets(games, window_h=6, floor=Decimal(floor))))
    section("Partidos: cuánto antes del final")
    for w in (6, 3, 2, 1, 0.5):
        print(row(f"entrar como mucho {w} h antes", bets(games, window_h=w, floor=Decimal("0.88"))))
    section("Partidos universitarios por precio")
    ncaaf = ("KXNCAAFGAME",)
    for floor in ("0.88", "0.92", "0.95"):
        print(row(f"universitario desde {int(Decimal(floor) * 100)}¢",
                  bets(games, window_h=6, floor=Decimal(floor), series=ncaaf)))


def bankroll_report(games: list, weather: list) -> None:
    print("\n=== Saldo: tamaño de apuesta y dinero máximo en juego (empezando con 24 $) ===")
    print("  (un tramo por ciudad y día, como el bot ahora)")
    keep = [m for m in games if m["series"] in ("KXMLBGAME", "KXNHLGAME")]
    sets = (("solo clima", weather), ("clima + béisbol + hockey", weather + keep), ("todo", weather + games))
    for label, markets in sets:
        for size, cap in ((5, 1000), (3, 1000), (5, 12), (3, 12), (2, 1000)):
            r = simulate(markets, cash=Decimal(24), order_size=size, max_position=size, max_exposure=Decimal(cap),
                         per_event_weather=1)
            closed = r["closed"]
            net = sum((c["net"] for c in closed), Decimal(0))
            by_day: dict = defaultdict(lambda: Decimal(0))
            for c in closed:
                by_day[int(c["when"] // 86400)] += c["net"]
            worst = min(by_day.values()) if by_day else Decimal(0)
            capt = "sin límite" if cap >= 1000 else f"máx. {cap} $ en juego"
            print(
                f"  {label:<26} {size} contratos, {capt:<18} → {money(net, True):>10} · peor día {money(worst, True):>9} · "
                f"peor bajada {money(-r['max_drawdown']):>9} · {len(closed)} apuestas"
            )


def main() -> None:
    games = json.loads(Path(sys.argv[1]).read_text())["markets"]
    weather = json.loads(Path(sys.argv[2]).read_text())["markets"]
    print(f"Datos: {len(games)} mercados de partidos y {len(weather)} de clima ya decididos (últimas 6 semanas).")
    weather_report(weather)
    games_report(games)
    bankroll_report(games, weather)
    print(
        "\nOjo: es optimista. Supone que el bot se lleva la primera venta del favorito en cada mercado. En la "
        "realidad, su orden a veces se llena justo cuando el precio se da la vuelta (alguien sabe algo), y eso "
        "estos datos no lo ven."
    )


if __name__ == "__main__":
    main()
