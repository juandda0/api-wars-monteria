# Verificación de interfaz

## Comprobación con mocks

- Viewport de 375 × 812 px: pedido, pago y factura sin desbordamiento horizontal, comprobado con medidas del DOM y capturas.
- Un combo cuesta 17.850 COP, con IVA del 19 %. Los campos conservan sus datos al volver desde la factura.
- El POST crea la venta; aparece el QR gris. Sin escanearlo, el mock confirma el pago y la interfaz muestra número, CUFE y enlaces de factura automáticamente.
- El foco vuelve al encabezado al cambiar de pantalla. Tab muestra el contorno visible del enlace de factura. Los campos tienen etiquetas, la espera usa role=status y los errores role=alert.
- Las pruebas cubren 422, errores HTTP/red, QR null, estados de venta, reintento de consulta, cancelación y consultas sin solapamiento.

En este entorno Windows, Vite se ejecutó desde npm run dev y la API se inició con npm start porque el proceso watch de la API no levantó. Se usó el mismo servidor y sus mocks, sin cambios de configuración.

## Límites para el equipo

- El catálogo es local y está rotulado como demostración: no hay endpoint de productos.
- El QR gris es deliberado. Los enlaces de factura del mock usan ejemplo.invalid y no abren una factura real.
- El correo del mock no envía mensajes. El contrato tampoco informa entrega del correo: se muestra un aviso de envío, no confirmación de recepción.
- No hay endpoint de descarga de PDF: no se inventa un botón ni una ruta.
- No hay endpoint para reemitir una factura fallida. Con pago registrado, se ofrece consultar de nuevo y pedir ayuda con la referencia; no se invita a crear otro cobro.
- No se probó aquí un cobro ni una factura real de Factus. Eso corresponde a la integración del equipo.
