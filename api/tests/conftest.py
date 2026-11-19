import os
import sys

# Los tests usan un clon de DossierInmobiliario: vendor/dossier (scripts/traer_dossier.sh)
# o el que indique DOSSIER_PATH.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
