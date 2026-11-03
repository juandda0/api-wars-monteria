import { afterEach, describe, expect, it, vi } from 'vitest'
import { calcularTotal, crearPedido, enviarPedido } from './pedido'

const comprador = { nombre: ' Ana ', documento: ' 123 ', correo: ' ana@example.com ' }
afterEach(() => vi.unstubAllGlobals())

describe('Pedido del kiosco', () => {
  it('excluye productos sin cantidad y limpia datos del comprador', () => {
    const pedido = crearPedido(comprador, [1, 0, 2])
    expect(pedido.comprador).toEqual({ nombre: 'Ana', documento: '123', correo: 'ana@example.com' })
    expect(pedido.lineas.map(l => l.cantidad)).toEqual([1, 2])
    expect(calcularTotal(pedido.lineas)).toBe(27370)
  })
  it('calcula el total con IVA y redondea una sola vez, como el API', () => {
    expect(calcularTotal([])).toBe(0)
    expect(calcularTotal([{ descripcion: 'Prueba', cantidad: 3, precioSinIva: 33, ivaPorcentaje: 19 }])).toBe(118)
  })
  it('envía el contrato exacto al endpoint y recibe la venta', async () => {
    const pedido = crearPedido(comprador, [1])
    const venta = { id: 'venta-1', estado: 'esperando_pago' }
    const fetchMock = vi.fn().mockResolvedValue(Response.json(venta, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(enviarPedido(pedido)).resolves.toEqual(venta)
    expect(fetchMock).toHaveBeenCalledWith('/api/ventas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido),
    })
  })
  it('explica el 422 y permite volver a enviar el pedido', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ id: 'reintento' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const pedido = crearPedido(comprador, [1])
    await expect(enviarPedido(pedido)).rejects.toThrow('El API rechazó el pedido')
    await expect(enviarPedido(pedido)).resolves.toEqual({ id: 'reintento' })
  })
  it('no trata los errores HTTP como ventas creadas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    await expect(enviarPedido(crearPedido(comprador, [1]))).rejects.toThrow('No pudimos crear')
  })
})
