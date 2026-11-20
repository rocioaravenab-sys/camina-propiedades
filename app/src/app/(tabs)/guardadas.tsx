import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilaAviso } from '@/components/fila-aviso';
import { Boton, Icono } from '@/components/ui';
import { useCompras } from '@/lib/compras';
import { useEstado } from '@/lib/estado';
import { fechaCorta } from '@/lib/formato';
import { compartirPdf } from '@/lib/pdf';
import { C } from '@/lib/tema';

export default function Guardadas() {
  const insets = useSafeAreaInsets();
  const { favoritos, informes } = useEstado();
  const { restaurar, estado } = useCompras();
  const [restaurando, setRestaurando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const lista = Object.values(favoritos).sort((a, b) => b.guardado_el - a.guardado_el);

  const onRestaurar = async () => {
    setRestaurando(true);
    setMensaje(null);
    try {
      const n = await restaurar();
      setMensaje(n > 0 ? `Recuperamos ${n === 1 ? '1 informe' : `${n} informes`}.` : 'No había compras pendientes.');
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}>
        <Text style={st.titulo}>Guardadas</Text>

        <Text style={st.seccion}>INFORMES COMPRADOS</Text>
        <View style={st.lista}>
          {informes.length === 0 ? (
            <Text style={st.vacio}>Cuando compres un informe en PDF, queda aquí.</Text>
          ) : (
            informes.map((i) => (
              <View key={i.id_transaccion} style={st.informe}>
                <View style={st.iconoPdf}>
                  <Text style={{ color: C.azul, fontSize: 11, fontWeight: '700' }}>PDF</Text>
                </View>
                <Pressable style={{ flex: 1 }} onPress={() => compartirPdf(i.archivo).catch(() => {})} accessibilityRole="button">
                  <Text style={st.informeTitulo} numberOfLines={2}>
                    {i.titulo}
                  </Text>
                  <Text style={st.nota}>Comprado el {fechaCorta(i.comprado_el)}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Compartir informe"
                  onPress={() => compartirPdf(i.archivo).catch(() => {})}
                  style={st.compartir}>
                  <Icono nombre="compartir" size={18} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text style={st.seccion}>PROPIEDADES</Text>
        <View style={st.lista}>
          {lista.length === 0 ? (
            <Text style={st.vacio}>Toca el marcador en la ficha de una propiedad para guardarla.</Text>
          ) : (
            lista.map((f) => (
              <FilaAviso
                key={f.aviso.id}
                aviso={f.aviso}
                apagado={f.ya_no_esta}
                detalle={f.ya_no_esta ? 'Ya no aparece en los portales' : undefined}
                onPress={() => router.push({ pathname: '/propiedad/[id]', params: { id: f.aviso.id } })}
              />
            ))
          )}
        </View>

        <View style={{ marginTop: 20, marginHorizontal: 20 }}>
          <Boton texto="Restaurar compras" tipo="enlace" cargando={restaurando} onPress={onRestaurar} />
          {mensaje ? <Text style={[st.nota, { textAlign: 'center' }]}>{mensaje}</Text> : null}
          {estado.fase === 'error' ? <Text style={st.error}>{estado.mensaje}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  titulo: { paddingHorizontal: 20, fontSize: 28, fontWeight: '700', color: C.texto, letterSpacing: -0.4 },
  seccion: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6, fontSize: 13, fontWeight: '700', color: C.texto3, letterSpacing: 0.3 },
  lista: { marginHorizontal: 20, gap: 10 },
  vacio: { fontSize: 14, color: C.texto3, paddingVertical: 8 },
  informe: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconoPdf: { width: 40, height: 48, borderRadius: 6, backgroundColor: C.azulClaro, alignItems: 'center', justifyContent: 'center' },
  informeTitulo: { fontWeight: '600', fontSize: 14, color: C.texto },
  nota: { fontSize: 12, color: C.texto3, marginTop: 2 },
  compartir: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.borde, alignItems: 'center', justifyContent: 'center' },
  error: { marginTop: 8, color: C.rojoTexto, fontSize: 13, textAlign: 'center' },
});
