# APU-04 — Guía para agentes IA

Reglas prácticas para cualquier agente (humano o IA) que edite este repo, y
un puente directo para cuando llegue el momento de construir **APU-05**.

## Si vas a tocar código de APU-04

1. Lee primero `docs/CURRENT-STATUS.md` (qué está hecho de verdad, no lo que
   "debería" estar) y `docs/DECISIONS.md` (por qué el código se ve así; evita
   deshacer decisiones deliberadas sin darte cuenta).
2. `docs/CONTRACTS.md` es la fuente de verdad del formato de datos. Si cambias
   la forma de `speakers.json` de entrada o de los archivos de salida,
   actualízalo ahí primero y sube el número de `schemaVersion`.
3. Corre `npm test` antes y después de cualquier cambio. No asumas que un
   archivo quedó escrito como esperabas: verifica con la suite real.
4. Reglas no negociables (ver `docs/DECISIONS.md` para el detalle):
   - `originalText` es inmutable — se escribe una sola vez.
   - `cleanedText` se congela cuando el caso queda finalizado por un humano.
   - El enmascarado de PII (`ner-engine.js` + `pii-relational-engine.js`) es
     por reglas y listas, nunca NER estadístico/LLM — es decisión de
     producto, no una limitación temporal.
   - El enmascarado está **apagado por defecto**; nunca lo actives
     implícitamente.
   - `speakers[]`, `covariateProject`, `covariateSchema` viajan intactos de
     entrada a salida (passthrough); nunca los valides por nombre de clave.
   - `[base]_cleaned.json` (el archivo principal) y `[base]_trazabilidad.json`
     (la traza forense) están separados a propósito
     (`src/core/export-package.js`, 2026-07). Nunca vuelvas a mezclarlos en
     un solo archivo sin que te lo pidan explícitamente.
   - Un único Web Worker (`clean-pipeline.worker.js`); el batch lo reutiliza
     con llamadas secuenciales, no crea un Worker por archivo.
   - Vanilla JS ES2022+ Modules, sin frameworks, sin build step.

## Si vas a construir APU-05 (lee esto primero)

APU-05 consume el paquete que produce APU-04 por cada entrevista/caso. No
necesitas leer todo este repo: con esto alcanza.

**Lo que vas a recibir de APU-04** (por cada archivo procesado):

- **`[base]_cleaned.json` — el archivo principal, tu materia prima.** Solo
  trae lo necesario para trabajar limpio: `speakers[]`, `covariateProject`,
  `covariateSchema` (idénticos a lo que exportó APU-03), `finalizedByHuman`,
  y `segments[]` con `segmentId, speakerId, speaker, start, end, cleanedText,
  confidence`. **No** contiene texto original, bitácora de cambios, ni
  métricas de calidad — deliberadamente, para que trabajes sobre datos
  limpios sin traza forense de por medio (docs/CONTRACTS.md §4).
- `[base]_cleaned.csv` — la misma información en tabla, una fila por
  segmento, con columnas `cv_*` dinámicas por cada covariable presente en
  `speakers[].covariates`. Incluye además `wpm`/`anomalous` como referencia
  rápida de calidad (útil para filtrar en una hoja de cálculo).
- `[base]_trazabilidad.json` — **complementario, no es tu materia prima.**
  Aquí vive todo lo forense: `originalText`, `modificationsLog`, `wpm`,
  `anomalous`, `anomalyReason`, `auditLog`, `source_hash`, `sourceRefs`, uno
  por cada `segmentId` (enlazado al archivo principal por ese mismo campo).
  Solo léelo si necesitas auditar el proceso de limpieza, no para análisis.
- `[base]_quality_report.json` — métricas agregadas del archivo (útil para
  el apéndice metodológico).
- `[base]_edit_log.csv` — bitácora forense de modificaciones, en CSV.
- `pii-buffer.local.json` — **solo si** el investigador activó el modo
  confidencial. Nunca debe llegar a APU-05; si lo ves en un paquete de
  entrada, es un error de quien te lo entregó, no lo proceses.

**Reglas de lectura obligatorias:**

1. **Trabaja sobre `[base]_cleaned.json`, no sobre `[base]_trazabilidad.json`.**
   El primero es tu materia prima (parecida a como llegó de APU-03); el
   segundo es evidencia forense para auditoría, no para análisis.
2. **No proceses un `cleaned.json` si `finalizedByHuman` es `false`.**
   Significa que un humano todavía no completó la revisión; el texto puede
   cambiar. Ese campo vive en la raíz de `cleaned.json` (no dentro de un
   `auditLog` anidado — el `auditLog` completo está en `trazabilidad.json`).
3. **`speakers[]`, `covariateProject`, `covariateSchema` son datos de VarOps,
   agnósticos.** No asumas ninguna clave fija (`age`, `sex`, `diagnosis`...).
   Lee lo que exista dinámicamente; puede venir vacío o `null` si el estudio
   no usó VarOps.
4. **Los placeholders de PII (`[PERSONA_1]`, `[HOSPITAL_A]`...) son
   relacionales dentro de un mismo archivo/caso**, no entre archivos
   distintos del mismo lote: `[PERSONA_1]` en `caso-a_cleaned.json` no es
   necesariamente la misma persona que `[PERSONA_1]` en `caso-b_cleaned.json`.
5. Si necesitas cruzar un segmento de `cleaned.json` con su historial de
   cambios, únelo por `segmentId` con el `trazabilidad.json` del mismo caso;
   nunca asumas que ambos archivos van a tener el mismo orden salvo que lo
   verifiques (ambos se generan en el mismo orden, pero no dependas de eso
   implícitamente).
6. Todo resultado analítico que produzcas debe poder trazarse de vuelta a
   `segmentId` (y de ahí a `start`/`end`/`speaker` del mismo archivo) — es el
   principio de auditabilidad de todo el ecosistema APU, no solo de APU-04.

Si tienes dudas sobre un campo específico, la fuente de verdad es
`docs/CONTRACTS.md` de este repositorio (APU-04), no este documento —
actualízalo si detectas una discrepancia.
