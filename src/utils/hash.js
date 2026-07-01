/**
 * Cálculo de source_hash y sourceRefs.*Hash (docs/CONTRACTS.md §8) usando
 * Web Crypto API, 100% local, sin red.
 */

/**
 * Calcula el hash SHA-256 (hexadecimal) de una cadena de texto o buffer,
 * usando la Web Crypto API disponible tanto en navegadores modernos como en
 * Node.js ≥18 (globalThis.crypto.subtle), sin dependencias externas.
 *
 * @param {string|ArrayBuffer|Uint8Array} data
 * @returns {Promise<string>} hash en hexadecimal minúsculas
 */
export async function sha256Hex(data) {
  if (data === null || data === undefined) {
    throw new Error('No se proporcionaron datos para calcular el hash.');
  }

  try {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
  } catch (error) {
    throw new Error('No se pudo calcular el hash del archivo. Verifique que el archivo no esté dañado.');
  }
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
