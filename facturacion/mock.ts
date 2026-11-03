import type { ServicioFacturacion } from '../contratos/tipos'

/** Simula Factus v2 con los datos que la demo necesita mostrar. */
export function crearFacturacionMock(): ServicioFacturacion {
  let consecutivo = 0

  return {
    async emitirFactura() {
      consecutivo += 1
      const numero = `SETP99${String(consecutivo).padStart(6, '0')}`
      return {
        numero,
        cufe: `cufe-falso-${numero}`,
        qrUrl: `https://ejemplo.invalid/qr/${numero}`,
        urlPublica: `https://ejemplo.invalid/factura/${numero}`,
      }
    },
    async descargarPdf() {
      return Buffer.from('%PDF-falso').toString('base64')
    },
    async enviarCorreo() {},
  }
}
