# Guion — Kiosco del congreso

**Duración objetivo:** 2 minutos, incluidas las acciones en pantalla. Ensayar con cronómetro.
**Estado:** borrador para revisión de Eddy Lans antes de presentarlo o enviarlo al evento.

## Preparación (no se lee)

- Ejecutar la app con los mocks por defecto y abrir el kiosco. Si el watcher de la API no inicia en Windows, el mismo servidor se puede levantar con `npm start`.
- Usar datos ficticios: Ana Demo, documento 123, ana@ejemplo.invalid. No usar datos de un asistente real.
- Mostrar la interfaz a 375 px; iniciar con cantidades en cero.
- El QR gris, los enlaces ejemplo.invalid y el correo simulado son intencionales. No escanear el QR ni prometer un correo recibido o una factura fiscal real.

## 0:00–0:20 · Problema

[Mostrar el pedido vacío.]

> Soy Eddy Lans. Imaginen la pausa de un congreso: alguien quiere comprar algo, saber cuánto cuesta y dejar sus datos para la factura. Nuestro caso de uso es reunir esos pasos en un kiosco que se pueda usar desde el celular.

## 0:20–0:35 · Solución

[Señalar los pasos Pedido, Pago y Factura.]

> La app organiza el recorrido en tres pantallas: elegir el pedido, esperar la confirmación del pago y consultar la factura. Hoy mostramos ese recorrido con los mocks del proyecto; los cobros y documentos son simulados.

## 0:35–1:05 · Demo: pedido

[Seleccionar un combo. Completar los tres campos con los datos ficticios.]

> Voy a elegir un combo del congreso. El total queda en diecisiete mil ochocientos cincuenta pesos, con IVA incluido. El pedido mínimo es de diez mil pesos: con el carrito vacío, el botón estaba deshabilitado. Ahora completo nombre, documento y correo, y continúo al pago.

[Pulsar Continuar al pago una sola vez.]

## 1:05–1:35 · Demo: pago y factura

[Mostrar la espera. El mock confirma el pago tras varias consultas; no se escanea el QR.]

> Aquí aparece el QR que devuelve el API. Este cuadro gris es el QR del mock. La pantalla consulta el estado automáticamente. Si la consulta falla, ofrece reintentar sobre la misma venta. Esperamos unos segundos hasta que la simulación confirme el pago y muestre la factura.

[Señalar número, CUFE y enlace solo cuando la factura esté visible.]

## 1:35–2:00 · Cierre

> Ya vemos el número, el CUFE, el enlace y el aviso de envío al correo. En este mock, el enlace es de ejemplo y no se envía un correo real. Esta demo muestra el recorrido completo del kiosco, con estados claros y una interfaz para celular. Ese es nuestro punto de partida para la integración real del equipo.

## Si algo falla (no se lee como parte del guion normal)

Mostrar el mensaje real y la opción de reintento. Si no aparece la factura, decir: «La demo se detuvo en este estado; aquí podemos reintentar la consulta». No afirmar que hubo factura ni sustituirla por un resultado inventado.

## Límites para la revisión de Eddy (no se leen)

- No anunciar descarga de PDF: el contrato de la interfaz no tiene ese endpoint.
- No afirmar validación fiscal, pago real, recepción del correo ni ahorro de tiempo medido.
- Si un pago figura registrado y falla la factura, la UI pide ayuda con la referencia. No hay endpoint de reemisión y no se debe provocar otro cobro.
- Comprobación realizada: pedido → QR gris → factura automática en navegador a 375 px; número, CUFE y enlaces del mock visibles. Evidencia y más detalles en `web/VERIFICACION.md`.
