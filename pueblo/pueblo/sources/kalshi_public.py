"""Datos públicos de mercados de Kalshi (sin clave: no puede operar ni ver tu cuenta)."""

from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation
from typing import Optional

import requests

from ..config import KALSHI_API


def dec(value) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def price(market: dict, key: str) -> Optional[Decimal]:
    """Precio en dólares: los campos nuevos acaban en _dollars; los viejos van en centavos."""
    value = dec(market.get(f"{key}_dollars"))
    if value is None:
        cents = dec(market.get(key))
        value = cents / 100 if cents is not None else None
    return value if value is not None and value > 0 else None


class KalshiPublic:
    def __init__(self, base_url: str = KALSHI_API, session=None, timeout: float = 20.0, pause: float = 0.25):
        self.base_url = base_url.rstrip("/")
        self.session = session or requests.Session()
        self.timeout = timeout
        self.pause = pause  # entre páginas, para no gastar el límite de peticiones

    def markets_closing(self, within_hours: float, now: Optional[float] = None, max_pages: int = 8) -> list:
        """Mercados abiertos que cierran en las próximas `within_hours` horas."""
        now = now if now is not None else time.time()
        params = {
            "status": "open",
            "min_close_ts": int(now),
            "max_close_ts": int(now + within_hours * 3600),
            "limit": 1000,
        }
        markets: list = []
        for page in range(max_pages):
            resp = self.session.get(f"{self.base_url}/markets", params=params, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            markets.extend(data.get("markets") or [])
            cursor = data.get("cursor")
            if not cursor:
                break
            params["cursor"] = cursor
            if page + 1 < max_pages and self.pause:
                time.sleep(self.pause)
        return markets
