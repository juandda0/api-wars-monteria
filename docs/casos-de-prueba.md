# Casos de prueba del flujo

Probado el 3 de noviembre de 2026 sobre `main` en `34be293`, con `npm run dev` y los mocks de cobros y facturación, que son los que conecta hoy `flujo/servidor.ts`.

Las peticiones se hicieron con `curl` a través del proxy de Vite (`http://localhost:5173/api/...`), el mismo camino que usa la interfaz. La interfaz no se probó en un navegador: se revisó que Vite la sirva (200) y se leyó el código de `web/src/App.tsx`. Los pasos de la sección [Pendiente en navegador](#pendiente-en-navegador) quedan por hacer a mano.

## Resultados

| # | Caso | Esperado | Resultado |
|---|---|---|---|
| 1 | Venta normal: 1 combo de 15.000 + 19 % de IVA | 201 con total 17.850 y cobro `ready` con QR; luego `facturada` con número y CUFE | ✅ Pasó a `facturada` (`SETP99000001`) en unos 9 s, con un intervalo de consulta de 3 s |
| 2 | Total de 9.999 COP | 422 | ✅ 422, "El total debe estar entre 10000 y 12000000 COP" |
| 3 | Total de 10.000 COP, en el límite | 201 | ✅ 201 |
| 4 | Total de 12.000.001 COP | 422 | ✅ 422 |
| 5 | Total de 12.000.000 COP, en el límite | 201 | ✅ 201 |
| 6 | Sin líneas (`lineas: []`) | 422 | ✅ 422 |
| 7 | Correo vacío | 422 | ✅ 422 |
| 8 | Sin comprador | 422 | ✅ 422 |
| 9 | Cuerpo `{}` | 422 | ✅ 422 |
| 10 | JSON inválido | 400 | ✅ 400, "El cuerpo no es JSON válido" |
| 11 | Cuerpo `null` | 400 | ✅ 400 |
| 12 | Consultar una venta que no existe | 404 | ✅ 404, "La venta no existe" |
| 13 | 5 ventas al mismo tiempo | Cada una facturada una sola vez, con número distinto | ✅ 5 `facturada` con números consecutivos y sin repetir |
| 14 | `lineas` como texto (`"hola"`) | 422 | ❌ **500**. Ver [E1](#e1-500-si-lineas-no-es-un-arreglo) |
| 15 | Una línea con `cantidad: -1` y otra con `cantidad: 2` | 422 | ❌ 201: la línea negativa resta del total. Ver [E2](#e2-la-api-acepta-datos-que-factus-v2-va-a-rechazar) |
| 16 | `cantidad: 1.5` | 422, o redondear | ❌ 201 con total 26.775. Ver E2 |
| 17 | `precioSinIva` como texto (`"15000"`) | 422 | ❌ 201. JavaScript convierte el texto en número y el texto llega así a facturación. Ver E2 |
| 18 | Nombre y documento vacíos | 422 | ❌ 201. Ver E2 |
| 19 | Correo mal formado (`no-es-correo`) | 422 | ❌ 201. Ver E2 |
| 20 | IVA negativo (`-50`) | 422 | ⚠️ Solo se rechaza si el total queda por debajo del mínimo. Ver E2 |

### Cliente de Factus Pay (`cobros/cliente.ts`)

Se cubre con pruebas unitarias en `cobros/cliente.test.ts`, que simulan `fetch` sin llamar al sandbox. Todas pasan en `npm run verificar`.

| Caso | Resultado |
|---|---|
| Creación con 200, `ready` y QR | ✅ |
| Creación con 201, `started` y `qr: null` | ✅ |
| Consultas sucesivas hasta `paid` | ✅ |
| QR con prefijo `data:image/png;base64,` | ✅ Queda solo el base64 |
| Los 5 estados conocidos | ✅ |
| Estado desconocido (`expired`) | ✅ `ErrorFactusPay` con el estado recibido |
| La API responde 422 | ✅ `ErrorFactusPay` con `status: 422` y el cuerpo |
| Respuesta que no es JSON | ✅ Error claro |
| Fallo de red | ✅ Error claro |
| Token y `User-Agent` en todas las llamadas | ✅ |

Sin probar: el cliente contra el sandbox real. Falta confirmar el esquema `Authorization: Bearer` y que los campos de la respuesta vengan en la raíz. Ambos están marcados como `SIN CONFIRMAR` en el código.

## Errores encontrados

Cada uno indica la carpeta responsable. No se corrigió ninguno fuera de `cobros/`.

### E1. 500 si `lineas` no es un arreglo

**Carpeta:** `flujo/` (Integración). **Gravedad:** media.

`POST /api/ventas` con `"lineas": "hola"` responde `500 Internal Server Error`. En el log aparece `TypeError: nueva.lineas.reduce is not a function` en `flujo/flujo.ts:92`. La validación usa `nueva.lineas?.length`, que también es verdadero para un texto. Debería responder 422, y para eso basta con `Array.isArray(nueva.lineas)`.

### E2. La API acepta datos que Factus v2 va a rechazar

**Carpeta:** `flujo/` (Integración). **Gravedad:** alta con el sandbox real.

Hoy `crearVenta` solo revisa que haya correo, que haya líneas y el rango del total. Acepta:

- cantidades negativas, que restan del total, y cantidades con decimales;
- precios e IVA como texto o negativos;
- nombre y documento vacíos;
- un correo mal formado.

Con los mocks todo termina en `facturada`. Con Factus v2 real, el problema aparece **después de que el cliente pagó**: la venta llega a `emitirFactura` con datos inválidos y queda cobrada sin factura.

Sugerencia: validar cada línea (cantidad entera mayor que 0, precio numérico mayor que 0, IVA de 0 a 100) y el comprador antes de llamar a `crearCobro`. La interfaz ya limita las cantidades y exige nombre, documento y correo, pero la API no debe depender de eso.

### E3. La pantalla final no muestra el QR de la factura ni el PDF

**Carpeta:** `web/` (Interfaz). **Gravedad:** alta para la nota, porque el flujo pedido termina en "mostrar número, CUFE, QR y PDF".

Según el código, la pantalla de la venta facturada muestra el número y el CUFE, pero no el QR (`factura.qrUrl`), el enlace a `factura.urlPublica` ni el PDF. También muestra el estado tal como llega de la API (`esperando_pago`, `facturada`) en lugar de un texto para el cliente.

### E4. No hay un endpoint para el PDF

**Carpeta:** `contratos/` y `flujo/` (Integración). **Gravedad:** alta, por la misma razón que E3.

`ServicioFacturacion.descargarPdf` existe, pero ni `contratos/openapi.yaml` ni `flujo/app.ts` ofrecen una ruta para descargarlo. La interfaz no tiene cómo mostrar el PDF. Mientras tanto, puede enlazar `urlPublica`.

### E5. Las ventas se pierden si se reinicia la API

**Carpeta:** `flujo/` (Integración). **Gravedad:** baja en la demo, pero hay que saberlo.

Encontrado al leer el código: las ventas viven en un `Map` en memoria. Con `npm run dev`, `tsx watch` reinicia la API cada vez que se guarda un archivo. Si eso pasa durante una venta, la interfaz recibe 404 y se queda mostrando "No pudimos consultar el estado". Además, el cobro de Factus Pay sigue vivo y nadie lo factura.

### E6. Mientras el cobro está en `started`, la pantalla no muestra nada

**Carpeta:** `web/` (Interfaz). **Gravedad:** baja.

Si Factus Pay responde `started` con `qr: null`, como dice su documentación, la pantalla no muestra el QR ni un mensaje de "generando QR". Cuando una consulta trae el estado `ready`, el QR aparece solo. Basta con un texto de espera.

### Pendiente de conectar (no es un error)

`flujo/servidor.ts` sigue usando `crearCobrosMock()` y `crearFacturacionMock()`. Juan Diego va a conectar los clientes reales y la lectura de `.env`.

### Corrección sobre el PR #13

La descripción del PR #13 dice que `flujo.ts` marca la venta como fallida ante un fallo pasajero de consulta. Ya no es así: el PR #9 hizo que siga consultando dentro del límite.

## Pendiente en navegador

Estos pasos se hacen a mano en `http://localhost:5173` con `npm run dev`. Conviene hacerlos también en un celular o en la vista móvil.

1. Con un pedido por debajo de 10.000 COP, el botón "Continuar al pago" está desactivado.
2. Si falta nombre, documento o correo, el botón está desactivado.
3. Pedido de 1 combo: aparece el total de 17.850 COP y luego el QR, que en el mock es un cuadro gris de 1 px.
4. Sin hacer clic, en unos 9 s el estado pasa a `facturada` y aparecen el número y el CUFE.
5. Si se detiene la API durante la espera, aparece "No pudimos consultar el estado. Volveremos a intentar."; al volver a arrancarla, ver E5.
6. Doble clic rápido en "Continuar al pago": se crea una sola venta.
