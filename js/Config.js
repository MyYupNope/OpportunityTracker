/**
 * Application configuration and API endpoints
 * Includes dynamic endpoint resolution and proxy/environment configuration.
 */

// Encoded default endpoint strings to prevent plain-text URL scraping in public JS
const _EP = {
  s: 'aHR0cHM6Ly9kb2NzLmdvb2dsZS5jb20vc3ByZWFkc2hlZXRzL2QvMUxkWG1wOXdBaWxkcVlkUkl5ekEzMkJNTVFJRERNMmtUMjVsTXJnWWVSYmsvZXhwb3J0P2Zvcm1hdD1jc3Y=',
  f: 'aHR0cHM6Ly9uZXdkYXduLnRhaWw3NGVlZjMudHMubmV0L3dlYmhvb2svamFwcG1vdGxldA==',
  n: 'aHR0cHM6Ly9uZXdkYXduLnRhaWw3NGVlZjMudHMubmV0L3dlYmhvb2svaW50ZXJwcmVwbm90ZXM=',
  d: 'aHR0cHM6Ly9uZXdkYXduLnRhaWw3NGVlZjMudHMubmV0L3dlYmhvb2svY2U1YWU4N2MtZTQ2My00NDQ1LWIxNTktOWQ5MzQ5MWRmMmI3'
};

function _decode(b64) {
  try {
    return atob(b64);
  } catch (e) {
    return '';
  }
}

/**
 * Returns optional API proxy base URL from window.APP_CONFIG if defined.
 */
function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL;
  }
  return '';
}

/**
 * Dynamic resolution getters for API endpoints with proxy override support
 */
export function getSheetExportUrl() {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.SHEET_EXPORT_URL) {
    return window.APP_CONFIG.SHEET_EXPORT_URL;
  }
  const base = getApiBaseUrl();
  if (base) return `${base}/export-csv`;
  return _decode(_EP.s);
}

export function getFormApiEndpoint() {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.FORM_API_ENDPOINT) {
    return window.APP_CONFIG.FORM_API_ENDPOINT;
  }
  const base = getApiBaseUrl();
  if (base) return `${base}/webhook/jappmotlet`;
  return _decode(_EP.f);
}

export function getNotesApiEndpoint() {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.NOTES_API_ENDPOINT) {
    return window.APP_CONFIG.NOTES_API_ENDPOINT;
  }
  const base = getApiBaseUrl();
  if (base) return `${base}/webhook/interprepnotes`;
  return _decode(_EP.n);
}

export function getDeleteApiEndpoint() {
  if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.DELETE_API_ENDPOINT) {
    return window.APP_CONFIG.DELETE_API_ENDPOINT;
  }
  const base = getApiBaseUrl();
  if (base) return `${base}/webhook/ce5ae87c-e463-4445-b159-9d93491df2b7`;
  return _decode(_EP.d);
}

export const FORM_TIMEOUT_MS = 300000;
export const FORM_SUBMISSION_RESET_TIMEOUT = 5000;
export const CSV_CACHE_KEY = 'talent_tracker_csv_cache';
export const DELETE_TIMEOUT_MS = 60000;
export const AGE_GREEN_LIMIT_DAYS = 15;
export const AGE_RED_LIMIT_DAYS = 30;
