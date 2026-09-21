/**
 * Automated Verification Suite for Card Colors by Application Status
 * Tests card color classes and age tints across all columns and statuses.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Read and parse js/app.js to test syncCardAgeTint behavior in a controlled mock environment
const appJsPath = path.resolve('js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Extract CARD_COLOR_CLASSES and syncCardAgeTint & computeApplicationAge from js/app.js
const extractFunction = (src, name) => {
  const marker = `function ${name}(`;
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error(`Could not find function ${name}`);
  let braceCount = 0;
  let started = false;
  let endIdx = idx;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') {
      braceCount++;
      started = true;
    } else if (src[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return src.substring(idx, endIdx);
};

const computeAgeFnCode = extractFunction(appJsContent, 'computeApplicationAge');
const syncCardFnCode = extractFunction(appJsContent, 'syncCardAgeTint');

// Build isolated execution context
const testContext = new Function(
  'parseDate', 'AGE_RED_LIMIT_DAYS', 'AGE_GREEN_LIMIT_DAYS',
  `
  const CARD_COLOR_CLASSES = ['age-green', 'age-amber', 'age-red', 'status-card-offer', 'status-card-accepted'];
  ${computeAgeFnCode}
  ${syncCardFnCode}
  return { CARD_COLOR_CLASSES, computeApplicationAge, syncCardAgeTint };
`
);

// Simple mock parseDate
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const { CARD_COLOR_CLASSES, computeApplicationAge, syncCardAgeTint } = testContext(
  parseDate, 30, 15
);

// Mock DOM Element
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(cls) { this.classes.add(cls); }
  remove(cls) { this.classes.delete(cls); }
  contains(cls) { return this.classes.has(cls); }
  toArray() { return Array.from(this.classes); }
}

class MockElement {
  constructor() {
    this.classList = new MockClassList();
    this.title = '';
  }
  removeAttribute(attr) {
    if (attr === 'title') this.title = '';
  }
}

console.log('\n========================================================');
console.log(' RUNNING APPLICATION STATUS CARD COLOR TESTS');
console.log('========================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✔ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`✖ FAIL: ${name}`);
    console.error(e);
    failed++;
  }
}

// TC-01: Status 'Offer' in 'Offered' column receives status-card-offer and no age tint
runTest('TC-01: Offer status gets light grey class (status-card-offer)', () => {
  const el = new MockElement();
  const app = {
    'Application Status': 'Offer',
    'Create Date': '2020-01-01' // Very old date, would normally be age-red
  };
  syncCardAgeTint(el, app, 'Offered');

  assert.equal(el.classList.contains('status-card-offer'), true, 'Should have status-card-offer');
  assert.equal(el.classList.contains('status-card-accepted'), false, 'Should not have status-card-accepted');
  assert.equal(el.classList.contains('age-red'), false, 'Should not have age-red');
  assert.equal(el.classList.contains('age-amber'), false, 'Should not have age-amber');
  assert.equal(el.classList.contains('age-green'), false, 'Should not have age-green');
  assert.equal(el.title, 'Status: Offer');
});

// TC-02: Status 'Offered' in 'Offered' column receives status-card-offer
runTest('TC-02: Offered status gets light grey class (status-card-offer)', () => {
  const el = new MockElement();
  const app = {
    'Application Status': 'Offered',
    'Create Date': '2020-01-01'
  };
  syncCardAgeTint(el, app, 'Offered');

  assert.equal(el.classList.contains('status-card-offer'), true, 'Should have status-card-offer');
  assert.equal(el.classList.contains('status-card-accepted'), false, 'Should not have status-card-accepted');
  assert.equal(el.classList.contains('age-red'), false, 'Should not have age-red');
  assert.equal(el.title, 'Status: Offer');
});

// TC-03: Status 'Accepted' in 'Offered' column receives status-card-accepted and no age tint
runTest('TC-03: Accepted status gets light blue class (status-card-accepted)', () => {
  const el = new MockElement();
  const app = {
    'Application Status': 'Accepted',
    'Create Date': '2020-01-01'
  };
  syncCardAgeTint(el, app, 'Offered');

  assert.equal(el.classList.contains('status-card-accepted'), true, 'Should have status-card-accepted');
  assert.equal(el.classList.contains('status-card-offer'), false, 'Should not have status-card-offer');
  assert.equal(el.classList.contains('age-red'), false, 'Should not have age-red');
  assert.equal(el.title, 'Status: Accepted');
});

// TC-04: Status transition from Offer to Accepted clears old classes
runTest('TC-04: Transition from Offer to Accepted switches classes cleanly', () => {
  const el = new MockElement();
  const app = {
    'Application Status': 'Offered',
    'Create Date': '2020-01-01'
  };
  syncCardAgeTint(el, app, 'Offered');
  assert.equal(el.classList.contains('status-card-offer'), true);

  // Now change status to Accepted
  app['Application Status'] = 'Accepted';
  syncCardAgeTint(el, app, 'Offered');
  assert.equal(el.classList.contains('status-card-accepted'), true);
  assert.equal(el.classList.contains('status-card-offer'), false);
  assert.equal(el.title, 'Status: Accepted');
});

// TC-05: Remaining columns (Ready, Applied, Interviewed) preserve age tinting
runTest('TC-05: Applied column still uses age-green/amber/red based on date', () => {
  const now = new Date();
  const recentDate = new Date(now.getTime() - 2 * 86400000).toISOString();
  const midDate = new Date(now.getTime() - 20 * 86400000).toISOString();
  const oldDate = new Date(now.getTime() - 40 * 86400000).toISOString();

  const elRecent = new MockElement();
  syncCardAgeTint(elRecent, { 'Application Status': 'Applied', 'Create Date': recentDate }, 'Applied');
  assert.equal(elRecent.classList.contains('age-green'), true);

  const elMid = new MockElement();
  syncCardAgeTint(elMid, { 'Application Status': 'Applied', 'Create Date': midDate }, 'Applied');
  assert.equal(elMid.classList.contains('age-amber'), true);

  const elOld = new MockElement();
  syncCardAgeTint(elOld, { 'Application Status': 'Applied', 'Create Date': oldDate }, 'Applied');
  assert.equal(elOld.classList.contains('age-red'), true);
});

// TC-06: Rejected column has no age or status tint
runTest('TC-06: Rejected column remains neutral without status or age tint', () => {
  const el = new MockElement();
  syncCardAgeTint(el, { 'Application Status': 'Rejected', 'Create Date': '2020-01-01' }, 'Rejected');
  assert.equal(el.classList.toArray().length, 0);
  assert.equal(el.title, '');
});

// TC-07: Verify CSS contains definitions for both light and dark themes
runTest('TC-07: CSS contains theme definitions and utility classes', () => {
  const cssPath = path.resolve('css/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(cssContent.includes('--card-status-offer: #f1f3f4;'), 'Light theme --card-status-offer defined');
  assert.ok(cssContent.includes('--card-status-accepted: #e8f0fe;'), 'Light theme --card-status-accepted defined');
  assert.ok(cssContent.includes('.kanban-card.status-card-offer'), '.kanban-card.status-card-offer rule exists');
  assert.ok(cssContent.includes('.kanban-card.status-card-accepted'), '.kanban-card.status-card-accepted rule exists');
  assert.ok(cssContent.includes('var(--card-status-offer)'), 'status-card-offer references var');
  assert.ok(cssContent.includes('var(--card-status-accepted)'), 'status-card-accepted references var');
});

console.log('\n--------------------------------------------------------');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('--------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
}
