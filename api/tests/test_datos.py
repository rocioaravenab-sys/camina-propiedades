import json
from datetime import date

import pytest

from app.config import Config
from app.datos import DatosError, Fuente, fila_a_aviso

FILA = {
    "id_origen": "TT-1", "portal": "TocToc", "url": "https://x", "comuna": "Ñuñoa", "sector": "",
    "tipo_propiedad": "Departamento", "habitaciones": 2, "banos": 2, "estacionamientos": 1,
    "precio_venta": "4850", "moneda": "UF", "latitud": "-33.456", "longitud": "-70.597",
    "fecha_captura": "2026-11-18",
}


def test_fila_en_uf():
    a = fila_a_aviso(FILA, 40000)
    assert a.precio_uf == 4850
    assert a.ubicacion_exacta is True  # TocToc, sin columna nueva
    assert a.sector is None


def test_fila_en_clp_se_pasa_a_uf_y_usd_queda_sin_precio():
    assert fila_a_aviso(dict(FILA, moneda="CLP", precio_venta=200_000_000), 40000).precio_uf == 5000
    assert fila_a_aviso(dict(FILA, moneda="USD"), 40000).precio_uf is None


def test_columna_ubicacion_exacta_manda_sobre_el_portal():
    assert fila_a_aviso(dict(FILA, ubicacion_exacta=False), 1).ubicacion_exacta is False
    assert fila_a_aviso(dict(FILA, portal="Yapo"), 1).ubicacion_exacta is False
    assert fila_a_aviso(dict(FILA, superficie_m2="64"), 1).m2 == 64


def test_sin_vista_ventas_vigentes_usa_ventas_rm_filtrada_por_fecha():
    pedidas = []

    def traer(url, headers):
        pedidas.append(url)
        if "ventas_vigentes" in url:
            raise DatosError("HTTP 404")
        return json.dumps([FILA])

    fuente = Fuente(Config("https://s.supabase.co", "k"), traer=traer, hoy=lambda: date(2026, 11, 19))
    avisos = fuente.avisos_cerca(-33.456, -70.597, 600, 40000)
    assert [a.id for a in avisos] == ["TT-1"]
    assert "ventas_rm" in pedidas[-1] and "fecha_captura=gte.2026-11-12" in pedidas[-1]


def test_error_de_red_se_propaga():
    def traer(url, headers):
        raise DatosError("caído")

    with pytest.raises(DatosError):
        Fuente(Config("https://s", "k"), traer=traer).avisos_cerca(-33.4, -70.6, 600, 1)
