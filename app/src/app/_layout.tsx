import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ComprasProvider } from '@/lib/compras';
import { EstadoProvider, useEstado } from '@/lib/estado';
import { C } from '@/lib/tema';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navegacion() {
  const { listo } = useEstado();
  useEffect(() => {
    if (listo) SplashScreen.hideAsync().catch(() => {});
  }, [listo]);
  if (!listo) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.fondo } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="propiedad/[id]" />
      <Stack.Screen name="informe/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <EstadoProvider>
        <ComprasProvider>
          <StatusBar style="dark" />
          <Navegacion />
        </ComprasProvider>
      </EstadoProvider>
    </SafeAreaProvider>
  );
}
