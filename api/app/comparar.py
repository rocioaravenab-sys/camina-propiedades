"""Precio de un aviso frente a su sector: lógica pura, sin red.

Es la versión numérica de wizard._describir_precio_venta de
DossierInmobiliario (que devuelve un texto): mismo umbral de ±10%
(calculos.DESVIO_ACEPTABLE_VS_MEDIANA_PCT) para decir si un precio está
bajo, en línea o sobre lo normal del sector.

Compara en UF/m² cuando hay superficie suficiente, porque es lo justo entre
departamentos de distinto tamaño; si no, compara el precio total contra
avisos de la misma tipología (dormitorios y baños).
"""

import statistics
from dataclasses import dataclass, field
from typing import List, Optional

from .dossier import calculos, geo

UMBRAL_PCT = calculos.DESVIO_ACEPTABLE_VS_MEDIANA_PCT

# Bajo esta cantidad de comparables no se da un color firme (misma regla que
# usa DossierInmobiliario para avisar "pocos datos").
MIN_COMPARABLES = 5

# "El sector" de un aviso: 5 cuadras a la redonda, como en el dossier.
RADIO_SECTOR_M = geo.RADIO_POR_DEFECTO_M

COLOR_BAJO = "verde"
COLOR_EN_LINEA = "amarillo"
COLOR_SOBRE = "rojo"
COLOR_SIN_DATOS = "gris"


@dataclass
class Aviso:
    """Un aviso de venta tal como lo dejó el scraper, con el precio en UF."""

    id: str
    portal: str
    url: Optional[str]
    comuna: str
    sector: Optional[str]
    tipo: str
    dormitorios: Optional[int]
    banos: Optional[int]
    estacionamientos: Optional[int]
    precio: float
    moneda: str
    precio_uf: Optional[float]
    m2: Optional[float]
    lat: Optional[float]
    lon: Optional[float]
    ubicacion_exacta: bool
    fecha_captura: Optional[str] = None
    gasto_comun_clp: Optional[float] = None

    @property
    def uf_m2(self):
        if self.precio_uf and self.m2:
            return self.precio_uf / self.m2
        return None


@dataclass
class Posicion:
    """Dónde cae el precio de un aviso dentro de su sector."""

    color: str
    etiqueta: str
    base: Optional[str]  # 'uf_m2' | 'precio' | None (sin datos)
    valor: Optional[float] = None
    mediana: Optional[float] = None
    p25: Optional[float] = None
    p75: Optional[float] = None
    desvio_pct: Optional[float] = None
    n_comparables: int = 0
    comparables: List[str] = field(default_factory=list)


def _cuartiles(valores):
    if len(valores) == 1:
        return valores[0], valores[0], valores[0]
    q1, q2, q3 = statistics.quantiles(sorted(valores), n=4, method="inclusive")
    return q1, q2, q3


def _misma_tipologia(a, b):
    return a.tipo.lower() == b.tipo.lower() and a.dormitorios == b.dormitorios


def comparables_de(aviso, candidatos, radio_m=RADIO_SECTOR_M):
    """Avisos del mismo tipo y dormitorios a menos de radio_m, más cercanos primero."""
    if aviso.lat is None or aviso.lon is None:
        return []
    cercanos = []
    for otro in candidatos:
        if otro.id == aviso.id or otro.lat is None or otro.lon is None:
            continue
        if not _misma_tipologia(aviso, otro) or not otro.precio_uf:
            continue
        distancia = geo.distancia_metros(aviso.lat, aviso.lon, otro.lat, otro.lon)
        if distancia <= radio_m:
            cercanos.append((distancia, otro))
    cercanos.sort(key=lambda par: par[0])
    return [otro for _, otro in cercanos]


def clasificar(desvio_pct):
    """Color y etiqueta del semáforo de precio para una desviación vs la mediana."""
    if desvio_pct < -UMBRAL_PCT:
        return COLOR_BAJO, "Bajo el sector"
    if desvio_pct > UMBRAL_PCT:
        return COLOR_SOBRE, "Sobre el sector"
    return COLOR_EN_LINEA, "En línea con el sector"


def posicion_precio(aviso, comparables):
    """Compara el aviso con sus comparables: primero en UF/m², si no en precio."""
    sin_datos = Posicion(color=COLOR_SIN_DATOS, etiqueta="Pocos datos en el sector", base=None,
                         n_comparables=len(comparables), comparables=[c.id for c in comparables])
    if not aviso.precio_uf:
        return sin_datos

    con_m2 = [c for c in comparables if c.uf_m2]
    if aviso.uf_m2 and len(con_m2) >= MIN_COMPARABLES:
        base, valor, muestra, usados = "uf_m2", aviso.uf_m2, [c.uf_m2 for c in con_m2], con_m2
    else:
        misma = [c for c in comparables if c.banos == aviso.banos] or comparables
        if len(misma) < MIN_COMPARABLES:
            return sin_datos
        base, valor, muestra, usados = "precio", aviso.precio_uf, [c.precio_uf for c in misma], misma

    p25, mediana, p75 = _cuartiles(muestra)
    desvio = (valor - mediana) / mediana * 100.0
    color, etiqueta = clasificar(desvio)
    return Posicion(
        color=color,
        etiqueta=etiqueta,
        base=base,
        valor=valor,
        mediana=mediana,
        p25=p25,
        p75=p75,
        desvio_pct=desvio,
        n_comparables=len(usados),
        comparables=[c.id for c in usados],
    )


def mejor_segmento_arriendo(estadisticas, sector, dormitorios, banos):
    """El segmento de arriendo más parecido al aviso, o None.

    Mismo escalonamiento que wizard._mejor_segmento (dormitorios y baños,
    luego solo dormitorios, luego el general de la comuna), pero prefiriendo
    el sector del aviso cuando tiene datos, y nunca mezclando tipologías:
    este número alimenta el cap rate.
    """
    if not estadisticas:
        return None
    del_sector = [e for e in estadisticas if sector and (e.sector or "") == sector]
    for grupo in (del_sector, estadisticas):
        if not grupo:
            continue
        exactos = [e for e in grupo if e.dormitorios == dormitorios and e.banos == banos]
        if exactos:
            return max(exactos, key=lambda e: e.n_avisos)
        por_dorm = [e for e in grupo if e.dormitorios == dormitorios]
        if por_dorm:
            return max(por_dorm, key=lambda e: e.n_avisos)
    generales = [e for e in estadisticas if e.dormitorios is None]
    if generales:
        return max(generales, key=lambda e: e.n_avisos)
    return None
