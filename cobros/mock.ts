import type { Cobro, ServicioCobros } from '../contratos/tipos'

// Cuadro gris de 1 px: reemplaza al QR real en desarrollo.
const QR_FALSO =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** Simula Factus Pay: el cobro nace `ready` y pasa a `paid` tras varias consultas. */
export function crearCobrosMock(consultasHastaPagar = 3): ServicioCobros {
  const cobros = new Map<string, Cobro & { consultas: number }>()

  return {
    async crearCobro(referencia, monto) {
      const cobro = { referencia, monto, estado: 'ready' as const, qrBase64: QR_FALSO, consultas: 0 }
      cobros.set(referencia, cobro)
      return { referencia, monto, estado: cobro.estado, qrBase64: cobro.qrBase64 }
    },
    async consultarCobro(referencia) {
      const cobro = cobros.get(referencia)
      if (!cobro) throw new Error(`Cobro ${referencia} no existe`)
      cobro.consultas += 1
      const estado = cobro.consultas >= consultasHastaPagar ? 'paid' : 'ready'
      return { referencia, monto: cobro.monto, estado, qrBase64: cobro.qrBase64 }
    },
  }
}

export const roto: number = "texto"
