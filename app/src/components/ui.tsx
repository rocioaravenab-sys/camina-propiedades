import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { C } from '@/lib/tema';

export function Punto({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function Tarjeta({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.tarjeta, style]}>{children}</View>;
}

export function Selector<T extends string>({
  opciones,
  valor,
  onCambio,
  chico,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambio: (v: T) => void;
  chico?: boolean;
}) {
  return (
    <View style={[s.selector, chico && s.selectorChico]} accessibilityRole="tablist">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onCambio(o.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            style={[s.opcion, chico && s.opcionChica, activo && s.opcionActiva]}>
            <Text style={[s.opcionTexto, chico && s.opcionTextoChico, activo && s.opcionTextoActivo]}>{o.texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Boton({
  texto,
  onPress,
  tipo = 'primario',
  cargando,
  deshabilitado,
}: {
  texto: string;
  onPress: () => void;
  tipo?: 'primario' | 'oscuro' | 'enlace';
  cargando?: boolean;
  deshabilitado?: boolean;
}) {
  const fondo = tipo === 'primario' ? C.azul : tipo === 'oscuro' ? C.texto : 'transparent';
  const color = tipo === 'enlace' ? C.azul : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado || cargando}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.boton,
        { backgroundColor: fondo, opacity: deshabilitado ? 0.5 : pressed ? 0.85 : 1 },
        tipo === 'enlace' && { paddingVertical: 8 },
      ]}>
      {cargando ? <ActivityIndicator color={color} /> : <Text style={[s.botonTexto, { color }]}>{texto}</Text>}
    </Pressable>
  );
}

export function BotonRedondo({
  onPress,
  etiqueta,
  children,
}: {
  onPress: () => void;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} hitSlop={6} style={s.redondo}>
      {children}
    </Pressable>
  );
}

type NombreIcono = 'atras' | 'guardar' | 'guardado' | 'compartir' | 'mapa' | 'ubicacion' | 'flecha-abajo' | 'flecha-arriba' | 'igual' | 'derecha' | 'pin' | 'cerrar';

const TRAZOS: Record<NombreIcono, string[]> = {
  atras: ['M15 5l-7 7 7 7'],
  guardar: ['M6 3h12v18l-6-4-6 4z'],
  guardado: ['M6 3h12v18l-6-4-6 4z'],
  compartir: ['M12 3v12', 'M7 8l5-5 5 5', 'M5 14v6h14v-6'],
  mapa: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14'],
  ubicacion: ['M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'],
  'flecha-abajo': ['M12 5v14', 'M6 13l6 6 6-6'],
  'flecha-arriba': ['M12 19V5', 'M6 11l6-6 6 6'],
  igual: ['M5 9h14', 'M5 15h14'],
  derecha: ['M9 5l7 7-7 7'],
  pin: ['M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z', 'M12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
  cerrar: ['M6 6l12 12', 'M18 6L6 18'],
};

export function Icono({ nombre, size = 22, color = C.texto, grosor = 2 }: { nombre: NombreIcono; size?: number; color?: string; grosor?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      {TRAZOS[nombre].map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={nombre === 'guardado' ? color : 'none'}
        />
      ))}
    </Svg>
  );
}

export function Cargando({ texto }: { texto?: string }) {
  return (
    <View style={s.centro}>
      <ActivityIndicator color={C.azul} size="large" />
      {texto ? <Text style={s.cargandoTexto}>{texto}</Text> : null}
    </View>
  );
}

export function Aviso({ titulo, texto, accion, onAccion }: { titulo: string; texto?: string; accion?: string; onAccion?: () => void }) {
  return (
    <View style={s.centro}>
      <Text style={s.avisoTitulo}>{titulo}</Text>
      {texto ? <Text style={s.avisoTexto}>{texto}</Text> : null}
      {accion && onAccion ? (
        <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
          <Boton texto={accion} onPress={onAccion} tipo="oscuro" />
        </View>
      ) : null}
    </View>
  );
}

export const s = StyleSheet.create({
  tarjeta: {
    backgroundColor: C.tarjeta,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  selector: { flexDirection: 'row', backgroundColor: C.gris, borderRadius: 999, padding: 4 },
  selectorChico: { backgroundColor: C.grisClaro, padding: 3 },
  opcion: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 10, minHeight: 40 },
  opcionChica: { flex: 0, paddingVertical: 5, paddingHorizontal: 10, minHeight: 30 },
  opcionActiva: { backgroundColor: C.texto },
  opcionTexto: { fontSize: 14, fontWeight: '600', color: C.texto2 },
  opcionTextoChico: { fontSize: 12, color: '#4A4E57' },
  opcionTextoActivo: { color: '#FFFFFF' },
  boton: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  botonTexto: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.tarjeta,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  cargandoTexto: { color: C.texto3, fontSize: 14, marginTop: 8 },
  avisoTitulo: { fontSize: 22, fontWeight: '700', color: C.texto, textAlign: 'center' },
  avisoTexto: { fontSize: 15, color: C.texto2, textAlign: 'center', lineHeight: 21 },
});
