import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CaminataProvider } from '@/lib/caminata';
import { ComprasProvider } from '@/lib/compras';
import { EstadoProvider, useEstado } from '@/lib/estado';
import { C } from '@/lib/tema';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Al tocar un aviso "en esta cuadra": un solo aviso abre su ficha; varios, el mapa.
function useAbrirAvisos(listo: boolean) {
  const respuesta = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!listo || !respuesta) return;
    const ids = respuesta.notification.request.content.data?.ids;
    if (Array.isArray(ids) && ids.length === 1) {
      router.push({ pathname: '/propiedad/[id]', params: { id: String(ids[0]) } });
    } else {
      router.navigate('/');
    }
    Notifications.clearLastNotificationResponse();
  }, [listo, respuesta]);
}

function Navegacion() {
  const { listo } = useEstado();
  useEffect(() => {
    if (listo) SplashScreen.hideAsync().catch(() => {});
  }, [listo]);
  useAbrirAvisos(listo);
  if (!listo) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.fondo } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="propiedad/[id]/index" />
      <Stack.Screen name="propiedad/[id]/comparar" />
      <Stack.Screen name="informe/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="caminata" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <EstadoProvider>
        <ComprasProvider>
          <CaminataProvider>
            <StatusBar style="dark" />
            <Navegacion />
          </CaminataProvider>
        </ComprasProvider>
      </EstadoProvider>
    </SafeAreaProvider>
  );
}
