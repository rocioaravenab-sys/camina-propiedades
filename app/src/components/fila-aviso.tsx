import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Aviso } from '@/lib/api';
import { numero, tipoCorto, tipologia, uf } from '@/lib/formato';
import { C, colorDe, leyendaDe } from '@/lib/tema';

import { precioCorto } from './pin';
import { Icono, Punto } from './ui';

export function FilaAviso({
  aviso,
  onPress,
  apagado,
  detalle,
}: {
  aviso: Aviso;
  onPress?: () => void;
  apagado?: boolean;
  detalle?: string;
}) {
  const partes = [tipoCorto(aviso.tipo), tipologia(aviso.dormitorios, aviso.banos), aviso.m2 ? `${numero(aviso.m2)} m²` : '']
    .filter(Boolean)
    .join(' · ');
  const lugar = aviso.sector || aviso.comuna;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [st.fila, apagado && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}>
      <Punto color={apagado ? C.sinDatos : colorDe(aviso.color)} size={12} />
      <View style={{ flex: 1 }}>
        <Text style={st.titulo} numberOfLines={1}>
          {precioCorto(aviso)} · {partes}
        </Text>
        <Text style={st.sub} numberOfLines={1}>
          {detalle ?? `${lugar}${aviso.color ? ' · ' + leyendaDe(aviso.color) : ''}`}
        </Text>
      </View>
      {onPress ? <Icono nombre="derecha" size={18} color={C.texto3} /> : null}
    </Pressable>
  );
}

export function textoAviso(a: Aviso): string {
  return [tipoCorto(a.tipo), tipologia(a.dormitorios, a.banos), a.sector || a.comuna].filter(Boolean).join(' · ') + ' · ' + uf(a.precio_uf);
}

const st = StyleSheet.create({
  fila: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  titulo: { fontWeight: '600', fontSize: 14, color: C.texto },
  sub: { fontSize: 12, color: C.texto3, marginTop: 2 },
});
