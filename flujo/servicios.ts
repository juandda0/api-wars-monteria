import { crearCobrosFactusPay } from '../cobros/cliente'
import { crearCobrosMock } from '../cobros/mock'
import type { ServicioCobros, ServicioFacturacion } from '../contratos/tipos'
import { crearFacturacionFactus } from '../facturacion/cliente'
import { crearFacturacionMock } from '../facturacion/mock'

type Entorno = Record<string, string | undefined>

const USER_AGENT = 'api-wars-monteria'
const FACTUS_URL = 'https://api-sandbox.factus.com.co'
const FACTUS_PAY_URL = 'https://pay-api-sandbox.factus.com.co'

const CREDENCIALES_FACTUS = ['FACTUS_CLIENT_ID', 'FACTUS_CLIENT_SECRET', 'FACTUS_USUARIO', 'FACTUS_CLAVE']
const CREDENCIALES_FACTUS_PAY = ['FACTUS_PAY_TOKEN']

const tieneValor = (entorno: Entorno, nombre: string) => Boolean(entorno[nombre]?.trim())

/** Dice si están todas las credenciales y avisa si solo están algunas: es casi siempre un error. */
function hayCredenciales(entorno: Entorno, servicio: string, nombres: string[]) {
  const faltan = nombres.filter((nombre) => !tieneValor(entorno, nombre))
  if (faltan.length > 0 && faltan.length < nombres.length) {
    console.warn(`${servicio}: se usa el mock porque faltan ${faltan.join(', ')}`)
  }
  return faltan.length === 0
}

/** Usa cada cliente real solo si están sus credenciales; si no, su mock. */
export function crearServicios(entorno: Entorno = process.env): {
  cobros: ServicioCobros
  facturacion: ServicioFacturacion
  modos: { cobros: 'real' | 'mock'; facturacion: 'real' | 'mock' }
} {
  const userAgent = entorno.USER_AGENT?.trim() || USER_AGENT
  const facturacionReal = hayCredenciales(entorno, 'Factus', CREDENCIALES_FACTUS)
  const cobrosReales = hayCredenciales(entorno, 'Factus Pay', CREDENCIALES_FACTUS_PAY)

  return {
    cobros: cobrosReales
      ? crearCobrosFactusPay({
          url: entorno.FACTUS_PAY_URL?.trim() || FACTUS_PAY_URL,
          token: entorno.FACTUS_PAY_TOKEN!.trim(),
          userAgent,
        })
      : crearCobrosMock(),
    facturacion: facturacionReal
      ? crearFacturacionFactus({
          url: entorno.FACTUS_URL?.trim() || FACTUS_URL,
          clientId: entorno.FACTUS_CLIENT_ID!.trim(),
          clientSecret: entorno.FACTUS_CLIENT_SECRET!.trim(),
          usuario: entorno.FACTUS_USUARIO!.trim(),
          clave: entorno.FACTUS_CLAVE!.trim(),
          userAgent,
        })
      : crearFacturacionMock(),
    modos: {
      cobros: cobrosReales ? 'real' : 'mock',
      facturacion: facturacionReal ? 'real' : 'mock',
    },
  }
}
