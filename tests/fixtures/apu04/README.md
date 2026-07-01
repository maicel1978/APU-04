# Fixtures APU-04

Datos de prueba realistas para el pipeline de limpieza (no triviales tipo
"hola mundo"), para reducir el riesgo de que el código pase tests
artificiales pero falle con datos reales.

## Archivos

- `caso-001-entrada.json` — entrada canónica (post-adaptador) de un caso
  ficticio de estudio clínico, con 6 segmentos diseñados para cubrir: error
  de glosario bioestadístico (seg-001), PII a enmascarar — nombre, fecha y
  hospital (seg-002), anomalía por WPM alto (seg-003), anomalía por pausa
  larga entre segmentos (seg-004), anomalía por WPM bajo (seg-005), y un
  segmento control con solo un error de puntuación/capitalización (seg-006).
- `caso-001-clean-esperado.json` — salida esperada del pipeline **antes** de
  cualquier intervención humana, es decir con `aiSuggested: true` y
  `editedByHuman: false` en todos los segmentos.

## Reglas de comparación para los tests

Campos que **deben coincidir exactamente** entre el resultado del pipeline y
`caso-001-clean-esperado.json`:

- `studyId`, `covariates` (todas las claves).
- Por segmento: `segmentId`, `originalText`, `cleanedText`, `confidence`,
  `wpm` (tolerancia ±0.01 por redondeo de punto flotante), `anomalous`,
  `aiSuggested`, `editedByHuman`.
- `modificationsLog`: mismo número de entradas, mismos `type`, mismos
  `before`/`after` (el `timestamp` se excluye de la comparación).

Campos dependientes del tiempo de ejecución, excluidos de la comparación
exacta (solo se verifica que existen y tienen el formato correcto):

- `auditLog.lastModified`.
- `modificationsLog[].timestamp`.
- `source_hash` y cualquier hash dentro de `sourceRefs` (dependen de SHA-256
  sobre archivos binarios que no se incluyen en este fixture; quedan `null`
  a propósito).

## Nota sobre `sourceRefs`

Los nombres de archivo en `sourceRefs` son ilustrativos (no existen
físicamente en este fixture) y sus campos de hash quedan en `null` a
propósito, ya que no se incluyen archivos binarios reales de audio/
transcripción. El pipeline trata esto como un caso válido: hash `null`
cuando el archivo fuente no está disponible, nunca debe fallar por su
ausencia.
