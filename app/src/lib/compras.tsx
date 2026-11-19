import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IAP from 'expo-iap';
import type { Purchase } from 'expo-iap';
import { Directory, File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import * as api from './api';
import { useEstado, type InformeGuardado } from './estado';

/**
 * Compra del informe PDF con la compra dentro de la app de Apple y Google.
 *
 * Es un producto consumible ("informe_pdf", $14.990): se compra una vez por
 * propiedad. El flujo:
 *   1. Se guarda en el teléfono qué propiedad se está pagando.
 *   2. La tienda cobra y avisa por purchaseUpdatedListener.
 *   3. La API (POST /informe) valida el recibo con la tienda y entrega el PDF.
 *   4. Recién con el PDF guardado se cierra la transacción (finishTransaction).
 * Si el paso 3 falla, la transacción queda abierta y "Restaurar compras" (o el
 * próximo arranque) la vuelve a intentar; Google reembolsa sola una compra que
 * no se cierra en 3 días.
 */
export const PRODUCTO_INFORME = 'informe_pdf';
export const PRECIO_REFERENCIA = '$14.990';

const CLAVE_PENDIENTE = 'camina:compra-pendiente:v1';

interface Pendiente {
  id_aviso: string;
  modo: api.Modo;
  titulo: string;
}

type EstadoCompra =
  | { fase: 'libre' }
  | { fase: 'pagando'; id_aviso: string }
  | { fase: 'descargando'; id_aviso: string }
  | { fase: 'listo'; informe: InformeGuardado }
  | { fase: 'error'; mensaje: string; id_aviso?: string };

interface Compras {
  disponible: boolean; // false en Expo Go o si la tienda no responde
  precio: string;
  estado: EstadoCompra;
  comprar: (p: Pendiente) => Promise<void>;
  restaurar: () => Promise<number>;
  limpiar: () => void;
}

const Ctx = createContext<Compras | null>(null);

function carpetaInformes(): Directory {
  const dir = new Directory(Paths.document, 'informes');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function nombreArchivo(idAviso: string, idTransaccion: string) {
  return `${idAviso}-${idTransaccion}`.replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf';
}

async function leerPendiente(): Promise<Pendiente | null> {
  try {
    const t = await AsyncStorage.getItem(CLAVE_PENDIENTE);
    return t ? (JSON.parse(t) as Pendiente) : null;
  } catch {
    return null;
  }
}

export function ComprasProvider({ children }: { children: ReactNode }) {
  const { agregarInforme, informes } = useEstado();
  const [disponible, setDisponible] = useState(false);
  const [precio, setPrecio] = useState(PRECIO_REFERENCIA);
  const [estado, setEstado] = useState<EstadoCompra>({ fase: 'libre' });
  const enCurso = useRef(new Set<string>());
  const informesRef = useRef(informes);
  useEffect(() => {
    informesRef.current = informes;
  }, [informes]);

  const entregar = useCallback(
    async (compra: Purchase, pendiente: Pendiente | null, reintento?: InformeGuardado): Promise<boolean> => {
      const idTransaccion = compra.transactionId ?? compra.id;
      const idAviso = reintento?.id_aviso ?? pendiente?.id_aviso;
      if (!idAviso || !compra.purchaseToken) return false;
      if (enCurso.current.has(idTransaccion)) return false;
      enCurso.current.add(idTransaccion);
      setEstado({ fase: 'descargando', id_aviso: idAviso });
      try {
        const modo = reintento?.modo ?? pendiente?.modo ?? 'vivir';
        const pdf = await api.informe({
          id_aviso: idAviso,
          modo,
          plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
          producto: compra.productId,
          token_compra: compra.purchaseToken,
          id_transaccion: idTransaccion,
        });
        const archivo = new File(carpetaInformes(), nombreArchivo(idAviso, idTransaccion));
        if (!archivo.exists) archivo.create({ overwrite: true });
        await archivo.write(new Uint8Array(pdf));
        const informe: InformeGuardado = {
          id_aviso: idAviso,
          modo,
          titulo: reintento?.titulo ?? pendiente?.titulo ?? 'Informe',
          archivo: archivo.uri,
          comprado_el: reintento?.comprado_el ?? compra.transactionDate ?? Date.now(),
          id_transaccion: idTransaccion,
          token_compra: compra.purchaseToken,
          producto: compra.productId,
        };
        agregarInforme(informe);
        if (!reintento) {
          await IAP.finishTransaction({ purchase: compra, isConsumable: true });
          await AsyncStorage.removeItem(CLAVE_PENDIENTE);
        }
        setEstado({ fase: 'listo', informe });
        return true;
      } catch {
        setEstado({
          fase: 'error',
          id_aviso: idAviso,
          mensaje:
            'Tu pago quedó registrado, pero no pudimos descargar el informe. Toca "Restaurar compras" en Guardadas para intentarlo de nuevo.',
        });
        return false;
      } finally {
        enCurso.current.delete(idTransaccion);
      }
    },
    [agregarInforme],
  );

  // Conexión con la tienda mientras la app está abierta.
  useEffect(() => {
    let vivo = true;
    let subs: { remove: () => void }[] = [];
    (async () => {
      try {
        await IAP.initConnection();
        if (!vivo) return;
        subs.push(
          IAP.purchaseUpdatedListener(async (compra) => {
            if (compra.productId !== PRODUCTO_INFORME || compra.purchaseState === 'pending') return;
            await entregar(compra, await leerPendiente());
          }),
          IAP.purchaseErrorListener((e) => {
            if (e.code === IAP.ErrorCode.UserCancelled) setEstado({ fase: 'libre' });
            else setEstado({ fase: 'error', mensaje: 'No se pudo completar el pago. No se hizo ningún cargo.' });
          }),
        );
        setDisponible(true);
        const productos = await IAP.fetchProducts({ skus: [PRODUCTO_INFORME], type: 'in-app' });
        const p = Array.isArray(productos) ? productos.find((x) => x.id === PRODUCTO_INFORME) : undefined;
        if (vivo && p?.displayPrice) setPrecio(p.displayPrice);
      } catch {
        // Expo Go o tienda no disponible: la app sigue funcionando sin compras.
        if (vivo) setDisponible(false);
      }
    })();
    return () => {
      vivo = false;
      subs.forEach((s) => s.remove());
      subs = [];
      IAP.endConnection().catch(() => {});
    };
  }, [entregar]);

  const comprar = useCallback(
    async (p: Pendiente) => {
      if (!disponible) {
        setEstado({ fase: 'error', mensaje: 'Las compras no están disponibles en este teléfono.' });
        return;
      }
      await AsyncStorage.setItem(CLAVE_PENDIENTE, JSON.stringify(p));
      setEstado({ fase: 'pagando', id_aviso: p.id_aviso });
      try {
        await IAP.requestPurchase({
          type: 'in-app',
          request: {
            apple: { sku: PRODUCTO_INFORME },
            google: { skus: [PRODUCTO_INFORME] },
          },
        });
      } catch {
        setEstado({ fase: 'error', mensaje: 'No se pudo abrir el pago. Inténtalo de nuevo.' });
      }
    },
    [disponible],
  );

  /** Completa pagos sin informe y vuelve a bajar PDFs que ya no están en el teléfono. */
  const restaurar = useCallback(async () => {
    let recuperados = 0;
    if (disponible) {
      try {
        await IAP.restorePurchases();
      } catch {}
      try {
        const abiertas = await IAP.getAvailablePurchases();
        const pendiente = await leerPendiente();
        for (const compra of abiertas) {
          if (compra.productId === PRODUCTO_INFORME && compra.purchaseState === 'purchased') {
            if (await entregar(compra, pendiente)) recuperados++;
          }
        }
      } catch {}
    }
    for (const inf of informesRef.current) {
      let existe = false;
      try {
        existe = new File(inf.archivo).exists;
      } catch {}
      if (!existe && inf.token_compra) {
        const compra = {
          id: inf.id_transaccion,
          transactionId: inf.id_transaccion,
          productId: inf.producto ?? PRODUCTO_INFORME,
          purchaseToken: inf.token_compra,
          transactionDate: inf.comprado_el,
        } as unknown as Purchase;
        if (await entregar(compra, null, inf)) recuperados++;
      }
    }
    setEstado((e) => (e.fase === 'listo' || e.fase === 'error' ? e : { fase: 'libre' }));
    return recuperados;
  }, [disponible, entregar]);

  const limpiar = useCallback(() => setEstado({ fase: 'libre' }), []);

  const valor = useMemo(
    () => ({ disponible, precio, estado, comprar, restaurar, limpiar }),
    [disponible, precio, estado, comprar, restaurar, limpiar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCompras(): Compras {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCompras fuera de ComprasProvider');
  return v;
}
