import { afterEach, expect, test, vi } from 'vitest'
import { crearCobrosFactusPay } from './cliente'

const config = { url: 'https://pay.test/', token: 'tok-123', userAgent: 'api-wars-monteria/test' }
const QR = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** Simula fetch con las respuestas dadas, en orden. */
function simularFetch(...respuestas: Array<{ status: number; cuerpo: unknown }>) {
  const fetchFalso = vi.fn<typeof fetch>()
  for (const r of respuestas) {
    fetchFalso.mockResolvedValueOnce(
      new Response(JSON.stringify(r.cuerpo), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }
  vi.stubGlobal('fetch', fetchFalso)
  return fetchFalso
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('crea el cobro cuando responde 200 con ready y QR', async () => {
  const fetchFalso = simularFetch({
    status: 200,
    cuerpo: { reference_code: 'V-1', amount: 15000, status: 'ready', qr: QR },
  })

  const cobro = await crearCobrosFactusPay(config).crearCobro('V-1', 15000)

  expect(cobro).toEqual({ referencia: 'V-1', monto: 15000, estado: 'ready', qrBase64: QR })
  const [url, init] = fetchFalso.mock.calls[0]!
  expect(url).toBe('https://pay.test/v1/collections')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(String(init?.body))).toEqual({ reference_code: 'V-1', amount: 15000 })
})

test('crea el cobro cuando responde 201 con started y qr null', async () => {
  simularFetch({ status: 201, cuerpo: { reference_code: 'V-2', amount: 20000, status: 'started', qr: null } })

  const cobro = await crearCobrosFactusPay(config).crearCobro('V-2', 20000)

  expect(cobro).toEqual({ referencia: 'V-2', monto: 20000, estado: 'started', qrBase64: null })
})

test('consulta el cobro hasta que pasa a paid', async () => {
  const fetchFalso = simularFetch(
    { status: 201, cuerpo: { reference_code: 'V-3', amount: 30000, status: 'started', qr: null } },
    { status: 200, cuerpo: { reference_code: 'V-3', amount: 30000, status: 'ready', qr: QR } },
    { status: 200, cuerpo: { reference_code: 'V-3', amount: 30000, status: 'paid', qr: QR } },
  )
  const cobros = crearCobrosFactusPay(config)

  await cobros.crearCobro('V-3', 30000)
  expect((await cobros.consultarCobro('V-3')).estado).toBe('ready')
  const pagado = await cobros.consultarCobro('V-3')

  expect(pagado).toEqual({ referencia: 'V-3', monto: 30000, estado: 'paid', qrBase64: QR })
  const [url, init] = fetchFalso.mock.calls[2]!
  expect(url).toBe('https://pay.test/v1/collections/V-3')
  expect(init?.method).toBeUndefined()
})

test('usa el monto creado si la consulta no trae amount', async () => {
  simularFetch(
    { status: 200, cuerpo: { reference_code: 'V-4', amount: 12000, status: 'ready', qr: QR } },
    { status: 200, cuerpo: { status: 'paid', qr: QR } },
  )
  const cobros = crearCobrosFactusPay(config)

  await cobros.crearCobro('V-4', 12000)

  expect(await cobros.consultarCobro('V-4')).toMatchObject({ referencia: 'V-4', monto: 12000 })
})

test('envía el token y el User-Agent en todas las llamadas', async () => {
  const fetchFalso = simularFetch(
    { status: 200, cuerpo: { reference_code: 'V-5', amount: 10000, status: 'ready', qr: QR } },
    { status: 200, cuerpo: { reference_code: 'V-5', amount: 10000, status: 'ready', qr: QR } },
  )
  const cobros = crearCobrosFactusPay(config)

  await cobros.crearCobro('V-5', 10000)
  await cobros.consultarCobro('V-5')

  expect(fetchFalso).toHaveBeenCalledTimes(2)
  for (const [, init] of fetchFalso.mock.calls) {
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
    expect(headers.get('User-Agent')).toBe('api-wars-monteria/test')
  }
})
