import os
from datetime import date
from decimal import Decimal

import pytest

from app.config import Config
from app.datos import DatosError
from app.datos_sql import FuenteSQL

HOY = date(2026, 11, 19)
CONFIG = Config("", "", database_url="postgresql://x")

FILA = {
    "id_origen": "TT-1", "portal": "TocToc", "url": "https://x", "comuna": "Ñuñoa", "sector": None,
    "tipo_propiedad": "Departamento", "habitaciones": 2, "banos": 2, "estacionamientos": 1,
    "precio_venta": Decimal("4850"), "moneda": "UF", "gasto_comun": None,
    "latitud": Decimal("-33.456"), "longitud": Decimal("-70.597"),
    "fecha_captura": date(2026, 11, 18), "superficie_m2": Decimal("64.5"), "ubicacion_exacta": True,
}


def test_filas_de_postgres_se_convierten_en_avisos():
    pedidas = []

    def consultar(sql, parametros):
        pedidas.append((sql, parametros))
        return [FILA]

    avisos = FuenteSQL(CONFIG, consultar=consultar, hoy=lambda: HOY).avisos_cerca(-33.456, -70.597, 600, 40000)
    assert [(a.id, a.precio_uf, a.m2, a.fecha_captura) for a in avisos] == [("TT-1", 4850, 64.5, "2026-11-18")]
    sql, parametros = pedidas[0]
    assert sql.startswith("SELECT") and parametros["desde"] == date(2026, 11, 12)
    assert parametros["lat_min"] < -33.456 < parametros["lat_max"]


def test_datos_al_es_texto():
    fuente = FuenteSQL(CONFIG, consultar=lambda s, p: [{"fecha_captura": date(2026, 11, 18)}])
    assert fuente.datos_al() == "2026-11-18"


def test_error_de_base_se_propaga():
    def consultar(sql, parametros):
        raise DatosError("OperationalError")

    with pytest.raises(DatosError):
        FuenteSQL(CONFIG, consultar=consultar).aviso("TT-1", 1)


# Prueba contra un Postgres de verdad, solo si se define TEST_DATABASE_URL
# (una base desechable: la prueba crea y borra sus tablas).
URL = os.getenv("TEST_DATABASE_URL")


@pytest.mark.skipif(not URL, reason="sin TEST_DATABASE_URL")
def test_contra_postgres():
    import psycopg

    with psycopg.connect(URL, autocommit=True) as c:
        c.execute("DROP TABLE IF EXISTS ventas_rm, estadisticas_arriendo")
        # Mismos tipos que crea scrapper.py (sin las columnas nuevas, como una base vieja).
        c.execute(
            "CREATE TABLE ventas_rm (id_origen text, portal text, url text, comuna text, sector text,"
            " tipo_propiedad text, habitaciones integer, banos integer, estacionamientos integer,"
            " precio_venta numeric, moneda text, gasto_comun numeric, latitud numeric, longitud numeric,"
            " fecha_captura date)"
        )
        c.execute(
            "INSERT INTO ventas_rm VALUES"
            " ('TT-1','TocToc','u','Ñuñoa',NULL,'Departamento',2,2,1,4850,'UF',NULL,-33.456,-70.597,'2026-11-18'),"
            " ('TT-2','TocToc','u','Ñuñoa',NULL,'Departamento',2,2,1,4900,'UF',NULL,-33.456,-70.597,'2026-10-01'),"
            " ('TT-3','TocToc','u','Ñuñoa',NULL,'Departamento',2,2,1,4900,'UF',NULL,-33.500,-70.597,'2026-11-18')"
        )
        c.execute(
            "CREATE TABLE estadisticas_arriendo (comuna text, sector text, tipo_propiedad text,"
            " dormitorios integer, banos integer, estacionamientos integer, p25_clp numeric,"
            " p50_clp numeric, p75_clp numeric, n_avisos integer, fecha_semana date)"
        )
        c.execute(
            "INSERT INTO estadisticas_arriendo VALUES"
            " ('Ñuñoa',NULL,'departamento',2,2,NULL,500000,550000,600000,12,'2026-11-16'),"
            " ('Ñuñoa',NULL,'departamento',2,2,NULL,400000,450000,500000,9,'2026-11-09')"
        )

    fuente = FuenteSQL(Config("", "", database_url=URL), hoy=lambda: HOY)
    assert [a.id for a in fuente.avisos_cerca(-33.456, -70.597, 600, 40000)] == ["TT-1"]
    assert fuente.aviso("TT-2", 40000).precio_uf == 4900
    assert fuente.datos_al() == "2026-11-18"
    stats = fuente.estadisticas_arriendo("Ñuñoa", "Departamento")
    assert [(s.p50_clp, s.fecha_semana) for s in stats] == [(550000, "2026-11-16")]
    with pytest.raises(DatosError):  # la sesión es de solo lectura
        fuente.consultar("CREATE TABLE intruso (x int)", {})
