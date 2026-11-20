// Modo caminata: ubicación en segundo plano y avisos locales "en esta cuadra".
// No hay servidor de notificaciones: el teléfono consulta /cerca al caminar y
// arma el aviso él mismo. Se apaga sola a las 2 horas.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import * as api from './api';
import { enLaCuadra, textoAviso } from './avisos';
import { distanciaM, type Coordenada } from './geo';

export const TAREA = 'camina-modo-caminata';
const CLAVE = 'camina:caminata:v1';
const CANAL = 'cuadra';

export const DURACION_MS = 2 * 60 * 60 * 1000;
const PASO_M = 40; // se consulta la API cada ~40 m caminados
const RADIO_CONSULTA_M = 150;
export const RADIO_CUADRA_M = 70; // lo que cuenta como "esta cuadra"
const ENTRE_AVISOS_MS = 2 * 60 * 1000;

export interface EstadoCaminata {
  activo: boolean;
  inicio: number;
  distancia_m: number;
  filtros: api.Filtros;
  ultimo?: Coordenada; // última posición recibida (para el recorrido)
  consultado?: Coordenada; // dónde se consultó la API por última vez
  ultimo_aviso_ms?: number;
  avisados: { dia: string; claves: string[] }; // edificios ya avisados hoy
}

const APAGADO: EstadoCaminata = { activo: false, inicio: 0, distancia_m: 0, filtros: {}, avisados: { dia: '', claves: [] } };

async function leer(): Promise<EstadoCaminata> {
  try {
    const txt = await AsyncStorage.getItem(CLAVE);
    return txt ? { ...APAGADO, ...JSON.parse(txt) } : APAGADO;
  } catch {
    return APAGADO;
  }
}

async function guardar(e: EstadoCaminata) {
  await AsyncStorage.setItem(CLAVE, JSON.stringify(e)).catch(() => {});
}

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Mientras la app está abierta los avisos también se muestran arriba.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Procesa una nueva posición: suma recorrido y, cada ~40 m, busca qué hay en la cuadra. */
export async function procesarPosicion(c: Coordenada, ahora = Date.now()) {
  let e = await leer();
  if (!e.activo) {
    await detener();
    return;
  }
  if (ahora - e.inicio > DURACION_MS) {
    await detener();
    return;
  }
  if (e.ultimo) {
    const d = distanciaM(e.ultimo, c);
    // Saltos grandes son errores del GPS, no pasos.
    if (d < 500) e = { ...e, distancia_m: e.distancia_m + d };
  }
  e = { ...e, ultimo: c };
  if (e.consultado && distanciaM(e.consultado, c) < PASO_M) {
    await guardar(e);
    return;
  }
  e = { ...e, consultado: c };
  await guardar(e);

  if (e.ultimo_aviso_ms && ahora - e.ultimo_aviso_ms < ENTRE_AVISOS_MS) return;
  let respuesta: api.RespuestaCerca;
  try {
    respuesta = await api.cerca(c.lat, c.lon, RADIO_CONSULTA_M, e.filtros);
  } catch {
    return;
  }
  if (respuesta.fuera_de_zona) return;

  const dia = hoy();
  const yaAvisados = e.avisados.dia === dia ? e.avisados.claves : [];
  const nuevo = enLaCuadra(respuesta.avisos, c, RADIO_CUADRA_M).find((ed) => !yaAvisados.includes(ed.clave));
  if (!nuevo) return;

  const texto = textoAviso(nuevo, nuevo.distancia);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: texto.titulo,
      body: texto.cuerpo,
      data: { ids: nuevo.avisos.map((a) => a.id) },
      ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
    },
    trigger: null,
  }).catch(() => {});

  // Se vuelve a leer por si se detuvo mientras se consultaba la API.
  const actual = await leer();
  if (!actual.activo) return;
  await guardar({ ...actual, ultimo_aviso_ms: ahora, avisados: { dia, claves: [...yaAvisados, nuevo.clave] } });
}

// La tarea se define al cargar el módulo (lo importa el _layout), para que
// exista cuando el sistema despierta la app en segundo plano.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TAREA, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const ultima = data.locations[data.locations.length - 1];
  await procesarPosicion({ lat: ultima.coords.latitude, lon: ultima.coords.longitude });
});

export type ResultadoActivar = 'activo' | 'sin-ubicacion' | 'error';

export async function activar(filtros: api.Filtros): Promise<ResultadoActivar> {
  const primero = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!primero?.granted) return 'sin-ubicacion';
  // "Siempre": si la persona no lo da, en iPhone igual funciona mientras se
  // vea el indicador azul; en Android sin él se corta al bloquear la pantalla.
  await Location.requestBackgroundPermissionsAsync().catch(() => null);
  await Notifications.requestPermissionsAsync().catch(() => null);
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Propiedades en tu cuadra',
      importance: AndroidImportance.HIGH,
    }).catch(() => {});
  }

  await guardar({ ...APAGADO, activo: true, inicio: Date.now(), filtros });
  try {
    await Location.startLocationUpdatesAsync(TAREA, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 20,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Modo caminata activo',
        notificationBody: 'Te avisamos al pasar por propiedades en venta. Se apaga sola a las 2 horas.',
        notificationColor: '#1747C9',
      },
    });
    return 'activo';
  } catch {
    await guardar(APAGADO);
    return 'error';
  }
}

export async function detener() {
  await guardar({ ...(await leer()), activo: false });
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TAREA)) await Location.stopLocationUpdatesAsync(TAREA);
  } catch {}
}

interface ValorCaminata extends EstadoCaminata {
  activar: (filtros: api.Filtros) => Promise<ResultadoActivar>;
  detener: () => Promise<void>;
}

const Ctx = createContext<ValorCaminata | null>(null);

/** Estado del modo caminata para las pantallas (se relee cada 10 s y al volver a la app). */
export function CaminataProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoCaminata>(APAGADO);

  const refrescar = useCallback(() => {
    leer().then((e) => {
      if (e.activo && Date.now() - e.inicio > DURACION_MS) {
        detener().then(() => setEstado({ ...e, activo: false }));
      } else {
        setEstado(e);
      }
    });
  }, []);

  useEffect(() => {
    refrescar();
    const intervalo = setInterval(refrescar, 10000);
    const s = AppState.addEventListener('change', (st) => st === 'active' && refrescar());
    return () => {
      clearInterval(intervalo);
      s.remove();
    };
  }, [refrescar]);

  const activarYa = useCallback(
    async (filtros: api.Filtros) => {
      const r = await activar(filtros);
      refrescar();
      return r;
    },
    [refrescar],
  );
  const detenerYa = useCallback(async () => {
    await detener();
    refrescar();
  }, [refrescar]);

  const valor = useMemo(() => ({ ...estado, activar: activarYa, detener: detenerYa }), [estado, activarYa, detenerYa]);
  return createElement(Ctx.Provider, { value: valor }, children);
}

export function useCaminata(): ValorCaminata {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCaminata fuera de CaminataProvider');
  return v;
}
