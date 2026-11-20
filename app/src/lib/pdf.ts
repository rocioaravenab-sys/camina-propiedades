import * as Sharing from 'expo-sharing';

/** Abre la hoja de compartir del sistema con el PDF (ver, guardar en Archivos, enviar). */
export function compartirPdf(uri: string) {
  return Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Informe caminaPropiedades' });
}
