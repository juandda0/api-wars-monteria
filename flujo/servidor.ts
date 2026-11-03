import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { crearCobrosMock } from '../cobros/mock'
import { crearFacturacionMock } from '../facturacion/mock'
import { crearApp } from './app'
import { crearFlujo } from './flujo'

// Cuando existan los clientes reales, se cambian aquí.
const flujo = crearFlujo({ cobros: crearCobrosMock(), facturacion: crearFacturacionMock() })

const app = crearApp(flujo)
app.use('/*', serveStatic({ root: './web/dist' }))

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`API en http://localhost:${port}`))
