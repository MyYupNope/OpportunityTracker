/**
 * Storage.js — Native IndexedDB Storage Utility for OpportunityTracker
 * Provides asynchronous, high-capacity key-value storage for large datasets (Google Sheet CSV cache).
 * Transparently falls back to localStorage migration and handles browser permission edge cases.
 */

const DB_NAME = 'OpportunityTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'cacheStore';

let dbPromise = null;

/**
 * Opens and initializes the IndexedDB database instance.
 * Reuses a singleton Promise for optimal connection management.
 */
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : (typeof window !== 'undefined' ? window.indexedDB : null);
    if (!idb) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.warn('[Storage] IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

/**
 * Retrieves a cached item by key from IndexedDB.
 * Falls back to legacy localStorage if present, migrates it, and clears the legacy entry.
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function getCache(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          if (req.result !== undefined) {
            resolve(req.result);
          } else {
            // Check legacy localStorage fallback for migration
            resolve(migrateLegacyLocalStorage(key));
          }
        };

        req.onerror = () => {
          resolve(migrateLegacyLocalStorage(key));
        };
      } catch (e) {
        resolve(migrateLegacyLocalStorage(key));
      }
    });
  } catch (e) {
    // If IndexedDB failed to open (e.g. strict private browsing), fallback to legacy storage
    return migrateLegacyLocalStorage(key);
  }
}

/**
 * Stores a value under the given key in IndexedDB.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<boolean>}
 */
export async function setCache(key, value) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);

        req.onsuccess = () => {
          // Remove any legacy localStorage entry to save quota
          try { localStorage.removeItem(key); } catch (err) {}
          resolve(true);
        };

        req.onerror = (event) => {
          console.warn('[Storage] Failed to write item to IndexedDB:', event.target.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('[Storage] Transaction error on setCache:', e);
        resolve(false);
      }
    });
  } catch (e) {
    console.warn('[Storage] Could not open IndexedDB for setCache:', e);
    return false;
  }
}

/**
 * Deletes a cached item from IndexedDB and legacy localStorage.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function deleteCache(key) {
  try {
    // Also remove from legacy localStorage
    try { localStorage.removeItem(key); } catch (e) {}

    const db = await openDB();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (e) {
    return false;
  }
}

/**
 * Clears the entire cache store in IndexedDB.
 * @returns {Promise<boolean>}
 */
export async function clearAllCache() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  } catch (e) {
    return false;
  }
}

/**
 * Helper to migrate legacy localStorage key to return value and clean up localStorage.
 * @param {string} key
 * @returns {any}
 */
function migrateLegacyLocalStorage(key) {
  try {
    const legacyVal = localStorage.getItem(key);
    if (!legacyVal) return null;
    let parsed = legacyVal;
    try {
      parsed = JSON.parse(legacyVal);
    } catch (e) {
      // not JSON, leave as raw string
    }
    // Clean legacy storage entry
    try { localStorage.removeItem(key); } catch (e) {}
    return parsed;
  } catch (e) {
    return null;
  }
}
