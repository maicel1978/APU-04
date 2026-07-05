# APU-04 — Contratos de datos (v3, esquema de salida 5.0.0)

Referencia formal de los formatos que APU-04 lee y produce. Fuente de verdad
para interoperar con APU-03 (entrada) y APU-05 (salida). Sustituye la versión
anterior (contrato de salida `1.0.0`, formulario fijo de covariables clínicas,
un caso a la vez): ver `docs/DECISIONS.md` §"Migración v1→v2" para el porqué.

## 1. Envoltorio común de salida

```json
{ "schemaVersion": "5.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "cleaned-text" }
```

`schemaVersion` se valida en runtime (`src/core/version-guard.js`). Es un
**par independiente** del `schemaVersion` de entrada (`3.0.0`, declarado por
APU-03): no son el mismo número y no deben confundirse.

## 2. Entrada: `speakers.json` (real, exportado por APU-03 v3.0.0)

```json
{
  "schemaVersion": "3.0.0",
  "unit": "APU-03",
  "speakers": [
    { "id": "spk-1", "label": "Paciente, principal", "covariates": { "grupo_estudio": "Intervención" } }
  ],
  "segments": [
    { "id": "seg-001", "start": 0.0, "end": 4.5, "text": "...", "speakerId": "spk-1", "speaker": "Paciente, principal", "edited": false }
  ],
  "covariateProject": { "...": "objeto de VarOps, puede ser null" },
  "covariateSchema": [ { "...": "arreglo de VarOps, puede ser null o []" } ]
}
```

Reglas de ingestión (Regla 1 del encargo — Herramienta Transversal 0):

- **Cero formulario clínico fijo.** No existe un conjunto de campos
  obligatorios (`diagnosis`, `age`, `sex`...). Cualquier covariable vive
  dentro de `speakers[].covariates`, con las claves que VarOps haya definido
  en `covariateSchema`, y APU-04 nunca las valida por nombre ni las exige.
- **Passthrough intocable.** `speakers[]`, `covariateProject` y
  `covariateSchema` se copian tal cual del archivo de entrada al de salida.
  Si vienen `null` o `[]` (sin VarOps), APU-04 los conserva así — nunca
  inventa estructura ni bloquea el flujo por su ausencia.
- **Mapeo canónico de segmentos**: `segments[].id → segmentId` (único lugar
  autorizado a leer `id`: `src/core/ingest-adapter.js`, verificado por
  auditoría estática). `start`, `end`, `speakerId`, `speaker` se copian sin
  modificar. `edited` (si viene) se preserva como pista de que APU-03 ya tocó
  el segmento, pero no se usa para decidir nada en APU-04 (la revisión humana
  de APU-04 es independiente).
- `manifest.json` es opcional y, si se carga, solo aporta metadatos de
  trazabilidad (`sourceManifestRef`/`sourceManifestHash`); su ausencia nunca
  bloquea el procesamiento.
- No se pide ni se infiere `studyId`/`caseId` de un formulario: el
  identificador de sesión (`sourceSession`) se deriva del nombre de archivo
  cargado (saneado) o, si el usuario lo desea, de un campo de texto libre
  opcional en la pantalla de ingestión (nunca obligatorio, nunca con lista
  fija de campos).

## 3. Entrada canónica interna (post-adaptador)

Forma normalizada de trabajo del pipeline, un `speakers.json` ya adaptado:

```json
{
  "sourceSession": "string",
  "speakers": [ { "id": "string", "label": "string", "covariates": "object" } ],
  "covariateProject": "object|null",
  "covariateSchema": "array|null",
  "segments": [
    { "segmentId": "string", "text": "string", "start": "number", "end": "number",
      "speakerId": "string", "speaker": "string|null", "confidence": "number|null" }
  ]
}
```

Reglas duras: `segmentId` único; `end > start`; `speakers[]`/`segments[]` no
vacíos. `covariateProject`/`covariateSchema` pueden ser `null`, nunca se
exige que existan con contenido.

## 4. Salida principal: `[base]_cleaned.json` (materia prima para análisis)

Rediseñado (2026-07, pedido explícito del usuario): **solo lo necesario para
trabajar limpio**, sin traza forense mezclada. Estructuralmente muy parecido
a `speakers.json` de entrada (§2). Generado por
`src/core/export-package.js#buildCleanedPackage`.

```json
{
  "schemaVersion": "5.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "cleaned-text",
  "sourceSession": "string",
  "speakers": [ "...igual que la entrada (passthrough, Regla 1)..." ],
  "covariateProject": "object|null", "covariateSchema": "array|null",
  "finalizedByHuman": "boolean",
  "segments": [
    { "segmentId": "string", "speakerId": "string", "speaker": "string|null",
      "start": "number", "end": "number", "cleanedText": "string", "confidence": "number|null" }
  ]
}
```

Reglas duras:

- `speakers[]`, `covariateProject`, `covariateSchema`: copiados intactos de
  la entrada (passthrough, regla dura, verificado por test de igualdad
  estructural).
- `finalizedByHuman` es un campo plano en la raíz (no anidado en un
  `auditLog`, que ya no existe en este archivo). Un consumidor (APU-05) no
  debe procesar un `cleaned.json` con `finalizedByHuman: false`.
- `segments[]` **no** incluye `originalText`, `modificationsLog`, `wpm`,
  `anomalous`, `anomalyReason`, `aiSuggested` ni `editedByHuman` — toda esa
  traza vive en el archivo complementario (§4bis). `cleanedText` es siempre
  la versión final, segura y validada por humano.

## 4bis. Complementario: `[base]_trazabilidad.json` (evidencia forense)

Generado por `src/core/export-package.js#buildTraceabilityPackage`, enlazado
al archivo principal por `segmentId`. No es materia prima para análisis; es
para quien necesite auditar el proceso de limpieza.

```json
{
  "schemaVersion": "5.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "trazabilidad",
  "sourceSession": "string", "source_hash": "sha256 de la entrada", "sourceRefs": { "...": "..." },
  "auditLog": { "version", "lastModified", "termsCorrectedCount", "finalizedByHuman", "nerOptInActive" },
  "segments": [
    { "segmentId": "string", "originalText": "string", "wpm": "number", "anomalous": "boolean",
      "anomalyReason": "string|null", "aiSuggested": "boolean", "editedByHuman": "boolean",
      "modificationsLog": [ { "timestamp", "type", "before", "after" } ] }
  ]
}
```

Reglas duras (heredadas del diseño anterior, sin cambios de fondo):

- `originalText` es inmutable (se escribe una sola vez en el pipeline).
- En `modificationsLog`, las entradas `type:"ner"` **nunca** llevan el valor
  real de la PII en `before`/`after`: solo el placeholder relacional indexado
  (`[PERSONA_1]`, `[HOSPITAL_A]`). El valor real va exclusivamente al buffer
  (§6). Para `punctuation`/`glossary`/`human` sí se guarda texto real.
- Excepción de diseño heredada: `originalText` (y el `before` de la primera
  entrada `type:"punctuation"`, generada antes del enmascarado) sí contienen
  texto crudo con PII real, como evidencia forense inmutable. Ningún
  consumidor de análisis (APU-05) debe leer este archivo para su trabajo
  normal; deben consumir `cleanedText` de `[base]_cleaned.json` (§4).

## 5. Vista tabular: `[base]_cleaned.csv`

Columnas fijas: `segmentId, start, end, speakerId, speaker, cleanedText, wpm,
anomalous, confidence` + una columna dinámica por cada covariable presente en
`speakers[].covariates` del hablante de ese segmento (prefijo `cv_`, p. ej.
`cv_grupo_estudio`). Si dos hablantes tienen distintas covariables, la unión
de todas las claves define las columnas; celdas sin valor para un hablante
quedan vacías (nunca se inventa un valor).

## 6. Buffer de PII: `pii-buffer.local.json`

```json
{ "schemaVersion": "5.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "pii-buffer",
  "warning": "Contiene datos identificables. No compartir ni subir a red.",
  "entityMap": { "[PERSONA_1]": { "canonicalValue": "string", "occurrences": ["segmentId", "..."] } } }
```

Se genera **solo si el modo confidencial está activo** (Regla 3, opt-in, OFF
por defecto). `entityMap` usa el placeholder relacional indexado como clave,
para poder des-enmascarar de forma consistente. Nunca viaja en el paquete que
se entrega a APU-05; sufijo `.local.json`, excluido en `.gitignore`.

### 6.1 Reemplazo relacional indexado (nuevo respecto a v1)

- Todas las menciones de una misma entidad (incluyendo variantes exactas de
  capitalización) reciben el **mismo índice** en todo el documento:
  `[PERSONA_1]` siempre es la misma persona, `[PERSONA_2]` otra distinta.
- Los índices se asignan en orden de primera aparición dentro del caso, por
  categoría (`PERSONA`, `HOSPITAL`, `DIRECCION`, `TELEFONO`, `FECHA` sin
  indexar por ser dato no identitario reutilizable).
- Implementado en `src/core/pii-relational-engine.js`, que envuelve
  `ner-engine.js` (reglas + listas, nunca ML) añadiendo la tabla de
  resolución de entidades por caso.

## 7. Reporte de calidad: `[base]_quality_report.json`

Por archivo, agregando lo que antes vivía disperso en `quality-report` +
`flagged-segments` + `glossary-hits`, más las métricas de la Regla 2:

```json
{
  "schemaVersion": "5.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "quality-report",
  "totalSegments": 0, "totalWords": 0, "wpmAverage": 0,
  "longPauseCount": 0, "anomalousCount": 0, "anomalousPercentage": 0,
  "editedByHumanPercentage": 0, "suspiciousTermsCount": 0,
  "substitutionCounts": { "punctuation": 0, "glossary": 0, "ner": 0, "human": 0 },
  "flaggedSegmentIds": []
}
```

## 8. Bitácora forense: `[base]_edit_log.csv`

Igual que en v1 (`modificationsLog` aplanado, una fila por modificación),
columnas `segmentId, timestamp, type, before, after`, con la misma regla de
redacción para `punctuation` cuando el segmento tiene coincidencias NER.

## 9. Dashboard transversal (APU-04D) — solo en memoria, no se exporta aparte

Agregación entre todos los archivos de un lote (batch): construida por
`src/core/batch-controller.js` a partir de los `quality_report` individuales.
No genera un archivo nuevo — se muestra en pantalla para permitir auditar por
excepción (Regla 2); si el usuario quiere conservarla, exporta los
`quality_report.json` de cada archivo.

## 10. Telemetría (fórmulas, sin cambios respecto a v1)

```
duration  = end - start
wordCount = longitud(split(cleanedText))
wpm       = (wordCount / duration) * 60
anomalous = wpm > 220 OR wpm < 40 OR (start[n] - end[n-1]) > 5.0
```

`duration <= 0` → `wpm = 0`, `anomalous = true` (sin dividir por cero).

### 10.1 `anomalyReason` (motivo legible, mejora 2026-07)

Cada causa de anomalía tiene un texto explicativo propio (pueden combinarse
si aplica más de una): ritmo alto, ritmo bajo, pausa larga, o duración
inválida (`<= 0`). Si el segmento con duración inválida es el **último** de
la entrevista, el motivo se amplía para aclarar que ese patrón (timestamp
final no determinado) es frecuente en transcripción automática y no indica
un archivo corrupto — implementado en `src/core/telemetry.js` (agnóstico a
qué unidad del ecosistema generó la transcripción). `anomalyReason` es
`null` cuando `anomalous` es `false`.

## 11. Archivos de configuración editables (`assets/data/`)

- `glossary.json`: `{ entries: [{ wrong, correct }] }`. Coincidencia por
  distancia de Levenshtein (umbral ≤2 para términos ≤12 caracteres).
- `ner-patterns.json`: `{ regexPatterns: [{ label, pattern }], listMatchers: [{ label, source, values }] }`.
  `listMatchers[].values` se completa en runtime por
  `src/core/ner-patterns-loader.js` con las listas manuales que el
  investigador escribe en la UI (nombres, hospitales/sitios, direcciones) —
  nunca se infiere del texto ni de covariables (v2 elimina la fuente
  "covariates.site" de v1, ya no existe una clave fija "site").

El motor relacional (§6.1) es una capa sobre `ner-engine.js`, no lo
reemplaza.

## 12. Nombres de archivo

`[base]_[stage].[ext]`, donde `base` se deriva del nombre del `speakers.json`
cargado (saneado a alfanumérico + guion, ver
`src/core/batch-controller.js#buildFileBase`), uno por cada archivo del lote.
