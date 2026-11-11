"""¿Quién gana con las combinadas (parlays) de Kalshi? Solo datos públicos.

Las combinadas no tienen libro de órdenes: quien quiere una pide precio (RFQ) y un creador de
mercado se lo da. Aquí se toma una muestra al azar de combinadas ya decididas, se bajan sus
operaciones reales (precio, tamaño y quién tomó el precio) y se cuenta, por tramo de precio, cuántas
veces salieron: si quien compra a 20¢ gana menos del 20 % de las veces, está pagando de más.

Uso (cada parte baja días distintos; así varias máquinas reparten el trabajo):
    python kalshi_sim/combos.py fetch --shard 3 --shards 20 --per-shard 1000

Imprime una línea `RESULT {...}` con la tabla sumada de esa parte.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import random
import re
import sys
import time

import requests

API = "https://api.elections.kalshi.com/trade-api/v2"
FIRST_DAY = dt.datetime(2026, 10, 28, tzinfo=dt.timezone.utc)
DAYS = 13
HOURS = (1, 4, 17, 19, 22)  # ventanas repartidas por el día (UTC)
BUCKETS = (0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0001)
WINNER = re.compile(r"(GAME|MATCH|FIGHT)$")
session = requests.Session()


def get(path: str, pace: float = 0.3, **params):
    params = {k: v for k, v in params.items() if v is not None}
    for attempt in range(60):
        try:
            resp = session.get(API + path, params=params, timeout=40)
        except requests.RequestException:
            time.sleep(2 + attempt)
            continue
        if resp.status_code == 429:
            time.sleep(0.7)
            continue
        resp.raise_for_status()
        time.sleep(pace)
        return resp.json()
    raise RuntimeError(f"Kalshi no contesta: {path}")


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def kind(legs: list) -> str:
    """De qué está hecha: solo ganadores de partidos distintos, con dos patas del mismo partido u otras."""
    tickers = [leg.get("market_ticker") or "" for leg in legs]
    events = [t.split("-")[1] if t.count("-") else t for t in tickers]
    if len(set(events)) < len(events):
        return "mismo_partido"
    if all(WINNER.search(t.split("-")[0]) for t in tickers):
        return "ganadores"
    return "otras"


def size(legs: list) -> str:
    return "2-3" if len(legs) <= 3 else "4-5" if len(legs) <= 5 else "6+"


def fetch(shard: int, shards: int, per_shard: int) -> dict:
    rng = random.Random(1000 + shard)
    markets = {}
    for day in range(DAYS):
        if day % shards != shard % min(shards, DAYS) and shards <= DAYS:
            continue
        for hour in HOURS:
            if shards > DAYS and (day * len(HOURS) + HOURS.index(hour)) % shards != shard:
                continue
            start = int((FIRST_DAY + dt.timedelta(days=day, hours=hour)).timestamp())
            cursor = None
            for _page in range(3):
                data = get(
                    "/markets", mve_filter="only", status="settled", limit=1000, cursor=cursor,
                    min_close_ts=start, max_close_ts=start + 2 * 3600,
                )  # fmt: skip
                for m in data.get("markets") or []:
                    if num(m.get("settlement_value_dollars")) is not None and (num(m.get("volume_fp")) or 0) > 0:
                        markets[m["ticker"]] = m
                cursor = data.get("cursor")
                if not cursor:
                    break
    chosen = rng.sample(sorted(markets), min(per_shard, len(markets)))
    print(f"parte {shard}: {len(markets)} combinadas decididas, muestra de {len(chosen)}", file=sys.stderr, flush=True)
    table: dict = collections.defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])
    combos: dict = collections.Counter()
    for i, ticker in enumerate(chosen):
        m = markets[ticker]
        legs = m.get("mve_selected_legs") or []
        value = num(m.get("settlement_value_dollars"))
        group, legs_group = kind(legs), size(legs)
        combos[f"{group}|{legs_group}"] += 1
        trades = get("/markets/trades", pace=0.25, ticker=ticker, limit=1000).get("trades") or []
        trades.sort(key=lambda t: t.get("created_time") or "")
        for order, t in enumerate(trades):
            price, count = num(t.get("yes_price_dollars")), num(t.get("count_fp"))
            side = t.get("taker_outcome_side") or t.get("taker_side")
            if price is None or not count or not 0 < price < 1 or side not in ("yes", "no"):
                continue
            bucket = next(k for k in range(len(BUCKETS) - 1) if BUCKETS[k] <= price < BUCKETS[k + 1])
            row = table[f"{group}|{legs_group}|{side}|{bucket}|{'primera' if order == 0 else 'despues'}"]
            row[0] += 1
            row[1] += price
            row[2] += value
            row[3] += count * price
            row[4] += count * value
        if (i + 1) % 200 == 0:
            print(f"  {i + 1} combinadas", file=sys.stderr, flush=True)
    return {"shard": shard, "combos": dict(combos), "table": {k: [round(x, 4) for x in v] for k, v in table.items()}}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["fetch"])
    parser.add_argument("--shard", type=int, default=0)
    parser.add_argument("--shards", type=int, default=1)
    parser.add_argument("--per-shard", type=int, default=1000)
    args = parser.parse_args()
    result = fetch(args.shard, args.shards, args.per_shard)
    print("RESULT " + json.dumps(result, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
