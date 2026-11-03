import type { Venta } from '../../contratos/tipos'
import { pesos } from './pedido'

export function EstadoPedido({ venta, error, reconsultar, volver }: {
  venta: Venta
  error: string
  reconsultar: () => void
  volver: () => void
}) {
  const pagada = venta.estado === 'pagada' || venta.cobro?.estado === 'paid'
  return <section aria-label="Estado del pedido">
    <p className="eyebrow">{venta.estado === 'facturada' ? '3. FACTURA' : '2. PAGO'}</p>
    <p className="total">Total: {pesos(venta.total)}</p>
    {venta.estado === 'esperando_pago' && <>
      <h2>Escanea para pagar</h2>
      {venta.cobro?.qrBase64
        ? <img className="qr" alt="QR de cobro para pagar tu pedido" width={240} height={240}
          src={`data:image/png;base64,${venta.cobro.qrBase64}`} />
        : <p role="status">Estamos preparando tu QR. Aparecerá aquí cuando esté disponible.</p>}
      <p role="status">Esperando el pago. Consultamos el estado automáticamente.</p>
      <p>Mantén esta pantalla abierta. Al confirmar el pago, prepararemos tu factura.</p>
    </>}
    {venta.estado === 'pagada' && <>
      <h2>Pago confirmado</h2>
      <p role="status">Estamos preparando tu factura. No vuelvas a pagar.</p>
    </>}
    {venta.estado === 'facturada' && <>
      <h2>¡Tu factura está lista!</h2>
      {venta.factura ? <>
        <p>Número de factura: <strong>{venta.factura.numero}</strong></p>
        <p>CUFE: <span className="cufe">{venta.factura.cufe}</span></p>
        <p><a className="enlace" href={venta.factura.urlPublica} target="_blank" rel="noreferrer">Ver factura (abre otra pestaña)</a></p>
        <p><a href={venta.factura.qrUrl} target="_blank" rel="noreferrer">Consultar QR de la factura (abre otra pestaña)</a></p>
        <p>La factura se enviará a <strong>{venta.comprador.correo}</strong>. También puedes abrirla desde este enlace.</p>
        <button onClick={volver}>Hacer otro pedido</button>
      </> : <>
        <p role="alert">La venta figura facturada, pero aún no recibimos los datos de la factura.</p>
        <button onClick={reconsultar}>Consultar factura de nuevo</button>
      </>}
    </>}
    {venta.estado === 'fallida' && <>
      <h2>No pudimos completar la venta</h2>
      <p role="alert" className="error">{venta.error || 'Ocurrió un error al procesar la venta.'}</p>
      {pagada ? <>
        <p>El pago está registrado. No vuelvas a pagar. Conserva la referencia y pide ayuda en el kiosco para la factura.</p>
        <button onClick={reconsultar}>Consultar estado de nuevo</button>
      </> : <>
        <p>Puedes revisar tus datos y volver a intentar con un pedido nuevo.</p>
        <button onClick={volver}>Volver al pedido e intentar de nuevo</button>
      </>}
    </>}
    {error && <div className="error" role="alert"><p>{error}</p>
      <button onClick={reconsultar}>Reintentar consulta</button></div>}
    <p>Referencia de venta: {venta.id}</p>
  </section>
}
