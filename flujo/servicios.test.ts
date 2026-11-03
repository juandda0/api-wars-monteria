import { afterEach, expect, test, vi } from 'vitest'
import { crearServicios } from './servicios'

const factus = {
  FACTUS_CLIENT_ID: 'id-de-prueba',
  FACTUS_CLIENT_SECRET: 'secreto-de-prueba',
  FACTUS_USUARIO: 'usuario@ejemplo.invalid',
  FACTUS_CLAVE: 'clave-de-prueba',
}
const factusPay = { FACTUS_PAY_TOKEN: 'token-de-prueba' }

const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('sin credenciales usa los dos mocks, sin avisos ni llamadas de red', async () => {
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const red = vi.fn()
  vi.stubGlobal('fetch', red)

  const { cobros, modos } = crearServicios({})
  await cobros.crearCobro('V-1', 20000)

  expect(modos).toEqual({ cobros: 'mock', facturacion: 'mock' })
  expect(aviso).not.toHaveBeenCalled()
  expect(red).not.toHaveBeenCalled()
})

test('las variables vacías de .env.example cuentan como ausentes', () => {
  const entorno = {
    FACTUS_CLIENT_ID: '',
    FACTUS_CLIENT_SECRET: '',
    FACTUS_USUARIO: '',
    FACTUS_CLAVE: '  ',
    FACTUS_PAY_TOKEN: '',
  }
  expect(crearServicios(entorno).modos).toEqual({ cobros: 'mock', facturacion: 'mock' })
})

test('cada cliente real depende solo de sus credenciales', () => {
  expect(crearServicios(factus).modos).toEqual({ cobros: 'mock', facturacion: 'real' })
  expect(crearServicios(factusPay).modos).toEqual({ cobros: 'real', facturacion: 'mock' })
  expect(crearServicios({ ...factus, ...factusPay }).modos).toEqual({
    cobros: 'real',
    facturacion: 'real',
  })
})

test('con credenciales incompletas usa el mock y nombra lo que falta, sin mostrar valores', () => {
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { modos } = crearServicios({ ...factus, FACTUS_CLAVE: '' })

  expect(modos.facturacion).toBe('mock')
  expect(aviso).toHaveBeenCalledWith('Factus: se usa el mock porque faltan FACTUS_CLAVE')
  expect(aviso.mock.calls[0][0]).not.toContain('secreto-de-prueba')
})

test('Factus Pay real usa la URL, el token y el User-Agent del entorno', async () => {
  const red = vi.fn(async (_url: string, _init: RequestInit) =>
    json({ reference_code: 'V-1', amount: 20000, status: 'ready', qr: 'UE5H' }),
  )
  vi.stubGlobal('fetch', red)

  const { cobros } = crearServicios({
    ...factusPay,
    FACTUS_PAY_URL: 'https://pay.invalid/',
    USER_AGENT: 'agente-de-prueba',
  })
  await cobros.crearCobro('V-1', 20000)

  const [url, init] = red.mock.calls[0]
  const encabezados = new Headers(init.headers)
  expect(url).toBe('https://pay.invalid/v1/collections')
  expect(encabezados.get('Authorization')).toBe('Bearer token-de-prueba')
  expect(encabezados.get('User-Agent')).toBe('agente-de-prueba')
})

test('Factus real usa la URL, las credenciales y el User-Agent del entorno', async () => {
  const red = vi.fn(async (_url: string, _init: RequestInit) =>
    json({ expires_in: 3600, access_token: 'token-1', pdf_base_64_encoded: 'UERG' }),
  )
  vi.stubGlobal('fetch', red)

  const { facturacion } = crearServicios({
    ...factus,
    FACTUS_URL: 'https://factus.invalid',
    USER_AGENT: 'agente-de-prueba',
  })
  await facturacion.descargarPdf('SETP1')

  const [url, init] = red.mock.calls[0]
  expect(url).toBe('https://factus.invalid/oauth/token')
  expect(new Headers(init.headers).get('User-Agent')).toBe('agente-de-prueba')
  expect(Object.fromEntries(init.body as URLSearchParams)).toMatchObject({
    client_id: 'id-de-prueba',
    client_secret: 'secreto-de-prueba',
    username: 'usuario@ejemplo.invalid',
    password: 'clave-de-prueba',
  })
})

test('sin URL ni User-Agent usa el sandbox y un User-Agent propio', async () => {
  const red = vi.fn(async (_url: string, _init: RequestInit) =>
    json({ status: 'ready', qr: 'UE5H' }),
  )
  vi.stubGlobal('fetch', red)

  await crearServicios(factusPay).cobros.crearCobro('V-1', 20000)

  const [url, init] = red.mock.calls[0]
  expect(url).toBe('https://pay-api-sandbox.factus.com.co/v1/collections')
  expect(new Headers(init.headers).get('User-Agent')).toBe('api-wars-monteria')
})
