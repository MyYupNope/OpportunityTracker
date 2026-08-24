/**
 * Node.js Automated Test Suite for OpportunityTracker Storage Layer (Storage.js)
 * Validates IndexedDB initialization, CRUD, >6MB capacity stress test,
 * legacy localStorage migration, and encryption roundtrips.
 */

import assert from 'node:assert/strict';

// 1. Setup in-memory mock environment for Node.js
class MockObjectStore {
  constructor(map) {
    this.map = map;
  }
  get(key) {
    const req = { onsuccess: null, onerror: null, result: this.map.get(key) };
    queueMicrotask(() => req.onsuccess && req.onsuccess({ target: req }));
    return req;
  }
  put(value, key) {
    this.map.set(key, value);
    const req = { onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess({ target: req }));
    return req;
  }
  delete(key) {
    this.map.delete(key);
    const req = { onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess({ target: req }));
    return req;
  }
  clear() {
    this.map.clear();
    const req = { onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess({ target: req }));
    return req;
  }
}

class MockTransaction {
  constructor(storeMap) {
    this.storeMap = storeMap;
  }
  objectStore(name) {
    return new MockObjectStore(this.storeMap);
  }
}

class MockDatabase {
  constructor(name) {
    this.name = name;
    this.objectStoreNames = {
      contains: (s) => s === 'cacheStore'
    };
    this.storeMap = new Map();
  }
  transaction(storeName, mode) {
    return new MockTransaction(this.storeMap);
  }
  createObjectStore(name) {
    return new MockObjectStore(this.storeMap);
  }
}

const mockDBInstance = new MockDatabase('OpportunityTrackerDB');

global.window = {};
global.indexedDB = {
  open: (name, version) => {
    const req = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: mockDBInstance
    };
    queueMicrotask(() => {
      if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: mockDBInstance } });
      if (req.onsuccess) req.onsuccess({ target: { result: mockDBInstance } });
    });
    return req;
  }
};
global.window.indexedDB = global.indexedDB;

const localStorageStore = new Map();
global.localStorage = {
  getItem: (k) => localStorageStore.get(k) || null,
  setItem: (k, v) => {
    // Enforce 5MB limit simulation for localStorage
    const totalBytes = Array.from(localStorageStore.values()).reduce((acc, str) => acc + str.length, 0) + v.length;
    if (totalBytes > 5 * 1024 * 1024) {
      const err = new Error("Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.");
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    }
    localStorageStore.set(k, String(v));
  },
  removeItem: (k) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear()
};

// 2. Import modules to test
const { getCache, setCache, deleteCache, clearAllCache } = await import('../js/Storage.js');
const { encryptCacheData, decryptCacheData } = await import('../js/Utils.js');

// 3. Test Runner
const results = [];

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, status: 'PASS', duration });
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ name, status: 'FAIL', duration, error: err.message });
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${name} (${duration}ms)`);
    console.error(err);
  }
}

console.log('\n========================================================');
console.log(' RUNNING OPPORTUNITY TRACKER INDEXEDDB TEST SUITE');
console.log('========================================================\n');

// TC-01: Basic CRUD Operations
await runTest('TC-01: Basic CRUD in IndexedDB', async () => {
  const key = 'test_crud_key';
  const testPayload = { message: 'Hello IndexedDB', timestamp: 123456 };

  const writeResult = await setCache(key, testPayload);
  assert.equal(writeResult, true, 'setCache should return true');

  const readResult = await getCache(key);
  assert.deepEqual(readResult, testPayload, 'getCache should match original payload');

  const deleteResult = await deleteCache(key);
  assert.equal(deleteResult, true, 'deleteCache should return true');

  const readAfterDelete = await getCache(key);
  assert.equal(readAfterDelete, null, 'getCache should return null after deletion');
});

// TC-02: High-Capacity & Quota Verification (>6 MB payload)
await runTest('TC-02: High Capacity Storage (>6 MB) Exceeds localStorage but Passes in IndexedDB', async () => {
  const largeCsv = 'Company,Role,Status,Salary,Notes\n' + 'Google,Senior Eng,Interviewing,220k,Strong fit\n'.repeat(150000);
  const largeBytes = Buffer.byteLength(largeCsv, 'utf8');
  assert.ok(largeBytes > 6 * 1024 * 1024, `Payload size is ${(largeBytes / (1024 * 1024)).toFixed(2)} MB`);

  // Verify that localStorage fails with QuotaExceededError
  let localStorageFailed = false;
  try {
    localStorage.setItem('large_temp_key', largeCsv);
  } catch (e) {
    localStorageFailed = (e.name === 'QuotaExceededError');
  }
  assert.equal(localStorageFailed, true, 'localStorage must reject >5MB with QuotaExceededError');

  // Verify that IndexedDB accepts the large payload effortlessly
  const writeOk = await setCache('large_dataset_cache', { csv: largeCsv, timestamp: Date.now() });
  assert.equal(writeOk, true, 'IndexedDB setCache should succeed for >6MB');

  const readData = await getCache('large_dataset_cache');
  assert.ok(readData && readData.csv.length === largeCsv.length, 'Retrieved payload length must match original');

  await deleteCache('large_dataset_cache');
});

// TC-03: Legacy localStorage Auto-Migration & Cleanup
await runTest('TC-03: Legacy localStorage Auto-Migration and Cleanup', async () => {
  const legacyKey = 'talent_tracker_csv_cache';
  const legacyData = { csv: 'Legacy,CSV,Data', encrypted: false, timestamp: 999999 };

  // Pre-seed in localStorage
  localStorage.setItem(legacyKey, JSON.stringify(legacyData));
  assert.ok(localStorage.getItem(legacyKey) !== null, 'Legacy item should exist in localStorage');

  // getCache should find legacy item, return it, and remove from localStorage
  const retrieved = await getCache(legacyKey);
  assert.deepEqual(retrieved, legacyData, 'getCache should retrieve and parse legacy localStorage item');
  assert.equal(localStorage.getItem(legacyKey), null, 'getCache must clean up legacy key from localStorage');
});

// TC-04: Encryption / Decryption Roundtrip with IndexedDB
await runTest('TC-04: Full Encryption & Decryption Roundtrip in IndexedDB', async () => {
  const rawCsv = 'Company Name,Job Title,Application Status,Location\nAcme Corp,Staff Engineer,Applied,Remote\nNova Inc,Lead,Offer,London';
  const encrypted = encryptCacheData(rawCsv);
  assert.notEqual(encrypted, rawCsv, 'Encrypted string must differ from raw text');

  const cacheObject = { csv: encrypted, encrypted: true, timestamp: Date.now() };
  await setCache('enc_test_key', cacheObject);

  const fromDb = await getCache('enc_test_key');
  assert.equal(fromDb.encrypted, true);

  const decrypted = decryptCacheData(fromDb.csv);
  assert.equal(decrypted, rawCsv, 'Decrypted text must exactly match the original raw CSV');

  await deleteCache('enc_test_key');
});

// TC-05: Cache Store Reset (clearAllCache)
await runTest('TC-05: Cache Store Reset via clearAllCache', async () => {
  await setCache('k1', 'val1');
  await setCache('k2', 'val2');

  assert.equal(await getCache('k1'), 'val1');
  assert.equal(await getCache('k2'), 'val2');

  const clearOk = await clearAllCache();
  assert.equal(clearOk, true);

  assert.equal(await getCache('k1'), null);
  assert.equal(await getCache('k2'), null);
});

// 4. Print Summary
console.log('\n--------------------------------------------------------');
const passCount = results.filter(r => r.status === 'PASS').length;
const failCount = results.filter(r => r.status === 'FAIL').length;
console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('--------------------------------------------------------\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32m✨ ALL TEST CASES PASSED SUCCESSFULLY!\x1b[0m\n');
}
