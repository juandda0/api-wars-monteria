import type { Venta } from '../../contratos/tipos'

/** Consulta secuencial: nunca hay dos peticiones de seguimiento simultáneas. */
export function seguirVenta(id: string, recibir: (venta: Venta) => void, fallar: (mensaje: string) => void) {
  const controlador = new AbortController()
  let activa = true
  let temporizador: ReturnType<typeof setTimeout> | undefined

  async function consultar() {
    try {
      const respuesta = await fetch(`/api/ventas/${encodeURIComponent(id)}`, { signal: controlador.signal })
      if (!respuesta.ok) throw new Error(respuesta.status === 404
        ? 'No encontramos esta venta. Conserva su referencia y consulta al kiosco antes de crear otro pedido.'
        : 'No pudimos consultar tu venta. Reintenta la consulta; no necesitas volver a pagar.')
      const venta = await respuesta.json() as Venta
      if (!activa) return
      recibir(venta)
      if (venta.estado !== 'facturada' && venta.estado !== 'fallida') {
        temporizador = setTimeout(consultar, 2000)
      }
    } catch (error) {
      if (activa) fallar(error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message : 'Se perdió la conexión. Reintenta la consulta; no necesitas volver a pagar.')
    }
  }

  void consultar()
  return () => {
    activa = false
    clearTimeout(temporizador)
    controlador.abort()
  }
}
