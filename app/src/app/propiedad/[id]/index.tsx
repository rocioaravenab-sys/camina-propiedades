import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { precioCorto } from '@/components/pin';
import { Aviso as Mensaje, Boton, BotonRedondo, Cargando, Icono, Punto, Tarjeta } from '@/components/ui';
import * as api from '@/lib/api';
import { useEstado } from '@/lib/estado';
import { clp, fechaCorta, numero, pct, tipologia, uf } from '@/lib/formato';
import { C, colorDe, colorTextoDe } from '@/lib/tema';

const ETIQUETA: Record<api.Color, string> = {
  verde: 'Bajo el sector',
  amarillo: 'En línea con el sector',
  rojo: 'Sobre el sector',
  gris: 'Pocos datos en el sector',
};

const FONDO_ETIQUETA: Record<api.Color, string> = {
  verde: '#E3F3E9',
  amarillo: C.amarilloFondo,
  rojo: '#F8E1E1',
  gris: C.grisClaro,
};

function millones(clpTotal: number): string {
  return `≈ $${numero(clpTotal / 1_000_000, clpTotal < 100_000_000 ? 1 : 0)} millones`;
}

function precioHistorial(p: { precio: number; moneda: string }): string {
  return p.moneda === 'UF' ? uf(p.precio) : clp(p.precio);
}

function hace(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${numero(dias)} días`;
}

// Pantalla 9: la ficha del aviso. La comparación completa vive en /comparar.
export default function Ficha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { favoritos, alternarFavorito, marcarNoEsta } = useEstado();
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<{ clave: string; datos?: api.RespuestaDetalle; error?: api.ErrorApi } | null>(null);

  const clave = JSON.stringify([id, intento]);
  const datos = resultado?.clave === clave ? (resultado.datos ?? null) : null;
  const error = resultado?.clave === clave ? (resultado.error ?? null) : null;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    api
      .detalle(id)
      .then((r) => vigente && setResultado({ clave, datos: r }))
      .catch((e) => {
        if (!vigente) return;
        const err = e instanceof api.ErrorApi ? e : new api.ErrorApi('Error', 0);
        if (err.status === 404) marcarNoEsta(id);
        setResultado({ clave, error: err });
      });
    return () => {
      vigente = false;
    };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const a = datos?.aviso;
  const guardado = !!(id && favoritos[id]);

  const cabecera = (
    <View style={[st.barra, { paddingTop: insets.top + 8 }]}>
      <BotonRedondo onPress={volver} etiqueta="Volver al mapa">
        <Icono nombre="atras" />
      </BotonRedondo>
      {a ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <BotonRedondo onPress={() => alternarFavorito(a)} etiqueta={guardado ? 'Quitar de guardadas' : 'Guardar'}>
            <Icono nombre={guardado ? 'guardado' : 'guardar'} size={20} color={guardado ? C.azul : C.texto} />
          </BotonRedondo>
          <BotonRedondo
            etiqueta="Compartir"
            onPress={() =>
              Share.share({
                message: `${a.tipo} ${tipologia(a.dormitorios, a.banos)} en ${a.sector || a.comuna}, ${precioCorto(a)}${a.url ? '\n' + a.url : ''}`,
              }).catch(() => {})
            }>
            <Icono nombre="compartir" size={20} />
          </BotonRedondo>
        </View>
      ) : null}
    </View>
  );

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: C.fondo }}>
        {cabecera}
        {error.status === 404 ? (
          <Mensaje
            titulo="Este aviso ya no está publicado"
            texto="Lo sacaron de los portales o no lo hemos visto en los últimos 7 días."
            accion="Volver al mapa"
            onAccion={volver}
          />
        ) : (
          <Mensaje titulo="No pudimos cargar el aviso" texto={error.message} accion="Reintentar" onAccion={() => setIntento((n) => n + 1)} />
        )}
      </View>
    );
  }

  if (!datos || !a) {
    return (
      <View style={{ flex: 1, backgroundColor: C.fondo }}>
        {cabecera}
        <Cargando texto="Cargando el aviso…" />
      </View>
    );
  }

  const color = a.color ?? 'gris';
  const cambio = datos.cambio_precio;
  const inicial = datos.historial[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      {cabecera}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {a.fotos && a.fotos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fotos}>
            {a.fotos.map((url, i) => (
              <Image
                key={url}
                source={{ uri: url }}
                style={st.foto}
                contentFit="cover"
                transition={150}
                accessibilityLabel={`Foto ${i + 1} de ${a.fotos!.length}`}
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={st.encabezado}>
          <Text style={st.sub}>
            {a.tipo} en venta · {[a.sector, a.comuna].filter(Boolean).join(', ')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Text style={st.precio}>{precioCorto(a)}</Text>
            {datos.precio_clp ? <Text style={st.lugar}>{millones(datos.precio_clp)}</Text> : null}
          </View>
          <View style={st.etiquetas}>
            <View style={[st.etiqueta, { backgroundColor: FONDO_ETIQUETA[color] }]}>
              <Punto color={colorDe(color)} size={8} />
              <Text style={[st.etiquetaTexto, { color: colorTextoDe(color) }]}>{ETIQUETA[color]}</Text>
            </View>
            {cambio ? (
              <View style={[st.etiqueta, { backgroundColor: C.azulClaro }]}>
                <Text style={[st.etiquetaTexto, { color: C.azul }]}>
                  {cambio.pct < 0 ? 'Bajó' : 'Subió'} {pct(Math.abs(cambio.pct), Math.abs(cambio.pct) < 1 ? 1 : 0)} de precio
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={st.grilla}>
          <Celda etiqueta="Dormitorios" valor={a.dormitorios != null ? String(a.dormitorios) : '—'} />
          <Celda etiqueta="Baños" valor={a.banos != null ? String(a.banos) : '—'} />
          <Celda etiqueta="Estacionam." valor={a.estacionamientos != null ? String(a.estacionamientos) : '—'} />
          <Celda etiqueta="Superficie" valor={a.m2 ? `${numero(a.m2)} m²` : '—'} />
          <Celda etiqueta="UF por m²" valor={a.uf_m2 ? numero(a.uf_m2, 1) : '—'} />
          <Celda etiqueta="Gasto común" valor={a.gasto_comun ? clp(a.gasto_comun) : '—'} />
        </View>

        <View style={st.bloque}>
          <Tarjeta style={{ gap: 10 }}>
            <Text style={st.seccion}>Historia del aviso</Text>
            <Dato
              etiqueta="Publicado"
              valor={[datos.dias_publicado != null ? hace(datos.dias_publicado) : null, a.portal].filter(Boolean).join(' · ')}
            />
            {cambio && inicial ? (
              <>
                <Dato etiqueta={`Precio inicial (${fechaCorta(inicial.fecha)})`} valor={precioHistorial(inicial)} />
                <Dato
                  etiqueta={`${cambio.pct < 0 ? 'Bajó' : 'Subió'} a (${fechaCorta(cambio.fecha)})`}
                  valor={`${precioHistorial({ precio: cambio.hasta, moneda: cambio.moneda })} (${cambio.pct < 0 ? '−' : '+'}${pct(Math.abs(cambio.pct), 0)})`}
                  color={cambio.pct < 0 ? C.verdeTexto : C.rojoTexto}
                />
              </>
            ) : (
              <Dato etiqueta="Precio" valor="Sin cambios desde que lo vimos" />
            )}
          </Tarjeta>
        </View>

        {a.lat != null && a.lon != null ? (
          <View style={[st.bloque, st.mini]}>
            <MapView
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              liteMode
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
              initialRegion={{ latitude: a.lat, longitude: a.lon, latitudeDelta: 0.006, longitudeDelta: 0.006 }}>
              {a.ubicacion_exacta ? (
                <Marker coordinate={{ latitude: a.lat, longitude: a.lon }} pinColor={colorDe(color)} />
              ) : (
                <Circle
                  center={{ latitude: a.lat, longitude: a.lon }}
                  radius={150}
                  strokeColor={colorDe(color)}
                  fillColor="rgba(185,130,0,0.14)"
                />
              )}
            </MapView>
            {!a.ubicacion_exacta ? (
              <View style={st.miniNota}>
                <Text style={st.miniNotaTexto}>Ubicación aproximada</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[st.pie, { paddingBottom: insets.bottom + 12 }]}>
        <Boton texto="Comparar con las del área" onPress={() => router.push({ pathname: '/propiedad/[id]/comparar', params: { id: a.id } })} />
        {a.url ? (
          <Boton texto="Ver aviso original en el portal" tipo="enlace" onPress={() => WebBrowser.openBrowserAsync(a.url!)} />
        ) : null}
      </View>
    </View>
  );
}

function Celda({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={st.celda}>
      <Text style={st.nota}>{etiqueta}</Text>
      <Text style={st.celdaValor} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </View>
  );
}

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <View style={st.dato}>
      <Text style={st.texto2}>{etiqueta}</Text>
      <Text style={[st.valor, color ? { color } : null]}>{valor}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  barra: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  fotos: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  foto: { width: 260, height: 180, borderRadius: 14, backgroundColor: C.borde },
  encabezado: { paddingHorizontal: 20, paddingTop: 2, gap: 4 },
  sub: { fontSize: 13, color: C.texto3 },
  precio: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.texto },
  lugar: { fontSize: 14, color: C.texto2 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  etiqueta: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  etiquetaTexto: { fontSize: 12, fontWeight: '700' },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 20, marginTop: 14 },
  celda: { backgroundColor: C.tarjeta, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, flexBasis: '30%', flexGrow: 1 },
  celdaValor: { fontSize: 17, fontWeight: '700', color: C.texto },
  bloque: { marginHorizontal: 20, marginTop: 12 },
  seccion: { fontSize: 15, fontWeight: '700', color: C.texto },
  dato: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  texto2: { fontSize: 14, color: C.texto2, flexShrink: 1 },
  valor: { fontSize: 14, fontWeight: '600', color: C.texto, textAlign: 'right', flexShrink: 1 },
  nota: { fontSize: 11, color: C.texto3 },
  mini: { height: 110, borderRadius: 18, overflow: 'hidden', backgroundColor: C.mapa },
  miniNota: { position: 'absolute', left: 12, bottom: 10, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  miniNotaTexto: { fontSize: 12, fontWeight: '600', color: C.texto },
  pie: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 14, gap: 4, borderTopWidth: 1, borderTopColor: C.linea },
});
