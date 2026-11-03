import { randomUUID } from 'node:crypto'
import type { Cobro, NuevaVenta, ServicioCobros, ServicioFacturacion, Venta } from '../contratos/tipos'

const MONTO_MINIMO = 10_000
const MONTO_MAXIMO = 12_000_000

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error))
const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms))

export class VentaInvalida extends Error {}

interface Opciones {
  cobros: ServicioCobros
  facturacion: ServicioFacturacion
  intervaloMs?: number
  maxConsultas?: number
  maxIntentosFactura?: number
}

export type Flujo = ReturnType<typeof crearFlujo>

/** El corazón de la demo: venta → cobro → pagado → factura, sin que nadie haga clic. */
export function crearFlujo({
  cobros,
  facturacion,
  intervaloMs = 3000,
  maxConsultas = 200,
  maxIntentosFactura = 3,
}: Opciones) {
  const ventas = new Map<string, Venta>()

  async function esperarPago(venta: Venta) {
    const referencia = venta.cobro!.referencia
    let ultimoFallo: string | null = null
    for (let i = 0; i < maxConsultas; i++) {
      await esperar(intervaloMs)
      let cobro: Cobro
      try {
        cobro = await cobros.consultarCobro(referencia)
      } catch (error) {
        // Un fallo al consultar no dice nada del pago: se sigue dentro del límite de consultas.
        ultimoFallo = mensajeDe(error)
        continue
      }
      ultimoFallo = null
      venta.cobro = cobro
      if (cobro.estado === 'failed' || cobro.estado === 'rejected') {
        throw new Error(`El cobro terminó en ${cobro.estado}`)
      }
      if (cobro.estado === 'paid') return
    }
    throw new Error(
      ultimoFallo
        ? `No se pudo consultar el cobro: ${ultimoFallo}`
        : 'Se agotó el tiempo de espera del pago',
    )
  }

  // Reintentar no duplica la factura: el cliente de Factus usa venta.id como reference_code,
  // y Factus devuelve la factura existente si esa referencia ya se procesó.
  async function emitirConReintentos(venta: Venta) {
    for (let intento = 1; ; intento++) {
      try {
        return await facturacion.emitirFactura(venta)
      } catch (error) {
        if (intento >= maxIntentosFactura) throw error
        await esperar(intervaloMs)
      }
    }
  }

  // Va fuera del ciclo de consultas: solo se llega aquí una vez por venta.
  async function facturar(venta: Venta) {
    venta.estado = 'pagada'
    const factura = await emitirConReintentos(venta)
    venta.factura = factura
    venta.estado = 'facturada'
    try {
      await facturacion.enviarCorreo(factura.numero, venta.comprador.correo)
    } catch (error) {
      // La venta ya está facturada: el correo es un extra y no cambia su estado.
      console.error(`No se pudo enviar el correo de la factura ${factura.numero}: ${mensajeDe(error)}`)
    }
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

      esperarPago(venta)
        .then(() => facturar(venta))
        .catch((error: unknown) => {
          venta.error = mensajeDe(error)
          venta.estado = 'fallida'
        })
      return venta
    },
    obtenerVenta(id: string) {
      return ventas.get(id)
    },
  }
}
