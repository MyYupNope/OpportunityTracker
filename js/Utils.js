import { FORM_TIMEOUT_MS } from './Config.js';

/**
 * Utility functions for OpportunityTracker
 */

const CACHE_SECRET_KEY = 'Interviewz_SecureCache_v1';

/**
 * Lightweight XOR + Base64 encryption for sensitive localStorage data
 */
export function encryptCacheData(dataStr) {
  if (!dataStr) return '';
  try {
    const key = CACHE_SECRET_KEY;
    let result = '';
    for (let i = 0; i < dataStr.length; i++) {
      result += String.fromCharCode(dataStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(unescape(encodeURIComponent(result)));
  } catch (e) {
    return dataStr;
  }
}

/**
 * Decrypts data stored by encryptCacheData
 */
export function decryptCacheData(encodedStr) {
  if (!encodedStr) return '';
  try {
    const raw = decodeURIComponent(escape(atob(encodedStr)));
    const key = CACHE_SECRET_KEY;
    let result = '';
    for (let i = 0; i < raw.length; i++) {
      result += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    return encodedStr;
  }
}

/**
 * Safely sanitizes external URLs to prevent malicious protocols (javascript:, data:, etc.)
 */
export function sanitizeUrl(urlStr) {
  if (!urlStr) return '#';
  const trimmed = String(urlStr).trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return '#';
  }
  if (!lower.startsWith('http://') && !lower.startsWith('https://') && !lower.startsWith('#')) {
    return 'https://' + trimmed;
  }
  return trimmed;
}

/**
 * Escapes HTML to prevent XSS injection
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const _domParser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

/**
 * Strict DOM-based HTML Sanitizer.
 * Sanitizes arbitrary HTML strings allowing only safe formatting tags and safe attributes.
 */
export function sanitizeHtml(dirtyHtml) {
  if (!dirtyHtml) return '';
  const ALLOWED_TAGS = new Set([
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'LI',
    'STRONG', 'EM', 'B', 'I', 'CODE', 'PRE', 'BLOCKQUOTE', 'BR', 'HR',
    'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN', 'A'
  ]);
  const ALLOWED_ATTRS = new Set(['class', 'id', 'style', 'target', 'rel', 'href']);

  try {
    const parser = _domParser || new DOMParser();
    const doc = parser.parseFromString(`<body>${dirtyHtml}</body>`, 'text/html');

    const cleanNode = (node) => {
      const children = Array.from(node.childNodes);
      children.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tagName = child.nodeName.toUpperCase();
          if (!ALLOWED_TAGS.has(tagName)) {
            const textNode = doc.createTextNode(child.textContent);
            node.replaceChild(textNode, child);
            return;
          }

          const attrs = Array.from(child.attributes);
          attrs.forEach(attr => {
            const attrName = attr.name.toLowerCase();
            if (!ALLOWED_ATTRS.has(attrName) || attrName.startsWith('on')) {
              child.removeAttribute(attr.name);
            } else if (attrName === 'href') {
              const val = attr.value.trim().toLowerCase();
              if (val.startsWith('javascript:') || val.startsWith('data:') || val.startsWith('vbscript:')) {
                child.removeAttribute('href');
              }
            }
          });

          if (tagName === 'A') {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }

          cleanNode(child);
        }
      });
    };

    cleanNode(doc.body);
    return doc.body.innerHTML;
  } catch (e) {
    return escapeHtml(dirtyHtml);
  }
}

/**
 * Date Parser helper (DD-MM-YYYY)
 */
export function parseDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const d = new Date(parts[2], parts[1] - 1, parts[0]);
    if (!isNaN(d.getTime())) return d;
  }
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) {
    console.warn(`[OpportunityTracker] Could not parse date: "${dateStr}"`);
    return new Date(0);
  }
  return new Date(parsed);
}

/**
 * Formats a DD-MM-YYYY date into DD-MM-YYYY (We) format
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = parseDate(dateStr);
  if (date.getTime() === 0) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return `${day}-${month}-${year} (${weekdays[date.getDay()]})`;
}

/**
 * Generates or retrieves a persistent per-session CSRF token
 */
function getCsrfToken() {
  const key = 'app_csrf_token';
  let token = null;
  try {
    token = sessionStorage.getItem(key);
  } catch (e) {
    // sessionStorage unavailable
  }
  if (!token) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    } else {
      token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
    try {
      sessionStorage.setItem(key, token);
    } catch (e) {
      // sessionStorage unavailable
    }
  }
  return token;
}

/**
 * Validates request origin against allowed application origins
 */
function isRequestOriginValid() {
  if (typeof window === 'undefined' || !window.location) return true;
  const origin = window.location.origin;
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('myyupnope.github.io') ||
    origin.startsWith('file://')
  );
}

/**
 * Shared form submission utility.
 * Handles AbortController timeout, anti-CSRF token injection, fetch, JSON result check, and error routing
 */
export async function postForm(url, formData, { setLoading = () => {}, onSuccess = () => {}, onError = () => {}, timeoutMs = FORM_TIMEOUT_MS } = {}) {
  setLoading(true);

  // 1. Origin Guard
  if (!isRequestOriginValid()) {
    const err = new Error('Submission blocked: Invalid request origin.');
    console.error('[postForm] Security check failed: unauthorized origin', typeof window !== 'undefined' ? window.location.origin : '');
    onError(err);
    setLoading(false);
    return;
  }

  // 2. Anti-CSRF Token & Timestamp Payload Injection
  const csrfToken = getCsrfToken();
  const timestamp = Date.now().toString();

  if (formData instanceof FormData) {
    if (!formData.has('_csrf')) formData.append('_csrf', csrfToken);
    if (!formData.has('_ts')) formData.append('_ts', timestamp);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      controller.abort(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`));
    } catch (e) {
      controller.abort();
    }
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': csrfToken,
        'X-Submission-Timestamp': timestamp
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errText}`);
    }

    const text = await response.text();
    let result = { ok: true };
    if (text.trim()) {
      try {
        result = JSON.parse(text);
      } catch (e) {
        // If it's not valid JSON but the status is OK, we treat it as successful
        result = { ok: true, message: text };
      }
    }
    if (result.ok === true || result.success === true) {
      onSuccess(result);
    } else {
      throw new Error(result.message || 'The submission was not successful. Please try again.');
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[postForm] error:', err);
    const safeErr = new Error(sanitizeErrorMessage(err));
    safeErr.name = err ? err.name : 'Error';
    onError(safeErr);
  } finally {
    setLoading(false);
  }
}

/**
 * Sanitizes error messages to prevent exposing verbose stack traces or internal server paths
 */
function sanitizeErrorMessage(err) {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const isAbort = (err && err.name === 'AbortError') ||
                  (typeof err === 'string' && err.includes('AbortError')) ||
                  (err && err.message && (err.message.includes('AbortError') || err.message.includes('aborted') || err.message.includes('timed out')));
  if (isAbort) {
    return 'Request timed out. Please check your connection and try again.';
  }
  const raw = typeof err === 'string' ? err : (err.message || String(err));
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return 'Network error: Unable to reach server. Please try again later.';
  }
  const clean = raw.replace(/at\s+.*:\d+:\d+/g, '').replace(/https?:\/\/[^\s]+/g, '[URL]').trim();
  return clean.length > 150 ? clean.substring(0, 150) + '...' : clean;
}


/**
 * Safely parses any cached timestamp format into epoch milliseconds
 */
export function parseCacheTimestamp(timestamp) {
  if (!timestamp) return null;
  
  // 1. Check if it's already a millisecond number/numeric string
  const num = Number(timestamp);
  if (!isNaN(num) && num > 1000000000000) {
    return num;
  }
  
  // 2. Check if it's a parseable ISO or full date string
  const str = String(timestamp).trim();
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return parsed;
  }
  
  // 3. Check if it's a time-only string like "14:59" or "Synced 14:59"
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    
    // If the parsed time is in the future relative to now, roll back by one day
    if (d.getTime() > Date.now()) {
      d.setDate(d.getDate() - 1);
    }
    return d.getTime();
  }
  
  return null;
}

