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

## Migración v1 → v2 (rediseño para interoperabilidad APU-03/APU-05)

Decisiones tomadas con autorización explícita del usuario para romper reglas
previamente marcadas "no negociables" en este mismo archivo. Motivo raíz: el
contrato v1 fue diseñado contra un `speakers.json` hipotético/simplificado
que no coincide con el real de `github.com/maicel1978/APU-3` (que trae
`speakers[]`, `covariateProject`, `covariateSchema`).

- **Se elimina el formulario fijo de covariables** (`covariates-form.js`,
  claves `caseId/group/moment/sex/age/site/diagnosis`) y su validación
  correspondiente en `schema-validator.js`. Razón: viola el agnosticismo de
  covariables exigido; las covariables reales viven en
  `speakers[].covariates`, definidas por VarOps, con claves arbitrarias.
- **Se abandona "un caso a la vez".** Se añade `batch-controller.js` para
  procesar N archivos `speakers.json`, cada uno generando su propio paquete
  de 4 archivos. El pipeline por caso (`clean-pipeline.js`) no cambia su
  contrato interno: el batch lo invoca una vez por archivo.
- **`schemaVersion` de salida sube de `1.0.0` a `4.0.0`** y cambia de forma
  (incluye `speakers[]`, `covariateProject`, `covariateSchema` en vez de
  `studyId`/`covariates` fijos). `version-guard.js` pasa a distinguir
  explícitamente la versión de entrada (`3.0.0`, declarada por APU-03) de la
  de salida (`4.0.0`, declarada por APU-04): son números independientes que
  nunca deben compararse entre sí.
- **NER pasa de OFF implícito (por ausencia de UI clara) a OFF explícito por
  defecto con toggle visible**, y el placeholder deja de ser genérico
  (`[NOMBRE]`) para ser relacional indexado (`[PERSONA_1]`, `[HOSPITAL_A]`).
  Se mantiene intacta la decisión de fondo "reglas + listas, nunca NER
  estadístico" (ver más abajo) — solo cambia el default y el formato del
  placeholder.
- **No se mantiene compatibilidad con el formato de entrada viejo**
  (`{segments:[{id,...}]}` plano, sin `speakers[]`). Fue una decisión
  explícita del usuario para no duplicar lógica de ingestión sin un
  consumidor real de ese formato.

Todo lo NO listado aquí (Worker único, `originalText` inmutable,
`cleanedText` se congela al finalizar, reglas+listas para PII, límite de
~300-350 líneas por archivo, español en la UI, único uso de `fetch()` en el
Worker) sigue vigente sin cambios.

### Aclaración: covariables passthrough vs. garantía "sin PII real" del texto

Las columnas dinámicas `cv_*` de `[base]_cleaned.csv` (docs/CONTRACTS.md §5)
son covariables estructuradas que el investigador ya declaró explícitamente
en `speakers[].covariates` (Regla 1, passthrough agnóstico): **no pasan por
el motor de NER** y no están sujetas a la garantía de "sin PII real" que sí
aplica a `cleanedText`/`modificationsLog`/`buildCleanTxt`/`buildEditLogCsv`
(texto libre extraído del habla). Es posible, y correcto, que el valor de una
covariable (p. ej. `sitio: "Hospital Central"`) coincida textualmente con una
entidad que el modo confidencial enmascaró en el texto libre de otro
segmento: son dos mecanismos distintos con propósitos distintos, no una fuga
de privacidad. Ver `tests/apu04-derived-views.test.mjs` para la prueba que
documenta esta distinción explícitamente.

## Bugfix (2026-07): `\b` no reconoce tildes/ñ en el enmascarado de PII

`src/core/ner-engine.js#replaceCaseInsensitive` usaba `\b` para detectar los
límites de una palabra al buscar coincidencias de las listas manuales
(nombres, hospitales, direcciones). El límite `\b` de JavaScript se define
sobre la clase de caracteres `[A-Za-z0-9_]`, que **no incluye vocales
acentuadas ni "ñ"**. Consecuencia real: un nombre como "Álvarez" (empieza
con vocal acentuada) o "Peña"/"José" (con "ñ"/tilde en el borde) nunca
coincidía, así que el enmascarado fallaba en silencio para una fracción real
de los nombres en español, sin ningún error visible — el investigador creía
que el dato estaba protegido y no lo estaba. Corregido reemplazando `\b` por
límites explícitos basados en categorías Unicode: `(?<![\p{L}\p{N}_])` /
`(?![\p{L}\p{N}_])` con flag `u`. Verificado que no introduce falsos
positivos por substring (p. ej. "Ana" ya no coincide dentro de "Anabel",
igual que antes). Si se toca este archivo de nuevo, no revertir a `\b` sin
volver a probar explícitamente con nombres acentuados.

## Bugfix (2026-07): el Worker ocultaba el motivo real del error

`src/workers/clean-pipeline.worker.js` enviaba siempre un mensaje genérico
en `message` ("No se pudo procesar la entrevista...") cuando el pipeline
lanzaba una excepción, y solo el campo `detail` (que la UI nunca leía)
llevaba el motivo real. Como todos los mensajes de error del pipeline
(`schema-validator.js`, `ingest-adapter.js`, etc.) ya están redactados en
español y sin datos sensibles ni trazas técnicas, es seguro mostrarlos
directamente. Corregido para que `message` sea el motivo real cuando existe,
cayendo al mensaje genérico solo si el error no trae texto propio. También
se añadió el nombre del archivo al mensaje de error cuando falla uno
dentro de un lote de varios (`src/ui/app.js`).

## Regla dura: las covariables nunca son obligatorias (recordatorio 2026-07)

El usuario recordó explícitamente que `speakers[].covariates` puede venir
ausente, `null`, vacío (`{}`), o presente solo en algunos hablantes/archivos
de un mismo lote — nunca debe tratarse como un requisito. Esto ya estaba
cubierto por el diseño de la Regla 1 (agnosticismo de covariables), pero se
verificó a fondo con `src/core/covariate-summary.js` (usado por el resumen
de "Grupos y variables del estudio" del Panel de calidad y por el filtro de
covariable en la Vista de Diálogo, mejora anterior de esta misma sesión):

- `covariates: null` explícito se trata igual que ausente (nunca lanza).
- Un hablante sin la clave `covariates` en absoluto se trata igual.
- Un lote mixto (algunos archivos/hablantes con covariables, otros sin
  ellas) agrega solo lo disponible, sin fallar por lo que falta.
- Un valor `null` o `""` dentro de `covariates` se omite del resumen y de
  las opciones de filtro, en vez de mostrarse como una opción vacía confusa.
- Cuando NINGÚN archivo del lote trae covariables, ni la tarjeta "Grupos y
  variables del estudio" ni el selector de covariable en el diálogo se
  muestran — no aparecen secciones vacías sin sentido.

Verificado con tests dedicados en `tests/apu04-covariate-summary.test.mjs`
(casos límite en aislamiento) y `tests/apu04-app.dom.test.mjs` (dos pruebas
de extremo a extremo: lote sin covariables en ningún archivo, y lote mixto).
Si se toca `covariate-summary.js` o su integración en la UI, mantener esta
garantía: la ausencia de covariables debe degradarse en silencio, nunca en
un error ni en una sección vacía visible.

## Mejora (2026-07): motivo legible de anomalía (`anomalyReason`)

Contexto: se confirmó, revisando el código fuente real de
`github.com/maicel1978/APU-2` (`src/workers/whisper.worker.js`), que el
patrón "último segmento con `start === end`" que reportó un usuario no es un
dato corrupto: es un valor de reserva que la etapa de transcripción
automática (ASR, vía Whisper/transformers.js) genera a propósito cuando no
logra determinar el timestamp final del último fragmento de audio
(`end: end ?? start ?? 0`). Ese patrón viaja intacto por el resto del
ecosistema hasta llegar a APU-04.

**No se modifica APU-02** (fuera de alcance de este repositorio; además
sería inconsistente arreglarlo solo para consumidores de esa unidad
específica). En su lugar, APU-04 pasó de solo "marcar" el segmento como
anómalo a explicar el motivo en lenguaje natural (`anomalyReason`,
`docs/CONTRACTS.md §10.1`), visible directamente en la Vista de Diálogo
Continuo. Deliberadamente el mensaje no menciona "APU-02" por nombre: la
causa (ASR sin timestamp final confiable) es genérica a cualquier
transcriptor automático que alimente el ecosistema, no exclusiva de esa
unidad.

Si en el futuro se detectan más patrones de anomalía recurrentes y
explicables (p. ej. otro artefacto conocido de una etapa anterior), el lugar
correcto para añadir el texto explicativo es `src/core/telemetry.js`
(`computeTelemetry`/`enrichLastSegmentReason`), no la UI: mantiene la razón
como parte del dato exportado (`[base]_cleaned.json`), no solo como texto de
pantalla que se pierde al exportar.

## Migración v2 → v3 (2026-07): separar el archivo principal de la traza forense

El usuario pidió explícitamente que "el archivo final que se usa para
APU-05" no traiga la traza mezclada, y que la materia prima para análisis
"sea muy similar a lo que entró desde APU-03", dejando la traza como
elemento complementario aparte.

- **Antes (v2, `schemaVersion: "4.0.0"`)**: `[base]_cleaned.json` mezclaba
  materia prima (`speakers[]`, `cleanedText`) con traza forense completa
  (`originalText`, `modificationsLog`, `wpm`, `anomalous`, `anomalyReason`,
  `auditLog`, `source_hash`, `sourceRefs`) en un solo documento por segmento.
- **Ahora (v3, `schemaVersion: "5.0.0"`)**: `src/core/export-package.js`
  separa el documento de trabajo interno (`cleanJson`, que el pipeline y la
  revisión humana en pantalla siguen usando tal cual, sin cambios — ningún
  módulo interno se tocó) en dos archivos de exportación:
  - `[base]_cleaned.json` (`buildCleanedPackage`): solo `speakers[]`,
    `covariateProject`, `covariateSchema`, `finalizedByHuman`, y
    `segments[]` con `segmentId, speakerId, speaker, start, end,
    cleanedText, confidence`. Estructuralmente parecido a `speakers.json`.
  - `[base]_trazabilidad.json` (`buildTraceabilityPackage`): `auditLog`,
    `source_hash`, `sourceRefs`, y `segments[]` con `segmentId,
    originalText, wpm, anomalous, anomalyReason, aiSuggested,
    editedByHuman, modificationsLog`, enlazado al principal por `segmentId`.
- **Por qué no se tocó el pipeline interno**: `clean-pipeline.js`,
  `review-view.js`, `dialogue-view.js` y el autoguardado de sesión siguen
  operando sobre el documento de trabajo unificado (con toda la
  información junta) — es lo correcto para la revisión humana en curso,
  donde sí hace falta ver `originalText` junto a `cleanedText` para el
  resaltado de cambios. La separación ocurre solo al exportar, en
  `src/ui/export-screen.js`, que ahora llama a `buildCleanedPackage`/
  `buildTraceabilityPackage` en vez de descargar `cleanJson` crudo.
- Si se agrega un campo nuevo al segmento de trabajo interno, decidir
  explícitamente a cuál de los dos paquetes de exportación pertenece
  (materia prima vs. traza) — no asumir que va a ambos ni que el
  `cleanJson` interno se exporta directamente nunca más.

## Historial: por qué hay dos capas de resaltado de diff

`buildChangeHighlight` (`src/ui/review-view.js`) compara por conjunto de
palabras y puede sugerir visualmente que se perdió texto cuando no es así.
En vez de tocar esa función (ya probada, usada en otros contextos),
`computeWordDiff` (`src/utils/word-diff.js`) calcula un diff posicional real
(LCS) y es lo que usa la pantalla de revisión para pintar el resaltado. Si
necesitas comparar textos en un contexto nuevo, usa `computeWordDiff`, no
`buildChangeHighlight`.
