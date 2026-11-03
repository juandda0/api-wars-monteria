import { afterEach, expect, test, vi } from 'vitest'
import { ErrorFactusPay, crearCobrosFactusPay, normalizarQr } from './cliente'

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

test('quita el prefijo data: del QR', async () => {
  simularFetch({
    status: 200,
    cuerpo: { reference_code: 'V-6', amount: 10000, status: 'ready', qr: `data:image/png;base64,${QR}` },
  })

  const cobro = await crearCobrosFactusPay(config).crearCobro('V-6', 10000)

  expect(cobro.qrBase64).toBe(QR)
})

test('normalizarQr deja solo el base64 y convierte vacíos en null', () => {
  expect(normalizarQr(QR)).toBe(QR)
  expect(normalizarQr(` DATA:image/png;base64,${QR}\n`)).toBe(QR)
  expect(normalizarQr('data:image/png;base64,')).toBeNull()
  expect(normalizarQr('')).toBeNull()
  expect(normalizarQr(null)).toBeNull()
  expect(normalizarQr(undefined)).toBeNull()
})

test.each(['started', 'ready', 'paid', 'failed', 'rejected'])('reconoce el estado %s', async (status) => {
  simularFetch({ status: 200, cuerpo: { reference_code: 'V-7', amount: 10000, status, qr: null } })

  expect((await crearCobrosFactusPay(config).consultarCobro('V-7')).estado).toBe(status)
})

test('lanza un error claro si llega un estado desconocido', async () => {
  simularFetch({ status: 200, cuerpo: { reference_code: 'V-8', amount: 10000, status: 'expired', qr: null } })

  const consulta = crearCobrosFactusPay(config).consultarCobro('V-8')

  await expect(consulta).rejects.toBeInstanceOf(ErrorFactusPay)
  await expect(consulta).rejects.toThrow('estado desconocido para el cobro V-8: "expired"')
})

test('lanza un error con el código HTTP si la API falla', async () => {
  simularFetch({ status: 422, cuerpo: { message: 'reference_code ya existe' } })

  const creacion = crearCobrosFactusPay(config).crearCobro('V-9', 10000)

  await expect(creacion).rejects.toMatchObject({ name: 'ErrorFactusPay', status: 422 })
  await expect(creacion).rejects.toThrow(
    'Factus Pay respondió 422 en POST /v1/collections: {"message":"reference_code ya existe"}',
  )
})

test('lanza un error claro si la respuesta no es JSON', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>ok</html>', { status: 200 })))

  await expect(crearCobrosFactusPay(config).consultarCobro('V-10')).rejects.toThrow(
    'Factus Pay respondió 200 en GET /v1/collections/V-10 sin un objeto JSON',
  )
})

test('lanza un error claro si no hay conexión', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')))

  await expect(crearCobrosFactusPay(config).consultarCobro('V-11')).rejects.toThrow(
    'No se pudo conectar con Factus Pay (GET /v1/collections/V-11): fetch failed',
  )
})
