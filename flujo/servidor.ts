import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { crearApp } from './app'
import { crearFlujo } from './flujo'
import { crearServicios } from './servicios'

// tsx no carga .env por su cuenta. Lo que ya esté en el entorno tiene prioridad.
if (existsSync('.env')) process.loadEnvFile()

const { cobros, facturacion, modos } = crearServicios()
console.log(`Cobros: ${modos.cobros}. Facturación: ${modos.facturacion}.`)

const app = crearApp(crearFlujo({ cobros, facturacion }))
app.use('/*', serveStatic({ root: './web/dist' }))

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`API en http://localhost:${port}`))
