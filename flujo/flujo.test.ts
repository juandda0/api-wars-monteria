import { afterEach, expect, test, vi } from 'vitest'
import { crearCobrosMock } from '../cobros/mock'
import type { NuevaVenta, ServicioCobros, Venta } from '../contratos/tipos'
import { crearFacturacionMock } from '../facturacion/mock'
import { crearApp } from './app'
import { crearFlujo } from './flujo'

const nueva: NuevaVenta = {
  comprador: { nombre: 'Ana Prueba', documento: '123', correo: 'ana@ejemplo.invalid' },
  lineas: [{ descripcion: 'Combo', cantidad: 1, precioSinIva: 15000, ivaPorcentaje: 19 }],
}

function crearDePrueba(cobros: ServicioCobros = crearCobrosMock(2), maxConsultas?: number) {
  const facturacion = crearFacturacionMock()
  const emitir = vi.spyOn(facturacion, 'emitirFactura')
  const enviar = vi.spyOn(facturacion, 'enviarCorreo')
  const flujo = crearFlujo({ cobros, facturacion, intervaloMs: 1, maxConsultas })
  return { app: crearApp(flujo), emitir, enviar }
}

const publicar = (app: ReturnType<typeof crearApp>, cuerpo: unknown) =>
  app.request('/api/ventas', { method: 'POST', body: JSON.stringify(cuerpo) })

async function esperarEstado(
  app: ReturnType<typeof crearApp>,
  id: string,
  estado: Venta['estado'],
) {
  return vi.waitFor(async () => {
    const venta = (await (await app.request(`/api/ventas/${id}`)).json()) as Venta
    expect(venta.estado).toBe(estado)
    return venta
  })
}

const cobroPagado = (referencia: string) => ({
  referencia,
  monto: 17850,
  estado: 'paid' as const,
  qrBase64: null,
})

const pausa = (ms: number) => new Promise((listo) => setTimeout(listo, ms))

afterEach(() => {
  vi.restoreAllMocks()
})

test('al quedar pagado, la factura se emite sola', async () => {
  const { app } = crearDePrueba()
  const respuesta = await publicar(app, nueva)
  expect(respuesta.status).toBe(201)
  const { id, total } = (await respuesta.json()) as Venta
  expect(total).toBe(17850)

  await vi.waitFor(async () => {
    const venta = (await (await app.request(`/api/ventas/${id}`)).json()) as Venta
    expect(venta.estado).toBe('facturada')
    expect(venta.factura?.numero).toBeTruthy()
  })
})

test('un cobro rechazado no genera factura', async () => {
  const cobros = crearCobrosMock()
  cobros.consultarCobro = async (referencia) => ({
    referencia,
    monto: 17850,
    estado: 'rejected',
    qrBase64: null,
  })
  const { app, emitir } = crearDePrueba(cobros)
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  await vi.waitFor(async () => {
    const venta = (await (await app.request(`/api/ventas/${id}`)).json()) as Venta
    expect(venta.estado).toBe('fallida')
  })
  expect(emitir).not.toHaveBeenCalled()
})

test('rechaza montos fuera del rango de Factus Pay', async () => {
  const { app } = crearDePrueba()
  const barata = { ...nueva, lineas: [{ ...nueva.lineas[0], precioSinIva: 100 }] }
  expect((await publicar(app, barata)).status).toBe(422)
})

test('un fallo temporal al consultar el cobro no mata la venta', async () => {
  const cobros = crearCobrosMock()
  const consultar = vi
    .spyOn(cobros, 'consultarCobro')
    .mockRejectedValueOnce(new Error('fetch failed'))
    .mockRejectedValueOnce(new Error('fetch failed'))
    .mockImplementation(async (referencia) => cobroPagado(referencia))
  const { app, emitir } = crearDePrueba(cobros)
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  const venta = await esperarEstado(app, id, 'facturada')
  expect(venta.error).toBeNull()
  expect(consultar).toHaveBeenCalledTimes(3)
  expect(emitir).toHaveBeenCalledTimes(1)
})

test('los fallos al consultar respetan el límite de consultas', async () => {
  const cobros = crearCobrosMock()
  const consultar = vi.spyOn(cobros, 'consultarCobro').mockRejectedValue(new Error('fetch failed'))
  const { app, emitir } = crearDePrueba(cobros, 3)
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  const venta = await esperarEstado(app, id, 'fallida')
  expect(venta.error).toBe('No se pudo consultar el cobro: fetch failed')
  expect(consultar).toHaveBeenCalledTimes(3)
  expect(emitir).not.toHaveBeenCalled()
})

test('una venta pagada se factura una sola vez', async () => {
  const cobros = crearCobrosMock()
  const consultar = vi
    .spyOn(cobros, 'consultarCobro')
    .mockImplementation(async (referencia) => cobroPagado(referencia))
  const { app, emitir } = crearDePrueba(cobros)
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  await esperarEstado(app, id, 'facturada')
  await pausa(20)
  expect(emitir).toHaveBeenCalledTimes(1)
  expect(consultar).toHaveBeenCalledTimes(1)
})

test('un fallo temporal al emitir se reintenta con la misma venta y para al lograrlo', async () => {
  const cobros = crearCobrosMock()
  const consultar = vi
    .spyOn(cobros, 'consultarCobro')
    .mockImplementation(async (referencia) => cobroPagado(referencia))
  const { app, emitir } = crearDePrueba(cobros)
  emitir.mockRejectedValueOnce(new Error('fetch failed'))
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  const venta = await esperarEstado(app, id, 'facturada')
  await pausa(20)
  expect(venta.error).toBeNull()
  expect(venta.factura?.numero).toBeTruthy()
  expect(emitir).toHaveBeenCalledTimes(2)
  expect(emitir.mock.calls.map(([{ id }]) => id)).toEqual([id, id])
  expect(consultar).toHaveBeenCalledTimes(1)
})

test('si la factura sigue fallando, la venta queda fallida al agotar los intentos', async () => {
  const cobros = crearCobrosMock()
  const consultar = vi
    .spyOn(cobros, 'consultarCobro')
    .mockImplementation(async (referencia) => cobroPagado(referencia))
  const { app, emitir, enviar } = crearDePrueba(cobros)
  emitir.mockRejectedValue(new Error('Factus respondió 500'))
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  const venta = await esperarEstado(app, id, 'fallida')
  await pausa(20)
  expect(venta.error).toBe('Factus respondió 500')
  expect(emitir).toHaveBeenCalledTimes(3)
  expect(consultar).toHaveBeenCalledTimes(1)
  expect(enviar).not.toHaveBeenCalled()
})

test('mientras reintenta la factura, la venta sigue pagada y sin error', async () => {
  const cobros = crearCobrosMock()
  vi.spyOn(cobros, 'consultarCobro').mockImplementation(async (referencia) => cobroPagado(referencia))
  let dejarPasar = () => {}
  const facturacion = crearFacturacionMock()
  const emitirReal = facturacion.emitirFactura
  const emitir = vi
    .spyOn(facturacion, 'emitirFactura')
    .mockRejectedValueOnce(new Error('fetch failed'))
    .mockImplementationOnce(async (venta) => {
      await new Promise<void>((listo) => {
        dejarPasar = listo
      })
      return emitirReal(venta)
    })
  const app = crearApp(crearFlujo({ cobros, facturacion, intervaloMs: 1 }))
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  await vi.waitFor(() => expect(emitir).toHaveBeenCalledTimes(2))
  const enEspera = await esperarEstado(app, id, 'pagada')
  expect(enEspera.error).toBeNull()

  dejarPasar()
  await esperarEstado(app, id, 'facturada')
})

test('un fallo de enviarCorreo no hace parecer fallida la venta facturada', async () => {
  const registro = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { app, emitir, enviar } = crearDePrueba()
  enviar.mockRejectedValue(new Error('Factus respondió 500'))
  const { id } = (await (await publicar(app, nueva)).json()) as Venta

  await vi.waitFor(() => expect(registro).toHaveBeenCalled())
  const venta = await esperarEstado(app, id, 'facturada')
  expect(venta.error).toBeNull()
  expect(venta.factura?.numero).toBeTruthy()
  expect(emitir).toHaveBeenCalledTimes(1)
  expect(registro.mock.calls[0][0]).toContain(venta.factura?.numero)
  expect(registro.mock.calls[0][0]).not.toContain(nueva.comprador.correo)
})
