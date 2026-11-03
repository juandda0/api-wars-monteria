# Simulacro de 40 minutos

El objetivo es probar la forma de trabajar, no el producto. Se usa la idea del kiosco del congreso, contra mocks.

La base ya trae el flujo funcionando con mocks y una pantalla provisional. Cada rol reemplaza su parte.

| Minuto | Qué pasa |
|---|---|
| 0–5 | Clonar, `npm install`, `npm run dev`, y darle `AGENTS.md` al agente |
| 5–30 | Cada uno construye su parte y sube al menos 2 PRs pequeños |
| 30–35 | Integración revisa el flujo completo en `main` |
| 35–40 | Revisar qué falló y acordar máximo 3 cambios para mañana |

## Tareas

En el simulacro son tres, así que cada uno cubre más de un rol.

- **Juan Diego, Integración e Interfaz:** revisar conflictos y PRs de contratos, y evitar que una venta se facture dos veces. Refinar la UI y la UX en `web/src/App.tsx`: pedido, QR con espera de pago y factura lista, bien en celular.
- **Elias David, Facturación:** escribir `facturacion/cliente.ts` para Factus v2, implementando `ServicioFacturacion`, con pruebas que simulen `fetch`.
- **Eddy Lans, Cobros y pitch:** escribir `cobros/cliente.ts` para Factus Pay, implementando `ServicioCobros`, con pruebas que simulen `fetch`. Probar el flujo en local y escribir en `pitch/` un guion de 2 minutos.

## Qué observar

- ¿Los PRs entran solos cuando las pruebas pasan? ¿Cuánto tardan?
- ¿Cada agente corrige sus pruebas fallidas sin ayuda?
- ¿Alguien tocó una carpeta ajena o hubo conflictos?
- ¿Los contratos alcanzaron, o hubo que preguntar todo el tiempo?

## Fuera del simulacro

Render, el sandbox real y el video no se prueban aquí. Hay que probarlos antes del reto.
