import type { ConfigContext, ExpoConfig } from 'expo/config';

// Valores que cambian entre entornos se leen de variables de entorno
// (en EAS se definen por perfil en eas.json o como secretos del proyecto).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const GOOGLE_MAPS_ANDROID = process.env.GOOGLE_MAPS_API_KEY_ANDROID ?? '';
const BUNDLE_ID = 'cl.caminapropiedades.app';
// Proyecto de EAS en la cuenta de Expo we2 (la misma de LaMeno).
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? 'f90bcf66-b212-48e4-8e46-89a1c02dfbcd';
// Las versiones de prueba pueden apuntar a la API corriendo en el Mac por
// http://; iOS bloquea http salvo que se permita aquí. Producción usa https.
const API_SIN_HTTPS = API_URL.startsWith('http://');

const TEXTO_UBICACION =
  'caminaPropiedades usa tu ubicación para mostrarte las propiedades en venta a tu alrededor.';
// El permiso "Siempre" solo se pide al activar el modo caminata (opcional).
const TEXTO_SIEMPRE =
  'Con el modo caminata activo, caminaPropiedades usa tu ubicación aunque tengas el teléfono en el bolsillo, para avisarte cuando pasas por una cuadra con propiedades en venta. Se apaga sola a las 2 horas.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'we2',
  name: 'caminaPropiedades',
  slug: 'camina-propiedades',
  scheme: 'caminapropiedades',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#F6F6F3',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      ...(API_SIN_HTTPS ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true } } : {}),
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#1747C9',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#1747C9',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: TEXTO_UBICACION,
        locationAlwaysAndWhenInUsePermission: TEXTO_SIEMPRE,
        locationAlwaysPermission: TEXTO_SIEMPRE,
        // Modo caminata: ubicación en segundo plano mientras está activo.
        // En Android corre como servicio con una notificación fija.
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // Los avisos "en esta cuadra" son notificaciones locales: sin servidor.
    ['expo-notifications', { color: '#1747C9', enableRemoteNotifications: false }],
    ['react-native-maps', { androidGoogleMapsApiKey: GOOGLE_MAPS_ANDROID }],
    'expo-iap',
  ],
  extra: {
    apiUrl: API_URL,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
