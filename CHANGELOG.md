# CHANGELOG — APU-04

## v3.0.0 — Separar el archivo principal de la traza forense

Pedido explícito del usuario: el archivo que se usa como materia prima para
APU-05 no debe traer la traza mezclada; debe parecerse a lo que entró desde
APU-03, con la traza como elemento complementario aparte.

- **`schemaVersion` de salida sube de `4.0.0` a `5.0.0`.**
- Nuevo `src/core/export-package.js`: `buildCleanedPackage(cleanJson)` y
  `buildTraceabilityPackage(cleanJson)`, que separan el documento de trabajo
  interno (sin cambios) en dos archivos de exportación.
- **`[base]_cleaned.json` (materia prima, reducido)**: solo `speakers[]`,
  `covariateProject`, `covariateSchema`, `finalizedByHuman` (campo plano) y
  `segments[]` con `segmentId, speakerId, speaker, start, end, cleanedText,
  confidence`. Ya no incluye `originalText`, `modificationsLog`, `wpm`,
  `anomalous`, `anomalyReason`, `aiSuggested`, `editedByHuman`, `auditLog`,
  `source_hash` ni `sourceRefs`.
- **Nuevo `[base]_trazabilidad.json`**: toda la traza forense anterior,
  enlazada al archivo principal por `segmentId`. El paquete de exportación
  pasa de 4 a 5 archivos (+ `pii-buffer.local.json` opcional).
- El pipeline interno (`clean-pipeline.js`), la revisión humana
  (`review-view.js`, `dialogue-view.js`) y el autoguardado de sesión NO se
  tocaron: siguen trabajando sobre el documento unificado; la separación
  ocurre solo al exportar (`src/ui/export-screen.js`).
- `docs/CONTRACTS.md` (§4 reescrita, nueva §4bis), `docs/AGENT-GUIDE.md` y
  `docs/MANUAL-USUARIO.md` actualizados con el nuevo contrato.

Suite completa: 289/289 (+ 11 tests nuevos en
`tests/apu04-export-package.test.mjs`, + 2 tests nuevos en
`tests/apu04-export-screen.dom.test.mjs`).

## v2.1.1 — Lenguaje simple en el motivo de anomalía por duración inválida

El usuario señaló que el mensaje mostrado en la Vista de Diálogo cuando un
segmento tiene duración inválida sonaba a registro técnico de programador
("Duración del segmento inválida (<= 0 segundos); no se pudo calcular wpm."),
inconsistente con el lenguaje simple ya aplicado al resto de la interfaz
(export-screen.js, dashboard-view.js, help-screen.js).

- `src/core/telemetry.js`: el mensaje pasa a "El inicio y el final de este
  segmento son iguales, así que no se pudo calcular el ritmo de habla."
- El texto ampliado para el último segmento de la entrevista también se
  simplificó, sin perder la explicación real (patrón conocido de las
  transcripciones automáticas).
- Se agregaron aserciones explícitas de que el mensaje no contiene notación
  técnica (`<=`) ni la abreviatura `wpm`, para evitar que un futuro cambio
  reintroduzca lenguaje técnico sin que se note.

Suite completa: 277/277.

## v2.1.0 — Visibilidad de grupos/covariables (sin análisis por grupo)

El usuario preguntó por metadatos de "grupo" (p. ej. intervención/control) y
por renombrar/caracterizar hablantes. Análisis con el contrato real:

- **El dato de grupo ya viajaba de punta a punta** (passthrough de
  `speakers[].covariates`, Regla 1) y ya salía en el CSV exportado
  (`derived-views.js`, columnas `cv_*`). No hacía falta ningún cambio de
  diseño para eso.
- **Se decidió NO implementar**: análisis/normalización por grupo (es
  responsabilidad de APU-05C, comparación por covariables) ni renombrado o
  unión de hablantes (ya es función explícita de APU-03; duplicarlo crearía
  dos fuentes de verdad divergentes sobre la identidad del hablante).
- **Se implementó**: visibilidad de las covariables ya existentes dentro de
  la propia interfaz, sin agregar análisis nuevo:
  - `src/core/covariate-summary.js` (nuevo): conteo de segmentos por
    valor de covariable, opciones para un filtro, y etiqueta legible por
    hablante. Puramente determinista, sin comparación de grupos.
  - Panel de calidad: nueva tarjeta "Grupos y variables del estudio" con el
    conteo agregado del lote completo.
  - Vista de Diálogo: nuevo filtro "Filtrar por grupo u otra variable del
    estudio" en la barra de herramientas (solo aparece si el archivo trae
    covariables), y la covariable del hablante se muestra junto a su nombre
    en cada burbuja.

Suite completa: 268/268.

## v2.0.3 — Motivo legible de anomalía (`anomalyReason`)

El usuario confirmó, con el código fuente real de `github.com/maicel1978/APU-2`
(`src/workers/whisper.worker.js`), que el patrón "último segmento con
`start === end`" corregido en v2.0.2 no es casual: la etapa de transcripción
automática genera ese valor de reserva a propósito cuando no puede
determinar el timestamp final del último fragmento de audio. Por
instrucción explícita del usuario, **no se modifica APU-02** (fuera de
alcance de este repositorio).

En su lugar, APU-04 ahora explica el motivo de cada anomalía en lenguaje
natural:

- Nuevo campo `anomalyReason` en cada segmento de `[base]_cleaned.json`
  (`docs/CONTRACTS.md §10.1`): describe si la causa fue ritmo de habla alto,
  bajo, pausa larga, o duración inválida (pueden combinarse).
- Si el segmento con duración inválida es el **último** de la entrevista, el
  motivo se amplía para aclarar que ese patrón es frecuente en transcripción
  automática — sin mencionar ninguna unidad del ecosistema por nombre
  (agnóstico a la fuente real de la transcripción).
- Visible directamente en la Vista de Diálogo Continuo (`dialogue-view.js`),
  como texto junto al segmento marcado, no solo un badge sin contexto.
- `src/ui/dialogue-view.js` se dividió en dos archivos
  (`dialogue-view.js` + `dialogue-bubble.js`, nuevo) para mantener el límite
  de 350 líneas por archivo (R10) tras el cambio.

Verificado con el timestamp exacto reportado por el usuario (segmento con
`start=end=355.4` en la última posición de un lote de 49). Suite completa:
203/203.

## v2.0.2 — Corrección de raíz: bloqueo fatal por segmentos de duración cero

Reportado por el usuario con un caso real: `speakers (5).json` completo era
rechazado por el error `segments[48]: "end" (355.4) debe ser mayor que
"start" (355.4).`, obligando a editar el JSON a mano fuera de la app.

**Causa raíz (no solo el mensaje)**: `schema-validator.js` trataba
`end === start` (duración cero) como un error fatal que invalidaba el
archivo COMPLETO, aunque `telemetry.js` ya tenía manejo defensivo correcto
para exactamente ese caso (marca el segmento como `anomalous`, `wpm: 0`, sin
lanzar). Dos mecanismos contradictorios en el mismo pipeline — uno
defensivo, uno destructivo — y el destructivo bloqueaba antes de que el
correcto pudiera actuar. Segmentos de duración cero son ruido normal de
ASR/diarización (timestamps redondeados, artefactos de silencio), no
archivos corruptos.

**Fix**: el validador ahora solo rechaza `end < start` (datos realmente
incoherentes); `end === start` se acepta y queda marcado como anómalo por
`telemetry.js` para revisión en el Panel de calidad (APU-04D), sin bloquear
el resto del archivo. Verificado con un test que reproduce el caso exacto
reportado (50 segmentos, uno con `start=end=355.4` en la posición 48): el
archivo se procesa completo y solo ese segmento queda señalado.

Suite completa: 194/194.

## v2.0.1 — Corrección de bugs reportados en producción

Reportado por el usuario: "a veces no aplica la anonimización" y a veces
aparece "No se pudo procesar la entrevista. Verifique el archivo de entrada
e inténtelo de nuevo." sin más información. Se reprodujeron y confirmaron
dos bugs reales, ambos heredados de la fontanería v1 reutilizada sin
auditar a fondo:

- **Bug 1 (privacidad)**: `src/core/ner-engine.js` usaba `\b` (límite de
  palabra nativo de JS, basado en `[A-Za-z0-9_]`) para encontrar nombres en
  las listas manuales. Esa clase de caracteres **no incluye tildes ni "ñ"**,
  así que nombres como "Álvarez", "José", "María" o "Peña" (con vocal
  acentuada o "ñ" en el borde de la palabra) nunca coincidían y quedaban sin
  enmascarar, sin ningún aviso. Corregido con límites de palabra basados en
  categorías Unicode (`\p{L}`/`\p{N}`), verificado con casos reales
  (Álvarez, José, Peña, María) y sin introducir falsos positivos por
  substring (p. ej. "Ana" ya no coincide dentro de "Anabel").
- **Bug 2 (mensajes de error)**: `src/workers/clean-pipeline.worker.js`
  siempre devolvía un mensaje genérico ("No se pudo procesar la
  entrevista...") al fallar, aunque el motivo real (ya redactado en español,
  sin datos sensibles) viajaba en un campo `detail` que la interfaz nunca
  leía. Corregido para mostrar el motivo real como mensaje principal.
  Además, al procesar un lote de varios archivos, el mensaje de error ahora
  identifica cuál de los archivos fue el que falló.

Ver `docs/DECISIONS.md` para el detalle técnico completo. Tests de
regresión añadidos en `tests/apu04-glossary-ner.test.mjs` y
`tests/apu04-worker.test.mjs`. Suite completa: 192/192.

## v2.0.0 — Rediseño de interoperabilidad APU-03 ↔ APU-05

Reconstrucción arquitectónica sobre la base del prototipo v1 (fontanería de
bajo nivel reutilizada: `text-diff.js`, `glossary-engine.js`, `ner-engine.js`,
`word-diff.js`, `hash.js`, `text-list.js`, `session-store.js`,
`review-view.js`, patrón de Worker inline vía Blob). Metodología: PRISMA+
v5.2-Lite (context-safe).

### Cambios que rompen compatibilidad con v1

- **Entrada**: se elimina el formulario fijo de covariables clínicas
  (`caseId/group/moment/sex/age/site/diagnosis`). Ahora se ingiere
  directamente `speakers.json` real de APU-03 v3.0.0 (`speakers[]`,
  `covariateProject`, `covariateSchema` como passthrough agnóstico).
- **Salida**: `schemaVersion` de `1.0.0` a `4.0.0`. Nueva forma de
  `[base]_cleaned.json`, con `speakers[]`/`covariateProject`/`covariateSchema`
  intactos y `auditLog.nerOptInActive`.
- **Convención de nombres de archivo**: de `[study]_[case]_[stage].[ext]` a
  `[base]_[stage].[ext]`, donde `base` se deriva del nombre del archivo
  cargado.
- **Batch**: se elimina la restricción "un caso a la vez". Se añade
  `src/core/batch-controller.js` para procesar N archivos y agregar métricas
  en un Dashboard Transversal de Calidad (APU-04D).
- **Privacidad**: el enmascarado de PII sigue siendo por reglas y listas
  (nunca IA estadística), pero ahora es explícitamente opt-in con un toggle
  visible (antes era simplemente opcional sin distinción clara de
  encendido/apagado), y el reemplazo es relacional indexado
  (`[PERSONA_1]`, `[HOSPITAL_A]`) en vez de placeholders genéricos.

### Añadido

- `src/core/pii-relational-engine.js` — motor de indexación relacional de
  entidades por caso, envolviendo `ner-engine.js`.
- `src/core/batch-controller.js` — agregación de métricas de lote.
- `src/core/dialogue-filters.js` — lógica pura de filtrado/orden para la
  Vista de Diálogo Continuo.
- `src/ui/pii-settings-form.js` — reemplaza `pii-list-form.js`, con toggle
  explícito.
- `src/ui/dashboard-view.js` — Dashboard APU-04D.
- `src/ui/dialogue-view.js` — Vista de Diálogo Continuo (guion/chat), con
  barra de herramientas persistente (filtros por estado/hablante, búsqueda
  instantánea sin perder el foco) y atajos de teclado (`Alt+A`, `Alt+E`,
  `Ctrl+Enter`, `Alt+F`).
- `docs/AGENT-GUIDE.md` — incluye guía específica para agentes que
  construyan APU-05.
- `docs/MANUAL-USUARIO.md` — guía no técnica para el investigador.

### Eliminado

- `src/ui/covariates-form.js`, `src/ui/pii-list-form.js`,
  `src/ui/review-screen.js` (reemplazados).

### Sin cambios (reutilizado intacto)

- `src/core/text-diff.js`, `src/core/glossary-engine.js`,
  `src/core/ner-engine.js`, `src/core/telemetry.js`,
  `src/core/session-store.js`, `src/utils/word-diff.js`, `src/utils/hash.js`,
  `src/utils/text-list.js`, `src/ui/review-view.js`,
  `src/ui/worker-client.js`, `src/ui/dom-helpers.js`, `src/main.js`,
  `index.html`, `scripts/serve.mjs`.

### Estado de pruebas

189/189 tests pasan (`npm test`, runner nativo `node --test` + `jsdom`),
incluida la auditoría estática de `src/`.
