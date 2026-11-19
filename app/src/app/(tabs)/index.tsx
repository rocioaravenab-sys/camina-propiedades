import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilaAviso } from '@/components/fila-aviso';
import { ChipsFiltros } from '@/components/filtros';
import { Marca } from '@/components/marca';
import { PinAviso, ZonaAproximada } from '@/components/pin';
import { Boton, Icono, Punto, Selector } from '@/components/ui';
import * as api from '@/lib/api';
import { useEstado } from '@/lib/estado';
import { cuadras, fechaCorta } from '@/lib/formato';
import { C } from '@/lib/tema';
import { distanciaM, useUbicacionEnVivo, type Coordenada } from '@/lib/ubicacion';

const RADIO_M = 600; // ~5 cuadras
const SANTIAGO: Coordenada = { lat: -33.4378, lon: -70.6505 }; // Plaza de Armas
// Volver a pedir avisos cuando la persona camina más que esto.
const PASO_RECARGA_M = 80;
const DELTA = 0.012;

interface Resultado {
  clave: string;
  datos: api.RespuestaCerca | null;
  error?: string;
}

function claveZona(z: api.Zona) {
  return `${z.comuna}|${z.sector ?? ''}|${z.lat}|${z.lon}`;
}

function region(c: Coordenada): Region {
  return { latitude: c.lat, longitude: c.lon, latitudeDelta: DELTA, longitudeDelta: DELTA };
}

export default function Mapa() {
  const insets = useSafeAreaInsets();
  const { modo, setModo, filtros, setFiltros } = useEstado();
  const { permiso, posicion, paso, pedirPermiso } = useUbicacionEnVivo(PASO_RECARGA_M);
  const mapa = useRef<MapView>(null);

  // Mientras "fijo" es null el mapa sigue a la persona y busca alrededor de
  // ella; si arrastra el mapa o pide otra zona, la búsqueda queda fija ahí.
  const [fijo, setFijo] = useState<Coordenada | null>(null);
  const [manual, setManual] = useState(false); // mapa de Santiago sin GPS
  const [vista, setVista] = useState<Coordenada | null>(null);
  const centro = fijo ?? paso;
  const siguiendo = fijo === null;

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [intento, setIntento] = useState(0);
  const [salud, setSalud] = useState<api.RespuestaSalud | null>(null);
  const [zonaSel, setZonaSel] = useState<string | null>(null);

  const clave = centro ? JSON.stringify([centro.lat, centro.lon, filtros, intento]) : null;
  const cargando = clave !== null && resultado?.clave !== clave;
  const datos = resultado?.datos ?? null;
  const error = resultado?.clave === clave ? resultado?.error ?? null : null;

  useEffect(() => {
    api.salud().then(setSalud).catch(() => {});
  }, []);

  // Seguir a la persona con la cámara mientras camina.
  useEffect(() => {
    if (!posicion || !siguiendo) return;
    mapa.current?.animateCamera({ center: { latitude: posicion.lat, longitude: posicion.lon } }, { duration: 500 });
  }, [posicion, siguiendo]);

  useEffect(() => {
    if (!centro || !clave) return;
    let vigente = true;
    api
      .cerca(centro.lat, centro.lon, RADIO_M, filtros)
      .then((datos) => vigente && setResultado({ clave, datos }))
      .catch(
        (e) =>
          vigente &&
          setResultado((r) => ({
            clave,
            datos: r?.datos ?? null,
            error: e instanceof Error ? e.message : 'No pudimos cargar las propiedades.',
          })),
      );
    return () => {
      vigente = false;
    };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  const buscar = () => setIntento((n) => n + 1);

  const verSantiago = () => {
    setManual(true);
    setFijo(SANTIAGO);
    setZonaSel(null);
    mapa.current?.animateToRegion(region(SANTIAGO), 400);
  };

  const volverAMi = () => {
    if (!posicion) {
      pedirPermiso();
      return;
    }
    setManual(false);
    setFijo(null);
    setZonaSel(null);
    mapa.current?.animateToRegion(region(posicion), 400);
  };

  const buscarAqui = () => {
    if (!vista) return;
    setFijo(vista);
    setZonaSel(null);
  };

  const abrir = (a: api.Aviso) => router.push({ pathname: '/propiedad/[id]', params: { id: a.id } });

  const total = (datos?.avisos.length ?? 0) + (datos?.zonas.reduce((n, z) => n + z.cantidad, 0) ?? 0);
  const zona = zonaSel != null ? datos?.zonas.find((z) => claveZona(z) === zonaSel) : undefined;
  const lejosDeLaBusqueda = !!(vista && centro && distanciaM(vista, centro) > 250);

  const [inicial] = useState(() => region(posicion ?? SANTIAGO));

  // Fuera de la Región Metropolitana.
  if (datos?.fuera_de_zona && !manual) {
    return (
      <View style={[st.pantallaCentro, { paddingTop: insets.top }]}>
        <View style={st.iconoGrande}>
          <Icono nombre="pin" size={44} color={C.azul} grosor={1.8} />
        </View>
        <Text style={st.grande}>Todavía no llegamos a tu zona</Text>
        <Text style={st.parrafo}>Por ahora caminaPropiedades funciona en las 52 comunas de la Región Metropolitana.</Text>
        <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
          <Boton texto="Ver el mapa de Santiago" tipo="oscuro" onPress={verSantiago} />
        </View>
      </View>
    );
  }

  // Sin permiso de ubicación.
  if (permiso === 'denegado' && !manual) {
    return (
      <View style={[st.pantallaCentro, { paddingTop: insets.top }]}>
        <View style={st.iconoGrande}>
          <Icono nombre="ubicacion" size={44} color={C.azul} grosor={1.8} />
        </View>
        <Text style={st.grande}>Activa tu ubicación</Text>
        <Text style={st.parrafo}>
          Usamos tu ubicación solo mientras la app está abierta, para mostrarte lo que está en venta a tu alrededor.
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: 8, gap: 6 }}>
          <Boton texto="Abrir ajustes" tipo="oscuro" onPress={() => Linking.openSettings()} />
          <Boton texto="Ver el mapa de Santiago" tipo="enlace" onPress={verSantiago} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.mapa }}>
      <MapView
        ref={mapa}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={inicial}
        showsUserLocation={permiso === 'concedido'}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        onPress={() => setZonaSel(null)}
        onRegionChangeComplete={(r, detalles) => {
          setVista({ lat: r.latitude, lon: r.longitude });
          if (detalles?.isGesture && !fijo) setFijo(centro ?? { lat: r.latitude, lon: r.longitude });
        }}>
        {datos?.zonas.map((z) => (
          <ZonaAproximada
            key={claveZona(z)}
            zona={z}
            activa={zonaSel === claveZona(z)}
            onPress={() => setZonaSel(claveZona(z))}
          />
        ))}
        {datos?.avisos.map((a) => <PinAviso key={a.id} aviso={a} onPress={() => abrir(a)} />)}
      </MapView>

      {/* Cabecera: marca, modo y filtros */}
      <View style={[st.arriba, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={st.cabecera}>
          <Marca />
          <Selector
            chico
            valor={modo}
            onCambio={setModo}
            opciones={[
              { valor: 'vivir', texto: 'Vivir' },
              { valor: 'invertir', texto: 'Invertir' },
            ]}
          />
        </View>
        <ChipsFiltros filtros={filtros} onCambio={setFiltros} />
        {lejosDeLaBusqueda ? (
          <Pressable style={st.buscarAqui} onPress={buscarAqui} accessibilityRole="button">
            <Text style={st.buscarAquiTexto}>Buscar en esta zona</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={volverAMi}
        accessibilityRole="button"
        accessibilityLabel="Volver a mi ubicación"
        style={[st.miUbicacion, siguiendo && { backgroundColor: C.azulClaro }]}>
        <Icono nombre="ubicacion" color={C.azul} />
      </Pressable>

      {/* Panel inferior */}
      <View style={st.panel}>
        <View style={st.asa} />
        {zona ? (
          <>
            <View style={st.panelTitulo}>
              <Text style={st.titulo} numberOfLines={1}>
                {zona.cantidad === 1 ? '1 aviso' : `${zona.cantidad} avisos`} en {zona.sector || zona.comuna}
              </Text>
              <Pressable onPress={() => setZonaSel(null)} accessibilityLabel="Cerrar" hitSlop={10}>
                <Icono nombre="cerrar" size={20} color={C.texto3} />
              </Pressable>
            </View>
            <Text style={st.nota}>El portal no publica la dirección exacta: están en algún punto de esta zona.</Text>
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {zona.avisos.map((a) => (
                <View key={a.id} style={st.filaBorde}>
                  <FilaAviso aviso={a} onPress={() => abrir(a)} />
                </View>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={st.panelTitulo}>
              <Text style={st.titulo}>
                {!centro
                  ? 'Buscando tu ubicación…'
                  : error
                    ? 'Sin conexión con el mapa'
                    : datos
                      ? `${total} en venta a ${cuadras(datos.radio_m ?? RADIO_M)}`
                      : 'Cargando propiedades…'}
              </Text>
              {cargando ? (
                <ActivityIndicator color={C.azul} />
              ) : salud?.datos_al ? (
                <Text style={st.nota}>Datos al {fechaCorta(salud.datos_al)}</Text>
              ) : null}
            </View>
            {error ? (
              <View style={{ gap: 6 }}>
                <Text style={st.nota}>{error}</Text>
                <Boton texto="Reintentar" tipo="enlace" onPress={buscar} />
              </View>
            ) : (
              <>
                <View style={st.leyenda}>
                  <View style={st.leyendaItem}>
                    <Punto color={C.verde} />
                    <Text style={st.leyendaTexto}>Bajo el sector</Text>
                  </View>
                  <View style={st.leyendaItem}>
                    <Punto color={C.amarillo} />
                    <Text style={st.leyendaTexto}>En línea</Text>
                  </View>
                  <View style={st.leyendaItem}>
                    <Punto color={C.rojo} />
                    <Text style={st.leyendaTexto}>Sobre el sector</Text>
                  </View>
                </View>
                <View style={st.leyendaItem}>
                  <View style={st.muestraZona} />
                  <Text style={st.nota}>Zona = ubicación aproximada del aviso</Text>
                </View>
                {salud && !salud.ok ? <Text style={st.alerta}>Los datos pueden estar atrasados.</Text> : null}
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const sombra = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
};

const st = StyleSheet.create({
  arriba: { position: 'absolute', left: 16, right: 16, gap: 10 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...sombra,
  },
  buscarAqui: {
    alignSelf: 'center',
    backgroundColor: C.texto,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 40,
    ...sombra,
  },
  buscarAquiTexto: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  miUbicacion: {
    position: 'absolute',
    right: 16,
    bottom: 190,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
    ...sombra,
  },
  asa: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borde, alignSelf: 'center' },
  panelTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  titulo: { fontSize: 20, fontWeight: '700', color: C.texto, letterSpacing: -0.3, flexShrink: 1 },
  nota: { fontSize: 12, color: C.texto3 },
  alerta: { fontSize: 12, color: C.amarilloTexto, fontWeight: '600' },
  leyenda: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaTexto: { fontSize: 12, color: C.texto2 },
  muestraZona: {
    width: 14,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.amarillo,
    backgroundColor: 'rgba(217,154,0,0.16)',
  },
  filaBorde: { borderWidth: 1, borderColor: C.linea, borderRadius: 16 },
  pantallaCentro: { flex: 1, backgroundColor: C.fondo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 18 },
  iconoGrande: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.azulClaro, alignItems: 'center', justifyContent: 'center' },
  grande: { fontSize: 26, fontWeight: '700', color: C.texto, textAlign: 'center', lineHeight: 30 },
  parrafo: { fontSize: 15, color: C.texto2, textAlign: 'center', lineHeight: 22 },
});
