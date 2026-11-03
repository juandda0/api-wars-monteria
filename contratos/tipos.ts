// Formatos compartidos. Solo los cambia Integración; los demás lo piden por PR.

export type EstadoCobro = 'started' | 'ready' | 'paid' | 'failed' | 'rejected'
export type EstadoVenta = 'esperando_pago' | 'pagada' | 'facturada' | 'fallida'

export interface Comprador {
  nombre: string
  documento: string
  correo: string
}

export interface LineaVenta {
  descripcion: string
  cantidad: number
  /** Precio unitario en COP sin IVA, como lo pide Factus v2. */
  precioSinIva: number
  ivaPorcentaje: number
}

export interface NuevaVenta {
  comprador: Comprador
  lineas: LineaVenta[]
}

export interface Cobro {
  referencia: string
  monto: number
  estado: EstadoCobro
  /** PNG en base64. Puede ser null mientras el estado sea `started`. */
  qrBase64: string | null
}

export interface Factura {
  numero: string
  cufe: string
  qrUrl: string
  urlPublica: string
}

export interface Venta extends NuevaVenta {
  id: string
  total: number
  estado: EstadoVenta
  cobro: Cobro | null
  factura: Factura | null
  error: string | null
}

/** Lo implementa `cobros/`. */
export interface ServicioCobros {
  crearCobro(referencia: string, monto: number): Promise<Cobro>
  consultarCobro(referencia: string): Promise<Cobro>
}

/** Lo implementa `facturacion/`. */
export interface ServicioFacturacion {
  emitirFactura(venta: Venta): Promise<Factura>
  /** Devuelve el PDF en base64. */
  descargarPdf(numero: string): Promise<string>
  enviarCorreo(numero: string, correo: string): Promise<void>
}
