"""Lectura de avisos directo desde Postgres (Railway u otro), sin PostgREST.

Se usa cuando está DATABASE_URL: es la misma base a la que escriben los
scrapers de DossierInmobiliario. Expone la misma interfaz que datos.Fuente,
así que el resto de la API no se entera de dónde vienen los datos.

Todas las consultas son SELECT y la sesión se abre en solo lectura.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from math import cos, radians

from .config import Config
from .datos import LIMITE_FILAS, DatosError, fila_a_aviso
from .dossier import mercado_externo

TIEMPO_LIMITE_S = 10


def _plano(valor):
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (date, datetime)):
        return valor.isoformat()
    return valor


def _consultar_postgres(database_url):
    """Devuelve consultar(sql, parametros) -> lista de dicts, contra una conexión nueva."""

    def consultar(sql, parametros):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as error:  # pragma: no cover
            raise DatosError("Falta psycopg (pip install -r requirements.txt)") from error
        try:
            with psycopg.connect(
                database_url, connect_timeout=TIEMPO_LIMITE_S, row_factory=dict_row,
                options="-c default_transaction_read_only=on -c statement_timeout={}".format(TIEMPO_LIMITE_S * 1000),
            ) as conexion:
                return conexion.execute(sql, parametros).fetchall()
        except psycopg.Error as error:
            raise DatosError(type(error).__name__) from error

    return consultar


class FuenteSQL:
    """Acceso a los avisos de venta vigentes, con SQL directo."""

    def __init__(self, config: Config, consultar=None, hoy=None):
        self.config = config
        self.consultar = consultar or _consultar_postgres(config.database_url)
        self.hoy = hoy or date.today

    def _filas(self, sql, parametros):
        return [{k: _plano(v) for k, v in fila.items()} for fila in self.consultar(sql, parametros)]

    def _desde(self):
        return self.hoy() - timedelta(days=self.config.dias_vigencia)

    def avisos_cerca(self, lat, lon, radio_m, valor_uf):
        """Avisos vigentes dentro de una caja que contiene el círculo pedido."""
        dlat = radio_m / 111_320.0
        dlon = radio_m / (111_320.0 * max(cos(radians(lat)), 0.01))
        # SELECT *: las columnas nuevas (superficie_m2, ubicacion_exacta) se
        # usan si existen; fila_a_aviso tolera que falten.
        filas = self._filas(
            "SELECT * FROM ventas_rm"
            " WHERE fecha_captura >= %(desde)s"
            " AND latitud BETWEEN %(lat_min)s AND %(lat_max)s"
            " AND longitud BETWEEN %(lon_min)s AND %(lon_max)s"
            " LIMIT %(limite)s",
            {
                "desde": self._desde(), "lat_min": lat - dlat, "lat_max": lat + dlat,
                "lon_min": lon - dlon, "lon_max": lon + dlon, "limite": LIMITE_FILAS,
            },
        )
        return [fila_a_aviso(f, valor_uf) for f in filas]

    def aviso(self, id_origen, valor_uf):
        """Un aviso por id (aunque ya no esté vigente: puede estar en Guardadas)."""
        filas = self._filas(
            "SELECT * FROM ventas_rm WHERE id_origen = %(id)s ORDER BY fecha_captura DESC LIMIT 1",
            {"id": id_origen},
        )
        return fila_a_aviso(filas[0], valor_uf) if filas else None

    def datos_al(self):
        filas = self._filas("SELECT max(fecha_captura) AS fecha_captura FROM ventas_rm", {})
        return filas[0]["fecha_captura"] if filas else None

    def estadisticas_arriendo(self, comuna, tipo):
        """Lo mismo que mercado_externo.consultar: la semana más reciente de la comuna."""
        if not comuna:
            return []
        filas = self._filas(
            "SELECT * FROM estadisticas_arriendo WHERE comuna = %(comuna)s"
            " AND fecha_semana = (SELECT max(fecha_semana) FROM estadisticas_arriendo WHERE comuna = %(comuna)s)",
            {"comuna": comuna},
        )
        resultado = [
            mercado_externo.EstadisticaExterna(
                comuna=f["comuna"], sector=f.get("sector"), tipo_propiedad=f["tipo_propiedad"],
                dormitorios=f.get("dormitorios"), banos=f.get("banos"),
                estacionamientos=f.get("estacionamientos"),
                p25_clp=f["p25_clp"], p50_clp=f["p50_clp"], p75_clp=f["p75_clp"],
                n_avisos=f["n_avisos"], fecha_semana=f["fecha_semana"],
            )
            for f in filas
        ]
        if tipo:
            resultado = [e for e in resultado if e.tipo_propiedad.lower() == tipo.lower()]
        return resultado
