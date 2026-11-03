import { expect, test } from 'vitest'
import { crearCobrosMock } from './mock'

test('el cobro pasa de ready a paid', async () => {
  const cobros = crearCobrosMock(2)
  const cobro = await cobros.crearCobro('V-1', 10000)
  expect(cobro.estado).toBe('ready')
  expect((await cobros.consultarCobro('V-1')).estado).toBe('ready')
  expect((await cobros.consultarCobro('V-1')).estado).toBe('paid')
})
