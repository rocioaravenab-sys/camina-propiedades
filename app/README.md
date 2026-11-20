# App caminaPropiedades (iPhone y Android)

Un solo código en Expo (React Native, SDK 58) para las dos tiendas. Sigue las
pantallas del prototipo (v2, pantallas 6 a 11): mapa, modo caminata, aviso en el
teléfono, ficha, comparar con las del área y permiso del modo caminata, más
informe PDF, guardadas y "Todavía no llegamos a tu zona".

## Qué hace

| Pantalla | Archivo | Qué muestra |
| --- | --- | --- |
| Mapa | `src/app/(tabs)/index.tsx` | Mapa que sigue a la persona. Al alejarlo o moverlo pide lo que falta (hasta 4 km por pedido) y lo suma a lo ya cargado; dibuja hasta 300 pines, los más cercanos al centro. Avisos exactos en el mismo edificio se juntan en "N en el edificio"; los aproximados son zonas "N en este sector". Filtros tipo, dormitorios y precio máximo. Botón "Modo caminata". Fuera de la RM muestra "Todavía no llegamos a tu zona". |
| Modo caminata | `src/app/caminata.tsx`, `src/lib/caminata.ts` | Pantalla de permiso (ubicación "Siempre" y notificaciones). Activo: barra azul con Detener, "En esta cuadra" y recorrido. Se apaga sola a las 2 horas. |
| Ficha | `src/app/propiedad/[id]/index.tsx` | Fotos (hasta 3), precio en UF y pesos, color frente al sector, si bajó o subió de precio, dormitorios, baños, estacionamientos, m², UF/m², gasto común, días publicado y portal, mini mapa. Guardar, compartir y "Comparar con las del área". |
| Comparar | `src/app/propiedad/[id]/comparar.tsx` | Todo junto: precio vs sector (semáforo y barra p25–mediana–p75), parecidas a 5 cuadras, "Si la compras para arrendar" (arriendo, cap rate, dividendo, flujo, crédito editable) y barrio. Abajo el informe PDF. |
| Informe | `src/app/informe/[id].tsx` | Compra del PDF con la tienda de Apple o Google ($14.990). |
| Guardadas | `src/app/(tabs)/guardadas.tsx` | Informes comprados (abrir y compartir el PDF), propiedades guardadas y "Restaurar compras". |

- **Ubicación.** Sin modo caminata, `src/lib/ubicacion.ts` mira la posición solo
  mientras el mapa está a la vista y la app en primer plano. El permiso
  "Siempre" se pide solo al activar el modo caminata.
- **Modo caminata.** `expo-location` corre la tarea `camina-modo-caminata` en
  segundo plano (en Android como servicio, con la notificación fija "Modo
  caminata activo"). Cada ~40 m consulta `/cerca` (150 m) y, si hay un edificio o
  aviso exacto a menos de 70 m que no se avisó hoy, muestra una notificación
  local. Máximo una cada 2 minutos. Al tocarla abre la ficha (un aviso) o el
  mapa (varios). No hay servidor de notificaciones ni cuenta.
- **Sin cuenta.** Filtros, crédito, favoritos y la lista de informes se
  guardan en el teléfono (`src/lib/estado.tsx`, AsyncStorage). Los PDF quedan en
  la carpeta de documentos de la app.
- **API.** `src/lib/api.ts` llama a `/cerca`, `/propiedad/{id}`, `/propiedad/{id}/comparar`,
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
