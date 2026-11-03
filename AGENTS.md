# Instrucciones para los agentes

Hackatón API WARS. La app tiene que usar Factus v2 y Factus Pay en un solo flujo automático:

`pedido → cobro con QR → consultar hasta paid → emitir factura → mostrar número, CUFE, QR y PDF`

La nota pesa así: integración de APIs 25 %, funcionamiento 25 %, calidad del código 15 %, innovación 15 %, experiencia de usuario 10 % y presentación 10 %.

## Stack

Node 22 y TypeScript en todo. API con Hono, interfaz con React y Vite, pruebas con Vitest.

- `npm run dev`: API en el puerto 8787 e interfaz con Vite.
- `npm run verificar`: tipos, pruebas y build. Es lo mismo que corre CI.

## Carpetas

Edita solo la carpeta de tu rol.

| Rol | Carpeta |
|---|---|
| Integración | `contratos/`, `flujo/`, `.github/`, dependencias y configuración |
| Facturación | `facturacion/` |
| Cobros | `cobros/` |
| Interfaz | `web/` |
| Producto y pitch | `docs/`, `pitch/` |

Los contratos están en `contratos/tipos.ts` y `contratos/openapi.yaml`. No los rompas ni los rodees: si necesitas un cambio o una dependencia nueva, abre un PR pequeño solo con eso. CI lo va a marcar como fallido a propósito: no intentes corregirlo, avísale a Integración, que lo revisa y lo fusiona con `gh pr merge --admin --squash`.

## Cómo entregar

Un PR pequeño cada 30–45 minutos. Nada de PRs grandes al final.

```bash
git switch main && git pull
git switch -c <rol>/<tema>
npm run verificar
git push -u origin HEAD
gh pr create --fill
gh pr merge --auto --squash
```

Si las pruebas pasan, el PR entra solo a `main`. Si fallan, corrige en la misma rama. Todo código nuevo lleva su prueba.

## Reglas

- Usa los mocks por defecto. Factus v2 permite 80 llamadas por minuto para todo el equipo; el sandbox real es solo para probar el flujo completo.
- Nada de credenciales en el repo. Van en `.env`, que está en `.gitignore`.
- Toda llamada a Factus lleva `User-Agent` propio; sin él, Cloudflare responde 403.

## Factus v2 (`https://api-sandbox.factus.com.co`)

- `POST /oauth/token` con datos de formulario, no JSON. El token dura 1 hora y se renueva con `grant_type=refresh_token`.
- `GET /v2/numbering-ranges`.
- `POST /v2/bills/validate`. El precio va sin IVA y los impuestos en `taxes[]`. Los pagos van en `payment_details[]`. La respuesta trae `cufe`, `number`, `links.qr` y `links.public_url`.
- `GET /v2/bills/:number/download-pdf`. El PDF llega en base64 en `pdf_base_64_encoded`.
- `POST /v2/bills/:number/send-email`.

## Factus Pay (`https://pay-api-sandbox.factus.com.co`)

- `POST /auth` con correo y contraseña. El token no vence y solo hay 5 intentos por minuto: usen uno solo para todo el equipo.
- `POST /v1/collections` con `reference_code` (único, máximo 100 caracteres) y `amount` (10.000 a 12.000.000 COP). El QR es un PNG en base64. En pruebas respondió 200 con `ready` y el QR al instante, aunque la documentación dice 201 con `started` y `qr: null`: maneja ambos casos.
- `GET /v1/collections/{reference_code}` y `GET /v1/collections`. Estados: `started`, `ready`, `paid`, `failed`, `rejected`. Límite de 80 llamadas por minuto.
- No hay webhook: hay que consultar el estado.
