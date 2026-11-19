// Colores y tipografía del prototipo aprobado.
export const C = {
  fondo: '#F6F6F3',
  mapa: '#E9EAE4',
  tarjeta: '#FFFFFF',
  texto: '#16181D',
  texto2: '#3C4049',
  texto3: '#5B5F68',
  borde: '#D5D7DC',
  linea: '#ECEDEF',
  gris: '#E6E7EA',
  grisClaro: '#F1F2F4',
  azul: '#1747C9',
  azulClaro: '#EEF2FC',
  verde: '#1F8A4C',
  verdeTexto: '#17713E',
  amarillo: '#B98200',
  amarilloTexto: '#8A6100',
  amarilloFondo: '#FBF1D6',
  rojo: '#C23B3B',
  rojoTexto: '#A3302F',
  sinDatos: '#9A9DA4',
};

export type ColorSemaforo = 'verde' | 'amarillo' | 'rojo' | 'gris';

export function colorDe(c?: string | null): string {
  switch (c) {
    case 'verde':
      return C.verde;
    case 'amarillo':
      return C.amarillo;
    case 'rojo':
      return C.rojo;
    default:
      return C.sinDatos;
  }
}

export function colorTextoDe(c?: string | null): string {
  switch (c) {
    case 'verde':
      return C.verdeTexto;
    case 'amarillo':
      return C.amarilloTexto;
    case 'rojo':
      return C.rojoTexto;
    default:
      return C.texto3;
  }
}

export function leyendaDe(c?: string | null): string {
  switch (c) {
    case 'verde':
      return 'bajo el sector';
    case 'amarillo':
      return 'en línea con el sector';
    case 'rojo':
      return 'sobre el sector';
    default:
      return 'pocos datos en el sector';
  }
}

// Fuentes del sistema: Space Grotesk/Inter quedan para cuando se agreguen los
// archivos de fuente; mientras tanto se usan pesos del sistema.
export const F = {
  titulo: { fontWeight: '700' as const, letterSpacing: -0.3 },
};
