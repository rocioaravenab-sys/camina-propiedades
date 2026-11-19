# API de caminaPropiedades

API en Python (FastAPI) que alimenta la app: lee los avisos de venta que deja el
scraper de DossierInmobiliario en Supabase y usa su motor (semáforo, cap rate,
barrio) para comparar cada aviso con su sector. Solo lee; no escribe en Supabase.

## Llamadas

| Llamada | Para qué |
| --- | --- |
| `GET /cerca?lat&lon&radio=600&tipo&dormitorios_min&precio_max_uf` | Avisos vigentes alrededor del usuario. `avisos` = pines con ubicación exacta y color de precio; `zonas` = avisos con ubicación aproximada agrupados por sector. Fuera de la RM responde `fuera_de_zona: true`. |
| `GET /propiedad/{id}/comparar?modo=vivir\|invertir&pie&tasa&plazo` | Precio frente al sector (UF/m² si hay superficie, si no precio total de la misma tipología), comparables, barrio y, en modo `invertir`, arriendo estimado, cap rate, dividendo, flujo y veredicto. Crédito por defecto: pie 10%, 30 años, 4,0%. |
| `GET /salud` | Si los datos de venta están al día. `ok: false` si el scraper lleva más de 48 h sin datos nuevos. |

Documentación interactiva en `/docs` con la API corriendo.

### Colores de precio

`verde` = más de 10% bajo la mediana del sector (600 m, misma tipología),
`amarillo` = dentro de ±10%, `rojo` = más de 10% sobre, `gris` = menos de 5
comparables (pocos datos). Es el mismo umbral del Semáforo Inmobiliario.

## Correr en local

```bash
cd api
./scripts/traer_dossier.sh          # clona DossierInmobiliario en vendor/dossier (commit en DOSSIER_COMMIT)
pip install -r requirements-dev.txt
cp .env.example .env                 # completar SUPABASE_URL y SUPABASE_KEY
set -a; source .env; set +a
uvicorn app.main:app --reload
pytest
```

## Desplegar en Railway

1. Nuevo servicio desde este repo, con *Root Directory* = `api` (usa el `Dockerfile`).
2. Variables: `SUPABASE_URL`, `SUPABASE_KEY` (la service key que ya usa la web de Semáforo) y
   `GITHUB_TOKEN` (un token de GitHub con solo lectura de `DossierInmobiliario`, para clonarlo
   al construir la imagen).
3. Para usar una versión nueva del motor de DossierInmobiliario, cambiar el commit en
   `DOSSIER_COMMIT` y volver a desplegar.

## Pendiente

- `POST /informe` (compra del PDF y validación del recibo de Apple o Google): fase 4.
- El índice de sobreoferta todavía no entra al veredicto de inversión.
- La caché del barrio vive en memoria: se pierde en cada despliegue.
