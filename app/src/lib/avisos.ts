// Funciones puras sobre los avisos: juntar los del mismo edificio, sumar lo
// que llega al alejar el mapa y armar el texto de los avisos del modo caminata.
import type { Aviso, Color, RespuestaCerca, Zona } from './api';
import { numero } from './formato';
import { distanciaM, type Coordenada } from './geo';

export interface Edificio {
  clave: string;
  lat: number;
  lon: number;
  avisos: Aviso[];
}

// ~11 m: avisos exactos a esa distancia son el mismo edificio.
export function claveEdificio(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function claveZona(z: Zona): string {
  return `${z.comuna}|${z.sector ?? ''}|${z.lat}|${z.lon}`;
}

export function agruparEdificios(avisos: Aviso[]): Edificio[] {
  const grupos = new Map<string, Edificio>();
  for (const a of avisos) {
    if (a.lat == null || a.lon == null) continue;
    const clave = claveEdificio(a.lat, a.lon);
    const g = grupos.get(clave);
    if (g) g.avisos.push(a);
    else grupos.set(clave, { clave, lat: a.lat, lon: a.lon, avisos: [a] });
  }
  for (const g of grupos.values()) g.avisos.sort((x, y) => (x.precio_uf ?? Infinity) - (y.precio_uf ?? Infinity));
  return [...grupos.values()];
}

// ---- Lo cargado en el mapa ----

export interface Circulo extends Coordenada {
  radio: number;
}

export interface Cargado {
  filtros: string; // los filtros con que se pidió: si cambian se parte de cero
  circulos: Circulo[]; // zonas ya pedidas a la API
  avisos: Record<string, Aviso>;
  zonas: Record<string, Zona>;
}

export function vacio(filtros: string): Cargado {
  return { filtros, circulos: [], avisos: {}, zonas: {} };
}

/** ¿La vista (centro + radio) ya está dentro de algo que se pidió? */
export function cubierta(c: Cargado, vista: Circulo): boolean {
  return c.circulos.some((k) => distanciaM(k, vista) + vista.radio <= k.radio * 1.02);
}

/** Suma una respuesta de /cerca a lo ya cargado. */
export function sumar(c: Cargado, pedido: Circulo, r: RespuestaCerca): Cargado {
  if (r.fuera_de_zona) return { ...c, circulos: [...c.circulos, pedido] };
  const avisos = { ...c.avisos };
  for (const a of r.avisos) avisos[a.id] = a;
  const zonas = { ...c.zonas };
  for (const z of r.zonas) zonas[claveZona(z)] = z;
  // Si la API recortó a los más cercanos, solo se da por cubierto hasta el más lejano que llegó.
  let radio = pedido.radio;
  if (r.recortado) {
    radio = 0;
    for (const p of [...r.avisos, ...r.zonas]) {
      if (p.lat != null && p.lon != null) radio = Math.max(radio, distanciaM(pedido, { lat: p.lat, lon: p.lon }));
    }
  }
  return { ...c, circulos: [...c.circulos, { ...pedido, radio }], avisos, zonas };
}

// ---- Modo caminata ----

const UNIDADES = ['', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve'];

function plural(tipo: string, n: number): string {
  const t = tipo.toLowerCase();
  if (n === 1) return t;
  return t.endsWith('a') || t.endsWith('o') ? t + 's' : t + 'es';
}

function desde(avisos: Aviso[]): string | null {
  const precios = avisos.map((a) => a.precio_uf).filter((p): p is number => !!p);
  return precios.length ? 'UF ' + numero(Math.min(...precios)) : null;
}

const LEYENDA: Record<Color, string> = {
  verde: 'bajo el precio del sector',
  amarillo: 'en línea con el sector',
  rojo: 'sobre el precio del sector',
  gris: 'con pocos datos para comparar',
};

export interface TextoAviso {
  titulo: string;
  cuerpo: string;
}

/** "En esta cuadra: hay un edificio con 2 departamentos en venta, desde UF 4.850…" */
export function textoAviso(e: Edificio, distancia: number): TextoAviso {
  const n = e.avisos.length;
  if (n === 1) {
    const a = e.avisos[0];
    const precio = a.precio_uf ? 'UF ' + numero(a.precio_uf) : 'precio no publicado';
    const lejos = distancia < 25 ? 'aquí' : `a ${Math.round(distancia / 10) * 10} m`;
    return {
      titulo: 'En esta cuadra',
      cuerpo: `${a.tipo} en venta ${lejos}: ${precio}, ${LEYENDA[a.color ?? 'gris']}.`,
    };
  }
  const tipos = new Set(e.avisos.map((a) => a.tipo));
  const tipo = tipos.size === 1 ? plural(e.avisos[0].tipo, n) : 'propiedades';
  const verdes = e.avisos.filter((a) => a.color === 'verde').length;
  const precio = desde(e.avisos);
  let cuerpo = `Hay un edificio con ${n} ${tipo} en venta${precio ? `, desde ${precio}` : ''}.`;
  if (verdes === 1) cuerpo += ' Uno está bajo el precio del sector.';
  else if (verdes > 1) cuerpo += ` ${verdes < UNIDADES.length ? UNIDADES[verdes] : verdes} están bajo el precio del sector.`;
  return { titulo: 'En esta cuadra', cuerpo };
}

/** Lo que hay "en esta cuadra": edificios con avisos exactos cerca, del más cercano al más lejano. */
export function enLaCuadra(avisos: Aviso[], aqui: Coordenada, radio: number): (Edificio & { distancia: number })[] {
  return agruparEdificios(avisos)
    .map((e) => ({ ...e, distancia: distanciaM(aqui, e) }))
    .filter((e) => e.distancia <= radio)
    .sort((x, y) => x.distancia - y.distancia);
}
