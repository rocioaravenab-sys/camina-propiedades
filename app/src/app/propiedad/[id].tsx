import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarraPrecio } from '@/components/barra-precio';
import { EditarCredito } from '@/components/editar-credito';
import { FilaAviso } from '@/components/fila-aviso';
import { precioCorto } from '@/components/pin';
import { Aviso as Mensaje, Boton, BotonRedondo, Cargando, Icono, Punto, Selector, Tarjeta } from '@/components/ui';
import * as api from '@/lib/api';
import { useCompras } from '@/lib/compras';
import { useEstado } from '@/lib/estado';
import { clp, metros, numero, pct, tipologia, uf } from '@/lib/formato';
import { C, colorDe, colorTextoDe } from '@/lib/tema';

const TITULO_PRECIO: Record<api.Color, string> = {
  verde: 'Precio bajo el sector',
  amarillo: 'Precio en línea con el sector',
  rojo: 'Precio sobre el sector',
  gris: 'Pocos datos en el sector',
};

function frasePrecio(p: api.PosicionPrecio, a: api.Aviso) {
  if (p.color === 'gris' || p.desvio_pct == null) {
    return `Hay ${p.n_comparables} avisos parecidos cerca: muy pocos para comparar con seguridad.`;
  }
  const tipo = p.base === 'uf_m2' ? 'del UF/m²' : `de ${tipologia(a.dormitorios, a.banos) || 'su tipología'}`;
  const d = Math.abs(p.desvio_pct);
  return `${pct(d, 0)} ${p.desvio_pct < 0 ? 'bajo' : 'sobre'} la mediana ${tipo} aquí`;
}

const NIVEL_CRIMEN: Record<string, { texto: string; color: string; fondo: string }> = {
  bajo: { texto: 'Baja', color: C.verdeTexto, fondo: '#E3F3E9' },
  medio: { texto: 'Media', color: C.amarilloTexto, fondo: C.amarilloFondo },
  alto: { texto: 'Alta', color: C.rojoTexto, fondo: '#F8E1E1' },
};

export default function Ficha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { modo, setModo, credito, setCredito, favoritos, alternarFavorito, marcarNoEsta } = useEstado();
  const { precio: precioInforme } = useCompras();
  const [resultado, setResultado] = useState<{ clave: string; datos?: api.RespuestaComparar; error?: api.ErrorApi } | null>(null);
  const [intento, setIntento] = useState(0);
  const [editando, setEditando] = useState(false);
  const [todosComparables, setTodosComparables] = useState(false);

  const creditoPedido = modo === 'invertir' ? credito : undefined;
  const clave = JSON.stringify([id, modo, creditoPedido, intento]);
  const cargando = resultado?.clave !== clave;
  // Mientras carga el otro modo se sigue mostrando lo anterior.
  const [ultimo, setUltimo] = useState<api.RespuestaComparar | null>(null);
  const datos = resultado?.clave === clave ? (resultado.datos ?? null) : ultimo;
  const error = resultado?.clave === clave ? (resultado.error ?? null) : null;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    api
      .comparar(id, modo, creditoPedido)
      .then((r) => {
        if (!vigente) return;
        setResultado({ clave, datos: r });
        setUltimo(r);
      })
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

  const cargar = () => setIntento((n) => n + 1);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const a = datos?.aviso;
  const guardado = !!(id && favoritos[id]);

  const cabecera = (
    <View style={[st.barra, { paddingTop: insets.top + 8 }]}>
      <BotonRedondo onPress={volver} etiqueta="Volver">
        <Icono nombre="atras" />
      </BotonRedondo>
      {a ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <BotonRedondo
            onPress={() => alternarFavorito({ ...a, color: datos?.precio.color })}
            etiqueta={guardado ? 'Quitar de guardadas' : 'Guardar'}>
            <Icono nombre={guardado ? 'guardado' : 'guardar'} size={20} color={guardado ? C.azul : C.texto} />
          </BotonRedondo>
          <BotonRedondo
            etiqueta="Compartir"
            onPress={() =>
              Share.share({
                message: `${a.tipo} ${tipologia(a.dormitorios, a.banos)} en ${a.sector || a.comuna}, ${uf(a.precio_uf)}${a.url ? '\n' + a.url : ''}`,
              }).catch(() => {})
            }>
            <Icono nombre="compartir" size={20} />
          </BotonRedondo>
        </View>
      ) : null}
    </View>
  );

  if (error && !datos) {
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
          <Mensaje titulo="No pudimos cargar la comparación" texto={error.message} accion="Reintentar" onAccion={cargar} />
        )}
      </View>
    );
  }

  if (!datos || !a) {
    return (
      <View style={{ flex: 1, backgroundColor: C.fondo }}>
        {cabecera}
        <Cargando texto="Comparando con el sector…" />
      </View>
    );
  }

  const p = datos.precio;
  const inv = datos.inversion;
  const caracteristicas = [
    a.tipo,
    a.dormitorios != null ? `${a.dormitorios} dorm.` : null,
    a.banos != null ? `${a.banos} ${a.banos === 1 ? 'baño' : 'baños'}` : null,
    a.m2 ? `${numero(a.m2)} m²` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const comparables = todosComparables ? datos.comparables : datos.comparables.slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      {cabecera}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {a.fotos && a.fotos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.fotos}>
            {a.fotos.map((url) => (
              <Image key={url} source={{ uri: url }} style={st.foto} contentFit="cover" transition={150} />
            ))}
          </ScrollView>
        ) : null}
        <View style={st.encabezado}>
          <Text style={st.sub}>{caracteristicas}</Text>
          <Text style={st.precio}>{precioCorto(a)}</Text>
          <Text style={st.lugar}>
            {[a.sector, a.comuna].filter(Boolean).join(', ')}
            {a.uf_m2 ? ` · UF ${numero(a.uf_m2, 1)} por m²` : ''}
          </Text>
          {a.gasto_comun || a.estacionamientos ? (
            <Text style={st.lugar}>
              {[
                a.gasto_comun ? `Gasto común ${clp(a.gasto_comun)}` : null,
                a.estacionamientos ? `${a.estacionamientos} estac.` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {!a.ubicacion_exacta ? <Text style={st.nota}>Ubicación aproximada: el portal no publica la dirección.</Text> : null}
        </View>

        <View style={st.bloque}>
          <Selector
            valor={modo}
            onCambio={setModo}
            opciones={[
              { valor: 'vivir', texto: 'Para vivir' },
              { valor: 'invertir', texto: 'Para invertir' },
            ]}
          />
        </View>

        {modo === 'invertir' ? (
          <Inversion inv={inv} cargando={cargando} onEditar={() => setEditando(true)} />
        ) : null}

        <View style={st.bloque}>
          <Tarjeta>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[st.circulo, { backgroundColor: colorDe(p.color) }]}>
                <Icono
                  nombre={p.color === 'verde' ? 'flecha-abajo' : p.color === 'rojo' ? 'flecha-arriba' : 'igual'}
                  color="#FFFFFF"
                  grosor={2.5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.tituloTarjeta, { color: colorTextoDe(p.color) }]}>{TITULO_PRECIO[p.color]}</Text>
                <Text style={st.texto2}>{frasePrecio(p, a)}</Text>
              </View>
            </View>
            <BarraPrecio p={p} />
            <Text style={st.nota}>Sobre {p.n_comparables} avisos parecidos a 5 cuadras</Text>
          </Tarjeta>
        </View>

        {datos.comparables.length > 0 ? (
          <View style={st.bloque}>
            <Text style={st.seccion}>Comparables cerca</Text>
            <View style={{ gap: 8 }}>
              {comparables.map((c) => (
                <FilaAviso
                  key={c.id}
                  aviso={c}
                  detalle={[c.sector || c.comuna, c.uf_m2 ? `UF ${numero(c.uf_m2, 1)}/m²` : null].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/propiedad/[id]', params: { id: c.id } })}
                />
              ))}
            </View>
            {datos.comparables.length > 4 && !todosComparables ? (
              <Boton texto={`Ver los ${datos.comparables.length}`} tipo="enlace" onPress={() => setTodosComparables(true)} />
            ) : null}
          </View>
        ) : null}

        {datos.barrio ? (
          <View style={st.bloque}>
            <Tarjeta style={{ gap: 10 }}>
              <Text style={st.seccionTarjeta}>El barrio</Text>
              {datos.barrio.metro ? (
                <Dato etiqueta={`Metro ${datos.barrio.metro.nombre}`} valor={metros(datos.barrio.metro.distancia_m)} />
              ) : (
                <Dato etiqueta="Metro" valor="Lejos (más de 1 km)" />
              )}
              {datos.barrio.area_verde ? (
                <Dato etiqueta="Área verde más cercana" valor={metros(datos.barrio.area_verde.distancia_m)} />
              ) : null}
              {datos.barrio.criminalidad ? (
                <View style={st.dato}>
                  <Text style={st.texto2}>Delincuencia comunal</Text>
                  <Text
                    style={[
                      st.pastilla,
                      {
                        color: NIVEL_CRIMEN[datos.barrio.criminalidad.nivel]?.color ?? C.texto,
                        backgroundColor: NIVEL_CRIMEN[datos.barrio.criminalidad.nivel]?.fondo ?? C.grisClaro,
                      },
                    ]}>
                    {NIVEL_CRIMEN[datos.barrio.criminalidad.nivel]?.texto ?? datos.barrio.criminalidad.nivel}
                  </Text>
                </View>
              ) : null}
              {datos.barrio.banderas.map((b, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ marginTop: 5 }}>
                    <Punto color={colorDe(b.nivel)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.banderaTitulo}>{b.titulo}</Text>
                    <Text style={st.nota}>{b.detalle}</Text>
                  </View>
                </View>
              ))}
            </Tarjeta>
          </View>
        ) : null}
      </ScrollView>

      <View style={[st.pie, { paddingBottom: insets.bottom + 12 }]}>
        <Boton
          texto={`Informe completo en PDF · ${precioInforme}`}
          onPress={() => router.push({ pathname: '/informe/[id]', params: { id: a.id } })}
        />
        {a.url ? (
          <Boton texto="Ver aviso original en el portal" tipo="enlace" onPress={() => WebBrowser.openBrowserAsync(a.url!)} />
        ) : null}
      </View>

      {inv && inv.disponible && editando ? (
        <EditarCredito
          inicial={inv.credito}
          onCerrar={() => setEditando(false)}
          onGuardar={(c) => {
            setCredito(c ?? {});
            setEditando(false);
          }}
        />
      ) : null}
    </View>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={st.dato}>
      <Text style={[st.texto2, { flex: 1 }]} numberOfLines={1}>
        {etiqueta}
      </Text>
      <Text style={st.valor}>{valor}</Text>
    </View>
  );
}

function Inversion({ inv, cargando, onEditar }: { inv: api.Inversion | null; cargando: boolean; onEditar: () => void }) {
  if (!inv) {
    return cargando ? (
      <View style={st.bloque}>
        <Tarjeta>
          <Text style={st.texto2}>Calculando la rentabilidad…</Text>
        </Tarjeta>
      </View>
    ) : null;
  }
  if (!inv.disponible) {
    return (
      <View style={st.bloque}>
        <Tarjeta>
          <Text style={st.seccionTarjeta}>Rentabilidad</Text>
          <Text style={st.texto2}>{inv.motivo}</Text>
        </Tarjeta>
      </View>
    );
  }
  const veredicto = inv.veredicto.replace(' / ', ', ').replace(/\b(Opción|Riesgo|Bajo|Medio|Alto)\b/g, (m) => m.toLowerCase());
  const nivelCap = inv.nivel_cap_rate;
  const colorCap = /alta/i.test(nivelCap) ? C.verdeTexto : /baja/i.test(nivelCap) ? C.rojoTexto : C.amarilloTexto;
  return (
    <>
      <View style={st.bloque}>
        <Tarjeta style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[st.barraVeredicto, { backgroundColor: colorDe(inv.color) }]} />
          <View style={{ flex: 1 }}>
            <Text style={[st.tituloTarjeta, { color: colorTextoDe(inv.color) }]}>{veredicto}</Text>
            <Text style={st.texto2}>
              Rentabilidad {nivelCap.toLowerCase()} y flujo {inv.flujo_mensual_clp >= 0 ? 'positivo' : 'negativo'}
            </Text>
          </View>
        </Tarjeta>
      </View>
      <View style={[st.bloque, st.grilla]}>
        <Cifra etiqueta="Arriendo estimado" valor={clp(inv.arriendo_estimado_clp)} nota={`Mediana de ${inv.arriendo_fuente.n_avisos} arriendos`} />
        <Cifra etiqueta="Cap rate" valor={pct(inv.cap_rate_pct)} nota={nivelCap} colorNota={colorCap} />
        <Cifra etiqueta="Dividendo" valor={clp(inv.dividendo_clp)} nota="al mes" />
        <Cifra
          etiqueta="Flujo mensual"
          valor={clp(inv.flujo_mensual_clp)}
          nota="tras dividendo y gastos"
          colorValor={inv.flujo_mensual_clp < 0 ? C.rojoTexto : C.verdeTexto}
        />
      </View>
      <View style={st.bloque}>
        <Tarjeta>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={st.seccionTarjeta}>Tu crédito</Text>
            <Pressable onPress={onEditar} style={st.botonChico} accessibilityRole="button">
              <Text style={{ color: C.azul, fontWeight: '600', fontSize: 13 }}>Editar</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Celda etiqueta="Pie" valor={pct(inv.credito.pie_pct, inv.credito.pie_pct % 1 ? 1 : 0)} />
            <Celda etiqueta="Plazo" valor={`${inv.credito.plazo_anos} años`} />
            <Celda etiqueta="Tasa" valor={pct(inv.credito.tasa_anual_pct, inv.credito.tasa_anual_pct % 1 ? 2 : 1)} />
          </View>
        </Tarjeta>
      </View>
    </>
  );
}

function Cifra({ etiqueta, valor, nota, colorNota, colorValor }: { etiqueta: string; valor: string; nota: string; colorNota?: string; colorValor?: string }) {
  return (
    <View style={st.cifra}>
      <Text style={st.nota}>{etiqueta}</Text>
      <Text style={[st.cifraValor, colorValor ? { color: colorValor } : null]}>{valor}</Text>
      <Text style={[st.nota, colorNota ? { color: colorNota, fontWeight: '600' } : null]}>{nota}</Text>
    </View>
  );
}

function Celda({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={st.celda}>
      <Text style={st.nota}>{etiqueta}</Text>
      <Text style={{ fontWeight: '700', fontSize: 16, color: C.texto }}>{valor}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  barra: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  encabezado: { paddingHorizontal: 20, paddingTop: 4, gap: 4 },
  fotos: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  foto: { width: 260, height: 180, borderRadius: 12, backgroundColor: C.borde },
  sub: { fontSize: 13, color: C.texto3 },
  precio: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5, color: C.texto },
  lugar: { fontSize: 14, color: C.texto2 },
  bloque: { marginHorizontal: 20, marginTop: 14 },
  circulo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tituloTarjeta: { fontSize: 19, fontWeight: '700' },
  texto2: { fontSize: 13, color: C.texto2 },
  nota: { fontSize: 12, color: C.texto3 },
  seccion: { fontSize: 15, fontWeight: '700', color: C.texto, marginBottom: 8 },
  seccionTarjeta: { fontSize: 15, fontWeight: '700', color: C.texto },
  dato: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  valor: { fontSize: 14, fontWeight: '600', color: C.texto },
  pastilla: { fontSize: 12, fontWeight: '600', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, overflow: 'hidden' },
  banderaTitulo: { fontSize: 14, fontWeight: '600', color: C.texto },
  barraVeredicto: { width: 14, height: 44, borderRadius: 7 },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cifra: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 4, flexBasis: '47%', flexGrow: 1 },
  cifraValor: { fontSize: 20, fontWeight: '700', color: C.texto },
  celda: { flex: 1, backgroundColor: C.grisClaro, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  botonChico: { borderWidth: 1, borderColor: C.borde, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, minHeight: 36 },
  pie: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 14, gap: 4, borderTopWidth: 1, borderTopColor: C.linea },
});
