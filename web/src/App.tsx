import { useEffect, useRef, useState } from 'react'
import type { Venta } from '../../contratos/tipos'
import { calcularTotal, crearPedido, enviarPedido, pesos, productos } from './pedido'
import './App.css'

export function App() {
  const [comprador, setComprador] = useState({ nombre: '', documento: '', correo: '' })
  const [cantidades, setCantidades] = useState(productos.map(() => 0))
  const [venta, setVenta] = useState<Venta | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const enviando = useRef(false)
  const pedido = crearPedido(comprador, cantidades)
  const total = calcularTotal(pedido.lineas)
  const terminada = venta?.estado === 'facturada' || venta?.estado === 'fallida'

  useEffect(() => {
    if (!venta || terminada) return
    const intervalo = setInterval(async () => {
      try {
        const respuesta = await fetch(`/api/ventas/${venta.id}`)
        if (!respuesta.ok) throw new Error()
        setVenta(await respuesta.json())
        setError('')
      } catch {
        setError('No pudimos consultar el estado. Volveremos a intentar.')
      }
    }, 1500)
    return () => clearInterval(intervalo)
  }, [venta?.id, terminada])

  async function pedir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando.current || total < 10000 || total > 12000000) return
    enviando.current = true
    setCargando(true)
    setError('')
    try {
      setVenta(await enviarPedido(pedido))
    } catch (error) {
      setError(error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message : 'No hay conexión con el API. Revisa tu conexión e intenta de nuevo.')
    } finally {
      enviando.current = false
      setCargando(false)
    }
  }

  return (
    <main>
      <p className="eyebrow">API WARS · MONTERÍA</p>
      <h1>Kiosco del congreso</h1>
      {!venta ? <>
        <p>Elige tu pedido y completa tus datos para recibir la factura en tu correo.</p>
        <form onSubmit={pedir} aria-busy={cargando}>
          <fieldset disabled={cargando}>
            <legend>1. Elige tus productos</legend>
            <p>Catálogo de demostración. Precios con IVA del 19 % incluido.</p>
            {productos.map((producto, indice) => <div className="producto" key={producto.descripcion}>
              <label htmlFor={`cantidad-${indice}`}>{producto.descripcion}
                <small>{pesos(calcularTotal([{ ...producto, cantidad: 1 }]))} / unidad</small>
              </label>
              <input id={`cantidad-${indice}`} aria-label={`Cantidad de ${producto.descripcion}`} type="number"
                min="0" max="100" step="1" inputMode="numeric" value={cantidades[indice]}
                onChange={evento => setCantidades(actual => actual.map((cantidad, i) => i === indice
                  ? Math.min(100, Math.max(0, Math.trunc(Number(evento.target.value)))) : cantidad))} />
            </div>)}
            <p className="total" aria-live="polite">Total: {pesos(total)}</p>
            <p id="limite">Pedido mínimo: 10.000 COP. Máximo: 12.000.000 COP.</p>
          </fieldset>
          <fieldset disabled={cargando}>
            <legend>2. Datos para tu factura</legend>
            <label htmlFor="nombre">Nombre completo</label>
            <input id="nombre" autoComplete="name" required maxLength={150} value={comprador.nombre}
              onChange={e => setComprador({ ...comprador, nombre: e.target.value })} />
            <label htmlFor="documento">Documento</label>
            <input id="documento" required maxLength={40} value={comprador.documento}
              onChange={e => setComprador({ ...comprador, documento: e.target.value })} />
            <label htmlFor="correo">Correo electrónico</label>
            <input id="correo" type="email" autoComplete="email" required maxLength={254} value={comprador.correo}
              onChange={e => setComprador({ ...comprador, correo: e.target.value })} />
          </fieldset>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" aria-describedby="limite" disabled={cargando || total < 10000 || total > 12000000
            || !comprador.nombre.trim() || !comprador.documento.trim() || !comprador.correo.trim()}>
            {cargando ? 'Creando pedido…' : 'Continuar al pago'}
          </button>
        </form>
      </> : <section aria-label="Estado del pedido">
        <p>Total: {pesos(venta.total)} · Estado: <strong>{venta.estado}</strong></p>
        {venta.estado === 'esperando_pago' && venta.cobro?.qrBase64 && <img alt="QR de pago" width={160}
          height={160} src={`data:image/png;base64,${venta.cobro.qrBase64}`} />}
        {venta.factura && <p>Factura {venta.factura.numero}<br />CUFE {venta.factura.cufe}</p>}
        {(venta.error || error) && <p role="alert" className="error">{venta.error || error}</p>}
      </section>}
    </main>
  )
}
