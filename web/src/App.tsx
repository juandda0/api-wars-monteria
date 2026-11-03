import { useEffect, useState } from 'react'
import type { NuevaVenta, Venta } from '../../contratos/tipos'

// Pantalla provisional: solo demuestra el flujo. La reemplaza Interfaz.
const PEDIDO: NuevaVenta = {
  comprador: { nombre: 'Ana Prueba', documento: '123', correo: 'ana@ejemplo.invalid' },
  lineas: [{ descripcion: 'Combo del congreso', cantidad: 1, precioSinIva: 15000, ivaPorcentaje: 19 }],
}

export function App() {
  const [venta, setVenta] = useState<Venta | null>(null)
  const terminada = venta?.estado === 'facturada' || venta?.estado === 'fallida'

  useEffect(() => {
    if (!venta || terminada) return
    const intervalo = setInterval(async () => {
      const respuesta = await fetch(`/api/ventas/${venta.id}`)
      setVenta(await respuesta.json())
    }, 1500)
    return () => clearInterval(intervalo)
  }, [venta?.id, terminada])

  async function pedir() {
    const respuesta = await fetch('/api/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PEDIDO),
    })
    setVenta(await respuesta.json())
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 420, margin: '0 auto', padding: 16 }}>
      <h1>Kiosco del congreso</h1>
      {!venta && <button onClick={pedir}>Pedir combo</button>}
      {venta && (
        <>
          <p>
            Total: ${venta.total.toLocaleString('es-CO')} · Estado: <strong>{venta.estado}</strong>
          </p>
          {venta.estado === 'esperando_pago' && venta.cobro?.qrBase64 && (
            <img
              alt="QR de pago"
              width={160}
              height={160}
              style={{ imageRendering: 'pixelated' }}
              src={`data:image/png;base64,${venta.cobro.qrBase64}`}
            />
          )}
          {venta.factura && (
            <p>
              Factura {venta.factura.numero}
              <br />
              CUFE {venta.factura.cufe}
            </p>
          )}
          {venta.error && <p role="alert">{venta.error}</p>}
        </>
      )}
    </main>
  )
}
