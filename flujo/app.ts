import { Hono } from 'hono'
import type { NuevaVenta } from '../contratos/tipos'
import { VentaInvalida, type Flujo } from './flujo'

/** Implementa contratos/openapi.yaml. */
export function crearApp(flujo: Flujo) {
  const app = new Hono()

  app.post('/api/ventas', async (c) => {
    const nueva = await c.req.json<NuevaVenta>().catch(() => null)
    if (!nueva) return c.json({ error: 'El cuerpo no es JSON válido' }, 400)
    try {
      return c.json(await flujo.crearVenta(nueva), 201)
    } catch (error) {
      if (error instanceof VentaInvalida) return c.json({ error: error.message }, 422)
      throw error
    }
  })

  app.get('/api/ventas/:id', (c) => {
    const venta = flujo.obtenerVenta(c.req.param('id'))
    return venta ? c.json(venta) : c.json({ error: 'La venta no existe' }, 404)
  })

  return app
}
