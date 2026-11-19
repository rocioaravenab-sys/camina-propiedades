// Números a la chilena: punto de miles, coma decimal.
function miles(n: number, decimales = 0): string {
  const fijo = Math.abs(n).toFixed(decimales);
  const [entero, dec] = fijo.split('.');
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + conPuntos + (dec ? ',' + dec : '');
}

export function uf(n?: number | null, decimales = 0): string {
  if (n == null) return '—';
  return 'UF ' + miles(n, decimales);
}

export function clp(n?: number | null): string {
  if (n == null) return '—';
  return (n < 0 ? '−$' : '$') + miles(Math.abs(n));
}

export function pct(n?: number | null, decimales = 1): string {
  if (n == null) return '—';
  return miles(n, decimales) + '%';
}

export function numero(n?: number | null, decimales = 0): string {
  if (n == null) return '—';
  return miles(n, decimales);
}

export function metros(m?: number | null): string {
  if (m == null) return '—';
  if (m >= 1000) return miles(m / 1000, 1) + ' km';
  return miles(Math.round(m / 10) * 10) + ' m';
}

// Una cuadra de Santiago ~ 120 m.
export function cuadras(m: number): string {
  const n = Math.max(1, Math.round(m / 120));
  return n === 1 ? '1 cuadra' : `${n} cuadras`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaCorta(iso?: string | number | null): string {
  if (iso == null) return '';
  const d = typeof iso === 'number' ? new Date(iso) : new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function tipologia(dormitorios?: number | null, banos?: number | null): string {
  if (dormitorios == null && banos == null) return '';
  return `${dormitorios ?? '?'}D${banos ?? '?'}B`;
}

export function tipoCorto(tipo?: string | null): string {
  if (!tipo) return 'Propiedad';
  return tipo.toLowerCase().startsWith('depart') ? 'Depto' : tipo;
}
