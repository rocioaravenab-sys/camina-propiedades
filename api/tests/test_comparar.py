from app.comparar import (
    Aviso, clasificar, comparables_de, mejor_segmento_arriendo, posicion_precio,
)
from app.dossier import mercado_externo

BASE = (-33.4560, -70.5970)  # Plaza Ñuñoa, aprox.


def aviso(id, precio_uf, m2=None, dorm=2, banos=2, dlat=0.0, exacta=True):
    return Aviso(
        id=id, portal="TocToc", url=None, comuna="Ñuñoa", sector=None, tipo="Departamento",
        dormitorios=dorm, banos=banos, estacionamientos=1, precio=precio_uf, moneda="UF",
        precio_uf=precio_uf, m2=m2, lat=BASE[0] + dlat, lon=BASE[1], ubicacion_exacta=exacta,
    )


def test_clasificar_umbral_10_por_ciento():
    assert clasificar(-12)[0] == "verde"
    assert clasificar(-10)[0] == "amarillo"
    assert clasificar(10)[0] == "amarillo"
    assert clasificar(10.5)[0] == "rojo"


def test_compara_en_uf_m2_cuando_hay_superficie():
    comps = [aviso("c%d" % i, 5000 + i * 100, m2=60) for i in range(5)]  # ~85 UF/m2
    a = aviso("a", 4500, m2=64)  # 70,3 UF/m2
    p = posicion_precio(a, comps)
    assert p.base == "uf_m2"
    assert p.color == "verde"
    assert p.n_comparables == 5


def test_sin_superficie_compara_precio_total():
    comps = [aviso("c%d" % i, 5000) for i in range(5)]
    p = posicion_precio(aviso("a", 6000), comps)
    assert p.base == "precio"
    assert p.color == "rojo"
    assert round(p.desvio_pct) == 20


def test_pocos_comparables_no_da_color():
    comps = [aviso("c%d" % i, 5000) for i in range(4)]
    p = posicion_precio(aviso("a", 6000), comps)
    assert p.color == "gris"
    assert p.base is None


def test_comparables_solo_misma_tipologia_y_dentro_del_radio():
    a = aviso("a", 5000)
    lejos = aviso("lejos", 5000, dlat=0.02)  # ~2,2 km
    otro_dorm = aviso("3d", 5000, dorm=3)
    cerca = aviso("cerca", 5000, dlat=0.002)
    assert [c.id for c in comparables_de(a, [a, lejos, otro_dorm, cerca])] == ["cerca"]


def _seg(sector, dorm, banos, n, p50=500000):
    return mercado_externo.EstadisticaExterna(
        comuna="Ñuñoa", sector=sector, tipo_propiedad="departamento", dormitorios=dorm, banos=banos,
        estacionamientos=None, p25_clp=p50, p50_clp=p50, p75_clp=p50, n_avisos=n, fecha_semana="2026-11-16",
    )


def test_mejor_segmento_prefiere_sector_y_tipologia():
    stats = [_seg("", 2, 2, 30, 550000), _seg("Plaza Ñuñoa", 2, 2, 6, 600000), _seg("", 1, 1, 50)]
    assert mejor_segmento_arriendo(stats, "Plaza Ñuñoa", 2, 2).p50_clp == 600000
    assert mejor_segmento_arriendo(stats, "Otro", 2, 2).p50_clp == 550000
    assert mejor_segmento_arriendo(stats, None, 4, 3) is None  # nunca mezcla tipologías
