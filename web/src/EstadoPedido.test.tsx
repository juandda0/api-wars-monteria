import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Venta } from '../../contratos/tipos'
import { EstadoPedido } from './EstadoPedido'

const base: Venta = {
  id: 'venta-demo', total: 17850, comprador: { nombre: 'Ana', documento: '123', correo: 'ana@example.com' },
  lineas: [], estado: 'esperando_pago', factura: null, error: null,
  cobro: { referencia: 'ref-demo', monto: 17850, estado: 'started', qrBase64: null },
}
const pintar = (cambios: Partial<Venta>, error = '') => renderToStaticMarkup(
  <EstadoPedido venta={{ ...base, ...cambios }} error={error} reconsultar={() => {}} volver={() => {}} />)

describe('Pantallas de pago y factura', () => {
  it('explica la espera del QR y muestra el PNG cuando llega', () => {
    expect(pintar({})).toContain('Estamos preparando tu QR')
    expect(pintar({ cobro: { ...base.cobro!, estado: 'ready', qrBase64: 'mock-gris' } })).toContain('data:image/png;base64,mock-gris')
  })
  it('distingue el pago confirmado de la factura lista', () => {
    const html = pintar({ estado: 'pagada' })
    expect(html).toContain('Pago confirmado')
    expect(html).toContain('No vuelvas a pagar')
    expect(html).not.toContain('Tu factura está lista')
  })
  it('muestra número, CUFE, enlaces del contrato y correo', () => {
    const html = pintar({ estado: 'facturada', factura: {
      numero: 'SETP123', cufe: 'cufe-demo', qrUrl: 'https://example.com/qr', urlPublica: 'https://example.com/factura',
    } })
    for (const dato of ['SETP123', 'cufe-demo', 'https://example.com/factura', 'https://example.com/qr', 'ana@example.com']) {
      expect(html).toContain(dato)
    }
    expect(html).not.toContain('Descargar PDF')
  })
  it('permite volver al pedido si falla el cobro', () => {
    const html = pintar({ estado: 'fallida', error: 'Cobro rechazado' })
    expect(html).toContain('Cobro rechazado')
    expect(html).toContain('Volver al pedido e intentar de nuevo')
  })
  it('si ya se cobró, permite consultar sin inducir un segundo pago', () => {
    const html = pintar({ estado: 'fallida', cobro: { ...base.cobro!, estado: 'paid' } })
    expect(html).toContain('No vuelvas a pagar')
    expect(html).toContain('Consultar estado de nuevo')
    expect(html).not.toContain('Volver al pedido e intentar de nuevo')
  })
  it('ofrece reintento de consulta ante un error de red', () => {
    expect(pintar({}, 'Sin conexión')).toContain('Reintentar consulta')
  })
  it('permite consultar otra vez si aún faltan los datos de factura', () => {
    expect(pintar({ estado: 'facturada' })).toContain('Consultar factura de nuevo')
  })
})
