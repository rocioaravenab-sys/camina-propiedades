import { Tabs } from 'expo-router/tabs';

import { Icono } from '@/components/ui';
import { C } from '@/lib/tema';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.azul,
        tabBarInactiveTintColor: C.texto3,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: C.tarjeta, borderTopColor: C.linea },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Mapa', tabBarIcon: ({ color }) => <Icono nombre="mapa" color={String(color)} /> }}
      />
      <Tabs.Screen
        name="guardadas"
        options={{ title: 'Guardadas', tabBarIcon: ({ color }) => <Icono nombre="guardar" color={String(color)} /> }}
      />
    </Tabs>
  );
}
