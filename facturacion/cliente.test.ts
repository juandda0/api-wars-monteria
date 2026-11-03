import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Venta } from '../contratos/tipos'
import { crearFacturacionFactus } from './cliente'

const config = {
  url: 'https://factus.invalid',
  clientId: 'id-de-prueba',
  clientSecret: 'secreto-de-prueba',
  usuario: 'usuario@ejemplo.invalid',
  clave: 'clave-de-prueba',
  userAgent: 'agente-de-prueba',
}

const venta: Venta = {
  id: 'venta-1',
  comprador: { nombre: 'Ana Prueba', documento: '123', correo: 'ana@ejemplo.invalid' },
  lineas: [{ descripcion: 'Combo', cantidad: 2, precioSinIva: 15000, ivaPorcentaje: 19 }],
  total: 35700,
  estado: 'pagada',
  cobro: { referencia: 'V-venta-1', monto: 35700, estado: 'paid', qrBase64: null },
  factura: null,
  error: null,
}

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

const respuestasBase: Record<string, () => Response> = {
  '/oauth/token': () =>
    json({ token_type: 'Bearer', expires_in: 3600, access_token: 'token-1', refresh_token: 'refresh-1' }),
  '/v2/numbering-ranges': () =>
    json({
      data: [
        { id: 7, is_active: 1, is_expired: 1 },
        { id: 12, is_active: 1, is_expired: 0 },
      ],
    }),
  '/v2/bills/validate': () =>
    json({
      status: 'Created',
      data: {
        number: 'SETP990000550',
        cufe: 'cufe-1',
        is_validated: true,
        links: { qr: 'https://qr.invalid/1', public_url: 'https://publica.invalid/1' },
      },
    }),
}

/** Reemplaza fetch por las respuestas dadas y devuelve las llamadas recibidas. */
function simularFactus(cambios: Record<string, () => Response> = {}) {
  const respuestas = { ...respuestasBase, ...cambios }
  const llamadas: { ruta: string; url: string; init: RequestInit; encabezados: Headers }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const ruta = new URL(url).pathname
    llamadas.push({ ruta, url, init, encabezados: new Headers(init.headers) })
    return respuestas[ruta]()
  })
  return {
    llamadas,
    a: (ruta: string) => llamadas.filter((llamada) => llamada.ruta === ruta),
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T12:00:00Z') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('pide el token con datos de formulario', async () => {
  const { a } = simularFactus()
  await crearFacturacionFactus(config).emitirFactura(venta)

  const { init, encabezados } = a('/oauth/token')[0]
  expect(init.method).toBe('POST')
  expect(init.body).toBeInstanceOf(URLSearchParams)
  // Sin Content-Type propio, fetch lo pone como application/x-www-form-urlencoded.
  expect(encabezados.get('Content-Type')).toBeNull()
  expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
    grant_type: 'password',
    client_id: 'id-de-prueba',
    client_secret: 'secreto-de-prueba',
    username: 'usuario@ejemplo.invalid',
    password: 'clave-de-prueba',
  })
})

test('reutiliza el token y el rango mientras siguen vigentes', async () => {
  const { a } = simularFactus()
  const facturacion = crearFacturacionFactus(config)
  await facturacion.emitirFactura(venta)
  vi.advanceTimersByTime(3500_000)
  await facturacion.emitirFactura(venta)

  expect(a('/oauth/token')).toHaveLength(1)
  expect(a('/v2/numbering-ranges')).toHaveLength(1)
  expect(a('/v2/bills/validate')).toHaveLength(2)
})

test('dos facturas simultáneas comparten el mismo token', async () => {
  const { a } = simularFactus()
  const facturacion = crearFacturacionFactus(config)
  await Promise.all([facturacion.emitirFactura(venta), facturacion.emitirFactura(venta)])
  expect(a('/oauth/token')).toHaveLength(1)
})

test('renueva el token con refresh_token antes de que venza', async () => {
  let emitidos = 0
  const { a } = simularFactus({
    '/oauth/token': () => {
      emitidos += 1
      return json({ expires_in: 3600, access_token: `token-${emitidos}`, refresh_token: `refresh-${emitidos}` })
    },
  })
  const facturacion = crearFacturacionFactus(config)
  await facturacion.emitirFactura(venta)
  vi.advanceTimersByTime(3550_000)
  await facturacion.emitirFactura(venta)

  const pedidos = a('/oauth/token')
  expect(pedidos).toHaveLength(2)
  expect(Object.fromEntries(pedidos[1].init.body as URLSearchParams)).toEqual({
    grant_type: 'refresh_token',
    refresh_token: 'refresh-1',
    client_id: 'id-de-prueba',
    client_secret: 'secreto-de-prueba',
  })
  expect(a('/v2/bills/validate')[1].encabezados.get('Authorization')).toBe('Bearer token-2')
})

test('pide un token nuevo si la renovación falla', async () => {
  const { a } = simularFactus({
    '/oauth/token': () =>
      a('/oauth/token').length === 2
        ? json({ message: 'refresh vencido' }, 401)
        : json({ expires_in: 3600, access_token: 'token-x', refresh_token: 'refresh-x' }),
  })
  const facturacion = crearFacturacionFactus(config)
  await facturacion.emitirFactura(venta)
  vi.advanceTimersByTime(3600_000)
  await facturacion.emitirFactura(venta)

  const tipos = a('/oauth/token').map(({ init }) => (init.body as URLSearchParams).get('grant_type'))
  expect(tipos).toEqual(['password', 'refresh_token', 'password'])
})

test('envía el User-Agent y el token en todas las llamadas', async () => {
  const { llamadas } = simularFactus()
  await crearFacturacionFactus(config).emitirFactura(venta)

  expect(llamadas.map(({ ruta }) => ruta)).toEqual([
    '/oauth/token',
    '/v2/numbering-ranges',
    '/v2/bills/validate',
  ])
  for (const { encabezados } of llamadas) {
    expect(encabezados.get('User-Agent')).toBe('agente-de-prueba')
  }
  for (const { encabezados } of llamadas.slice(1)) {
    expect(encabezados.get('Authorization')).toBe('Bearer token-1')
  }
})

test('busca el rango de facturas de venta y descarta los vencidos', async () => {
  const { a } = simularFactus()
  await crearFacturacionFactus(config).emitirFactura(venta)

  const { searchParams } = new URL(a('/v2/numbering-ranges')[0].url)
  expect(searchParams.get('filter[document]')).toBe('21')
  expect(searchParams.get('filter[is_active]')).toBe('1')
  const cuerpo = JSON.parse(a('/v2/bills/validate')[0].init.body as string)
  expect(cuerpo.numbering_range_id).toBe(12)
})

test('convierte la venta en factura con el precio sin IVA y el impuesto aparte', async () => {
  const { a } = simularFactus()
  const factura = await crearFacturacionFactus(config).emitirFactura(venta)

  const { init, encabezados } = a('/v2/bills/validate')[0]
  expect(init.method).toBe('POST')
  expect(encabezados.get('Content-Type')).toBe('application/json')
  expect(JSON.parse(init.body as string)).toEqual({
    reference_code: 'venta-1',
    numbering_range_id: 12,
    send_email: false,
    payment_details: [
      { payment_form: '1', payment_method_code: '47', reference_code: 'V-venta-1', amount: '35700.00' },
    ],
    cash_rounding_amount: '0.00',
    customer: {
      identification_document_code: '13',
      identification: '123',
      legal_organization_code: '2',
      names: 'Ana Prueba',
      email: 'ana@ejemplo.invalid',
    },
    items: [
      {
        code_reference: 'L-1',
        name: 'Combo',
        quantity: '2.00',
        price: '15000.00',
        unit_measure_code: '94',
        standard_code: '999',
        taxes: [{ code: '01', rate: '19.00' }],
      },
    ],
  })
  expect(factura).toEqual({
    numero: 'SETP990000550',
    cufe: 'cufe-1',
    qrUrl: 'https://qr.invalid/1',
    urlPublica: 'https://publica.invalid/1',
  })
})

test('compensa con cash_rounding_amount el redondeo del cobro', async () => {
  const { a } = simularFactus()
  await crearFacturacionFactus(config).emitirFactura({
    ...venta,
    // 10.000,50 + 1.900,10 de IVA = 11.900,60; el cobro se hizo por 11.901.
    lineas: [{ descripcion: 'Combo', cantidad: 1, precioSinIva: 10000.5, ivaPorcentaje: 19 }],
    total: 11901,
  })

  const cuerpo = JSON.parse(a('/v2/bills/validate')[0].init.body as string)
  expect(cuerpo.payment_details[0].amount).toBe('11901.00')
  expect(cuerpo.cash_rounding_amount).toBe('0.40')
})

test('un error de la API incluye el estado, la ruta y el detalle', async () => {
  simularFactus({
    '/v2/bills/validate': () =>
      json({ message: 'Datos inválidos', data: { errors: { 'customer.names': ['Obligatorio'] } } }, 422),
  })
  await expect(crearFacturacionFactus(config).emitirFactura(venta)).rejects.toThrow(
    'Factus respondió 422 en POST /v2/bills/validate: Datos inválidos {"customer.names":["Obligatorio"]}',
  )
})

test('un error del token es claro y no revela las credenciales', async () => {
  simularFactus({ '/oauth/token': () => json({ error_description: 'Credenciales inválidas' }, 401) })
  const error: Error = await crearFacturacionFactus(config).emitirFactura(venta).catch((e) => e)

  expect(error.message).toBe('Factus respondió 401 en POST /oauth/token: Credenciales inválidas')
  expect(error.message).not.toContain('secreto-de-prueba')
  expect(error.message).not.toContain('clave-de-prueba')
})

test('una respuesta HTML de Cloudflare da un error legible', async () => {
  simularFactus({ '/oauth/token': () => new Response('<html>Forbidden</html>', { status: 403 }) })
  await expect(crearFacturacionFactus(config).emitirFactura(venta)).rejects.toThrow(
    /^Factus respondió 403 en POST \/oauth\/token$/,
  )
})

test('un fallo de red dice qué llamada falló', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('fetch failed')
  })
  await expect(crearFacturacionFactus(config).emitirFactura(venta)).rejects.toThrow(
    'No se pudo conectar con Factus en POST /oauth/token: fetch failed',
  )
})

test('falla si no hay un rango activo y vuelve a buscarlo en el siguiente intento', async () => {
  let rangos: unknown[] = []
  const { a } = simularFactus({ '/v2/numbering-ranges': () => json({ data: rangos }) })
  const facturacion = crearFacturacionFactus(config)
  await expect(facturacion.emitirFactura(venta)).rejects.toThrow('rango de numeración activo')

  rangos = [{ id: 12, is_active: true, is_expired: false }]
  await expect(facturacion.emitirFactura(venta)).resolves.toBeTruthy()
  expect(a('/v2/numbering-ranges')).toHaveLength(2)
})

test('falla si la DIAN no validó la factura', async () => {
  simularFactus({
    '/v2/bills/validate': () =>
      json({ data: { number: 'SETP1', is_validated: false, errors: { FAK: 'Rechazada' } } }),
  })
  await expect(crearFacturacionFactus(config).emitirFactura(venta)).rejects.toThrow(
    'La DIAN no validó la factura de la venta venta-1: {"FAK":"Rechazada"}',
  )
})

test('falla si la respuesta no trae los datos de la factura', async () => {
  simularFactus({ '/v2/bills/validate': () => json({ data: { number: 'SETP1' } }) })
  await expect(crearFacturacionFactus(config).emitirFactura(venta)).rejects.toThrow(
    'Factus no devolvió número, CUFE y enlaces para la venta venta-1',
  )
})
