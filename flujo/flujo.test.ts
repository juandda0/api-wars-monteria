import { expect, test, vi } from 'vitest'
import { crearCobrosMock } from '../cobros/mock'
import type { NuevaVenta, ServicioCobros, Venta } from '../contratos/tipos'
import { crearFacturacionMock } from '../facturacion/mock'
import { crearApp } from './app'
import { crearFlujo } from './flujo'

const nueva: NuevaVenta = {
  comprador: { nombre: 'Ana Prueba', documento: '123', correo: 'ana@ejemplo.invalid' },
  lineas: [{ descripcion: 'Combo', cantidad: 1, precioSinIva: 15000, ivaPorcentaje: 19 }],
}

function crearDePrueba(cobros: ServicioCobros = crearCobrosMock(2)) {
  const facturacion = crearFacturacionMock()
  const emitir = vi.spyOn(facturacion, 'emitirFactura')
  const flujo = crearFlujo({ cobros, facturacion, intervaloMs: 1 })
  return { app: crearApp(flujo), emitir }
}

const publicar = (app: ReturnType<typeof crearApp>, cuerpo: unknown) =>
  app.request('/api/ventas', { method: 'POST', body: JSON.stringify(cuerpo) })

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
