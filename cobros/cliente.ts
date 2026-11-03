import type { Cobro, EstadoCobro, ServicioCobros } from '../contratos/tipos'

export interface ConfigFactusPay {
  /** Base de la API, p. ej. https://pay-api-sandbox.factus.com.co */
  url: string
  /** Token de POST /auth. No vence; llega por configuración, aquí no se hace login. */
  token: string
  /** Sin User-Agent propio, Cloudflare responde 403. */
  userAgent: string
}

/**
 * Lo que devuelve Factus Pay para un cobro.
 * Confirmados en AGENTS.md: `reference_code`, `amount` (en la petición), `status` y `qr`.
 * SIN CONFIRMAR en la documentación oficial: que la respuesta traiga los campos en la raíz
 * (y no dentro de un sobre como `data`) y que repita `reference_code` y `amount`.
 */
interface RespuestaCobro {
  reference_code?: string
  amount?: number
  status?: unknown
  qr?: unknown
}

const ESTADOS: readonly EstadoCobro[] = ['started', 'ready', 'paid', 'failed', 'rejected']

/** Error de Factus Pay con el código HTTP, si lo hubo. */
export class ErrorFactusPay extends Error {
  constructor(
    mensaje: string,
    readonly status?: number,
  ) {
    super(mensaje)
    this.name = 'ErrorFactusPay'
  }
}

/** Deja solo el base64: quita un prefijo `data:image/png;base64,` si la API lo agrega. */
export function normalizarQr(qr: unknown): string | null {
  if (typeof qr !== 'string') return null
  const base64 = qr.trim().replace(/^data:[^,]*;base64,/i, '')
  return base64 === '' ? null : base64
}

function aEstado(status: unknown, referencia: string): EstadoCobro {
  if (ESTADOS.includes(status as EstadoCobro)) return status as EstadoCobro
  throw new ErrorFactusPay(
    `Factus Pay devolvió un estado desconocido para el cobro ${referencia}: ${JSON.stringify(status)}. ` +
      `Se esperaba uno de: ${ESTADOS.join(', ')}`,
  )
}

/** Cliente real de Factus Pay. Las consultas periódicas las hace flujo/flujo.ts. */
export function crearCobrosFactusPay(config: ConfigFactusPay): ServicioCobros {
  const base = config.url.replace(/\/+$/, '')
  // Montos de los cobros creados por este cliente, por si la consulta no trae `amount`.
  const montos = new Map<string, number>()

  async function pedir(ruta: string, init: RequestInit = {}): Promise<RespuestaCobro> {
    const metodo = init.method ?? 'GET'
    let respuesta: Response
    try {
      respuesta = await fetch(`${base}${ruta}`, {
        ...init,
        headers: {
          // SIN CONFIRMAR: esquema `Bearer` para el token de Factus Pay.
          Authorization: `Bearer ${config.token}`,
          'User-Agent': config.userAgent,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      })
    } catch (error) {
      const causa = error instanceof Error ? error.message : String(error)
      throw new ErrorFactusPay(`No se pudo conectar con Factus Pay (${metodo} ${ruta}): ${causa}`)
    }

    const texto = await respuesta.text()
    if (!respuesta.ok) {
      // El formato del cuerpo de error no está confirmado: se muestra tal cual, recortado.
      const detalle = texto.trim().slice(0, 300) || respuesta.statusText
      throw new ErrorFactusPay(
        `Factus Pay respondió ${respuesta.status} en ${metodo} ${ruta}: ${detalle}`,
        respuesta.status,
      )
    }
    let cuerpo: unknown
    try {
      cuerpo = JSON.parse(texto)
    } catch {
      cuerpo = undefined
    }
    if (typeof cuerpo !== 'object' || cuerpo === null) {
      throw new ErrorFactusPay(
        `Factus Pay respondió ${respuesta.status} en ${metodo} ${ruta} sin un objeto JSON`,
        respuesta.status,
      )
    }
    return cuerpo as RespuestaCobro
  }

  function aCobro(cuerpo: RespuestaCobro, referencia: string): Cobro {
    return {
      referencia: cuerpo.reference_code ?? referencia,
      monto: typeof cuerpo.amount === 'number' ? cuerpo.amount : (montos.get(referencia) ?? 0),
      estado: aEstado(cuerpo.status, referencia),
      qrBase64: normalizarQr(cuerpo.qr),
    }
  }

  return {
    async crearCobro(referencia, monto) {
      // La documentación dice 201 con `started` y `qr: null`; en pruebas respondió 200 con `ready` y QR.
      const cuerpo = await pedir('/v1/collections', {
        method: 'POST',
        body: JSON.stringify({ reference_code: referencia, amount: monto }),
      })
      montos.set(referencia, monto)
      return aCobro(cuerpo, referencia)
    },
    async consultarCobro(referencia) {
      const cuerpo = await pedir(`/v1/collections/${encodeURIComponent(referencia)}`)
      return aCobro(cuerpo, referencia)
    },
  }
}
