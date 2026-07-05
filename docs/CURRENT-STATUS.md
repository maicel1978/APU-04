# APU-04 — Estado actual (rediseño en curso)

Metodología: PRISMA+ v5.2-Lite (context-safe), ver acuerdo con el usuario.
Última actualización: bloque "Cierre" COMPLETADO — proyecto entregado.
189/189 tests reales pasando (`npm test`), incluida auditoría estática.

## Progreso por bloque (todos completados)

- [x] Descubrimiento + Viabilidad — decisiones registradas en `docs/DECISIONS.md`.
- [x] Estructura + Contratos — `docs/CONTRACTS.md` reescrito (entrada v3.0.0 real
      de APU-03, salida v4.0.0), árbol de archivos objetivo definido abajo.
- [x] Core (lógica pura): reescritos `ingest-adapter.js`, `schema-validator.js`,
      `version-guard.js`, `clean-pipeline.js`, `derived-views.js`,
      `ner-patterns-loader.js`, `pii-relational-engine.js` (nuevo),
      `batch-controller.js` (nuevo), `assets/data/ner-patterns.json`,
      `src/utils/download.js` (nombre de archivo), `src/workers/clean-pipeline.worker.js`
      (nerOptInActive). Tests actualizados/reescritos y en verde: schema,
      pipeline, glossary-ner, derived-views, review-session, version-guard,
      ner-patterns-loader, worker, download. Fixtures nuevos:
      `caso-001-speakers-v3.json` (formato real APU-03), `caso-001-canonico.json`
      (post-adaptador).
- [x] UI: nuevos `src/core/dialogue-filters.js` (lógica pura de filtrado),
      `src/ui/pii-settings-form.js` (reemplaza `pii-list-form.js`, toggle
      opt-in Regla 3), `src/ui/dashboard-view.js` (APU-04D, Regla 2),
      `src/ui/dialogue-view.js` (guion continuo + atajos Alt+A/E/F, Ctrl+Enter,
      búsqueda con foco preservado, Regla 4), `src/ui/export-screen.js`
      (reescrito, paquete de 4 archivos `[base]_[stage].[ext]` + pii-buffer
      opcional), `src/ui/app.js` (reescrito, orquesta batch completo).
      Eliminados: `covariates-form.js`, `pii-list-form.js`, `review-screen.js`
      (formulario fijo prohibido por Regla 1 y pantallas reemplazadas).
      `main.js`/`index.html`/`review-view.js`/`worker-client.js`/`dom-helpers.js`
      sin cambios. CSS ampliado con estilos de diálogo/toolbar/dashboard.
      Tests jsdom nuevos: `apu04-dialogue-filters.test.mjs` (puro),
      `apu04-pii-settings-form.dom.test.mjs`, `apu04-dashboard-view.dom.test.mjs`,
      `apu04-export-screen.dom.test.mjs` (reescrito), `apu04-dialogue-view.dom.test.mjs`
      (incluye verificación real de preservación de foco en búsqueda y atajos
      de teclado), `apu04-app.dom.test.mjs` (reescrito, flujo batch completo
      con Worker simulado).
- [x] Cierre: pruebas de estrés añadidas (`apu04-stress.test.mjs`: 500
      segmentos, texto vacío, duration<=0, covariables ausentes, covariables
      con comas/comillas en CSV, lote heterogéneo de 3 archivos), más
      cobertura unitaria de `batch-controller.js` y `pii-relational-engine.js`
      en aislamiento (antes solo probados indirectamente vía clean-pipeline).
      Generados `docs/AGENT-GUIDE.md` (con sección "Si vas a construir
      APU-05, lee esto primero"), `docs/MANUAL-USUARIO.md` (guía no técnica
      en español) y `CHANGELOG.md`. `README.md` actualizado al v2. Suite
      final: 189/189 tests.

## Cómo usar el puente hacia APU-05

Cuando comiences una sesión nueva de agente para construir APU-05, basta con
decirle: "lee `APU-04/docs/AGENT-GUIDE.md` (sección APU-05) y
`APU-04/docs/CONTRACTS.md`" — ahí está todo el contrato de datos que va a
consumir, sin necesidad de re-explicar el contexto de este proyecto.

## Incidente registrado (corregido)

Durante este bloque, varias escrituras con rutas absolutas crearon una
jerarquía duplicada (`/home/user/home/user/...`) que luego se limpió con
`rm -rf home`, borrando por error las reescrituras ya hechas de varios
archivos core (quedó la versión v1 vieja en su lugar). Se detectó al correr
`npm test` (fallos con mensajes de contrato v1, p. ej. "Falta studyId") y se
corrigió reescribiendo todos los archivos afectados con rutas relativas.
Lección aplicada: usar siempre rutas relativas al workspace en `write_file`/
`edit_file` de aquí en adelante, y confirmar con `npm test` real tras cada
lote de cambios, no asumir que una escritura previa persiste.

## Punto de partida

Repositorio real clonado de `github.com/maicel1978/APU-04` (146/146 tests
pasaban en la base original). Se reutiliza intacta la fontanería de bajo
nivel: `text-diff.js`, `glossary-engine.js`, `ner-engine.js`, `word-diff.js`,
`hash.js`, `text-list.js`, `session-store.js`, `review-view.js`, patrón de
Worker inline vía Blob (`worker-client.js`), arnés de pruebas `node:test` +
`jsdom`.

## Árbol de archivos objetivo (planificado)

```
src/core/
  ingest-adapter.js         REESCRITO — lee speakers.json real v3.0.0 (speakers[],
                             covariateProject, covariateSchema), sin formulario fijo.
  schema-validator.js       REESCRITO — sin claves de covariates fijas.
  pii-relational-engine.js  NUEVO — envuelve ner-engine.js, indexa entidades
                             ([PERSONA_1], [HOSPITAL_1]...), opt-in.
  clean-pipeline.js         REESCRITO — passthrough de speakers/covariateProject/
                             covariateSchema, NER condicional a nerOptInActive.
  derived-views.js          REESCRITO — CSV con columnas dinámicas de covariables,
                             quality_report con métricas de la Regla 2.
  batch-controller.js       NUEVO — deriva nombre base por archivo, agrega
                             métricas de dashboard entre archivos del lote.
  version-guard.js          REESCRITO — separa versión de entrada (3.0.0/APU-03)
                             y de salida (4.0.0/APU-04).
  ner-engine.js             SIN CAMBIOS (motor base de reglas+listas).
  ner-patterns-loader.js    REESCRITO — listas manuales explícitas (nombres,
                             hospitales, direcciones); ya no depende de
                             "covariates.site" (esa clave fija ya no existe).
  glossary-engine.js        SIN CAMBIOS.
  telemetry.js              SIN CAMBIOS (fórmulas iguales).
  session-store.js          SIN CAMBIOS (ya soporta múltiples sesiones por sessionId).

src/ui/  (pendiente, próximo bloque)
  app.js                    A REESCRIBIR — orquesta ingestión (single/batch) →
                             dashboard → diálogo continuo → exportación.
  covariates-form.js        A ELIMINAR (formulario fijo prohibido por Regla 1).
  pii-list-form.js          A RENOMBRAR → pii-settings-form.js (toggle opt-in +
                             listas manuales de nombres/hospitales/direcciones).
  review-screen.js          A ELIMINAR (reemplazado por dialogue-view.js).
  review-view.js            SIN CAMBIOS (lógica pura, reutilizable tal cual).
  dashboard-view.js         NUEVO — APU-04D: métricas por archivo y por lote.
  dialogue-view.js          NUEVO — vista de guion/chat continuo, filtros,
                             búsqueda instantánea, atajos de teclado.
  export-screen.js          A MODIFICAR — exporta el paquete de 4 archivos por
                             cada caso del lote (+ pii-buffer si aplica).
  worker-client.js          SIN CAMBIOS.
  dom-helpers.js            SIN CAMBIOS.

src/workers/
  clean-pipeline.worker.js  MODIFICADO — contrato de mensaje agrega nerOptInActive (hecho).

src/utils/
  download.js               MODIFICADO — buildFileName usa `[base]_[stage].[ext]` (hecho).
```

## Cómo retomar si se pierde contexto

1. Releer este archivo y `docs/CONTRACTS.md` (fuente de verdad del formato).
2. Releer `docs/DECISIONS.md` antes de tocar cualquier archivo marcado
   "no negociable" o con nota de migración.
3. Correr `npm test` para confirmar el estado real (no asumir por este
   documento qué está implementado; verificar siempre con la suite real).
4. Usar SIEMPRE rutas relativas al workspace al escribir/editar archivos.
