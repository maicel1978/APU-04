# APU-04 — Decisiones de diseño no obvias

Cosas que un agente (humano o IA) podría "corregir" por error si no las
conociera. Si vas a tocar alguna de estas áreas, lee esto primero.

## Arquitectura, no negociable

- **100% navegador, sin backend, sin build step.** Vanilla JS ES2022+
  Modules. No agregar React/Vue/webpack/bundlers. Un único Web Worker
  (`src/workers/clean-pipeline.worker.js`) ejecuta el pipeline pesado.
- **No usar Presidio/BERT/SLM ni ningún NER estadístico.** El enmascarado de
  PII (`src/core/ner-engine.js`) es deliberadamente reglas + listas
  (regex + coincidencia exacta), no IA. Es una decisión de producto (auditable
  y determinista > cobertura automática), no una limitación temporal. La UI
  debe seguir declarando esto explícitamente al usuario.
- **Un caso/entrevista a la vez.** No hay cola de lotes ni comparación
  multi-caso en esta app. Si se necesita comparar varios `clean.json`, eso es
  responsabilidad de otra unidad del ecosistema, no de APU-04.
- **`originalText` es inmutable.** Se escribe una sola vez en
  `clean-pipeline.js` y nunca se reasigna en ningún otro archivo.
- **`cleanedText` se congela tras `auditLog.finalizedByHuman: true`.**
  `editSegment` (`src/ui/review-view.js`) debe seguir rechazando ediciones en
  ese estado. Hay test de regresión para esto; si lo ves fallar, es una señal
  de alarma real, no un test frágil.

## Por qué `clean.json` sí contiene PII real (esto es intencional)

`originalText` y el `before` de la primera entrada `modificationsLog`
(`type:"punctuation"`, que corre antes del enmascarado) conservan el texto
crudo, incluida PII real, como evidencia forense inmutable. Esto es
intencional: la regla de "nunca exponer PII real" aplica a `cleanedText`, a
las entradas `type:"ner"`, y a las vistas derivadas exportables — no a
`originalText`. Cualquier consumidor de `clean.json` debe leer únicamente
`cleanedText`. `edit-log.csv` (vista exportable) sí redacta ese texto crudo
con un marcador genérico, porque un CSV puede abrirse fuera del ecosistema.

## Por qué el Módulo A no restituye tildes ni agrega comas contextuales

`text-diff.js` solo hace: capitalizar inicio de segmento, colapsar espacios,
agregar punto final si falta. Deliberadamente **no** intenta arreglar
`rapida → rápida` ni insertar comas alrededor de vocativos
(`"...tiempo doctor" → "...tiempo, doctor."`). Ese tipo de corrección
requiere una lista de excepciones ad hoc que no es generalizable de forma
determinista. Si el fixture antiguo de referencia
(`tests/fixtures/apu04/caso-001-clean-esperado.json`) muestra esas
correcciones, es una discrepancia conocida del fixture, no un bug del código.

## Por qué "revisado" no es un campo nuevo en el esquema

Un segmento se considera revisado si tiene al menos una entrada
`type:"human"` en `modificationsLog` (incluso una confirmación sin cambios,
donde `before === after`). No se agregó un campo `reviewed` para no romper
el contrato de datos ya cerrado. Ver `isSegmentReviewed`/`canFinalize` en
`src/ui/review-view.js`.

## Reglas de estilo de código (por qué el código se ve así)

- Archivos `.js` con cabecera de comentario al inicio citando qué implementan.
  Es documentación útil, consérvala al editar.
- Límite práctico de ~300-350 líneas por archivo; si un módulo crece más,
  divídelo por responsabilidad en vez de alargarlo.
- Interfaz de usuario en español (decisión de producto: usuarios finales son
  investigadores clínicos/cualitativos hispanohablantes).
- El único uso permitido de `fetch()` en `src/` es en
  `clean-pipeline.worker.js`, para leer su propio código fuente (patrón
  Inline Worker vía Blob). La auditoría estática (`tests/apu04-static-audit.mjs`)
  falla si aparece `fetch`/`XMLHttpRequest`/`WebSocket` en cualquier otro
  archivo de `src/`.
- `ingest-adapter.js` es el único archivo autorizado a usar la clave `id`
  (formato de la unidad anterior). Todo lo demás usa `segmentId`. También
  verificado por auditoría estática.

## Por qué index.html tiene un script clásico embebido

Si se abre `index.html` con doble clic (protocolo `file://`), el navegador
bloquea la carga de `src/main.js` (módulo ES) por política CORS, y sin
ningún aviso la página queda en blanco. El script clásico embebido en
`index.html` (no es un módulo, así que siempre se ejecuta) detecta ese caso
y muestra instrucciones; además sirve de reserva genérica si `initApp` falla
por cualquier otro motivo (p. ej. `localStorage` no disponible). Ver
`window.__apu04Boot` en `index.html` y su uso en `src/main.js`.

## Historial: por qué hay dos capas de resaltado de diff

`buildChangeHighlight` (`src/ui/review-view.js`) compara por conjunto de
palabras y puede sugerir visualmente que se perdió texto cuando no es así.
En vez de tocar esa función (ya probada, usada en otros contextos),
`computeWordDiff` (`src/utils/word-diff.js`) calcula un diff posicional real
(LCS) y es lo que usa la pantalla de revisión para pintar el resaltado. Si
necesitas comparar textos en un contexto nuevo, usa `computeWordDiff`, no
`buildChangeHighlight`.
