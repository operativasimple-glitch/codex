"""Los vecinos del pueblo."""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from ..config import Config
from ..sources.kalshi_public import KalshiPublic
from ..sources.nws import NWSClient
from ..sources.panel import PanelClient
from ..world import World
from .cronista import Cronista
from .kali import Kali
from .nube import Nube
from .radar import Radar
from .vigia import Vigia


def tz_minutes(tz: str):
    """Lo que el panel espera en `tz`: minutos de UTC menos la hora local (como getTimezoneOffset)."""
    zone = ZoneInfo(tz)

    def offset() -> int:
        delta = datetime.now(timezone.utc).astimezone(zone).utcoffset()
        return -int(delta.total_seconds() // 60) if delta is not None else 0

    return offset


def build_agents(world: World, config: Config) -> list:
    panel = PanelClient(config.panel_url, config.panel_password) if config.panel_configured else None
    return [
        Kali(world, panel, tz_minutes(config.tz)),
        Nube(world, NWSClient(config.contact)),
        Vigia(world),
        Radar(world, KalshiPublic(config.kalshi_api)),
        Cronista(world, config.tz),
    ]
