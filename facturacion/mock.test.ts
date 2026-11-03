import { expect, test } from 'vitest'
import type { Venta } from '../contratos/tipos'
import { crearFacturacionMock } from './mock'

test('emite facturas con número consecutivo', async () => {
  const facturacion = crearFacturacionMock()
  const venta = {} as Venta
  expect((await facturacion.emitirFactura(venta)).numero).toBe('SETP99000001')
  expect((await facturacion.emitirFactura(venta)).numero).toBe('SETP99000002')
})
