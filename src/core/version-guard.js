/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Versionado defensivo del esquema: no migra datos entre versiones, solo
 * detecta una versión de schemaVersion distinta a la soportada y devuelve un
 * mensaje claro para que la UI avise al usuario en vez de fallar de forma
 * confusa. v2: distingue explícitamente la versión de ENTRADA (declarada por
 * APU-03, "3.0.0") de la versión de SALIDA (declarada por APU-04); son
 * números independientes que nunca deben compararse entre sí
 * (docs/DECISIONS.md, migración v1→v2). v3 (2026-07): sube la versión de
 * salida a "5.0.0" al separar `[base]_cleaned.json` (sin traza forense) de
 * `[base]_trazabilidad.json` (traza completa) — ver src/core/export-package.js.
 * Esta constante valida el documento de TRABAJO interno (cleanJson), que
 * sigue trayendo ambas partes juntas; los archivos ya separados que se
 * exportan declaran su propio `schemaVersion` igual a este valor.
 */

// Versión de entrada soportada: la que exporta APU-03 (speakers.json).
export const SUPPORTED_INPUT_SCHEMA_VERSION = '3.0.0';

// Versión de salida que produce esta build de APU-04 (contrato hacia APU-05).
export const SUPPORTED_OUTPUT_SCHEMA_VERSION = '5.0.0';

/**
 * Verifica de forma defensiva si un documento de ENTRADA (`speakers.json` de
 * APU-03) declara la versión de esquema soportada por esta build. Nunca
 * lanza: siempre devuelve un resultado estructurado (R6).
 *
 * @param {*} doc - documento candidato, se espera `{ schemaVersion, unit: "APU-03", ... }`.
 * @returns {{ ok: boolean, message: string|null, foundVersion: string|null }}
 */
export function checkInputSchemaVersion(doc) {
  return checkVersion(doc, SUPPORTED_INPUT_SCHEMA_VERSION, 'entrada (speakers.json de APU-03)');
}

/**
 * Verifica de forma defensiva si un documento de SALIDA (`[base]_cleaned.json`
 * u otro artefacto ya generado por APU-04, p. ej. al reabrir una sesión)
 * declara la versión de esquema soportada por esta build.
 *
 * @param {*} doc - documento candidato, se espera `{ schemaVersion, unit: "APU-04", ... }`.
 * @returns {{ ok: boolean, message: string|null, foundVersion: string|null }}
 */
export function checkOutputSchemaVersion(doc) {
  return checkVersion(doc, SUPPORTED_OUTPUT_SCHEMA_VERSION, 'salida de APU-04 (cleaned.json)');
}

function checkVersion(doc, supportedVersion, description) {
  if (doc === null || typeof doc !== 'object') {
    return {
      ok: false,
      foundVersion: null,
      message: `El archivo de ${description} no tiene un formato reconocible (no es un objeto JSON válido).`,
    };
  }

  const foundVersion = typeof doc.schemaVersion === 'string' ? doc.schemaVersion : null;

  if (foundVersion === null) {
    return {
      ok: false,
      foundVersion: null,
      message: `El archivo de ${description} no declara "schemaVersion". No se puede continuar sin saber con qué versión del esquema fue generado.`,
    };
  }

  if (foundVersion !== supportedVersion) {
    return {
      ok: false,
      foundVersion,
      message: `El archivo de ${description} fue generado con la versión de esquema "${foundVersion}", pero esta aplicación solo admite la versión "${supportedVersion}". Actualice la aplicación o convierta el archivo antes de continuar; no se procesará para evitar datos inconsistentes.`,
    };
  }

  return { ok: true, foundVersion, message: null };
}
