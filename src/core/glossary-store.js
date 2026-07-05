/**
 * PRISMA+ v5.2 — Vanilla JS ES2022+ Modules
 * Runtime: NO frameworks (R1)
 * Persistencia local del glosario editable (mejora 2026-07, idea del
 * usuario: "glossary.json editable desde la app, reutilizable"). Mismo
 * patrón que session-store.js: adaptador de almacenamiento inyectable
 * (testeable sin navegador real), 100% local, sin red.
 *
 * El glosario cargado al iniciar (`assets/data/glossary.json`) es el punto
 * de partida; las entradas que el investigador agrega/edita en la sesión se
 * guardan en localStorage bajo una clave fija, y sobreviven a recargar la
 * página. Exportar/Importar como archivo permite compartirlo entre equipos o
 * reutilizarlo en otra computadora (igual que session-store.js
 * exportSessionFile/importSessionFile).
 */

const GLOSSARY_STORAGE_KEY = 'apu04_glossary_overrides';

/**
 * Crea un almacén local para las entradas de glosario añadidas/editadas por
 * el investigador durante el uso de la aplicación.
 *
 * @param {{ getItem: (k:string)=>string|null, setItem:(k:string,v:string)=>void,
 *           removeItem:(k:string)=>void }} [storageAdapter]
 * @returns {{ loadOverrides: () => object[], saveOverrides: (entries: object[]) => void,
 *             clearOverrides: () => void }}
 */
export function createGlossaryStore(storageAdapter) {
  const storage = storageAdapter ?? getDefaultStorage();

  function loadOverrides() {
    const raw = storage.getItem(GLOSSARY_STORAGE_KEY);
    if (raw === null || raw === undefined) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      // Datos corruptos en almacenamiento local: se ignoran en vez de romper
      // el arranque de la aplicación (R6, defensivo).
      return [];
    }
  }

  function saveOverrides(entries) {
    if (!Array.isArray(entries)) {
      throw new Error('Las entradas del glosario deben ser una lista.');
    }
    try {
      storage.setItem(GLOSSARY_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      throw new Error('No se pudo guardar el glosario. El almacenamiento local podría estar lleno o no disponible.');
    }
  }

  function clearOverrides() {
    storage.removeItem(GLOSSARY_STORAGE_KEY);
  }

  return { loadOverrides, saveOverrides, clearOverrides };
}

/**
 * Combina el glosario base (cargado de assets/data/glossary.json) con las
 * entradas que el investigador agregó/editó en esta sesión. Las entradas
 * guardadas con el mismo `wrong` (insensible a mayúsculas) reemplazan a la
 * entrada base correspondiente, en vez de duplicarla.
 *
 * @param {{ wrong: string, correct: string, exact?: boolean }[]} baseEntries
 * @param {{ wrong: string, correct: string, exact?: boolean }[]} overrideEntries
 * @returns {{ wrong: string, correct: string, exact?: boolean }[]}
 */
export function mergeGlossaryEntries(baseEntries, overrideEntries) {
  const base = Array.isArray(baseEntries) ? baseEntries : [];
  const overrides = Array.isArray(overrideEntries) ? overrideEntries : [];

  const merged = new Map(base.map((entry) => [normalizeKey(entry.wrong), entry]));
  for (const entry of overrides) {
    merged.set(normalizeKey(entry.wrong), entry);
  }
  return [...merged.values()];
}

function normalizeKey(wrong) {
  return typeof wrong === 'string' ? wrong.trim().toLocaleLowerCase('es') : '';
}

function getDefaultStorage() {
  if (typeof globalThis.localStorage !== 'undefined') {
    return globalThis.localStorage;
  }
  throw new Error('No hay almacenamiento local disponible en este entorno. Proporcione un adaptador de almacenamiento.');
}
