/**
 * Versionado defensivo del esquema: no migra datos entre versiones, solo
 * detecta una versión de schemaVersion distinta a la soportada y devuelve un
 * mensaje claro para que la UI avise al usuario en vez de fallar de forma
 * confusa.
 */

// Única versión de schemaVersion soportada por esta build de APU-04. Si en el
// futuro se soportan varias versiones a la vez, esta constante pasa a ser una
// lista y `checkSchemaVersion` deja de comparar por igualdad estricta.
export const SUPPORTED_SCHEMA_VERSION = '1.0.0';

/**
 * Verifica de forma defensiva si un documento (`clean.json`, `pii-buffer.local.json`
 * o un archivo de sesión) declara la versión de esquema soportada por esta build.
 * Nunca lanza: siempre devuelve un resultado estructurado (R6).
 *
 * @param {*} doc - documento candidato, se espera `{ schemaVersion, ... }`.
 * @returns {{ ok: boolean, message: string|null, foundVersion: string|null }}
 */
export function checkSchemaVersion(doc) {
  if (doc === null || typeof doc !== 'object') {
    return {
      ok: false,
      foundVersion: null,
      message: 'El archivo no tiene un formato reconocible (no es un objeto JSON válido).',
    };
  }

  const foundVersion = typeof doc.schemaVersion === 'string' ? doc.schemaVersion : null;

  if (foundVersion === null) {
    return {
      ok: false,
      foundVersion: null,
      message: 'El archivo no declara "schemaVersion". No se puede continuar sin saber con qué versión del esquema fue generado.',
    };
  }

  if (foundVersion !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      foundVersion,
      message: `Este archivo fue generado con la versión de esquema "${foundVersion}", pero esta aplicación solo admite la versión "${SUPPORTED_SCHEMA_VERSION}". Actualice la aplicación o convierta el archivo antes de continuar; no se procesará para evitar datos inconsistentes.`,
    };
  }

  return { ok: true, foundVersion, message: null };
}
