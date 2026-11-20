import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Aviso, Filtros, Modo } from './api';

// Todo vive en el teléfono: no hay cuenta en la v1.
const CLAVE = 'camina:estado:v1';

export interface Favorito {
  aviso: Aviso;
  guardado_el: number;
  ya_no_esta?: boolean;
}

export interface InformeGuardado {
  id_aviso: string;
  modo: Modo;
  titulo: string;
  archivo: string; // uri file:// dentro de la carpeta de documentos
  comprado_el: number;
  id_transaccion: string;
  // Para volver a bajar el PDF si se borra del teléfono (la API revalida el recibo).
  token_compra?: string;
  producto?: string;
}

export interface CreditoUsuario {
  pie?: number;
  tasa?: number;
  plazo?: number;
}

interface Datos {
  filtros: Filtros;
  credito: CreditoUsuario;
  favoritos: Record<string, Favorito>;
  informes: InformeGuardado[];
}

const INICIAL: Datos = { filtros: {}, credito: {}, favoritos: {}, informes: [] };

interface Estado extends Datos {
  listo: boolean;
  setFiltros: (f: Filtros) => void;
  setCredito: (c: CreditoUsuario) => void;
  alternarFavorito: (a: Aviso) => void;
  marcarNoEsta: (id: string) => void;
  agregarInforme: (i: InformeGuardado) => void;
}

const Ctx = createContext<Estado | null>(null);

export function EstadoProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(INICIAL);
  const [listo, setListo] = useState(false);
  const cargado = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((txt) => {
        if (txt) {
          // La v1 guardaba el modo Vivir/Invertir; ya no se usa.
          const { modo: _modo, ...guardado } = JSON.parse(txt);
          setDatos({ ...INICIAL, ...guardado });
        }
      })
      .catch(() => {})
      .finally(() => {
        cargado.current = true;
        setListo(true);
      });
  }, []);

  useEffect(() => {
    if (!cargado.current) return;
    AsyncStorage.setItem(CLAVE, JSON.stringify(datos)).catch(() => {});
  }, [datos]);

  const setFiltros = useCallback((filtros: Filtros) => setDatos((d) => ({ ...d, filtros })), []);
  const setCredito = useCallback((credito: CreditoUsuario) => setDatos((d) => ({ ...d, credito })), []);
  const alternarFavorito = useCallback(
    (aviso: Aviso) =>
      setDatos((d) => {
        const favoritos = { ...d.favoritos };
        if (favoritos[aviso.id]) delete favoritos[aviso.id];
        else favoritos[aviso.id] = { aviso, guardado_el: Date.now() };
        return { ...d, favoritos };
      }),
    [],
  );
  const marcarNoEsta = useCallback(
    (id: string) =>
      setDatos((d) =>
        d.favoritos[id] ? { ...d, favoritos: { ...d.favoritos, [id]: { ...d.favoritos[id], ya_no_esta: true } } } : d,
      ),
    [],
  );
  const agregarInforme = useCallback(
    (i: InformeGuardado) =>
      setDatos((d) => ({
        ...d,
        informes: [i, ...d.informes.filter((x) => x.id_transaccion !== i.id_transaccion)],
      })),
    [],
  );

  const valor = useMemo(
    () => ({ ...datos, listo, setFiltros, setCredito, alternarFavorito, marcarNoEsta, agregarInforme }),
    [datos, listo, setFiltros, setCredito, alternarFavorito, marcarNoEsta, agregarInforme],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useEstado(): Estado {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEstado fuera de EstadoProvider');
  return v;
}
