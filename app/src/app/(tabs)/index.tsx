import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilaAviso } from '@/components/fila-aviso';
import { ChipsFiltros } from '@/components/filtros';
import { Marca } from '@/components/marca';
import { PinAviso, PinEdificio, ZonaAproximada } from '@/components/pin';
import { Boton, Icono, Punto } from '@/components/ui';
import * as api from '@/lib/api';
import { agruparEdificios, claveZona, cubierta, enLaCuadra, sumar, vacio, type Cargado, type Circulo, type Edificio } from '@/lib/avisos';
import { DURACION_MS, RADIO_CUADRA_M, useCaminata } from '@/lib/caminata';
import { useEstado } from '@/lib/estado';
import { fechaCorta, metros, numero, uf } from '@/lib/formato';
import { C } from '@/lib/tema';
import { distanciaM, useUbicacionEnVivo, type Coordenada } from '@/lib/ubicacion';

const RADIO_MIN_M = 600; // ~5 cuadras
const RADIO_MAX_M = 4000; // lo más que entrega la API por pedido
const MAX_PINES = 300; // con el mapa muy alejado se dibujan los más cercanos al centro
const SANTIAGO: Coordenada = { lat: -33.4378, lon: -70.6505 }; // Plaza de Armas
const DELTA = 0.012;

interface Vista extends Coordenada {
  radio: number; // media diagonal de lo que se ve, en metros
  latDelta: number;
  lonDelta: number;
}

type Seleccion = { tipo: 'zona' | 'edificio'; clave: string } | null;

function region(c: Coordenada): Region {
  return { latitude: c.lat, longitude: c.lon, latitudeDelta: DELTA, longitudeDelta: DELTA };
}

function vistaDe(r: Region): Vista {
  const alto = r.latitudeDelta * 111320;
  const ancho = r.longitudeDelta * 111320 * Math.cos((r.latitude * Math.PI) / 180);
  return { lat: r.latitude, lon: r.longitude, radio: Math.hypot(alto, ancho) / 2, latDelta: r.latitudeDelta, lonDelta: r.longitudeDelta };
}

function dentro(v: Vista, p: { lat: number | null; lon: number | null }): boolean {
  if (p.lat == null || p.lon == null) return false;
  return Math.abs(p.lat - v.lat) <= v.latDelta * 0.6 && Math.abs(p.lon - v.lon) <= v.lonDelta * 0.6;
}

function duracion(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export default function Mapa() {
  const insets = useSafeAreaInsets();
  const { filtros, setFiltros } = useEstado();
  const caminata = useCaminata();
  const { permiso, posicion, pedirPermiso } = useUbicacionEnVivo();
  const mapa = useRef<MapView>(null);

  // Mientras "siguiendo" el mapa acompaña a la persona; si lo arrastra, se queda donde lo dejó.
  const [siguiendo, setSiguiendo] = useState(true);
  const [manual, setManual] = useState(false); // mapa de Santiago sin GPS
  const [vista, setVista] = useState<Vista | null>(null);
  const [sel, setSel] = useState<Seleccion>(null);
  const [salud, setSalud] = useState<api.RespuestaSalud | null>(null);
  const [fuera, setFuera] = useState(false);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<{ clave: string; mensaje: string } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // Todo lo ya cargado se va sumando; si cambian los filtros se parte de cero.
  const claveFiltros = JSON.stringify(filtros);
  const [guardado, setGuardado] = useState<Cargado>(() => vacio(claveFiltros));
  const cargado = guardado.filtros === claveFiltros ? guardado : vacio(claveFiltros);

  // Qué falta pedir: lo que se ve (o alrededor de la persona antes de que el mapa avise).
  const listo = manual || !siguiendo || posicion !== null;
  const base: Circulo | null = !listo
    ? null
    : vista
      ? { lat: vista.lat, lon: vista.lon, radio: Math.min(Math.max(vista.radio, RADIO_MIN_M), RADIO_MAX_M) }
      : posicion
        ? { ...posicion, radio: RADIO_MIN_M }
        : null;
  const pedido: Circulo | null =
    base && !cubierta(cargado, base) ? { ...base, radio: Math.min(Math.round(base.radio * 1.25), RADIO_MAX_M) } : null;
  const clavePedido = pedido
    ? JSON.stringify([pedido.lat.toFixed(4), pedido.lon.toFixed(4), pedido.radio, claveFiltros, intento])
    : null;
  const cargando = clavePedido !== null && error?.clave !== clavePedido;

  useEffect(() => {
    api.salud().then(setSalud).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pedido || !clavePedido) return;
    api
      .cerca(pedido.lat, pedido.lon, pedido.radio, filtros)
      .then((r) => {
        // Lo que llega se suma aunque la persona ya haya movido el mapa.
        setGuardado((g) => sumar(g.filtros === claveFiltros ? g : vacio(claveFiltros), pedido, r));
        setFuera(r.fuera_de_zona);
        setError(null);
      })
      .catch((e) =>
        setError({ clave: clavePedido, mensaje: e instanceof Error ? e.message : 'No pudimos cargar las propiedades.' }),
      );
  }, [clavePedido]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seguir a la persona con la cámara mientras camina.
  useEffect(() => {
    if (!posicion || !siguiendo) return;
    mapa.current?.animateCamera({ center: { latitude: posicion.lat, longitude: posicion.lon } }, { duration: 500 });
  }, [posicion, siguiendo]);

  // Reloj para el recorrido del modo caminata.
  useEffect(() => {
    if (!caminata.activo) return;
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, [caminata.activo]);

  // Lo que se dibuja: lo cargado que cae en la vista, los más cercanos al centro primero.
  const { edificios, zonas, total } = useMemo(() => {
    const todos = Object.values(cargado.avisos);
    const todasZonas = Object.values(cargado.zonas);
    if (!vista) return { edificios: agruparEdificios(todos.slice(0, MAX_PINES)), zonas: todasZonas.slice(0, MAX_PINES), total: 0 };
    const visibles = todos.filter((a) => dentro(vista, a));
    const zonasVisibles = todasZonas.filter((z) => dentro(vista, z));
    const cerca = (p: Coordenada) => distanciaM(vista, p);
    visibles.sort((a, b) => cerca({ lat: a.lat!, lon: a.lon! }) - cerca({ lat: b.lat!, lon: b.lon! }));
    zonasVisibles.sort((a, b) => cerca(a) - cerca(b));
    return {
      edificios: agruparEdificios(visibles.slice(0, MAX_PINES)),
      zonas: zonasVisibles.slice(0, MAX_PINES),
      total: visibles.length + zonasVisibles.reduce((n, z) => n + z.cantidad, 0),
    };
  }, [cargado, vista]);

  const enCuadra = useMemo(
    () => (caminata.activo && posicion ? enLaCuadra(Object.values(cargado.avisos), posicion, RADIO_CUADRA_M * 1.5) : []),
    [caminata.activo, posicion, cargado],
  );

  const reintentar = () => setIntento((n) => n + 1);

  const verSantiago = () => {
    setManual(true);
    setSiguiendo(false);
    setSel(null);
    setVista(vistaDe(region(SANTIAGO)));
    mapa.current?.animateToRegion(region(SANTIAGO), 400);
  };

  const volverAMi = () => {
    if (!posicion) {
      pedirPermiso();
      return;
    }
    setManual(false);
    setSiguiendo(true);
    setSel(null);
    mapa.current?.animateToRegion(region(posicion), 400);
  };

  const abrir = (a: api.Aviso) => router.push({ pathname: '/propiedad/[id]', params: { id: a.id } });
  const abrirEdificio = (e: Edificio) => (e.avisos.length === 1 ? abrir(e.avisos[0]) : setSel({ tipo: 'edificio', clave: e.clave }));

  const empezarCaminata = () => {
    setSiguiendo(true);
    setManual(false);
    router.push('/caminata');
  };

  const zonaSel = sel?.tipo === 'zona' ? cargado.zonas[sel.clave] : undefined;
  const edificioSel = sel?.tipo === 'edificio' ? edificios.find((e) => e.clave === sel.clave) : undefined;

  const [inicial] = useState(() => region(posicion ?? SANTIAGO));

  // Fuera de la Región Metropolitana.
  if (fuera && siguiendo && !manual) {
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
        <Text style={st.parrafo}>Usamos tu ubicación para mostrarte lo que está en venta a tu alrededor.</Text>
        <View style={{ alignSelf: 'stretch', marginTop: 8, gap: 6 }}>
          <Boton texto="Abrir ajustes" tipo="oscuro" onPress={() => Linking.openSettings()} />
          <Boton texto="Ver el mapa de Santiago" tipo="enlace" onPress={verSantiago} />
        </View>
      </View>
    );
  }

  const restante = caminata.activo ? caminata.inicio + DURACION_MS - ahora : 0;

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
        onPress={() => setSel(null)}
        onRegionChangeComplete={(r, detalles) => {
          setVista(vistaDe(r));
          if (detalles?.isGesture) setSiguiendo(false);
        }}>
        {zonas.map((z) => (
          <ZonaAproximada
            key={claveZona(z)}
            zona={z}
            activa={sel?.tipo === 'zona' && sel.clave === claveZona(z)}
            onPress={() => setSel({ tipo: 'zona', clave: claveZona(z) })}
          />
        ))}
        {edificios.map((e) =>
          e.avisos.length === 1 ? (
            <PinAviso key={e.avisos[0].id} aviso={e.avisos[0]} onPress={() => abrir(e.avisos[0])} />
          ) : (
            <PinEdificio
              key={e.clave}
              edificio={e}
              activo={sel?.tipo === 'edificio' && sel.clave === e.clave}
              onPress={() => abrirEdificio(e)}
            />
          ),
        )}
      </MapView>

      {/* Cabecera: marca, modo caminata y filtros */}
      <View style={[st.arriba, { top: insets.top + 8 }]} pointerEvents="box-none">
        {caminata.activo ? (
          <View style={st.barraCaminata}>
            <Icono nombre="caminar" color="#FFFFFF" grosor={2.2} />
            <View style={{ flex: 1 }}>
              <Text style={st.barraTitulo}>Modo caminata activo</Text>
              <Text style={st.barraTexto}>El mapa se actualiza solo. Te avisamos al pasar por propiedades en venta.</Text>
            </View>
            <Pressable onPress={caminata.detener} style={st.detener} accessibilityRole="button">
              <Text style={st.detenerTexto}>Detener</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={st.cabecera}>
              <Marca />
              <Pressable onPress={empezarCaminata} style={st.botonCaminata} accessibilityRole="button">
                <Icono nombre="caminar" size={16} color={C.azul} grosor={2.2} />
                <Text style={st.botonCaminataTexto}>Modo caminata</Text>
              </Pressable>
            </View>
            <ChipsFiltros filtros={filtros} onCambio={setFiltros} />
          </>
        )}
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
        {zonaSel || edificioSel ? (
          <>
            <View style={st.panelTitulo}>
              <Text style={st.titulo} numberOfLines={1}>
                {zonaSel
                  ? `${zonaSel.cantidad === 1 ? '1 aviso' : `${zonaSel.cantidad} avisos`} en ${zonaSel.sector || zonaSel.comuna}`
                  : `${edificioSel!.avisos.length} en este edificio`}
              </Text>
              <Pressable onPress={() => setSel(null)} accessibilityLabel="Cerrar" hitSlop={10}>
                <Icono nombre="cerrar" size={20} color={C.texto3} />
              </Pressable>
            </View>
            {zonaSel ? (
              <Text style={st.nota}>El portal no publica la dirección exacta: están en algún punto de esta zona.</Text>
            ) : null}
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {(zonaSel ? zonaSel.avisos : edificioSel!.avisos).map((a) => (
                <View key={a.id} style={st.filaBorde}>
                  <FilaAviso aviso={a} onPress={() => abrir(a)} />
                </View>
              ))}
            </ScrollView>
          </>
        ) : caminata.activo ? (
          <>
            <Text style={st.titulo}>En esta cuadra</Text>
            {enCuadra.length === 0 ? (
              <Text style={st.nota}>Nada en venta a menos de una cuadra. Sigue caminando y te avisamos.</Text>
            ) : (
              enCuadra.slice(0, 3).map((e) => (
                <Pressable key={e.clave} onPress={() => abrirEdificio(e)} style={st.filaCuadra} accessibilityRole="button">
                  <View style={st.iconoEdificio}>
                    <Icono nombre="edificio" color={C.azul} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.filaTitulo} numberOfLines={1}>
                      {e.avisos.length === 1 ? `${e.avisos[0].tipo} en venta` : `Edificio con ${e.avisos.length} en venta`}
                    </Text>
                    <Text style={st.nota} numberOfLines={1}>
                      {[
                        e.avisos[0].precio_uf ? `${e.avisos.length > 1 ? 'Desde ' : ''}${uf(e.avisos[0].precio_uf)}` : null,
                        e.avisos.some((a) => a.color === 'verde') ? (e.avisos.length > 1 ? 'uno bajo el sector' : 'bajo el sector') : null,
                        `a ${metros(e.distancia)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Icono nombre="derecha" size={18} color={C.texto3} />
                </Pressable>
              ))
            )}
            <View style={st.panelTitulo}>
              <Text style={st.nota}>
                Recorrido: {numero(caminata.distancia_m / 1000, 1)} km · {duracion(ahora - caminata.inicio)}
              </Text>
              <Text style={st.nota}>Se apaga sola en {duracion(restante)}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={st.panelTitulo}>
              <Text style={st.titulo}>
                {!listo
                  ? 'Buscando tu ubicación…'
                  : error && !cargando
                    ? 'Sin conexión con el mapa'
                    : vista
                      ? `${numero(total)} en venta en esta vista`
                      : 'Cargando propiedades…'}
              </Text>
              {cargando ? (
                <ActivityIndicator color={C.azul} />
              ) : salud?.datos_al ? (
                <Text style={st.nota}>Datos al {fechaCorta(salud.datos_al)}</Text>
              ) : null}
            </View>
            {error && !cargando ? (
              <View style={{ gap: 6 }}>
                <Text style={st.nota}>{error.mensaje}</Text>
                <Boton texto="Reintentar" tipo="enlace" onPress={reintentar} />
              </View>
            ) : (
              <>
                <Text style={st.texto2}>Aleja el mapa y se van sumando más propiedades.</Text>
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
  botonCaminata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.azulClaro,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  botonCaminataTexto: { color: C.azul, fontWeight: '700', fontSize: 13 },
  barraCaminata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.azul,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
    ...sombra,
  },
  barraTitulo: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  barraTexto: { color: '#FFFFFF', opacity: 0.9, fontSize: 12 },
  detener: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  detenerTexto: { color: C.azul, fontWeight: '700', fontSize: 13 },
  filaCuadra: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.fondo, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  iconoEdificio: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.azulClaro, alignItems: 'center', justifyContent: 'center' },
  filaTitulo: { fontSize: 14, fontWeight: '700', color: C.texto },
  texto2: { fontSize: 13, color: C.texto2 },
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
