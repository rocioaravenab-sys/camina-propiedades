import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { distanciaM, type Coordenada } from './geo';

export { distanciaM, type Coordenada };

export type Permiso = 'pendiente' | 'concedido' | 'denegado';

async function revisarPermiso(): Promise<Permiso> {
  try {
    const actual = await Location.getForegroundPermissionsAsync();
    const r = actual.granted ? actual : await Location.requestForegroundPermissionsAsync();
    return r.granted ? 'concedido' : 'denegado';
  } catch {
    return 'denegado';
  }
}

/**
 * Ubicación en vivo SOLO mientras la pantalla del mapa está a la vista y la
 * app está abierta. Al salir de la pantalla o pasar a segundo plano se corta.
 */
export function useUbicacionEnVivo(pasoM = 80) {
  const [permiso, setPermiso] = useState<Permiso>('pendiente');
  const [posicion, setPosicion] = useState<Coordenada | null>(null);
  // "paso" solo cambia cuando la persona se movió más de pasoM: es lo que
  // dispara una nueva búsqueda, para no pedir a la API a cada metro.
  const [paso, setPaso] = useState<Coordenada | null>(null);
  const [activa, setActiva] = useState(AppState.currentState === 'active');
  const [enfocada, setEnfocada] = useState(true);
  const sub = useRef<Location.LocationSubscription | null>(null);

  const pedirPermiso = useCallback(() => {
    revisarPermiso().then(setPermiso);
  }, []);

  useEffect(() => {
    revisarPermiso().then(setPermiso);
    const s = AppState.addEventListener('change', (st) => {
      setActiva(st === 'active');
      // Si la persona volvió desde Ajustes, revisar el permiso otra vez.
      if (st === 'active') revisarPermiso().then(setPermiso);
    });
    return () => s.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setEnfocada(true);
      return () => setEnfocada(false);
    }, []),
  );

  useEffect(() => {
    if (permiso !== 'concedido' || !activa || !enfocada) return;
    let vivo = true;
    Location.getLastKnownPositionAsync()
      .then((p) => {
        if (!vivo || !p) return;
        const c = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPosicion((prev) => prev ?? c);
        setPaso((prev) => prev ?? c);
      })
      .catch(() => {});
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 4000 },
      (p) => {
        const c = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPosicion(c);
        setPaso((prev) => (prev && distanciaM(prev, c) < pasoM ? prev : c));
      },
    )
      .then((s) => {
        if (vivo) sub.current = s;
        else s.remove();
      })
      .catch(() => {});
    return () => {
      vivo = false;
      sub.current?.remove();
      sub.current = null;
    };
  }, [permiso, activa, enfocada, pasoM]);

  return { permiso, posicion, paso, pedirPermiso };
}
