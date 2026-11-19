"""Lo que responde la API: el mapa alrededor del usuario y la comparación de un aviso."""

import os
import time
from dataclasses import asdict
from datetime import datetime, timezone

from . import comparar
from .config import Config
from .datos import DatosError, Fuente
from .dossier import banderas_sector, calculos, conectividad, criminalidad, geo, indicadores, modelos

# Región Metropolitana, en una caja amplia: fuera de ella la app muestra
# "Todavía no llegamos a tu zona".
_RM_LAT = (-34.30, -32.90)
_RM_LON = (-71.75, -69.75)

RADIO_MAXIMO_M = 1500

# El barrio (Overpass/OpenStreetMap) cambia poco y Overpass limita consultas:
# se guarda por sector (~100 m) durante 30 días.
_TTL_BARRIO_S = 30 * 24 * 3600
_cache_barrio = {}


def en_region_metropolitana(lat, lon):
    return _RM_LAT[0] <= lat <= _RM_LAT[1] and _RM_LON[0] <= lon <= _RM_LON[1]


def valor_uf():
    """UF del día (mindicador.cl, con caché local). None si no hay forma de saberla."""
    try:
        conexion = indicadores.abrir(os.getenv("CACHE_UF", "/tmp/camina_uf.db"))
        return indicadores.uf(conexion).valor
    except Exception:
        return None


def _aviso_json(aviso, posicion=None):
    datos = {
        "id": aviso.id,
        "portal": aviso.portal,
        "url": aviso.url,
        "comuna": aviso.comuna,
        "sector": aviso.sector,
        "tipo": aviso.tipo,
        "dormitorios": aviso.dormitorios,
        "banos": aviso.banos,
        "estacionamientos": aviso.estacionamientos,
        "precio": aviso.precio,
        "moneda": aviso.moneda,
        "precio_uf": round(aviso.precio_uf, 1) if aviso.precio_uf else None,
        "m2": aviso.m2,
        "uf_m2": round(aviso.uf_m2, 2) if aviso.uf_m2 else None,
        "lat": aviso.lat,
        "lon": aviso.lon,
        "ubicacion_exacta": aviso.ubicacion_exacta,
        "visto_el": aviso.fecha_captura,
    }
    if posicion is not None:
        datos["color"] = posicion.color
        datos["desvio_pct"] = round(posicion.desvio_pct, 1) if posicion.desvio_pct is not None else None
    return datos


def _posicion_json(p):
    redondear = (lambda v: round(v, 2) if v is not None else None)
    return {
        "color": p.color,
        "etiqueta": p.etiqueta,
        "base": p.base,
        "valor": redondear(p.valor),
        "mediana": redondear(p.mediana),
        "p25": redondear(p.p25),
        "p75": redondear(p.p75),
        "desvio_pct": round(p.desvio_pct, 1) if p.desvio_pct is not None else None,
        "n_comparables": p.n_comparables,
    }


def _filtrar(avisos, tipo=None, dormitorios_min=None, precio_max_uf=None):
    resultado = []
    for a in avisos:
        if tipo and a.tipo.lower() != tipo.lower():
            continue
        if dormitorios_min is not None and (a.dormitorios or 0) < dormitorios_min:
            continue
        if precio_max_uf is not None and (not a.precio_uf or a.precio_uf > precio_max_uf):
            continue
        resultado.append(a)
    return resultado


def cerca(fuente: Fuente, lat, lon, radio_m=600, tipo=None, dormitorios_min=None, precio_max_uf=None):
    """Avisos vigentes alrededor del usuario: pines (exactos) y zonas (aproximados)."""
    radio_m = max(100, min(int(radio_m), RADIO_MAXIMO_M))
    if not en_region_metropolitana(lat, lon):
        return {"fuera_de_zona": True, "avisos": [], "zonas": []}

    uf = valor_uf()
    # Se trae más allá del radio para que los avisos del borde tengan su
    # sector completo con qué compararse.
    candidatos = fuente.avisos_cerca(lat, lon, radio_m + comparar.RADIO_SECTOR_M, uf)
    en_radio = [
        a for a in candidatos
        if a.lat is not None and geo.distancia_metros(lat, lon, a.lat, a.lon) <= radio_m
    ]
    en_radio = _filtrar(en_radio, tipo, dormitorios_min, precio_max_uf)

    avisos, zonas = [], {}
    for aviso in en_radio:
        posicion = comparar.posicion_precio(aviso, comparar.comparables_de(aviso, candidatos))
        if aviso.ubicacion_exacta:
            avisos.append(_aviso_json(aviso, posicion))
        else:
            clave = (aviso.comuna, aviso.sector or "", round(aviso.lat, 4), round(aviso.lon, 4))
            zona = zonas.setdefault(clave, {
                "comuna": aviso.comuna, "sector": aviso.sector, "lat": aviso.lat, "lon": aviso.lon,
                "cantidad": 0, "avisos": [],
            })
            zona["cantidad"] += 1
            zona["avisos"].append(_aviso_json(aviso, posicion))

    return {
        "fuera_de_zona": False,
        "radio_m": radio_m,
        "valor_uf": uf,
        "avisos": avisos,
        "zonas": list(zonas.values()),
    }


def barrio(lat, lon, comuna):
    """Metro, áreas verdes, molestias y delincuencia comunal, con banderas de color."""
    clave = (round(lat, 3), round(lon, 3))
    guardado = _cache_barrio.get(clave)
    if guardado and time.time() - guardado[0] < _TTL_BARRIO_S:
        con = guardado[1]
    else:
        try:
            con = conectividad.consultar(lat, lon)
        except Exception:
            con = None
        if con is not None:
            _cache_barrio[clave] = (time.time(), con)
    crim = criminalidad.nivel(comuna)
    banderas = banderas_sector.evaluar(con, crim)
    return {
        "metro": asdict(con.estacion_mas_cercana) if con and con.estacion_mas_cercana else None,
        "area_verde": asdict(con.parque_mas_cercano) if con and con.parque_mas_cercano else None,
        "criminalidad": asdict(crim) if crim else None,
        "banderas": [asdict(b) for b in banderas],
    }


def inversion(aviso, uf, arriendo_clp, pie_pct, tasa_pct, plazo_anos):
    """Cap rate, dividendo, flujo y veredicto con el motor de DossierInmobiliario."""
    entrada = modelos.EntradaDossier(
        propiedad=modelos.Propiedad(
            nombre=aviso.id, direccion="", comuna=aviso.comuna, tipo=aviso.tipo,
            m2_utiles=aviso.m2 or 0.0, dormitorios=aviso.dormitorios or 0, banos=aviso.banos or 0,
            estacionamientos=aviso.estacionamientos or 0, precio=aviso.precio_uf, moneda="UF",
            lat=aviso.lat, lon=aviso.lon,
        ),
        credito=modelos.Credito(pie_pct=pie_pct, tasa_interes_anual_pct=tasa_pct, plazo_anos=plazo_anos),
        mercado=modelos.Mercado(arriendo_mensual_clp=arriendo_clp, valor_uf_clp=uf, arriendo_scrapper_clp=arriendo_clp),
        zona=modelos.Zona(saturacion="", precio_venta_comparable="", plusvalia=""),
    )
    r = calculos.analizar(entrada)
    return {
        "arriendo_estimado_clp": round(r.arriendo_mensual),
        "cap_rate_pct": round(r.cap_rate_pct, 2),
        "nivel_cap_rate": r.nivel_cap_rate,
        "dividendo_clp": round(r.dividendo_clp),
        "dividendo_uf": round(r.dividendo_uf, 2),
        "flujo_mensual_clp": round(r.flujo_caja_mensual),
        "veredicto": r.veredicto,
        "color": r.color.lower(),
        "credito": {"pie_pct": pie_pct, "tasa_anual_pct": tasa_pct, "plazo_anos": plazo_anos},
    }


def comparar_aviso(fuente: Fuente, config: Config, id_aviso, modo="vivir",
                   pie_pct=None, tasa_pct=None, plazo_anos=None):
    """La ficha de comparación de un aviso. None si el aviso no existe."""
    uf = valor_uf()
    aviso = fuente.aviso(id_aviso, uf)
    if aviso is None:
        return None

    comparables = []
    if aviso.lat is not None:
        candidatos = fuente.avisos_cerca(aviso.lat, aviso.lon, comparar.RADIO_SECTOR_M, uf)
        comparables = comparar.comparables_de(aviso, candidatos)
    posicion = comparar.posicion_precio(aviso, comparables)
    usados = set(posicion.comparables)

    respuesta = {
        "aviso": _aviso_json(aviso),
        "precio": _posicion_json(posicion),
        "comparables": [_aviso_json(c) for c in comparables if c.id in usados][:15],
        "barrio": barrio(aviso.lat, aviso.lon, aviso.comuna) if aviso.lat is not None else None,
        "inversion": None,
    }

    if modo == "invertir":
        respuesta["inversion"] = _inversion_o_motivo(
            fuente, aviso, uf,
            config.pie_pct if pie_pct is None else pie_pct,
            config.tasa_anual_pct if tasa_pct is None else tasa_pct,
            config.plazo_anos if plazo_anos is None else plazo_anos,
        )
    return respuesta


def _inversion_o_motivo(fuente, aviso, uf, pie_pct, tasa_pct, plazo_anos):
    if not uf or not aviso.precio_uf:
        return {"disponible": False, "motivo": "Falta el precio en UF o el valor de la UF."}
    try:
        estadisticas = fuente.estadisticas_arriendo(aviso.comuna, aviso.tipo)
    except Exception:
        estadisticas = []
    segmento = comparar.mejor_segmento_arriendo(estadisticas, aviso.sector, aviso.dormitorios, aviso.banos)
    if segmento is None:
        return {"disponible": False, "motivo": "No hay arriendos comparables en este sector todavía."}
    resultado = inversion(aviso, uf, segmento.p50_clp, pie_pct, tasa_pct, plazo_anos)
    resultado["disponible"] = True
    resultado["arriendo_fuente"] = {
        "n_avisos": segmento.n_avisos, "semana": segmento.fecha_semana,
        "dormitorios": segmento.dormitorios, "banos": segmento.banos,
    }
    return resultado


def salud(fuente: Fuente, config: Config, ahora=None):
    """Estado de los datos: avisa si el scraper lleva más de 48 h sin datos nuevos."""
    try:
        ultima = fuente.datos_al()
    except DatosError as error:
        return {"ok": False, "datos_al": None, "alerta": "No se pudo leer Supabase: {}".format(error)}
    if not ultima:
        return {"ok": False, "datos_al": None, "alerta": "No hay avisos de venta."}
    ahora = ahora or datetime.now(timezone.utc)
    captura = datetime.fromisoformat(ultima[:10]).replace(tzinfo=timezone.utc)
    horas = (ahora - captura).total_seconds() / 3600
    # fecha_captura es un día, no una hora: se cuenta desde el fin de ese día.
    atrasado = horas - 24 > config.horas_alerta
    return {
        "ok": not atrasado,
        "datos_al": ultima[:10],
        "alerta": "El scraper lleva más de {} h sin datos nuevos.".format(config.horas_alerta) if atrasado else None,
    }
