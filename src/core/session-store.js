/**
 * Autoguardado de progreso de revisión y exportación/importación manual de
 * una sesión en curso. 100% local (localStorage o adaptador inyectado para
 * pruebas), sin red.
 */

const SESSION_KEY_PREFIX = 'apu04_session_';

/**
 * Crea un almacén de sesión para autoguardado de progreso durante la
 * revisión humana. `storageAdapter` es inyectable para permitir pruebas
 * sin depender de un navegador real (localStorage no existe en Node puro);
 * por defecto usa `globalThis.localStorage` si está disponible.
 *
 * @param {{ getItem: (k:string)=>string|null, setItem:(k:string,v:string)=>void,
 *           removeItem:(k:string)=>void }} [storageAdapter]
 * @returns {{ saveSession: Function, loadSession: Function, clearSession: Function,
 *             exportSessionFile: Function, importSessionFile: Function }}
 */
export function createSessionStore(storageAdapter) {
  const storage = storageAdapter ?? getDefaultStorage();

  function saveSession(sessionId, data) {
    assertSessionId(sessionId);
    try {
      storage.setItem(SESSION_KEY_PREFIX + sessionId, JSON.stringify(data));
    } catch (error) {
      throw new Error('No se pudo guardar el progreso de la sesión. El almacenamiento local podría estar lleno o no disponible.');
    }
  }

  function loadSession(sessionId) {
    assertSessionId(sessionId);
    const raw = storage.getItem(SESSION_KEY_PREFIX + sessionId);
    if (raw === null || raw === undefined) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error('El progreso guardado de la sesión está dañado y no se pudo leer.');
    }
  }

  function clearSession(sessionId) {
    assertSessionId(sessionId);
    storage.removeItem(SESSION_KEY_PREFIX + sessionId);
  }

  return { saveSession, loadSession, clearSession, exportSessionFile, importSessionFile };
}

function assertSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new Error('El identificador de sesión no es válido.');
  }
}

/**
 * Serializa una sesión en progreso como texto JSON para exportación manual
 * (archivo `[case]_session.local.json`), permitiendo retomar el trabajo en
 * otra computadora o en otro día (docs/DECISIONS.md §2.1).
 *
 * @param {object} data
 * @returns {string}
 */
export function exportSessionFile(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Reconstruye una sesión en progreso a partir del texto JSON de un archivo
 * de sesión previamente exportado.
 *
 * @param {string} jsonText
 * @returns {object}
 */
export function importSessionFile(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error('No se pudo importar el archivo de sesión: no es un JSON válido.');
  }
}

function getDefaultStorage() {
  if (typeof globalThis.localStorage !== 'undefined') {
    return globalThis.localStorage;
  }
  throw new Error('No hay almacenamiento local disponible en este entorno. Proporcione un adaptador de almacenamiento.');
}
