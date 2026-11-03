import { randomUUID } from 'node:crypto'
import type { NuevaVenta, ServicioCobros, ServicioFacturacion, Venta } from '../contratos/tipos'

const MONTO_MINIMO = 10_000
const MONTO_MAXIMO = 12_000_000

export class VentaInvalida extends Error {}

interface Opciones {
  cobros: ServicioCobros
  facturacion: ServicioFacturacion
  intervaloMs?: number
  maxConsultas?: number
}

export type Flujo = ReturnType<typeof crearFlujo>

/** El corazón de la demo: venta → cobro → pagado → factura, sin que nadie haga clic. */
export function crearFlujo({ cobros, facturacion, intervaloMs = 3000, maxConsultas = 200 }: Opciones) {
  const ventas = new Map<string, Venta>()

  async function esperarPagoYFacturar(venta: Venta) {
    const referencia = venta.cobro!.referencia
    for (let i = 0; i < maxConsultas; i++) {
      await new Promise((listo) => setTimeout(listo, intervaloMs))
      const cobro = await cobros.consultarCobro(referencia)
      venta.cobro = cobro
      if (cobro.estado === 'failed' || cobro.estado === 'rejected') {
        throw new Error(`El cobro terminó en ${cobro.estado}`)
      }
      if (cobro.estado === 'paid') {
        venta.estado = 'pagada'
        venta.factura = await facturacion.emitirFactura(venta)
        venta.estado = 'facturada'
        await facturacion.enviarCorreo(venta.factura.numero, venta.comprador.correo)
        return
      }
    }
    throw new Error('Se agotó el tiempo de espera del pago')
  }

  return {
    async crearVenta(nueva: NuevaVenta): Promise<Venta> {
      if (!nueva.comprador?.correo || !nueva.lineas?.length) {
        throw new VentaInvalida('La venta necesita comprador con correo y al menos una línea')
      }
      const total = Math.round(
        nueva.lineas.reduce(
          (suma, l) => suma + l.cantidad * l.precioSinIva * (1 + l.ivaPorcentaje / 100),
          0,
        ),
      )
      if (total < MONTO_MINIMO || total > MONTO_MAXIMO) {
        throw new VentaInvalida(`El total debe estar entre ${MONTO_MINIMO} y ${MONTO_MAXIMO} COP`)
      }

      const id = randomUUID()
      const venta: Venta = {
        ...nueva,
        id,
        total,
        estado: 'esperando_pago',
        cobro: await cobros.crearCobro(`V-${id}`, total),
        factura: null,
        error: null,
      }
      ventas.set(id, venta)

      esperarPagoYFacturar(venta).catch((error: unknown) => {
        venta.error = error instanceof Error ? error.message : String(error)
        if (venta.estado !== 'facturada') venta.estado = 'fallida'
      })
      return venta
    },
    obtenerVenta(id: string) {
      return ventas.get(id)
    },
  }
}
