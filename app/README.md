# App caminaPropiedades (iPhone y Android)

Un solo código en Expo (React Native, SDK 58) para las dos tiendas. Sigue las 5
pantallas del prototipo aprobado: mapa en vivo, comparar para vivir, comparar
para invertir, informe PDF y guardadas (más la pantalla "Todavía no llegamos a
tu zona").

## Qué hace

| Pantalla | Archivo | Qué muestra |
| --- | --- | --- |
| Mapa | `src/app/(tabs)/index.tsx` | Mapa en vivo alrededor de la persona (radio 600 m, ~5 cuadras). Pines con precio y color para avisos con ubicación exacta; zonas sombreadas "N en este sector" para los aproximados. Filtros tipo, dormitorios y precio máximo. Selector Vivir/Invertir. Si arrastra el mapa aparece "Buscar en esta zona". Fuera de la RM muestra "Todavía no llegamos a tu zona". |
| Ficha | `src/app/propiedad/[id].tsx` | Precio vs sector (semáforo y barra p25–mediana–p75), comparables cerca, barrio (metro, área verde, delincuencia, banderas). En "Para invertir": veredicto, arriendo estimado, cap rate, dividendo, flujo y crédito editable (por defecto pie 10%, 30 años, tasa de la API). Guardar y compartir. |
| Informe | `src/app/informe/[id].tsx` | Compra del PDF con la tienda de Apple o Google ($14.990). |
| Guardadas | `src/app/(tabs)/guardadas.tsx` | Informes comprados (abrir y compartir el PDF), propiedades guardadas y "Restaurar compras". |

- **Ubicación solo con la app abierta.** `src/lib/ubicacion.ts` mira la posición
  solo mientras el mapa está a la vista y la app en primer plano. No se pide el
  permiso "siempre" en iOS y en Android se bloquea `ACCESS_BACKGROUND_LOCATION`.
- **Sin cuenta.** Modo, filtros, crédito, favoritos y la lista de informes se
  guardan en el teléfono (`src/lib/estado.tsx`, AsyncStorage). Los PDF quedan en
  la carpeta de documentos de la app.
- **API.** `src/lib/api.ts` llama a `/cerca`, `/propiedad/{id}/comparar`,
  `/salud` y (para el PDF) `POST /informe`.

## Compra del PDF

Producto **consumible** con id `informe_pdf` en App Store Connect y en Google
Play Console (precio $14.990 CLP), una compra por propiedad. Usa `expo-iap`
(`src/lib/compras.tsx`):

1. La app guarda qué propiedad se está pagando y abre el pago de la tienda.
2. Con el pago hecho, manda el recibo a `POST /informe` (`id_aviso`, `modo`,
   `plataforma`, `producto`, `token_compra`, `id_transaccion`). La API valida el
   recibo con Apple o Google y responde el PDF (`application/pdf`).
3. Recién con el PDF guardado se cierra la transacción. Si algo falla, queda
   abierta y "Restaurar compras" la reintenta (Google reembolsa sola una compra
   que no se cierra en 3 días).

"Restaurar compras" también vuelve a bajar un PDF que se haya borrado del
teléfono, usando el recibo guardado. Si se desinstala la app se pierde la lista
local de informes: sin cuenta no hay cómo recuperarla.

`POST /informe` todavía no existe en la API (es la fase 4). Hasta entonces el
pago funciona, pero la descarga falla y la compra queda abierta sin cobrarse en
definitiva: no publicar en las tiendas antes de tener ese endpoint.

## Correr en desarrollo

Mapas y compras usan código nativo, así que no funciona en Expo Go: hace falta
una "development build".

```bash
cd app
npm install
# En un Mac con Xcode (simulador o iPhone por cable):
EXPO_PUBLIC_API_URL=http://<ip-del-mac>:8000 npx expo run:ios
# Android (Android Studio o teléfono con depuración USB):
EXPO_PUBLIC_API_URL=http://<ip-del-mac>:8000 GOOGLE_MAPS_API_KEY_ANDROID=... npx expo run:android
```

O en la nube con EAS, sin Xcode: `npx eas-cli@latest build --profile development --platform ios`.

Revisar tipos y lint: `npm run typecheck` y `npx eslint src`.

## Configuración

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `eas.json` por perfil, o al correr | URL de la API (Railway). Hoy dice `REEMPLAZAR-...`: cambiarla cuando la API esté desplegada. |
| `GOOGLE_MAPS_API_KEY_ANDROID` | Secreto de EAS | Llave de Google Maps SDK for Android (en iPhone se usa Apple Maps, sin llave). |

Identificador de la app: `cl.caminapropiedades.app` en las dos tiendas
(`app.config.ts`). Se publica con las mismas cuentas de Apple Developer y Google
Play de LaMeno y MiDosis.

## Publicar

1. `npx eas-cli@latest init` (une el proyecto a la cuenta de Expo).
2. Crear la app en App Store Connect y en Play Console con el id de arriba, y el
   producto `informe_pdf`.
3. `npx eas-cli@latest build --profile production --platform all`
4. `npx eas-cli@latest submit --platform ios` y `--platform android`.
