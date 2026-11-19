import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Marker } from 'react-native-maps';

import type { Aviso, Zona } from '@/lib/api';
import { numero } from '@/lib/formato';
import { C, colorDe, leyendaDe } from '@/lib/tema';

import { Punto } from './ui';

export function precioCorto(a: Aviso): string {
  if (a.precio_uf) return 'UF ' + numero(a.precio_uf);
  if (a.moneda?.toUpperCase() === 'CLP' && a.precio) return '$' + numero(a.precio / 1_000_000, 0) + ' M';
  return '—';
}

// En Android los marcadores con vista propia se dibujan una vez y se congelan
// (tracksViewChanges=false) para que el mapa no se ponga lento con muchos pines.
function useCongelar(dep: string) {
  const [congelado, setCongelado] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setCongelado(dep), 400);
    return () => clearTimeout(t);
  }, [dep]);
  return congelado !== dep;
}

export function PinAviso({ aviso, onPress }: { aviso: Aviso; onPress: () => void }) {
  const color = colorDe(aviso.color);
  const seguir = useCongelar(String(aviso.color));
  if (aviso.lat == null || aviso.lon == null) return null;
  return (
    <Marker
      coordinate={{ latitude: aviso.lat, longitude: aviso.lon }}
      onPress={onPress}
      tracksViewChanges={seguir}
      anchor={{ x: 0.5, y: 0.5 }}
      accessibilityLabel={`${aviso.tipo} en ${precioCorto(aviso)}, ${leyendaDe(aviso.color)}`}>
      <View style={[st.pin, { borderColor: color }]}>
        <Punto color={color} />
        <Text style={st.pinTexto}>{precioCorto(aviso)}</Text>
      </View>
    </Marker>
  );
}

// Radio de la zona sombreada para avisos con ubicación aproximada.
export const RADIO_ZONA_M = 160;

export function ZonaAproximada({ zona, onPress, activa }: { zona: Zona; onPress: () => void; activa: boolean }) {
  const seguir = useCongelar(`${zona.cantidad}-${activa}`);
  return (
    <>
      <Circle
        center={{ latitude: zona.lat, longitude: zona.lon }}
        radius={RADIO_ZONA_M}
        strokeColor={activa ? C.amarilloTexto : C.amarillo}
        strokeWidth={2}
        lineDashPattern={[6, 6]}
        fillColor="rgba(217,154,0,0.16)"
      />
      <Marker
        coordinate={{ latitude: zona.lat, longitude: zona.lon }}
        onPress={onPress}
        tracksViewChanges={seguir}
        anchor={{ x: 0.5, y: 0.5 }}
        accessibilityLabel={`${zona.cantidad} avisos en este sector, ubicación aproximada`}>
        <View style={[st.zona, activa && st.zonaActiva]}>
          <Text style={[st.zonaTexto, activa && { color: '#FFFFFF' }]}>
            {zona.cantidad === 1 ? '1 en este sector' : `${zona.cantidad} en este sector`}
          </Text>
        </View>
      </Marker>
    </>
  );
}

const st = StyleSheet.create({
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pinTexto: { fontSize: 13, fontWeight: '700', color: C.texto },
  zona: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  zonaActiva: { backgroundColor: C.texto },
  zonaTexto: { fontSize: 13, fontWeight: '600', color: C.texto },
});
