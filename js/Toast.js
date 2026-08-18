import { escapeHtml } from './Utils.js';

/**
 * Dynamic Toast Alert Utility
 */
let toastContainerEl = null;
let toastSeq = 0;

function getToastContainer() {
  if (!toastContainerEl || !toastContainerEl.parentNode) {
    toastContainerEl = document.getElementById('toastContainer');
    if (!toastContainerEl) {
      toastContainerEl = document.createElement('div');
      toastContainerEl.id = 'toastContainer';
      toastContainerEl.className = 'toast-container';
      toastContainerEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastContainerEl);
    }
  }
  return toastContainerEl;
}

export function showToast(message, type = 'success') {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  
  // Trigger transition
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Fade out and remove
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
    // Fallback if transitionend is not supported or doesn't fire
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 400);
  }, 4000);
}

/**
 * Creates a toast that stays visible until explicitly closed/updated.
 * Returns the toast id, usable with updatePersistentToast/closePersistentToast.
 */
export function showPersistentToast(message, type = 'info') {
  const container = getToastContainer();
  const id = 'toast-' + (++toastSeq);

  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  toast.setAttribute('data-toast-id', id);
  toast.innerHTML = `<span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  return id;
}

/**
 * Updates an existing persistent toast's message and type.
 * Falls back to creating one if the id is not found.
 */
export function updatePersistentToast(id, message, type = 'info') {
  if (!id) return;
  const container = getToastContainer();
  const toast = container.querySelector(`.toast-item[data-toast-id="${id}"]`);

  if (!toast) {
    // Create it if missing so the lifecycle message is still shown.
    showPersistentToast(message, type);
    return;
  }

  toast.className = `toast-item ${type}`;
  const msgEl = toast.querySelector('.toast-message');
  if (msgEl) msgEl.textContent = message;
  if (!toast.classList.contains('show')) {
    setTimeout(() => toast.classList.add('show'), 10);
  }
}

/**
 * Removes a persistent toast.
 */
export function closePersistentToast(id) {
  if (!id) return;
  const container = getToastContainer();
  const toast = container.querySelector(`.toast-item[data-toast-id="${id}"]`);
  if (!toast) return;
  toast.classList.remove('show');
  const remove = () => toast.remove();
  toast.addEventListener('transitionend', remove);
  setTimeout(remove, 400);
}
