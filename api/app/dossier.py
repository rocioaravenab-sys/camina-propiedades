"""Carga los módulos de DossierInmobiliario (semáforo, cálculo, barrio).

DossierInmobiliario es un repositorio privado de módulos sueltos (no un
paquete instalable), así que no se instala con pip: se clona en un commit
fijo (ver DOSSIER_COMMIT y scripts/traer_dossier.sh) y se agrega al path.
DOSSIER_PATH apunta a ese clon; por defecto, api/vendor/dossier.
"""

import os
import sys

_POR_DEFECTO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vendor", "dossier")
DOSSIER_PATH = os.path.abspath(os.getenv("DOSSIER_PATH", _POR_DEFECTO))

if not os.path.isfile(os.path.join(DOSSIER_PATH, "calculos.py")):
    raise RuntimeError(
        "No se encontró DossierInmobiliario en {}. Corre scripts/traer_dossier.sh "
        "o define DOSSIER_PATH.".format(DOSSIER_PATH)
    )

if DOSSIER_PATH not in sys.path:
    sys.path.insert(0, DOSSIER_PATH)

import banderas_sector  # noqa: E402
import calculos  # noqa: E402
import conectividad  # noqa: E402
import criminalidad  # noqa: E402
import geo  # noqa: E402
import indicadores  # noqa: E402
import mercado_externo  # noqa: E402
import modelos  # noqa: E402

__all__ = [
    "banderas_sector",
    "calculos",
    "conectividad",
    "criminalidad",
    "geo",
    "indicadores",
    "mercado_externo",
    "modelos",
]
