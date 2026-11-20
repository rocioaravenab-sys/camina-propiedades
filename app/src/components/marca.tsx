import { Text } from 'react-native';

import { C } from '@/lib/tema';

export function Marca({ size = 20 }: { size?: number }) {
  return (
    <Text style={{ fontSize: size, fontWeight: '700', letterSpacing: -0.3, color: C.texto }} accessibilityRole="header">
      camina<Text style={{ color: C.azul }}>Propiedades</Text>
    </Text>
  );
}
