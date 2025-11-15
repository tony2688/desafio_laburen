## Alcance
- Subir el código actual al repositorio `tony2688/desafio_laburen` sin añadir archivos innecesarios.
- Preferir un branch dedicado para revisión y abrir PR hacia `main`.

## Pasos
1. Verificar existencia del repo y permisos de escritura.
2. Preparar lote de archivos a subir (todo el contenido del proyecto actual):
   - `package.json`, `tsconfig.json`, `.env.example`
   - `prisma/schema.prisma`
   - `src/**` (API, servicios, agente, webhook, seed, prisma client)
   - Excluir `node_modules/` y `dist/`.
3. Crear branch `phase1-initial-skeleton` en GitHub y subir los archivos con un único commit:
   - Mensaje: `feat: Fase 1 – diseño y skeleton (API, Prisma, seed, agent)`.
4. Abrir Pull Request hacia `main` con descripción breve:
   - Resumen de componentes (Prisma, endpoints, webhook, herramientas del agente).
   - Instrucciones mínimas de ejecución (usar `.env.example`, migrar y seed).

## Consideraciones
- No subir secretos: `.env.example` sin valores reales.
- Mantener estructura tal cual en el workspace; no agregar documentación adicional.
- Si el repo no existe o no hay permisos, reportar y ofrecer alternativa (crear repo o cambiar destino).

## Resultado esperado
- Branch `phase1-initial-skeleton` con todo el código.
- PR abierto listo para revisión y merge a `main`. 