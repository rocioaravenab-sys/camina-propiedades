"""Configuración por variables de entorno (ver .env.example)."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_clave: str
    # Si está, la API lee Postgres directo (Railway) en vez de Supabase.
    database_url: str = ""
    dias_vigencia: int = 7
    # Crédito por defecto del modo inversión (decisión de Rocio, 2026-11-19):
    # pie 10%, 30 años y la tasa que usa la web de Semáforo (4,0%).
    pie_pct: float = 10.0
    plazo_anos: int = 30
    tasa_anual_pct: float = 4.0
    # Avisos sin datos nuevos por más de esto = alerta (ver /salud).
    horas_alerta: int = 48


def desde_entorno():
    return Config(
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_clave=os.getenv("SUPABASE_KEY", ""),
        database_url=os.getenv("DATABASE_URL", ""),
        dias_vigencia=int(os.getenv("DIAS_VIGENCIA", "7")),
        pie_pct=float(os.getenv("CREDITO_PIE_PCT", "10")),
        plazo_anos=int(os.getenv("CREDITO_PLAZO_ANOS", "30")),
        tasa_anual_pct=float(os.getenv("CREDITO_TASA_PCT", "4.0")),
        horas_alerta=int(os.getenv("HORAS_ALERTA", "48")),
    )
