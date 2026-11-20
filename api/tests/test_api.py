from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import main, servicio
from app.comparar import Aviso
from app.config import Config
from app.dossier import mercado_externo

UF = 40000.0
CONFIG = Config("https://s", "k")


def _aviso(id, precio_uf, dlat=0.0, exacta=True, sector="Plaza Ñuñoa"):
    return Aviso(
        id=id, portal="TocToc" if exacta else "Yapo", url="https://portal/" + id, comuna="Ñuñoa",
        sector=sector, tipo="Departamento", dormitorios=2, banos=2, estacionamientos=1,
        precio=precio_uf, moneda="UF", precio_uf=precio_uf, m2=None,
        lat=-33.4560 + dlat, lon=-70.5970, ubicacion_exacta=exacta, fecha_captura="2026-11-18",
    )


class FuenteFalsa:
    def __init__(self, avisos, estadisticas=(), datos_al="2026-11-18", historial=()):
        self.avisos = avisos
        self.estadisticas = list(estadisticas)
        self._datos_al = datos_al
        self.historial = list(historial)

    def historial_precios(self, id_origen):
        return self.historial

    def avisos_cerca(self, lat, lon, radio_m, valor_uf):
        return self.avisos

    def aviso(self, id_origen, valor_uf):
        return next((a for a in self.avisos if a.id == id_origen), None)

    def datos_al(self):
        return self._datos_al

    def estadisticas_arriendo(self, comuna, tipo):
        return self.estadisticas


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(servicio, "valor_uf", lambda: UF)
    monkeypatch.setattr(servicio.conectividad, "consultar", lambda lat, lon: None)

    def armar(fuente):
        main.app.dependency_overrides[main.obtener_fuente] = lambda: fuente
        main.app.dependency_overrides[main.obtener_config] = lambda: CONFIG
        return TestClient(main.app)

    yield armar
    main.app.dependency_overrides.clear()


def _sector(n=6):
    comps = [_aviso("c%d" % i, 5000, dlat=0.001 * (i + 1)) for i in range(n)]
    return comps + [_aviso("barato", 4400), _aviso("aprox", 5000, exacta=False)]


def test_fuera_de_la_region_metropolitana(cliente):
    r = cliente(FuenteFalsa([])).get("/cerca", params={"lat": -36.82, "lon": -73.05})  # Concepción
    assert r.status_code == 200
    assert r.json()["fuera_de_zona"] is True


def test_cerca_separa_pines_exactos_y_zonas_aproximadas(cliente):
    r = cliente(FuenteFalsa(_sector())).get("/cerca", params={"lat": -33.4560, "lon": -70.5970})
    datos = r.json()
    ids = {a["id"]: a for a in datos["avisos"]}
    assert "aprox" not in ids
    assert ids["barato"]["color"] == "verde"
    assert datos["zonas"][0]["cantidad"] == 1
    assert datos["zonas"][0]["sector"] == "Plaza Ñuñoa"


def test_cerca_filtra_por_precio(cliente):
    r = cliente(FuenteFalsa(_sector())).get(
        "/cerca", params={"lat": -33.4560, "lon": -70.5970, "precio_max_uf": 4500})
    assert [a["id"] for a in r.json()["avisos"]] == ["barato"]


def test_cerca_con_mapa_alejado_trae_los_mas_cercanos(cliente, monkeypatch):
    monkeypatch.setattr(servicio, "MAXIMO_AVISOS", 3)
    r = cliente(FuenteFalsa(_sector())).get(
        "/cerca", params={"lat": -33.4560, "lon": -70.5970, "radio": 4000})
    datos = r.json()
    assert datos["recortado"] is True
    assert datos["radio_m"] == 4000
    total = len(datos["avisos"]) + sum(z["cantidad"] for z in datos["zonas"])
    assert total == 3
    assert "c5" not in {a["id"] for a in datos["avisos"]}  # el más lejano queda fuera


def test_comparar_para_vivir(cliente):
    r = cliente(FuenteFalsa(_sector())).get("/propiedad/barato/comparar")
    datos = r.json()
    assert datos["precio"]["color"] == "verde"
    assert datos["precio"]["base"] == "precio"
    assert datos["precio"]["mediana"] == 5000
    assert len(datos["comparables"]) == 6  # c5 queda a ~670 m, fuera del sector
    assert datos["inversion"] is None
    assert datos["barrio"]["criminalidad"]["comuna"] == "Ñuñoa"


def test_comparar_para_invertir_usa_credito_por_defecto(cliente):
    seg = mercado_externo.EstadisticaExterna(
        comuna="Ñuñoa", sector="Plaza Ñuñoa", tipo_propiedad="departamento", dormitorios=2, banos=2,
        estacionamientos=None, p25_clp=550000, p50_clp=600000, p75_clp=650000, n_avisos=8,
        fecha_semana="2026-11-16",
    )
    r = cliente(FuenteFalsa(_sector(), [seg])).get("/propiedad/barato/comparar", params={"modo": "invertir"})
    inv = r.json()["inversion"]
    assert inv["disponible"] is True
    assert inv["credito"] == {"pie_pct": 10.0, "tasa_anual_pct": 4.0, "plazo_anos": 30}
    assert inv["arriendo_estimado_clp"] == 600000
    # 600.000 x 12 / (4.400 UF x 40.000) = 4,09%
    assert inv["cap_rate_pct"] == pytest.approx(4.09, abs=0.01)
    assert inv["nivel_cap_rate"] == "Aceptable"
    assert inv["color"] in {"verde", "amarillo", "rojo"}


def test_invertir_sin_arriendos_lo_dice(cliente):
    r = cliente(FuenteFalsa(_sector())).get("/propiedad/barato/comparar", params={"modo": "invertir"})
    assert r.json()["inversion"]["disponible"] is False


def test_detalle_trae_dias_publicado_y_baja_de_precio(cliente, monkeypatch):
    historial = [
        {"fecha_captura": "2026-10-01", "precio_venta": 4600, "moneda": "UF"},
        {"fecha_captura": "2026-10-08", "precio_venta": 4600, "moneda": "UF"},
        {"fecha_captura": "2026-11-10", "precio_venta": 4400, "moneda": "UF"},
    ]
    r = cliente(FuenteFalsa(_sector(), historial=historial)).get("/propiedad/barato")
    datos = r.json()
    assert datos["aviso"]["color"] == "verde"
    assert datos["publicado_desde"] == "2026-10-01"
    assert datos["dias_publicado"] >= 49
    assert [h["precio"] for h in datos["historial"]] == [4600, 4400]
    assert datos["cambio_precio"]["pct"] == pytest.approx(-4.3, abs=0.05)
    assert datos["precio_clp"] == 4400 * UF


def test_detalle_sin_historial(cliente):
    datos = cliente(FuenteFalsa(_sector())).get("/propiedad/barato").json()
    assert datos["historial"] == [] and datos["cambio_precio"] is None
    assert datos["publicado_desde"] == "2026-11-18"


def test_aviso_inexistente_da_404(cliente):
    assert cliente(FuenteFalsa([])).get("/propiedad/nada").status_code == 404
    assert cliente(FuenteFalsa([])).get("/propiedad/nada/comparar").status_code == 404


def test_salud_alerta_tras_48_horas():
    ahora = datetime(2026, 11, 22, 12, tzinfo=timezone.utc)
    assert servicio.salud(FuenteFalsa([], datos_al="2026-11-21"), CONFIG, ahora)["ok"] is True
    viejo = servicio.salud(FuenteFalsa([], datos_al="2026-11-18"), CONFIG, ahora)
    assert viejo["ok"] is False and "48 h" in viejo["alerta"]


def test_con_database_url_usa_postgres_directo():
    from app.datos import Fuente
    from app.datos_sql import FuenteSQL

    assert isinstance(main.obtener_fuente(Config("https://s", "k", database_url="postgresql://x")), FuenteSQL)
    assert isinstance(main.obtener_fuente(Config("https://s", "k")), Fuente)
