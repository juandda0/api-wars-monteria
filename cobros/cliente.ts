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
  status: string
  qr: string | null
}

/** Cliente real de Factus Pay. Las consultas periódicas las hace flujo/flujo.ts. */
export function crearCobrosFactusPay(config: ConfigFactusPay): ServicioCobros {
  const base = config.url.replace(/\/+$/, '')
  // Montos de los cobros creados por este cliente, por si la consulta no trae `amount`.
  const montos = new Map<string, number>()

  async function pedir(ruta: string, init: RequestInit = {}): Promise<RespuestaCobro> {
    const respuesta = await fetch(`${base}${ruta}`, {
      ...init,
      headers: {
        // SIN CONFIRMAR: esquema `Bearer` para el token de Factus Pay.
        Authorization: `Bearer ${config.token}`,
        'User-Agent': config.userAgent,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    return (await respuesta.json()) as RespuestaCobro
  }

  function aCobro(cuerpo: RespuestaCobro, referencia: string): Cobro {
    return {
      referencia: cuerpo.reference_code ?? referencia,
      monto: typeof cuerpo.amount === 'number' ? cuerpo.amount : (montos.get(referencia) ?? 0),
      estado: cuerpo.status as EstadoCobro,
      qrBase64: cuerpo.qr ?? null,
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
