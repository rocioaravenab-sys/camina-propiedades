"""Lectura de avisos de venta desde Supabase (solo lectura, vía PostgREST).

Mismo estilo que mercado_externo.py de DossierInmobiliario: HTTP directo,
sin SDK, y la función que sale a la red se puede reemplazar en los tests.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from math import cos, radians

from .comparar import Aviso
from .config import Config
from .dossier import mercado_externo

TIEMPO_LIMITE = 10
LIMITE_FILAS = 1000

# Portales que entregan la coordenada real del aviso. Se usa solo para filas
# guardadas antes de que existiera la columna ubicacion_exacta.
_PORTALES_EXACTOS = set(mercado_externo.PORTALES_CON_UBICACION_REAL) | {"GoPlaceIt"}

# Se pide cada columna por nombre, no '*': si falta una (superficie_m2 o
# ubicacion_exacta en una base sin la migración de la fase 1), PostgREST
# responde 400 y se reintenta con las columnas básicas.
_COLUMNAS = (
    "id_origen,portal,url,comuna,sector,tipo_propiedad,habitaciones,banos,"
    "estacionamientos,precio_venta,moneda,gasto_comun,latitud,longitud,fecha_captura"
)
_COLUMNAS_NUEVAS = ",superficie_m2,ubicacion_exacta,fotos"


class DatosError(Exception):
    """Supabase no respondió o respondió algo ilegible."""


def _traer(url, headers):
    peticion = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(peticion, timeout=TIEMPO_LIMITE) as respuesta:
            return respuesta.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raise DatosError("HTTP {}".format(error.code)) from error
    except (urllib.error.URLError, OSError) as error:
        raise DatosError(str(error)) from error


def _numero(valor):
    try:
        return float(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None


def _entero(valor):
    n = _numero(valor)
    return int(n) if n is not None else None


def _fotos(valor):
    """La columna fotos guarda una lista JSON en texto; también acepta una
    lista ya decodificada. Devuelve [] si no hay fotos o no se puede leer."""
    if isinstance(valor, str):
        try:
            valor = json.loads(valor)
        except ValueError:
            return []
    if not isinstance(valor, list):
        return []
    return [u for u in valor if isinstance(u, str) and u.startswith(("http://", "https://"))][:3]


def fila_a_aviso(fila, valor_uf):
    """Convierte una fila de ventas_rm en Aviso, con el precio pasado a UF."""
    precio = _numero(fila.get("precio_venta")) or 0.0
    moneda = (fila.get("moneda") or "UF").upper()
    if moneda == "UF":
        precio_uf = precio or None
    elif moneda == "CLP" and valor_uf:
        precio_uf = precio / valor_uf if precio else None
    else:
        precio_uf = None  # USD u otra: sin conversión confiable, queda sin color

    lat, lon = _numero(fila.get("latitud")), _numero(fila.get("longitud"))
    exacta = fila.get("ubicacion_exacta")
    if exacta is None:
        exacta = fila.get("portal") in _PORTALES_EXACTOS and lat is not None

    m2 = _numero(fila.get("superficie_m2"))
    return Aviso(
        id=fila.get("id_origen"),
        portal=fila.get("portal") or "",
        url=fila.get("url"),
        comuna=fila.get("comuna") or "",
        sector=fila.get("sector") or None,
        tipo=fila.get("tipo_propiedad") or "",
        dormitorios=_entero(fila.get("habitaciones")),
        banos=_entero(fila.get("banos")),
        estacionamientos=_entero(fila.get("estacionamientos")),
        precio=precio,
        moneda=moneda,
        precio_uf=precio_uf,
        m2=m2 if m2 and m2 > 0 else None,
        lat=lat,
        lon=lon,
        ubicacion_exacta=bool(exacta),
        fecha_captura=fila.get("fecha_captura"),
        gasto_comun_clp=_numero(fila.get("gasto_comun")),
        fotos=_fotos(fila.get("fotos")),
    )


class Fuente:
    """Acceso a los avisos de venta vigentes en Supabase."""

    def __init__(self, config: Config, traer=None, hoy=None):
        self.config = config
        self.traer = traer or _traer
        self.hoy = hoy or date.today

    def _headers(self):
        clave = self.config.supabase_clave
        return {"apikey": clave, "Authorization": "Bearer {}".format(clave), "Accept": "application/json"}

    def _get(self, tabla, parametros):
        url = "{}/rest/v1/{}?{}".format(
            self.config.supabase_url.rstrip("/"), tabla, urllib.parse.urlencode(parametros, doseq=True)
        )
        crudo = self.traer(url, self._headers())
        try:
            filas = json.loads(crudo)
        except (TypeError, ValueError) as error:
            raise DatosError("Respuesta ilegible de Supabase: {}".format(error)) from error
        if not isinstance(filas, list):
            raise DatosError("Supabase no devolvió una lista")
        return filas

    def _ventas(self, filtros):
        """Filas de avisos vigentes. Usa la vista ventas_vigentes; si todavía no
        existe (base sin la migración de la fase 1), filtra ventas_rm por fecha."""
        desde = (self.hoy() - timedelta(days=self.config.dias_vigencia)).isoformat()
        intentos = (
            ("ventas_vigentes", _COLUMNAS + _COLUMNAS_NUEVAS, {}),
            ("ventas_rm", _COLUMNAS + _COLUMNAS_NUEVAS, {"fecha_captura": "gte." + desde}),
            ("ventas_rm", _COLUMNAS, {"fecha_captura": "gte." + desde}),
        )
        ultimo_error = None
        for tabla, columnas, extra in intentos:
            parametros = dict(filtros, select=columnas, limit=str(LIMITE_FILAS), **extra)
            try:
                return self._get(tabla, parametros)
            except DatosError as error:
                ultimo_error = error
        raise ultimo_error

    def avisos_cerca(self, lat, lon, radio_m, valor_uf):
        """Avisos vigentes dentro de una caja que contiene el círculo pedido."""
        dlat = radio_m / 111_320.0
        dlon = radio_m / (111_320.0 * max(cos(radians(lat)), 0.01))
        filtros = {
            "latitud": ["gte.{:.6f}".format(lat - dlat), "lte.{:.6f}".format(lat + dlat)],
            "longitud": ["gte.{:.6f}".format(lon - dlon), "lte.{:.6f}".format(lon + dlon)],
        }
        return [fila_a_aviso(f, valor_uf) for f in self._ventas(filtros)]

    def aviso(self, id_origen, valor_uf):
        """Un aviso por id (aunque ya no esté vigente: puede estar en Guardadas)."""
        filtros = {"id_origen": "eq.{}".format(id_origen), "limit": "1"}
        try:
            filas = self._get("ventas_rm", dict(filtros, select=_COLUMNAS + _COLUMNAS_NUEVAS))
        except DatosError:
            filas = self._get("ventas_rm", dict(filtros, select=_COLUMNAS))
        return fila_a_aviso(filas[0], valor_uf) if filas else None

    def datos_al(self):
        """Fecha de la última captura de ventas (para mostrar "datos al ...")."""
        filas = self._get("ventas_rm", {"select": "fecha_captura", "order": "fecha_captura.desc", "limit": "1"})
        return filas[0]["fecha_captura"] if filas else None

    def estadisticas_arriendo(self, comuna, tipo):
        return mercado_externo.consultar(
            self.config.supabase_url, self.config.supabase_clave, comuna, tipo,
            traer=self.traer,
        )
