import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Filtros } from '@/lib/api';
import { numero } from '@/lib/formato';
import { C } from '@/lib/tema';

type Campo = 'tipo' | 'dormitorios' | 'precio';

const TIPOS: { valor: Filtros['tipo']; texto: string }[] = [
  { valor: undefined, texto: 'Todos' },
  { valor: 'Departamento', texto: 'Departamentos' },
  { valor: 'Casa', texto: 'Casas' },
];
const DORMS: (number | undefined)[] = [undefined, 1, 2, 3, 4];
const PRECIOS: (number | undefined)[] = [undefined, 2500, 3500, 4500, 6000, 8000, 12000];

function textoChip(campo: Campo, f: Filtros): string {
  if (campo === 'tipo') return f.tipo === 'Departamento' ? 'Depto' : f.tipo === 'Casa' ? 'Casa' : 'Depto o casa';
  if (campo === 'dormitorios') return f.dormitorios_min ? `${f.dormitorios_min}+ dorm.` : 'Dormitorios';
  return f.precio_max_uf ? `Hasta UF ${numero(f.precio_max_uf)}` : 'Precio';
}

export function ChipsFiltros({ filtros, onCambio }: { filtros: Filtros; onCambio: (f: Filtros) => void }) {
  const [abierto, setAbierto] = useState<Campo | null>(null);
  const insets = useSafeAreaInsets();
  const campos: Campo[] = ['tipo', 'dormitorios', 'precio'];
  const activo = (c: Campo) =>
    c === 'tipo' ? !!filtros.tipo : c === 'dormitorios' ? !!filtros.dormitorios_min : !!filtros.precio_max_uf;

  const opciones: { texto: string; elegir: () => void; marcado: boolean }[] =
    abierto === 'tipo'
      ? TIPOS.map((t) => ({ texto: t.texto, marcado: filtros.tipo === t.valor, elegir: () => onCambio({ ...filtros, tipo: t.valor }) }))
      : abierto === 'dormitorios'
        ? DORMS.map((d) => ({
            texto: d ? `${d} o más` : 'Cualquiera',
            marcado: filtros.dormitorios_min === d,
            elegir: () => onCambio({ ...filtros, dormitorios_min: d }),
          }))
        : PRECIOS.map((p) => ({
            texto: p ? `Hasta UF ${numero(p)}` : 'Sin tope',
            marcado: filtros.precio_max_uf === p,
            elegir: () => onCambio({ ...filtros, precio_max_uf: p }),
          }));

  return (
    <>
      <View style={st.fila}>
        {campos.map((c) => (
          <Pressable
            key={c}
            onPress={() => setAbierto(c)}
            accessibilityRole="button"
            style={[st.chip, activo(c) && st.chipActivo]}>
            <Text style={[st.chipTexto, activo(c) && { color: '#FFFFFF' }]}>{textoChip(c, filtros)}</Text>
          </Pressable>
        ))}
      </View>
      <Modal visible={abierto !== null} transparent animationType="slide" onRequestClose={() => setAbierto(null)}>
        <Pressable style={st.velo} onPress={() => setAbierto(null)} accessibilityLabel="Cerrar" />
        <View style={[st.hoja, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.asa} />
          <Text style={st.hojaTitulo}>
            {abierto === 'tipo' ? 'Tipo de propiedad' : abierto === 'dormitorios' ? 'Dormitorios' : 'Precio máximo'}
          </Text>
          {opciones.map((o) => (
            <Pressable
              key={o.texto}
              accessibilityRole="radio"
              accessibilityState={{ checked: o.marcado }}
              onPress={() => {
                o.elegir();
                setAbierto(null);
              }}
              style={st.opcion}>
              <Text style={[st.opcionTexto, o.marcado && { color: C.azul, fontWeight: '700' }]}>{o.texto}</Text>
              {o.marcado ? <View style={st.marca} /> : null}
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderColor: C.borde,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontSize: 13, fontWeight: '600', color: C.texto },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  hoja: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10 },
  asa: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borde, alignSelf: 'center', marginBottom: 12 },
  hojaTitulo: { fontSize: 18, fontWeight: '700', color: C.texto, marginBottom: 6 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.linea,
    minHeight: 48,
  },
  opcionTexto: { fontSize: 16, color: C.texto },
  marca: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.azul },
});
