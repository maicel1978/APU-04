# APU-04 — Contratos de datos

Referencia formal de los formatos JSON/CSV que APU-04 lee y produce. Es la
fuente de verdad para interoperar con otras unidades del ecosistema APU o
para escribir código nuevo dentro de este repo.

## 1. Envoltorio común

Todo documento JSON que produce APU-04 incluye:

```json
{ "schemaVersion": "1.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "..." }
```

`schemaVersion` se valida en runtime (`src/core/version-guard.js`). Si cambia,
incrementar aquí y en el validador; no reinterpretar una versión antigua con
un esquema nuevo.

## 2. Entrada: `speakers.json` (viene de la unidad anterior)

```json
{ "segments": [{ "id": "seg-001", "speakerId": "spk-1", "start": 0.0, "end": 4.0, "text": "...", "confidence": 0.9 }] }
```

Usa `id`, no `segmentId`. `src/core/ingest-adapter.js` es el **único** lugar
autorizado a leer `id`; todo el resto del pipeline usa `segmentId`. No trae
`studyId` ni `covariates`: eso lo completa el usuario en la UI
(`src/ui/covariates-form.js`), nunca se infiere.

## 3. Entrada canónica (post-adaptador, lo que valida `schema-validator.js`)

```json
{
  "studyId": "string",
  "covariates": {
    "caseId": "string", "group": "intervencion|control", "moment": "pre|post",
    "sex": "M|F", "age": "integer|null", "site": "string", "diagnosis": "string"
  },
  "sourceRefs": {
    "sourceAudioFileName": "string|null", "sourceManifestRef": "string|null",
    "sourceManifestHash": "string|null", "sourceTranscriptRef": "string|null",
    "sourceTranscriptHash": "string|null"
  },
  "segments": [
    { "segmentId": "string", "text": "string", "start": "float", "end": "float",
      "speakerId": "string", "confidence": "float|null" }
  ]
}
```

Reglas duras: `segmentId` único; `end > start`; toda clave de `covariates` y
`sourceRefs` debe existir siempre, con `null` explícito si no aplica (nunca
se omite la clave).

## 4. Salida principal: `[study]_[case]_clean.json`

```json
{
  "schemaVersion": "1.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "clean-text",
  "studyId": "string", "covariates": { "...": "igual que la entrada" },
  "source_hash": "sha256 de la entrada", "sourceRefs": { "...": "copiado tal cual" },
  "auditLog": { "version": "0.3", "lastModified": "ISO-8601", "termsCorrectedCount": 0, "finalizedByHuman": false },
  "segments": [
    {
      "segmentId": "string",
      "originalText": "string — INMUTABLE, nunca se reescribe",
      "cleanedText": "string",
      "confidence": "float|null", "wpm": "float", "anomalous": "boolean",
      "aiSuggested": "boolean", "editedByHuman": "boolean",
      "modificationsLog": [
        { "timestamp": "ISO-8601", "type": "punctuation|glossary|ner|human", "before": "string", "after": "string" }
      ]
    }
  ]
}
```

Reglas duras (no negociables, verificadas por tests):

- `originalText` se escribe una sola vez y nunca se toca de nuevo.
- `cleanedText` queda **congelado** en cuanto `auditLog.finalizedByHuman` pasa
  a `true`. Cualquier corrección posterior exige una nueva versión del
  archivo, nunca una sobrescritura silenciosa. Ver `editSegment` en
  `src/ui/review-view.js`.
- En `modificationsLog`, las entradas `type:"ner"` **nunca** llevan el valor
  real de la PII en `before`/`after`, solo placeholders (`[NOMBRE]`,
  `[HOSPITAL]`, `[FECHA]`, `[DIRECCIÓN]`). El valor real va exclusivamente al
  buffer de PII (§5). Para `punctuation`/`glossary`/`human` sí se guarda texto
  real, porque no es PII.
- Excepción de diseño conocida: `originalText` (y el `before` de la primera
  entrada `type:"punctuation"`, generada antes del enmascarado) **sí**
  contienen el texto crudo con PII real, por ser evidencia forense
  inmutable. Ninguna sub-unidad de análisis debe leer `originalText`; deben
  consumir solo `cleanedText`.

## 5. Buffer de PII: `[study]_[case]_pii-buffer.local.json`

```json
{ "schemaVersion": "1.0.0", "ecosystem": "APU", "unit": "APU-04", "stage": "pii-buffer",
  "warning": "Contiene datos identificables. No compartir ni subir a red.",
  "entries": [{ "segmentId": "string", "placeholder": "[NOMBRE]", "originalValue": "string" }] }
```

Nunca se incluye en el paquete que viaja a las unidades de análisis. Sufijo
`.local.json`, excluido en `.gitignore`.

## 6. Vistas derivadas (generadas siempre desde `clean.json`, nunca editadas)

| Archivo | Contenido | Generado por |
|---|---|---|
| `[study]_[case]_clean.txt` | Texto plano concatenado | `buildCleanTxt` |
| `[study]_[case]_clean.csv` | Una fila por segmento | `buildCleanCsv` |
| `[study]_[case]_quality-report.json` | Totales, % editado/anómalo, wpm, sustituciones | `buildQualityReport` |
| `[study]_[case]_glossary-hits.json` | Términos corregidos por glosario | `buildGlossaryHits` |
| `[study]_[case]_flagged-segments.json` | IDs de segmentos problemáticos | `buildFlaggedSegments` |
| `[study]_[case]_edit-log.csv` | `modificationsLog` aplanado | `buildEditLogCsv` |

Todas viven en `src/core/derived-views.js`, reciben **solo** `cleanJson`
(nunca `piiBuffer`: es estructuralmente imposible que filtren PII real).
Excepción: `buildEditLogCsv` redacta `before`/`after` de la entrada
`punctuation` con `"<texto original, ver clean.json>"` cuando el segmento
tiene coincidencias NER (a diferencia de `clean.json`, que sí conserva ese
texto).

## 7. Archivos de configuración editables (`assets/data/`)

- `glossary.json`: `{ entries: [{ wrong, correct }] }`. Coincidencia por
  distancia de Levenshtein (umbral ≤2 para términos ≤12 caracteres).
- `ner-patterns.json`: `{ regexPatterns: [{ label, pattern }], listMatchers: [{ label, source, values }] }`.
  `listMatchers[].values` se completa en runtime por
  `src/core/ner-patterns-loader.js` con `covariates.site` y las listas
  manuales que el usuario escribe en la UI — nunca se infiere del texto.

Ambos son JSON planos, editables por el investigador sin tocar código.

## 8. Telemetría (Módulo D)

```
duration  = end - start
wordCount = longitud(split(cleanedText))
wpm       = (wordCount / duration) * 60
anomalous = wpm > 220 OR wpm < 40 OR (start[n] - end[n-1]) > 5.0
```

`duration <= 0` se maneja sin dividir por cero: `wpm = 0`, `anomalous = true`.
Implementado en `src/core/telemetry.js`.

## 9. Nombres de archivo

`[study]_[case]_[stage].[ext]`, saneando caracteres no alfanuméricos a guion.
Implementado en `src/utils/download.js#buildFileName`.
