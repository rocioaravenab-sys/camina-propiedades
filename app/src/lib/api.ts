import Constants from 'expo-constants';

// URL de la API: EXPO_PUBLIC_API_URL al construir (ver app.config.ts).
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:8000'
).replace(/\/$/, '');

export type Color = 'verde' | 'amarillo' | 'rojo' | 'gris';
export type Modo = 'vivir' | 'invertir';

export interface Aviso {
  id: string;
  portal: string;
  url: string | null;
  comuna: string;
  sector: string | null;
  tipo: string;
  dormitorios: number | null;
  banos: number | null;
  estacionamientos: number | null;
  precio: number;
  moneda: string;
  precio_uf: number | null;
  m2: number | null;
  uf_m2: number | null;
  lat: number | null;
  lon: number | null;
  ubicacion_exacta: boolean;
  visto_el: string | null;
  gasto_comun?: number | null;
  fotos?: string[];
  color?: Color;
  desvio_pct?: number | null;
}

export interface Zona {
  comuna: string;
  sector: string | null;
  lat: number;
  lon: number;
  cantidad: number;
  avisos: Aviso[];
}

export interface RespuestaCerca {
  fuera_de_zona: boolean;
  radio_m?: number;
  valor_uf?: number | null;
  avisos: Aviso[];
  zonas: Zona[];
}

export interface PosicionPrecio {
  color: Color;
  etiqueta: string;
  base: 'uf_m2' | 'precio' | null;
  valor: number | null;
  mediana: number | null;
  p25: number | null;
  p75: number | null;
  desvio_pct: number | null;
  n_comparables: number;
}

export interface Lugar {
  nombre: string;
  distancia_m: number;
}

export interface Bandera {
  nivel: 'rojo' | 'amarillo' | 'verde';
  titulo: string;
  detalle: string;
}

export interface Barrio {
  metro: Lugar | null;
  area_verde: Lugar | null;
  criminalidad: { comuna: string; tasa_100k: number; nivel: 'bajo' | 'medio' | 'alto'; periodo: string } | null;
  banderas: Bandera[];
}

export interface Credito {
  pie_pct: number;
  tasa_anual_pct: number;
  plazo_anos: number;
}

export type Inversion =
  | { disponible: false; motivo: string }
  | {
      disponible: true;
      arriendo_estimado_clp: number;
      cap_rate_pct: number;
      nivel_cap_rate: string;
      dividendo_clp: number;
      dividendo_uf: number;
      flujo_mensual_clp: number;
      veredicto: string;
      color: string;
      credito: Credito;
      arriendo_fuente: { n_avisos: number; semana: string; dormitorios: number; banos: number };
    };

export interface RespuestaComparar {
  aviso: Aviso;
  precio: PosicionPrecio;
  comparables: Aviso[];
  barrio: Barrio | null;
  inversion: Inversion | null;
}

export interface RespuestaSalud {
  ok: boolean;
  datos_al: string | null;
  alerta: string | null;
}

export class ErrorApi extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function pedir<T>(ruta: string, params?: Record<string, string | number | undefined | null>, init?: RequestInit): Promise<T> {
  const qs = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `${API_URL}${ruta}${qs ? '?' + qs : ''}`;
  const control = new AbortController();
  const plazo = setTimeout(() => control.abort(), 20000);
  try {
    const r = await fetch(url, { ...init, signal: control.signal });
    if (!r.ok) {
      let detalle = `Error ${r.status}`;
      try {
        const cuerpo = await r.json();
        if (cuerpo?.detail) detalle = String(cuerpo.detail);
      } catch {}
      throw new ErrorApi(detalle, r.status);
    }
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi('No pudimos conectarnos. Revisa tu conexión.', 0);
  } finally {
    clearTimeout(plazo);
  }
}

export interface Filtros {
  tipo?: 'Departamento' | 'Casa';
  dormitorios_min?: number;
  precio_max_uf?: number;
}

export function cerca(lat: number, lon: number, radio: number, filtros: Filtros) {
  return pedir<RespuestaCerca>('/cerca', { lat, lon, radio, ...filtros });
}

export function comparar(id: string, modo: Modo, credito?: Partial<{ pie: number; tasa: number; plazo: number }>) {
  return pedir<RespuestaComparar>(`/propiedad/${encodeURIComponent(id)}/comparar`, { modo, ...credito });
}

export function salud() {
  return pedir<RespuestaSalud>('/salud');
}

export interface PedidoInforme {
  id_aviso: string;
  modo: Modo;
  plataforma: 'ios' | 'android';
  producto: string;
  token_compra: string;
  id_transaccion: string;
}

/**
 * Pide el PDF ya pagado. La API valida el recibo con Apple o Google y responde
 * application/pdf. (POST /informe es la fase 4 de la API.)
 */
export async function informe(pedido: PedidoInforme): Promise<ArrayBuffer> {
  const control = new AbortController();
  const plazo = setTimeout(() => control.abort(), 60000);
  try {
    const r = await fetch(`${API_URL}/informe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
      body: JSON.stringify(pedido),
      signal: control.signal,
    });
    if (!r.ok) throw new ErrorApi(`Error ${r.status}`, r.status);
    return await r.arrayBuffer();
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi('No pudimos conectarnos. Revisa tu conexión.', 0);
  } finally {
    clearTimeout(plazo);
  }
}
