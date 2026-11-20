import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Boton, Icono } from '@/components/ui';
import { useCaminata } from '@/lib/caminata';
import { useEstado } from '@/lib/estado';
import { C } from '@/lib/tema';

const PASOS = [
  'Tu teléfono te pedirá permitir la ubicación "Siempre".',
  'Y permitir notificaciones de caminaPropiedades.',
  'Se apaga sola a las 2 horas o cuando tocas Detener. Tu ubicación no sale del teléfono salvo para buscar avisos cercanos.',
];

// Pantalla 11: explica los permisos antes de activar el modo caminata.
export default function PermisoCaminata() {
  const insets = useSafeAreaInsets();
  const { filtros } = useEstado();
  const { activar } = useCaminata();
  const [ocupado, setOcupado] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const activarYa = async () => {
    setOcupado(true);
    setProblema(null);
    const r = await activar(filtros);
    setOcupado(false);
    if (r === 'activo') cerrar();
    else if (r === 'sin-ubicacion') setProblema('Sin permiso de ubicación no podemos seguir tu caminata. Puedes darlo en Ajustes.');
    else setProblema('No pudimos activar el modo caminata. Revisa que la ubicación esté en "Siempre" en Ajustes.');
  };

  return (
    <View style={[st.pantalla, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Pressable onPress={cerrar} accessibilityRole="button" accessibilityLabel="Cerrar" style={st.cerrar} hitSlop={6}>
        <Icono nombre="cerrar" size={20} />
      </Pressable>

      <View style={st.icono}>
        <Icono nombre="caminar" size={42} color={C.azul} grosor={1.8} />
      </View>
      <Text style={st.titulo}>Sal a caminar y te avisamos</Text>
      <Text style={st.parrafo}>
        Con el modo caminata, el mapa se actualiza solo y te llega un aviso cuando pasas por una cuadra con propiedades en venta,
        aunque tengas el teléfono en el bolsillo.
      </Text>

      <View style={st.tarjeta}>
        {PASOS.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={st.numero}>{i + 1}</Text>
            <Text style={st.paso}>{p}</Text>
          </View>
        ))}
      </View>

      {problema ? (
        <View style={{ gap: 4 }}>
          <Text style={st.problema}>{problema}</Text>
          <Boton texto="Abrir ajustes" tipo="enlace" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}

      <View style={{ flex: 1 }} />
      <Boton texto="Activar modo caminata" onPress={activarYa} cargando={ocupado} />
      <Boton texto="Ahora no" tipo="enlace" onPress={cerrar} />
    </View>
  );
}

const st = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo, paddingHorizontal: 28, gap: 18 },
  cerrar: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icono: { width: 88, height: 88, borderRadius: 44, backgroundColor: C.azulClaro, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 28, fontWeight: '700', color: C.texto, lineHeight: 32, letterSpacing: -0.3 },
  parrafo: { fontSize: 15, color: C.texto2, lineHeight: 22 },
  tarjeta: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12 },
  numero: { color: C.azul, fontWeight: '700', fontSize: 14 },
  paso: { flex: 1, fontSize: 14, color: C.texto2, lineHeight: 20 },
  problema: { fontSize: 14, color: C.rojoTexto, lineHeight: 20 },
});
