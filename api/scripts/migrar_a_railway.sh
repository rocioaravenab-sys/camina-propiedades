#!/usr/bin/env bash
# Copia las tablas de los scrapers desde Supabase a un Postgres nuevo (Railway).
#
# No toca Supabase: solo lee (pg_dump). Escribe únicamente en el destino, que
# debe estar vacío. Se corre a mano, una vez, con los scrapers detenidos.
#
#   ORIGEN_URL=...  (DATABASE_URL actual de Supabase, puerto 5432, no el pooler 6543)
#   DESTINO_URL=... (DATABASE_URL del Postgres de Railway)
#   ./migrar_a_railway.sh
#
# Necesita pg_dump y pg_restore igual o más nuevos que el Postgres de Supabase (brew install postgresql@17).
set -euo pipefail

: "${ORIGEN_URL:?Falta ORIGEN_URL}"
: "${DESTINO_URL:?Falta DESTINO_URL}"

TABLAS=(ventas_rm arriendos_rm historial_precios_venta historial_precios_arriendo
        estadisticas_venta estadisticas_arriendo sectores_geocodificados)

ARCHIVO="supabase_$(date +%Y%m%d_%H%M).dump"
args=()
for t in "${TABLAS[@]}"; do args+=(--table "public.$t"); done

echo "1/4 Respaldo desde Supabase (solo lectura) -> $ARCHIVO"
pg_dump "$ORIGEN_URL" --format=custom --no-owner --no-acl "${args[@]}" --file "$ARCHIVO"

echo "2/4 Restaurando en el destino"
pg_restore --dbname "$DESTINO_URL" --no-owner --no-acl --exit-on-error "$ARCHIVO"

echo "3/4 Vista de avisos vigentes (la crea también el scraper al partir)"
psql "$DESTINO_URL" -v ON_ERROR_STOP=1 -c \
  "CREATE OR REPLACE VIEW ventas_vigentes AS SELECT * FROM ventas_rm WHERE fecha_captura >= current_date - 7;"

echo "4/4 Comparando filas origen / destino"
for t in "${TABLAS[@]}"; do
  o=$(psql "$ORIGEN_URL" -At -c "SELECT count(*) FROM public.$t" 2>/dev/null || echo "-")
  d=$(psql "$DESTINO_URL" -At -c "SELECT count(*) FROM public.$t" 2>/dev/null || echo "-")
  printf '%-28s %10s %10s %s\n' "$t" "$o" "$d" "$([ "$o" = "$d" ] && echo ok || echo REVISAR)"
done
echo "Listo. Guarda $ARCHIVO hasta confirmar que todo funciona."
