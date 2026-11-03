import type { Factura, ServicioFacturacion, Venta } from '../contratos/tipos'

export interface ConfigFactus {
  url: string
  clientId: string
  clientSecret: string
  usuario: string
  clave: string
  userAgent: string
}

const MARGEN_RENOVACION_MS = 60_000
const TIEMPO_MAXIMO_MS = 30_000

// Códigos de https://developers.factus.com.co/tablas-de-referencia/tablas/
const RANGO_FACTURA_DE_VENTA = '21'
const CEDULA = '13'
const PERSONA_NATURAL = '2'
const PAGO_DE_CONTADO = '1'
// POR CONFIRMAR: la tabla no tiene un código para QR; se usa Transferencia.
const PAGO_POR_TRANSFERENCIA = '47'
const UNIDAD = '94'
const ESTANDAR_DEL_CONTRIBUYENTE = '999'
const IVA = '01'

interface Token {
  valor: string
  refresh?: string
  venceEn: number
}

interface RespuestaToken {
  access_token?: string
  refresh_token?: string
  expires_in: number
}

interface RespuestaRangos {
  data?: { id: number; is_active: boolean | number; is_expired: boolean | number }[]
}

interface RespuestaFactura {
  data?: {
    number?: string
    cufe?: string
    is_validated?: boolean
    errors?: unknown
    links?: { qr?: string; public_url?: string }
  }
}

interface RespuestaPdf {
  pdf_base_64_encoded?: string
  data?: { pdf_base_64_encoded?: string }
}

const redondear = (valor: number) => Math.round(valor * 100) / 100
const dinero = (valor: number) => redondear(valor).toFixed(2)

function detalleDelError(cuerpo: string) {
  try {
    const { message, error_description, error, errors, data } = JSON.parse(cuerpo)
    const errores = data?.errors ?? errors
    return [message ?? error_description ?? error, errores && JSON.stringify(errores)]
      .filter(Boolean)
      .join(' ')
  } catch {
    return ''
  }
}

function construirFactura(venta: Venta, rangoId: number) {
  const totalExacto = venta.lineas.reduce((suma, linea) => {
    const base = redondear(redondear(linea.cantidad) * redondear(linea.precioSinIva))
    return suma + base + redondear((base * linea.ivaPorcentaje) / 100)
  }, 0)

  return {
    // Si Factus ya procesó esta referencia devuelve la factura existente en vez de crear otra.
    reference_code: venta.id,
    numbering_range_id: rangoId,
    // El correo lo envía el flujo con enviarCorreo.
    send_email: false,
    payment_details: [
      {
        payment_form: PAGO_DE_CONTADO,
        payment_method_code: PAGO_POR_TRANSFERENCIA,
        reference_code: venta.cobro?.referencia,
        amount: dinero(venta.total),
      },
    ],
    // El cobro va en pesos enteros y la factura puede tener centavos.
    // POR CONFIRMAR en el sandbox: que Factus calcule el total igual que totalExacto.
    cash_rounding_amount: dinero(venta.total - totalExacto),
    customer: {
      // POR CONFIRMAR: Comprador no trae el tipo de documento; se asume cédula de persona natural.
      identification_document_code: CEDULA,
      identification: venta.comprador.documento,
      legal_organization_code: PERSONA_NATURAL,
      names: venta.comprador.nombre,
      email: venta.comprador.correo,
    },
    items: venta.lineas.map((linea, i) => ({
      code_reference: `L-${i + 1}`,
      name: linea.descripcion,
      quantity: dinero(linea.cantidad),
      price: dinero(linea.precioSinIva),
      unit_measure_code: UNIDAD,
      standard_code: ESTANDAR_DEL_CONTRIBUYENTE,
      taxes: [{ code: IVA, rate: dinero(linea.ivaPorcentaje) }],
    })),
  }
}

/** Cliente real de Factus v2: https://developers.factus.com.co */
export function crearFacturacionFactus(config: ConfigFactus): ServicioFacturacion {
  const base = config.url.replace(/\/+$/, '')
  let token: Token | null = null
  let renovacion: Promise<string> | null = null
  let rango: Promise<number> | null = null

  async function pedir<T>(metodo: string, ruta: string, cuerpo?: BodyInit, encabezados = {}) {
    const operacion = `${metodo} ${ruta}`
    let respuesta: Response
    try {
      respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        body: cuerpo,
        headers: { Accept: 'application/json', 'User-Agent': config.userAgent, ...encabezados },
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      })
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      throw new Error(`No se pudo conectar con Factus en ${operacion}: ${motivo}`)
    }

    const texto = await respuesta.text()
    if (!respuesta.ok) {
      const detalle = detalleDelError(texto)
      throw new Error(
        `Factus respondió ${respuesta.status} en ${operacion}${detalle ? `: ${detalle}` : ''}`,
      )
    }
    try {
      // La respuesta de send-email no está documentada: un 2xx sin cuerpo también es éxito.
      return (texto ? JSON.parse(texto) : {}) as T
    } catch {
      throw new Error(`Factus devolvió una respuesta que no es JSON en ${operacion}`)
    }
  }

  async function pedirToken(campos: Record<string, string>, anterior?: string) {
    const { access_token, refresh_token, expires_in } = await pedir<RespuestaToken>(
      'POST',
      '/oauth/token',
      new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...campos,
      }),
      anterior ? { Authorization: `Bearer ${anterior}` } : {},
    )
    if (!access_token) throw new Error('Factus no devolvió el token de acceso')
    // La duración se toma de la respuesta: la documentación muestra 600 y 3600 segundos.
    token = { valor: access_token, refresh: refresh_token, venceEn: Date.now() + expires_in * 1000 }
    return access_token
  }

  async function renovarToken() {
    if (token?.refresh) {
      try {
        return await pedirToken({ grant_type: 'refresh_token', refresh_token: token.refresh }, token.valor)
      } catch {
        // Un refresh_token vencido no debe tumbar la factura: se pide un token nuevo.
        token = null
      }
    }
    return pedirToken({ grant_type: 'password', username: config.usuario, password: config.clave })
  }

  function obtenerToken() {
    if (token && Date.now() < token.venceEn - MARGEN_RENOVACION_MS) return Promise.resolve(token.valor)
    renovacion ??= renovarToken().finally(() => {
      renovacion = null
    })
    return renovacion
  }

  async function pedirConToken<T>(metodo: string, ruta: string, cuerpo?: unknown) {
    return pedir<T>(metodo, ruta, cuerpo === undefined ? undefined : JSON.stringify(cuerpo), {
      Authorization: `Bearer ${await obtenerToken()}`,
      'Content-Type': 'application/json',
    })
  }

  async function buscarRango() {
    const { data } = await pedirConToken<RespuestaRangos>(
      'GET',
      `/v2/numbering-ranges?filter[document]=${RANGO_FACTURA_DE_VENTA}&filter[is_active]=1`,
    )
    // La documentación dice 1/0, pero su ejemplo trae true/false.
    const activo = data?.find((r) => Boolean(r.is_active) && !r.is_expired)
    if (!activo) throw new Error('Factus no tiene un rango de numeración activo para facturas de venta')
    return activo.id
  }

  function obtenerRango() {
    rango ??= buscarRango().catch((error: unknown) => {
      rango = null
      throw error
    })
    return rango
  }

  return {
    async emitirFactura(venta: Venta): Promise<Factura> {
      const { data } = await pedirConToken<RespuestaFactura>(
        'POST',
        '/v2/bills/validate',
        construirFactura(venta, await obtenerRango()),
      )
      if (data?.is_validated === false) {
        throw new Error(
          `La DIAN no validó la factura de la venta ${venta.id}: ${JSON.stringify(data.errors ?? {})}`,
        )
      }
      const { number, cufe, links } = data ?? {}
      if (!number || !cufe || !links?.qr || !links.public_url) {
        throw new Error(`Factus no devolvió número, CUFE y enlaces para la venta ${venta.id}`)
      }
      return { numero: number, cufe, qrUrl: links.qr, urlPublica: links.public_url }
    },
    async descargarPdf(numero: string) {
      const respuesta = await pedirConToken<RespuestaPdf>(
        'GET',
        `/v2/bills/${encodeURIComponent(numero)}/download-pdf`,
      )
      // POR CONFIRMAR: la documentación no dice si el campo va en la raíz o dentro de data.
      const pdf = respuesta.data?.pdf_base_64_encoded ?? respuesta.pdf_base_64_encoded
      if (!pdf) throw new Error(`Factus no devolvió el PDF de la factura ${numero}`)
      return pdf
    },
    async enviarCorreo(numero: string, correo: string) {
      await pedirConToken('POST', `/v2/bills/${encodeURIComponent(numero)}/send-email`, {
        email: correo,
      })
    },
  }
}
