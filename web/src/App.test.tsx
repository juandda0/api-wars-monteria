import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('Acceso al pedido', () => {
  it('ofrece salto al contenido, encabezado enfocable y paso actual', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('href="#contenido"')
    expect(html).toContain('id="contenido"')
    expect(html).toMatch(/<h1[^>]*tabindex="-1"/)
    expect(html).toContain('aria-current="step">1. Pedido')
  })
  it('vincula los campos a etiquetas y bloquea un pedido vacío', () => {
    const html = renderToStaticMarkup(<App />)
    for (const id of ['nombre', 'documento', 'correo']) {
      expect(html).toContain(`for="${id}"`)
      expect(html).toContain(`id="${id}"`)
    }
    expect(html).toContain('type="email"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continuar al pago/)
    expect(html).toContain('aria-live="polite"')
  })
})
