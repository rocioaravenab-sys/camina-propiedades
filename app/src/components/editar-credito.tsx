import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Credito } from '@/lib/api';
import { C } from '@/lib/tema';

import { Boton } from './ui';

function aNumero(t: string): number | undefined {
  const n = parseFloat(t.replace(',', '.'));
  return isFinite(n) ? n : undefined;
}

function aTexto(n: number) {
  return String(n).replace('.', ',');
}

export function EditarCredito({
  inicial,
  onCerrar,
  onGuardar,
}: {
  inicial: Credito;
  onCerrar: () => void;
  onGuardar: (c: { pie: number; tasa: number; plazo: number } | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [pie, setPie] = useState(() => aTexto(inicial.pie_pct));
  const [tasa, setTasa] = useState(() => aTexto(inicial.tasa_anual_pct));
  const [plazo, setPlazo] = useState(() => String(inicial.plazo_anos));

  const p = aNumero(pie);
  const t = aNumero(tasa);
  const a = aNumero(plazo);
  const valido = p != null && p >= 0 && p <= 100 && t != null && t > 0 && t <= 30 && a != null && a >= 1 && a <= 40;

  const campo = (etiqueta: string, valor: string, set: (s: string) => void, sufijo: string) => (
    <View style={st.campo}>
      <Text style={st.etiqueta}>{etiqueta}</Text>
      <View style={st.entradaFila}>
        <TextInput
          value={valor}
          onChangeText={set}
          keyboardType="decimal-pad"
          style={st.entrada}
          accessibilityLabel={etiqueta}
          selectTextOnFocus
        />
        <Text style={st.sufijo}>{sufijo}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable style={st.velo} onPress={onCerrar} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[st.hoja, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={st.titulo}>Tu crédito</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {campo('Pie', pie, setPie, '%')}
            {campo('Plazo', plazo, setPlazo, 'años')}
            {campo('Tasa', tasa, setTasa, '%')}
          </View>
          {!valido ? <Text style={st.error}>Pie entre 0 y 100%, plazo de 1 a 40 años y tasa de hasta 30%.</Text> : null}
          <Boton
            texto="Recalcular"
            deshabilitado={!valido}
            onPress={() => valido && onGuardar({ pie: p!, tasa: t!, plazo: Math.round(a!) })}
          />
          <Boton texto="Volver a 10% de pie, 30 años" tipo="enlace" onPress={() => onGuardar(null)} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  hoja: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, gap: 14 },
  titulo: { fontSize: 18, fontWeight: '700', color: C.texto },
  campo: { flex: 1, gap: 6 },
  etiqueta: { fontSize: 12, color: C.texto3 },
  entradaFila: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.grisClaro, borderRadius: 12, paddingHorizontal: 10 },
  entrada: { flex: 1, fontSize: 18, fontWeight: '700', color: C.texto, paddingVertical: 10, minHeight: 44 },
  sufijo: { fontSize: 13, color: C.texto3 },
  error: { fontSize: 12, color: C.rojoTexto },
});
