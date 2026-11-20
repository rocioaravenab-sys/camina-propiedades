import { StyleSheet, Text, View } from 'react-native';

import type { PosicionPrecio } from '@/lib/api';
import { numero, uf } from '@/lib/formato';
import { C, colorDe } from '@/lib/tema';

function fmt(base: PosicionPrecio['base'], v: number | null) {
  if (v == null) return '—';
  return base === 'uf_m2' ? `UF ${numero(v, 1)}/m²` : uf(v);
}

/** Dónde cae el precio entre el p25 y el p75 del sector, con la mediana marcada. */
export function BarraPrecio({ p }: { p: PosicionPrecio }) {
  if (p.valor == null || p.mediana == null || p.p25 == null || p.p75 == null) return null;
  const min = Math.min(p.valor, p.p25) * 0.92;
  const max = Math.max(p.valor, p.p75) * 1.08;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%` as const;
  return (
    <View style={{ gap: 6 }}>
      <View style={st.riel} accessible accessibilityLabel={`Este precio ${fmt(p.base, p.valor)}, mediana del sector ${fmt(p.base, p.mediana)}`}>
        <View style={[st.rango, { left: pos(p.p25), right: `${100 - parseFloat(pos(p.p75))}%` }]} />
        <View style={[st.mediana, { left: pos(p.mediana) }]} />
        <View style={[st.este, { left: pos(p.valor), backgroundColor: colorDe(p.color) }]} />
      </View>
      <View style={st.etiquetas}>
        <Text style={st.etiqueta}>Esta: {fmt(p.base, p.valor)}</Text>
        <Text style={st.etiqueta}>Mediana: {fmt(p.base, p.mediana)}</Text>
      </View>
      <Text style={st.etiqueta}>
        Rango normal del sector: {fmt(p.base, p.p25)} a {fmt(p.base, p.p75)}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  riel: { height: 10, borderRadius: 5, backgroundColor: C.gris, marginVertical: 6 },
  rango: { position: 'absolute', top: 0, height: 10, borderRadius: 5, backgroundColor: '#C9D3EE' },
  mediana: { position: 'absolute', top: -3, width: 2, height: 16, marginLeft: -1, backgroundColor: C.texto },
  este: {
    position: 'absolute',
    top: -5,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  etiquetas: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  etiqueta: { fontSize: 12, color: C.texto3 },
});
