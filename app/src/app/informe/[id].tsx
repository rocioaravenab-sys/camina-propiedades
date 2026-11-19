import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { textoAviso } from '@/components/fila-aviso';
import { Marca } from '@/components/marca';
import { Boton, BotonRedondo, Icono, Tarjeta } from '@/components/ui';
import * as api from '@/lib/api';
import { useCompras } from '@/lib/compras';
import { useEstado } from '@/lib/estado';
import { compartirPdf } from '@/lib/pdf';
import { tipoCorto, tipologia } from '@/lib/formato';
import { C } from '@/lib/tema';

const INCLUYE = [
  'Informe formal para el banco o la familia',
  'Sensibilidad si la tasa sube o baja',
  'Sobreoferta del sector en detalle',
  'Historial de precios del aviso',
  'Renta corta (Airbnb), si hay datos',
];

export default function Informe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { modo, informes } = useEstado();
  const { disponible, precio, estado, comprar, limpiar } = useCompras();
  const [aviso, setAviso] = useState<api.Aviso | null>(null);

  useEffect(() => {
    limpiar();
    if (id) api.comparar(id, 'vivir').then((r) => setAviso(r.aviso)).catch(() => {});
  }, [id, limpiar]);

  const yaComprado = informes.find((i) => i.id_aviso === id);
  const titulo = aviso
    ? `${tipoCorto(aviso.tipo)} ${tipologia(aviso.dormitorios, aviso.banos)} · ${aviso.sector || aviso.comuna}`
    : 'Esta propiedad';
  const ocupado = (estado.fase === 'pagando' || estado.fase === 'descargando') && estado.id_aviso === id;
  const listo = estado.fase === 'listo' && estado.informe.id_aviso === id ? estado.informe : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.fondo }}>
      <View style={[st.barra, { paddingTop: insets.top + 8 }]}>
        <BotonRedondo onPress={() => router.back()} etiqueta="Volver a la ficha">
          <Icono nombre="atras" />
        </BotonRedondo>
        <Text style={st.titulo}>Informe completo</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={st.hojaPdf} accessible accessibilityLabel={`Vista del informe de ${titulo}`}>
          <Marca size={11} />
          <Text style={st.hojaTitulo}>{titulo}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={[st.linea, { width: 36, height: 8, backgroundColor: C.verde }]} />
            <View style={[st.linea, { width: 36, height: 8 }]} />
            <View style={[st.linea, { width: 36, height: 8 }]} />
          </View>
          <View style={[st.linea, { width: '100%' }]} />
          <View style={[st.linea, { width: '85%' }]} />
          <View style={[st.linea, { width: '92%' }]} />
          <View style={{ height: 54, borderRadius: 6, backgroundColor: C.azulClaro }} />
          <View style={[st.linea, { width: '70%' }]} />
        </View>

        <Tarjeta style={{ marginHorizontal: 20, marginTop: 20, gap: 10 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, color: C.texto }}>Además de lo que ves en la app</Text>
          {INCLUYE.map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ color: C.verde, fontWeight: '700' }}>✓</Text>
              <Text style={{ fontSize: 14, color: C.texto2, flex: 1 }}>{t}</Text>
            </View>
          ))}
        </Tarjeta>

        {estado.fase === 'error' && (!estado.id_aviso || estado.id_aviso === id) ? (
          <Text style={st.error}>{estado.mensaje}</Text>
        ) : null}
      </ScrollView>

      <View style={[st.pie, { paddingBottom: insets.bottom + 12 }]}>
        {listo || yaComprado ? (
          <>
            <Boton texto="Abrir el informe" tipo="oscuro" onPress={() => compartirPdf((listo ?? yaComprado)!.archivo)} />
            <Text style={st.nota}>Quedó guardado en Guardadas, en tu teléfono.</Text>
          </>
        ) : (
          <>
            <Boton
              texto={
                estado.fase === 'descargando' && ocupado
                  ? 'Preparando tu informe…'
                  : `Comprar por ${precio}`
              }
              tipo="oscuro"
              cargando={ocupado}
              deshabilitado={!disponible}
              onPress={() =>
                id &&
                comprar({ id_aviso: id, modo, titulo: aviso ? textoAviso(aviso) : titulo })
              }
            />
            <Text style={st.nota}>
              {disponible
                ? 'Pago con tu cuenta de Apple o Google. El PDF queda guardado en tu teléfono.'
                : 'Las compras no están disponibles en esta versión de la app.'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  titulo: { fontSize: 20, fontWeight: '700', color: C.texto },
  hojaPdf: {
    alignSelf: 'center',
    marginTop: 16,
    width: 190,
    height: 250,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 18,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  hojaTitulo: { fontSize: 13, fontWeight: '700', lineHeight: 16, color: C.texto },
  linea: { height: 6, borderRadius: 3, backgroundColor: C.gris },
  error: { marginHorizontal: 20, marginTop: 14, color: C.rojoTexto, fontSize: 14, lineHeight: 20 },
  pie: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 16, gap: 10, borderTopWidth: 1, borderTopColor: C.linea },
  nota: { textAlign: 'center', fontSize: 12, color: C.texto3 },
});
