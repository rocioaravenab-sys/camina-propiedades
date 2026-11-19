"""API de caminaPropiedades: el mapa alrededor del usuario y la comparación de un aviso."""

from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from . import servicio
from .config import Config, desde_entorno
from .datos import DatosError, Fuente
from .datos_sql import FuenteSQL

app = FastAPI(title="caminaPropiedades API", version="0.1.0")


def obtener_config() -> Config:
    return desde_entorno()


def obtener_fuente(config: Config = Depends(obtener_config)):
    """Postgres directo si hay DATABASE_URL; si no, Supabase por PostgREST."""
    return FuenteSQL(config) if config.database_url else Fuente(config)


@app.exception_handler(DatosError)
def _datos_no_disponibles(_request, error):
    return JSONResponse(status_code=503, content={"detail": "Datos no disponibles: {}".format(error)})


@app.get("/salud")
def salud(fuente: Fuente = Depends(obtener_fuente), config: Config = Depends(obtener_config)):
    """Si la API está arriba y si los datos de venta están al día (alerta de 48 h)."""
    return servicio.salud(fuente, config)


@app.get("/cerca")
def cerca(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radio: int = Query(600, ge=100, le=servicio.RADIO_MAXIMO_M, description="Metros"),
    tipo: Optional[str] = Query(None, description="Departamento o Casa"),
    dormitorios_min: Optional[int] = Query(None, ge=0),
    precio_max_uf: Optional[float] = Query(None, gt=0),
    fuente: Fuente = Depends(obtener_fuente),
):
    """Avisos vigentes alrededor del usuario: pines con color y zonas aproximadas."""
    return servicio.cerca(fuente, lat, lon, radio, tipo, dormitorios_min, precio_max_uf)


@app.get("/propiedad/{id_aviso}/comparar")
def comparar(
    id_aviso: str,
    modo: Literal["vivir", "invertir"] = "vivir",
    pie: Optional[float] = Query(None, ge=0, le=100, description="Pie en %"),
    tasa: Optional[float] = Query(None, gt=0, le=30, description="Tasa anual en %"),
    plazo: Optional[int] = Query(None, ge=1, le=40, description="Años"),
    fuente: Fuente = Depends(obtener_fuente),
    config: Config = Depends(obtener_config),
):
    """Precio frente al sector, comparables, barrio y, en modo invertir, cap rate y flujo."""
    resultado = servicio.comparar_aviso(fuente, config, id_aviso, modo, pie, tasa, plazo)
    if resultado is None:
        raise HTTPException(status_code=404, detail="Aviso no encontrado")
    return resultado
