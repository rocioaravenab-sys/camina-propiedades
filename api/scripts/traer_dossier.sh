#!/bin/bash
# Clona DossierInmobiliario (repo privado) en vendor/dossier, en el commit fijo
# de DOSSIER_COMMIT. Necesita GITHUB_TOKEN con lectura de ese repo (en Railway,
# una variable del servicio; en local basta con tener acceso por git).
set -euo pipefail
cd "$(dirname "$0")/.."

COMMIT="$(tr -d '[:space:]' < DOSSIER_COMMIT)"
DESTINO="vendor/dossier"
if [ -n "${GITHUB_TOKEN:-}" ]; then
    URL="https://x-access-token:${GITHUB_TOKEN}@github.com/rocioaravenab-sys/DossierInmobiliario.git"
else
    URL="https://github.com/rocioaravenab-sys/DossierInmobiliario.git"
fi

rm -rf "$DESTINO"
mkdir -p "$DESTINO"
git -C "$DESTINO" init -q
git -C "$DESTINO" remote add origin "$URL"
git -C "$DESTINO" fetch -q --depth 1 origin "$COMMIT"
git -C "$DESTINO" checkout -q FETCH_HEAD
# El token no queda guardado en la imagen.
rm -rf "$DESTINO/.git"
echo "DossierInmobiliario $COMMIT en $DESTINO"
