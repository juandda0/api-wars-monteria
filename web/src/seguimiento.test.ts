import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Venta } from '../../contratos/tipos'
import { seguirVenta } from './seguimiento'

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const respuesta = (estado: Venta['estado']) => Response.json({ id: 'v1', estado })

describe('Seguimiento de la venta', () => {
  it('consulta hasta facturada y después se detiene', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respuesta('esperando_pago'))
      .mockResolvedValueOnce(respuesta('pagada')).mockResolvedValueOnce(respuesta('facturada'))
    vi.stubGlobal('fetch', fetchMock)
    const recibir = vi.fn()
    const detener = seguirVenta('v1', recibir, vi.fn())
    await vi.advanceTimersByTimeAsync(10000)
    expect(recibir.mock.calls.map(([venta]) => venta.estado)).toEqual(['esperando_pago', 'pagada', 'facturada'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    detener()
  })
  it('también se detiene ante una venta fallida', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta('fallida'))
    vi.stubGlobal('fetch', fetchMock)
    seguirVenta('v1', vi.fn(), vi.fn())
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('no solapa solicitudes lentas y descarta respuestas después del desmontaje', async () => {
    let resolver!: (respuesta: Response) => void
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(r => { resolver = r }))
    vi.stubGlobal('fetch', fetchMock)
    const recibir = vi.fn()
    const detener = seguirVenta('v1', recibir, vi.fn())
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    detener()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    resolver(respuesta('facturada'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(recibir).not.toHaveBeenCalled()
  })
  it.each([404, 500])('pausa ante HTTP %s y permite iniciar una consulta nueva', async status => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(respuesta('facturada'))
    vi.stubGlobal('fetch', fetchMock)
    const fallar = vi.fn()
    seguirVenta('v1', vi.fn(), fallar)
    await vi.advanceTimersByTimeAsync(10000)
    expect(fallar).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const recibir = vi.fn()
    seguirVenta('v1', recibir, fallar)
    await vi.advanceTimersByTimeAsync(0)
    expect(recibir).toHaveBeenCalledWith(expect.objectContaining({ estado: 'facturada' }))
  })
  it('explica la desconexión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const fallar = vi.fn()
    seguirVenta('v1', vi.fn(), fallar)
    await vi.advanceTimersByTimeAsync(0)
    expect(fallar).toHaveBeenCalledWith(expect.stringContaining('Se perdió la conexión'))
  })
})
