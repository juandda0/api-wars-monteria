import type { Comprador, LineaVenta, NuevaVenta, Venta } from '../../contratos/tipos'

// Catálogo local de la demo: el contrato no ofrece un endpoint de productos.
export const productos = [
  { descripcion: 'Combo del congreso', precioSinIva: 15000, ivaPorcentaje: 19 },
  { descripcion: 'Sándwich', precioSinIva: 9000, ivaPorcentaje: 19 },
  { descripcion: 'Café', precioSinIva: 4000, ivaPorcentaje: 19 },
] satisfies Omit<LineaVenta, 'cantidad'>[]

export function crearPedido(comprador: Comprador, cantidades: number[]): NuevaVenta {
  return {
    comprador: {
      nombre: comprador.nombre.trim(),
      documento: comprador.documento.trim(),
      correo: comprador.correo.trim(),
    },
    lineas: productos.flatMap((producto, indice) => {
      const cantidad = cantidades[indice] ?? 0
      return Number.isInteger(cantidad) && cantidad > 0 ? [{ ...producto, cantidad }] : []
    }),
  }
}

export function calcularTotal(lineas: LineaVenta[]) {
  return Math.round(lineas.reduce((suma, linea) =>
    suma + linea.cantidad * linea.precioSinIva * (1 + linea.ivaPorcentaje / 100), 0))
}

export const pesos = (valor: number) => `${valor.toLocaleString('es-CO')} COP`

export async function enviarPedido(pedido: NuevaVenta): Promise<Venta> {
  const respuesta = await fetch('/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  })
  if (respuesta.status === 422) {
    throw new Error('El API rechazó el pedido. Revisa tus datos y el total (10.000 a 12.000.000 COP) e intenta de nuevo.')
  }
  if (!respuesta.ok) throw new Error('No pudimos crear el pedido. Intenta de nuevo.')
  return respuesta.json() as Promise<Venta>
}
