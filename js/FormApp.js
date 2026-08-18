import { showToast } from './Toast.js';
import { postForm, encryptCacheData, decryptCacheData } from './Utils.js';
import { getFormApiEndpoint, FORM_TIMEOUT_MS, FORM_SUBMISSION_RESET_TIMEOUT } from './Config.js';

export class FormApp {
  constructor() {
    this.saveDraftTimer = null;
    this.isSubmitting = false;
    this.initDoms();
    this.initEventListeners();
    this.loadDraft();
    this.initCharacterCounters();
  }

  initDoms() {
    this.form = document.querySelector("#job_opening");
    this.submitBtn = document.querySelector("#submit_btn");
    this.spinner = document.querySelector("#job_spin");
    this.resetBtn = document.querySelector("#reset_btn");
    this.inputs = this.form.querySelectorAll('input, textarea');
    this.hiringTeam = document.querySelector("#hiring_team");
    this.jobDesc = document.querySelector("#job_description");
    this.companyDesc = document.querySelector("#company_description");
    this.jobDescCounter = document.querySelector("#job_description_counter");
    this.companyDescCounter = document.querySelector("#company_description_counter");
    this.newAppSection = document.querySelector('.new-application-section');
  }

  initEventListeners() {
    this.form.addEventListener("submit", (e) => this.handleSubmit(e));

    if (this.resetBtn) {
      this.resetBtn.addEventListener("click", () => this.handleReset());
    }

    // Auto-save on input with debounce
    this.inputs.forEach(input => {
      input.addEventListener('input', () => {
        this.saveDraft();
        if (input === this.jobDesc || input === this.companyDesc) {
          this.updateCounter(input);
        }
      });

      // Real-time validation
      input.addEventListener('blur', () => this.validateField(input));
    });

    // Hiring Team focus/blur behavior
    if (this.hiringTeam) {
      this.hiringTeam.addEventListener("focus", () => {
        if (this.hiringTeam.value === "Not Defined") {
          this.hiringTeam.value = "";
        }
      });
      this.hiringTeam.addEventListener("blur", () => {
        if (this.hiringTeam.value.trim() === "") {
          this.hiringTeam.value = "Not Defined";
        }
      });
    }

    // Keyboard navigation scoped to form
    if (this.form) {
      this.form.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) {
            if (this.newAppSection && !this.newAppSection.classList.contains('tab-hidden')) {
              this.form.requestSubmit();
            }
          }
        }
      });
    }
  }

  validateField(input) {
    if (input._validTimer) {
      clearTimeout(input._validTimer);
      input._validTimer = null;
    }
    if (!input.checkValidity()) {
      input.classList.add('is-invalid');
    } else {
      input.classList.remove('is-invalid');
      input.classList.add('is-valid');
      input._validTimer = setTimeout(() => {
        input.classList.remove('is-valid');
        input._validTimer = null;
      }, 2000);
    }
  }

  async handleSubmit(event) {
    event.preventDefault();

    // Double-submit guard
    if (this.isSubmitting) return;

    if (!this.form.checkValidity()) {
      this.form.classList.add('was-validated');
      showToast('Please fill in all required fields correctly.', 'warning');

      // Focus and scroll to first invalid field
      const firstInvalid = this.form.querySelector(':invalid');
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus();
      }
      return;
    }

    this.isSubmitting = true;
    showToast('Submitting your application... Please wait for feedback.', 'info');

    // Restore standard blue color on re-submission start
    this.submitBtn.classList.remove('btn-danger');
    this.submitBtn.classList.add('btn-primary');

    await postForm(getFormApiEndpoint(), new FormData(this.form), {
      timeoutMs: FORM_TIMEOUT_MS,
      setLoading: (v) => this.setLoadingState(v),
      onSuccess:  ()  => this.handleSuccess(),
      onError:    (e) => this.handleError(e.name === 'AbortError'
        ? 'Submission error: Request timed out after 5 minutes.'
        : 'Submission error: ' + e.message),
    });

    this.isSubmitting = false;
  }

  setLoadingState(isLoading) {
    this.submitBtn.disabled = isLoading;
    if (this.resetBtn) {
      this.resetBtn.disabled = isLoading;
    }
    this.form.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (isLoading) {
      this.spinner.classList.remove("hidden");
      this.spinner.classList.add("active");
    } else {
      this.spinner.classList.remove("active");
      this.spinner.classList.add("hidden");
    }
  }

  handleSuccess() {
    showToast('Application submitted successfully!', 'success');

    // Clear draft after successful submission
    localStorage.removeItem('job_app_draft');

    // Restore standard blue color on success
    this.submitBtn.classList.remove('btn-danger');
    this.submitBtn.classList.add('btn-primary');

    if (this.resetTimerId) {
      clearTimeout(this.resetTimerId);
    }

    this.resetTimerId = setTimeout(() => {
      // Auto-switch to Applications tab
      if (typeof window.switchTab === 'function') {
        window.switchTab('home');
      }

      this.form.reset();
      this.form.classList.remove('was-validated');
      this.inputs.forEach(input => {
        input.classList.remove('is-valid', 'is-invalid');
      });
      if (this.hiringTeam) {
        this.hiringTeam.value = "Not Defined";
      }
      this.initCharacterCounters();
      this.resetTimerId = null;
    }, FORM_SUBMISSION_RESET_TIMEOUT);
  }

  handleError(message) {
    showToast(`Error: ${message}`, 'error');
    // Turn button red on failure
    this.submitBtn.classList.remove('btn-primary');
    this.submitBtn.classList.add('btn-danger');
  }

  handleReset() {
    // Two-click confirmation pattern
    if (!this.resetPending) {
      this.resetPending = true;
      const btn = this.resetBtn;
      const originalTitle = btn.getAttribute('title');
      btn.setAttribute('title', 'Click again to confirm reset');
      btn.classList.add('reset-confirm-pending');
      showToast('Click Reset again to confirm clearing the form.', 'warning');

      this._resetPendingTimer = setTimeout(() => {
        this.resetPending = false;
        btn.setAttribute('title', originalTitle);
        btn.classList.remove('reset-confirm-pending');
      }, 3000);
      return;
    }

    // Second click – confirmed, proceed with reset
    clearTimeout(this._resetPendingTimer);
    this.resetPending = false;
    if (this.resetBtn) {
      this.resetBtn.setAttribute('title', 'Reset Form');
      this.resetBtn.classList.remove('reset-confirm-pending');
    }

    // Explicitly clear every field
    this.inputs.forEach(input => {
      if (input === this.hiringTeam) {
        input.value = "Not Defined";
      } else {
        input.value = "";
      }
      input.classList.remove('is-valid', 'is-invalid');
    });

    this.form.classList.remove('was-validated');
    localStorage.removeItem('job_app_draft');
    this.initCharacterCounters();
    showToast('Form has been reset.', 'info');
  }

  saveDraft() {
    if (this.saveDraftTimer) {
      clearTimeout(this.saveDraftTimer);
    }
    this.saveDraftTimer = setTimeout(() => {
      const data = {};
      this.inputs.forEach(input => {
        data[input.name] = input.value;
      });
      const encrypted = encryptCacheData(JSON.stringify(data));
      localStorage.setItem('job_app_draft', encrypted);
    }, 500);
  }

  loadDraft() {
    try {
      const raw = localStorage.getItem('job_app_draft');
      if (raw) {
        let draftStr = decryptCacheData(raw);
        if (!draftStr || !draftStr.startsWith('{')) {
          draftStr = raw;
        }
        const data = JSON.parse(draftStr);
        this.inputs.forEach(input => {
          if (data[input.name] !== undefined) {
            input.value = data[input.name];
          }
        });
        showToast('Restored your progress from draft.', 'info');
      }
    } catch (error) {
      console.error("Failed to load draft:", error);
      localStorage.removeItem('job_app_draft');
    }
  }

  initCharacterCounters() {
    if (this.jobDesc) this.updateCounter(this.jobDesc);
    if (this.companyDesc) this.updateCounter(this.companyDesc);
  }

  updateCounter(input) {
    const length = input.value.length;
    if (input === this.jobDesc && this.jobDescCounter) {
      this.jobDescCounter.textContent = `${length} / 15000`;
    } else if (input === this.companyDesc && this.companyDescCounter) {
      this.companyDescCounter.textContent = `${length} / 15000`;
    }
  }
}
