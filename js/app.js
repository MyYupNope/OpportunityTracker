import { FacetedSelect } from './FacetedSelect.js';
import { FormApp } from './FormApp.js';
import { state } from './State.js';
import { renderAllDashboardWidgets } from './Charts.js';
import { parseMarkdown } from './Markdown.js';
import { showToast, showPersistentToast, updatePersistentToast, closePersistentToast } from './Toast.js';
import {
  escapeHtml,
  parseDate,
  formatDisplayDate,
  postForm,
  parseCacheTimestamp,
  encryptCacheData,
  decryptCacheData,
  sanitizeUrl
} from './Utils.js';
import {
  getSheetExportUrl,
  getNotesApiEndpoint,
  getDeleteApiEndpoint,
  CSV_CACHE_KEY,
  DELETE_TIMEOUT_MS,
  AGE_GREEN_LIMIT_DAYS,
  AGE_RED_LIMIT_DAYS
} from './Config.js';
import { getCache, setCache, deleteCache } from './Storage.js';

const sortCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

// Module-level state & component instances
let companySelect = null;
let jobSelect = null;
let statusSelect = null;
let activeFetchController = null;
let fetchSequenceCounter = 0;
let drawerLastFocusedElement = null;
let isInterviewSubmitting = false;

/* --------------------------------------------------------------------------
   LANDING HERO: CANVAS PARTICLE NETWORK
   Adapted from Resume.js particle system — scoped to the Home/Landing tab.
   -------------------------------------------------------------------------- */
class LandingParticles {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationFrameId = null;
    this.isActive = false;
    this._cachedColor = null;
    this._lastThemeClass = '';
    this.handleResize = this._onResize.bind(this);
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.canvas = document.getElementById('landingHeroCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._onResize(true);
    this.particles = this._createParticles();
    this._animate();
    window.addEventListener('resize', this.handleResize);
  }

  stop() {
    this.isActive = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.handleResize);
  }

  _createParticles() {
    const particles = [];
    const count = window.innerWidth < 768 ? 30 : 60;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 1.8 + 0.8
      });
    }
    return particles;
  }

  _onResize(immediate = false) {
    if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
    const doResize = () => {
      if (!this.canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const parent = this.canvas.parentElement;
      this.canvas.width = parent.clientWidth * dpr;
      this.canvas.height = parent.clientHeight * dpr;
      if (this.ctx) {
        this.ctx.resetTransform();
        this.ctx.scale(dpr, dpr);
      }
    };
    if (immediate) doResize();
    else this._resizeTimeout = setTimeout(doResize, 150);
  }

  _getColorRgb() {
    try {
      const style = getComputedStyle(document.documentElement);
      let color = style.getPropertyValue('--color-primary').trim();
      if (color.startsWith('#')) {
        let hex = color.substring(1);
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return {
          r: parseInt(hex.substring(0, 2), 16),
          g: parseInt(hex.substring(2, 4), 16),
          b: parseInt(hex.substring(4, 6), 16)
        };
      }
    } catch (e) { /* fallback */ }
    return { r: 59, g: 130, b: 246 }; // Default blue fallback
  }

  _animate() {
    if (!this.isActive) return;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    this.ctx.clearRect(0, 0, width, height);

    const themeClass = document.documentElement.className;
    if (this._lastThemeClass !== themeClass || !this._cachedColor) {
      this._lastThemeClass = themeClass;
      this._cachedColor = this._getColorRgb();
    }
    const c = this._cachedColor;

    // Update and draw particles
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.55)`;
      this.ctx.fill();
    });

    // Draw connecting lines
    const maxDist = 120;
    const maxDistSq = maxDist * maxDist;
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < maxDistSq) {
          const dist = Math.sqrt(distSq);
          const alpha = (1 - dist / maxDist) * 0.25;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
          this.ctx.lineWidth = 1;
          this.ctx.stroke();
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this._animate());
  }
}

// DOM Element Cache
const dom = {};

function initDomCache() {
  dom.syncStatus = document.getElementById('syncStatus');
  dom.statTotal = document.getElementById('statTotal');
  dom.statActivePipeline = document.getElementById('statActivePipeline');
  dom.statCompanies = document.getElementById('statCompanies');
  dom.statJobs = document.getElementById('statJobs');
  dom.statActiveApps = document.getElementById('statActiveApps');
  dom.statConversion = document.getElementById('statConversion');
  dom.statRejectionRate = document.getElementById('statRejectionRate');
  dom.statAvgSuitability = document.getElementById('statAvgSuitability');
  dom.statThisWeek = document.getElementById('statThisWeek');
  dom.statThisMonth = document.getElementById('statThisMonth');

  dom.btnResetFilters = document.getElementById('btnResetFilters');
  dom.noResults = document.getElementById('noResults');
  dom.resultsCount = document.getElementById('resultsCount');

  dom.companySelectContainer = document.getElementById('companySelectContainer');
  dom.companyTrigger = document.getElementById('companyTrigger');
  dom.companySearch = document.getElementById('companySearch');
  dom.companyOptions = document.getElementById('companyOptions');

  dom.jobSelectContainer = document.getElementById('jobSelectContainer');
  dom.jobTrigger = document.getElementById('jobTrigger');
  dom.jobSearch = document.getElementById('jobSearch');
  dom.jobOptions = document.getElementById('jobOptions');

  dom.statusSelectContainer = document.getElementById('statusSelectContainer');
  dom.statusTrigger = document.getElementById('statusTrigger');
  dom.statusSearch = document.getElementById('statusSearch');
  dom.statusOptions = document.getElementById('statusOptions');

  dom.drawerOverlay = document.getElementById('drawerOverlay');
  dom.detailsDrawer = document.getElementById('detailsDrawer');
  dom.btnCloseDrawer = document.getElementById('btnCloseDrawer');
  dom.btnDrawerThemeToggle = document.getElementById('btnDrawerThemeToggle');
  dom.drawerJobTitleDisplay = document.getElementById('drawerJobTitleDisplay');
  dom.drawerCompanyNameDisplay = document.getElementById('drawerCompanyNameDisplay');
  dom.drawerJobTitle = document.getElementById('drawerJobTitle');
  dom.drawerCompanyName = document.getElementById('drawerCompanyName');
  dom.drawerDate = document.getElementById('drawerDate');
  dom.drawerHiringTeam = document.getElementById('drawerHiringTeam');
  dom.drawerHiringTeamLink = document.getElementById('drawerHiringTeamLink');
  dom.drawerFollowUp = document.getElementById('drawerFollowUp');
  dom.drawerFollowUpLink = document.getElementById('drawerFollowUpLink');
  dom.drawerSuitabilityScoreContainer = document.getElementById('drawerSuitabilityScoreContainer');
  dom.drawerSuitabilityScore = document.getElementById('drawerSuitabilityScore');
  dom.drawerSuitabilityEval = document.getElementById('drawerSuitabilityEval');
  dom.sectionSuitabilityEval = document.getElementById('sectionSuitabilityEval');
  dom.drawerStatusSelect = document.getElementById('drawerStatusSelect');
  dom.drawerCommentsTextarea = document.getElementById('drawerCommentsTextarea');
  dom.drawerJobDescription = document.getElementById('drawerJobDescription');
  dom.drawerCompanyDescription = document.getElementById('drawerCompanyDescription');
  dom.drawerlinkJobUrl = document.getElementById('drawerlinkJobUrl');
  dom.linkJobUrlAnchor = document.getElementById('linkJobUrlAnchor');
  dom.linkCompanyFolder = document.getElementById('linkCompanyFolder');
  dom.drawerInterviewCompany = document.getElementById('drawerInterviewCompany');
  dom.drawerInterviewPreparation = document.getElementById('drawerInterviewPreparation');

  dom.filtersSection = document.querySelector('.filters-section');
  dom.applicationsSection = document.getElementById('applicationsSection');
  dom.statsSection = document.querySelector('.stats-section');
  dom.analyticsSection = document.querySelector('.analytics-section');
  dom.newApplicationSection = document.querySelector('.new-application-section');
  dom.globalDashboardRangeContainer = document.getElementById('globalDashboardRangeContainer');
  dom.kanbanViewSection = document.getElementById('kanbanViewSection');
  dom.kanbanBoard = document.getElementById('kanbanBoard');
  dom.fabBtn = document.getElementById('fabNewApplication');
  dom.refreshBtn = document.getElementById('btnHeaderRefresh');
  dom.syncContainer = document.querySelector('.sync-container');
  dom.topbarBrandLink = document.getElementById('topbarBrandLink');
  dom.landingTabContent = document.getElementById('landingTabContent');

  dom.tabPreparation = document.getElementById('tabPreparation');
  dom.tabNotes = document.getElementById('tabNotes');
  dom.btnCopyPreparation = document.getElementById('btnCopyPreparation');
  dom.drawerInterviewNotes = document.getElementById('drawerInterviewNotes');
  dom.jobInterviewForm = document.getElementById('jobinterview');
  dom.btnResetInterviewNotes = document.getElementById('btnResetInterviewNotes');
  dom.btnSubmitOverviewBottom = document.getElementById('btnSubmitOverviewBottom');
  dom.btnSubmitNotesBottom = document.getElementById('btnSubmitNotesBottom');
  dom.fabThemeToggle = document.getElementById('fabThemeToggle');
  dom.dashboardRangeToggle = document.getElementById('dashboardRangeToggle');
  dom.statCardThisMonth = document.getElementById('statCardThisMonth');

}

// Global drop-down components


function initializeApp() {
  initDomCache();

  companySelect = new FacetedSelect(dom.companySelectContainer, dom.companyTrigger, dom.companySearch, dom.companyOptions, 'All Companies');
  jobSelect = new FacetedSelect(dom.jobSelectContainer, dom.jobTrigger, dom.jobSearch, dom.jobOptions, 'All Job Titles');
  statusSelect = new FacetedSelect(dom.statusSelectContainer, dom.statusTrigger, dom.statusSearch, dom.statusOptions, 'All Statuses');

  setupEventListeners();
  fetchData();
  initTabNavigation();
  initScrollReveal();
}



/**
 * Helper to copy HTML of a target element as rich text.
 */
function copyElementHtml(button, targetElement) {
  if (!targetElement) return;

  // Clone the element so we can manipulate it without affecting the live DOM
  const clone = targetElement.cloneNode(true);

  // --- Remove elements that shouldn't appear in Word paste ---
  clone.querySelectorAll(
    '.prep-divider, .prep-no-data, .btn-copy-html, .score-circle-svg, .info-label'
  ).forEach(el => el.remove());

  // Remove any element hidden via inline style
  clone.querySelectorAll('*').forEach(el => {
    const d = el.style.display;
    if (d === 'none') el.remove();
  });

  // --- Compact tables for Word ---
  clone.querySelectorAll('.md-table, table').forEach(table => {
    table.style.cssText = 'width:auto; border-collapse:collapse; font-size:10pt; border:1px solid #999; margin:4pt 0;';
  });

  clone.querySelectorAll('th, td').forEach(cell => {
    cell.style.cssText = 'padding:1pt 4pt; font-size:10pt; border:1px solid #bbb; vertical-align:top;';
  });

  clone.querySelectorAll('th').forEach(th => {
    th.style.fontWeight = '600';
    th.style.backgroundColor = '#f0f0f0';
  });

  // --- Fix score circle: show score as bold text, remove SVG ---
  clone.querySelectorAll('.suitability-score-circle-wrapper').forEach(wrapper => {
    const scoreVal = wrapper.querySelector('.score-circle-value');
    const scoreMax = wrapper.querySelector('.score-circle-max');
    const text = (scoreVal ? scoreVal.textContent : '?') + ' ' + (scoreMax ? scoreMax.textContent : '/ 5');
    const p = document.createElement('p');
    p.style.cssText = 'font-size:16pt; font-weight:bold; margin:4pt 0;';
    p.textContent = 'Score: ' + text.trim();
    wrapper.replaceWith(p);
  });

  // --- Fix suitability evaluation grid for Word ---
  clone.querySelectorAll('.suit-eval-grid').forEach(grid => {
    grid.style.cssText = 'font-size:10pt; margin:4pt 0;';
  });
  clone.querySelectorAll('.suit-eval-section').forEach(section => {
    section.style.cssText = 'padding:4pt 0; margin:2pt 0; border-bottom:1px solid #ddd;';
  });
  clone.querySelectorAll('.suit-eval-heading').forEach(heading => {
    heading.style.cssText = 'font-weight:600; font-size:10pt; margin-bottom:2pt;';
  });
  clone.querySelectorAll('.suit-eval-text').forEach(txt => {
    txt.style.cssText = 'font-size:10pt; margin:2pt 0;';
  });
  clone.querySelectorAll('.suit-eval-list').forEach(list => {
    list.style.cssText = 'font-size:10pt; margin:2pt 0; padding-left:16pt;';
  });

  // --- Add section headings ---
  const sections = [
    { id: 'sectionPrepCompany', title: '*** Company Introduction ***' },
    { id: 'sectionPrepSuitability', title: '*** Job suitability ***' },
    { id: 'sectionPrepInterview', title: '*** Interview Preparation ***' }
  ];
  sections.forEach(({ id, title }) => {
    const sec = clone.querySelector('#' + id);
    if (sec) {
      const h = document.createElement('p');
      h.style.cssText = 'font-size:12pt; font-weight:bold; color:#111; margin:10pt 0 4pt 0;';
      h.innerHTML = `<b>${title}</b>`;
      sec.prepend(h);
    }
  });

  // --- Append clone off-screen, select, copy, remove ---
  clone.style.cssText = 'position:fixed; left:-9999px; top:0; opacity:0; pointer-events:none;';
  document.body.appendChild(clone);

  const selection = window.getSelection();
  const range = document.createRange();
  selection.removeAllRanges();
  range.selectNodeContents(clone);
  selection.addRange(range);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (e) {
    console.warn('[copyElementHtml] execCommand failed:', e);
  }
  selection.removeAllRanges();
  document.body.removeChild(clone);

  // --- UI feedback ---
  const showFeedback = () => {
    const iconCopy = button.querySelector('.icon-copy');
    const iconCheck = button.querySelector('.icon-check');
    if (iconCopy && iconCheck) {
      iconCopy.style.display = 'none';
      iconCheck.style.display = '';
      setTimeout(() => {
        iconCopy.style.display = '';
        iconCheck.style.display = 'none';
      }, 2000);
    }
    showToast('Content copied to clipboard with formatting.', 'success');
  };

  if (copied) {
    showFeedback();
  } else {
    // Fallback: ClipboardItem with the cleaned HTML
    const html = clone.innerHTML;
    const plainText = targetElement.innerText || targetElement.textContent || '';
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });
    navigator.clipboard.write([new ClipboardItem({
      'text/html': htmlBlob,
      'text/plain': textBlob
    })]).then(showFeedback).catch(err => {
      console.error('Failed to copy:', err);
      showToast('Failed to copy. Please try manually selecting and copying.', 'error');
    });
  }
}

function setupEventListeners() {
  // Global click listener to close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (dom.companySelectContainer && !dom.companySelectContainer.contains(e.target)) {
      companySelect.close();
    }
    if (dom.jobSelectContainer && !dom.jobSelectContainer.contains(e.target)) {
      jobSelect.close();
    }
    if (dom.statusSelectContainer && !dom.statusSelectContainer.contains(e.target)) {
      statusSelect.close();
    }
  });

  // Topbar Brand click listener (replaced inline onclick)
  if (dom.topbarBrandLink) {
    dom.topbarBrandLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.switchTab('landing');
    });
  }

  // Theme Toggle Button
  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('theme-dark');
    if (isDark) {
      document.documentElement.classList.remove('theme-dark');
      document.documentElement.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('theme-light');
      document.documentElement.classList.add('theme-dark');
      localStorage.setItem('theme', 'dark');
    }

    // Immediately re-render dashboard widgets only if dashboard tab is currently active
    const activeNavBtn = document.querySelector('.topbar-nav-btn.active');
    const activeTab = activeNavBtn ? activeNavBtn.getAttribute('data-tab') : 'landing';
    if (activeTab === 'dashboard') {
      const filtered = getFilteredDashboardApps(state.dashboardRange || 'yearly');
      renderAllDashboardWidgets(filtered, true);
    }
  };

  if (dom.fabThemeToggle) {
    dom.fabThemeToggle.addEventListener('click', toggleTheme);
  }

  if (dom.btnDrawerThemeToggle) {
    dom.btnDrawerThemeToggle.addEventListener('click', toggleTheme);
  }

  // Dashboard Range Switch Toggle Button
  if (dom.dashboardRangeToggle) {
    dom.dashboardRangeToggle.addEventListener('click', () => {
      const isYearly = dom.dashboardRangeToggle.classList.contains('active');
      if (isYearly) {
        dom.dashboardRangeToggle.classList.remove('active');
        state.dashboardRange = 'weekly';
      } else {
        dom.dashboardRangeToggle.classList.add('active');
        state.dashboardRange = 'yearly';
      }
      localStorage.setItem('dashboardRange', state.dashboardRange);
      
      const filtered = getFilteredDashboardApps(state.dashboardRange);
      calculateStatistics(filtered);
      const activeNavBtn = document.querySelector('.topbar-nav-btn.active');
      const activeTab = activeNavBtn ? activeNavBtn.getAttribute('data-tab') : 'landing';
      if (activeTab === 'dashboard') {
        renderAllDashboardWidgets(filtered, true);
      }
    });
  }




  // Refresh Button (Forces a manual reload and re-parse of the data)
  if (dom.refreshBtn) {
    dom.refreshBtn.addEventListener('click', () => {
      fetchData(false, true);
    });
  }

  if (dom.btnResetFilters) {
    dom.btnResetFilters.addEventListener('click', () => {
      state.selectedCompany = null;
      state.selectedJobTitle = null;
      state.selectedStatus = null;
      
      updateFiltersUI();
      applyFilters();
    });
  }

  // Reset Button Interview Notes
  if (dom.btnResetInterviewNotes) {
    dom.btnResetInterviewNotes.addEventListener('click', () => {
      const inp = dom.drawerInterviewNotes;
      if (inp) {
        inp.value = '';
        showToast('Interview notes reset', 'info');
      }
    });
  }

  // Submit notes / overview event listener
  const formJobInterview = dom.jobInterviewForm;
  if (formJobInterview) {
    formJobInterview.addEventListener('submit', (e) => {
      e.preventDefault();

      const submitter = e.submitter;
      const submitterId = submitter ? submitter.id : null;
      if (submitterId === 'btnSubmitOverviewBottom') {
        submitJobInterviewForm('overview');
        return;
      }
      if (submitterId === 'btnSubmitNotesBottom') {
        submitJobInterviewForm('notes');
        return;
      }

      // If submitted without explicit submitter (e.g. Enter key), check active tab
      const activeDrawerTab = document.querySelector('.drawer-tab.active');
      const isOverview = activeDrawerTab && activeDrawerTab.id === 'tabOverview';
      submitJobInterviewForm(isOverview ? 'overview' : 'notes');
    });
  }

  // Drawer Close Actions
  if (dom.btnCloseDrawer) dom.btnCloseDrawer.addEventListener('click', closeDetailsDrawer);
  if (dom.drawerOverlay) dom.drawerOverlay.addEventListener('click', closeDetailsDrawer);
  
  if (dom.drawerStatusSelect) {
    dom.drawerStatusSelect.addEventListener('change', () => {
      updateSelectColorClass(dom.drawerStatusSelect);
    });
  }

  if (dom.drawerFollowUp) {
    dom.drawerFollowUp.addEventListener('input', updateFollowUpLink);
  }

  if (dom.drawerHiringTeam) {
    dom.drawerHiringTeam.addEventListener('input', updateHiringTeamLink);
  }
  
  // Drawer Tab Click Event Listeners
  if (dom.detailsDrawer) {
    const drawerTabs = dom.detailsDrawer.querySelectorAll('.drawer-tab');
    drawerTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        if (!tab.classList.contains('disabled')) {
          selectTab(tab.id);
        }
      });
    });
  }

  // Drawer Tabs Keyboard Navigation (Arrow keys Left/Right)
  const drawerTabsContainer = dom.detailsDrawer ? dom.detailsDrawer.querySelector('.drawer-tabs') : null;
  if (drawerTabsContainer) {
    drawerTabsContainer.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const tabs = Array.from(drawerTabsContainer.querySelectorAll('.drawer-tab'));
        const enabledTabs = tabs.filter(t => !t.classList.contains('disabled'));
        const activeIndex = enabledTabs.findIndex(t => t.classList.contains('active'));
        
        let nextIndex = activeIndex;
        if (e.key === 'ArrowRight') {
          nextIndex = (activeIndex + 1) % enabledTabs.length;
        } else if (e.key === 'ArrowLeft') {
          nextIndex = (activeIndex - 1 + enabledTabs.length) % enabledTabs.length;
        }
        
        const nextTab = enabledTabs[nextIndex];
        if (nextTab) {
          selectTab(nextTab.id);
          nextTab.focus();
        }
      }
    });
  }

  // ESC Key to close dropdowns and drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      companySelect.close();
      jobSelect.close();
      statusSelect.close();
      closeDetailsDrawer();
    }
  });



  // Event Delegation: Kanban Board Details Click
  if (dom.kanbanBoard) {
    dom.kanbanBoard.addEventListener('click', (e) => {
      const detailsBtn = e.target.closest('.kanban-btn-details');
      if (detailsBtn) {
        e.stopPropagation();
        const origIndex = parseInt(detailsBtn.getAttribute('data-index'), 10);
        const app = state.rawApplications.find(a => a.originalIndex === origIndex) || state.filteredApplications[origIndex];
        if (app) openDetailsDrawer(app);
      }
    });
  }

  // Event Delegation: Kanban Board Delete Form Submit
  if (dom.kanbanBoard) {
    dom.kanbanBoard.addEventListener('submit', (e) => {
      const form = e.target.closest('.kanban-delete-form');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();

      const jobUrl = (form.getAttribute('data-job-url') || '').trim();
      if (!jobUrl) {
        showToast('This application has no Job URL and cannot be deleted.', 'error');
        return;
      }

      const cardEl = form.closest('.kanban-card');
      const app = (state.rawApplications || []).find(a => (a['Job URL'] || '').trim() === jobUrl);
      if (!app) {
        showToast('Application not found in current data. Refresh and try again.', 'error');
        return;
      }

      if (state.deleteRequests && state.deleteRequests[jobUrl] && state.deleteRequests[jobUrl].status === 'submitting') {
        showToast('A deletion request is already in progress for this application.', 'warning');
        return;
      }

      deleteApplication(app, cardEl);
    });
  }

  // Initialize Kanban drag and drop event handlers ONCE
  setupKanbanDragAndDrop();

  // Copy all Preparation content button
  const btnCopyPrep = dom.btnCopyPreparation;
  if (btnCopyPrep) {
    btnCopyPrep.addEventListener('click', () => {
      const target = document.querySelector('.preparation-card');
      copyElementHtml(btnCopyPrep, target);
    });
  }
}



function setSyncState(status, message) {
  if (!dom.syncStatus) return;
  dom.syncStatus.className = `sync-status ${status}`;
  dom.syncStatus.innerHTML = `
    <span class="status-dot"></span>
    <span class="status-text">${message}</span>
  `;
}

function writeCacheIdle(csvText) {
  const saveAction = async () => {
    try {
      const encryptedCsv = encryptCacheData(csvText);
      const newCache = { csv: encryptedCsv, encrypted: true, timestamp: Date.now() };
      await setCache(CSV_CACHE_KEY, newCache);
    } catch (e) {
      console.warn('[OpportunityTracker] Failed to write cache to IndexedDB:', e);
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(saveAction);
  } else {
    setTimeout(saveAction, 100);
  }
}

/**
 * Fetch and Parse Data with offline IndexedDB storage support
 */
async function fetchData(isTabSwitch = false, isForceRefresh = false, onComplete = null) {
  const emitComplete = (ok) => {
    if (typeof onComplete === 'function') onComplete(ok);
  };
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  let cachedVal = null;
  try {
    cachedVal = await getCache(CSV_CACHE_KEY);
  } catch (e) {
    console.warn('[OpportunityTracker] Failed to read cache from IndexedDB:', e);
  }

  let cachedCsvText = null;
  let hasLoadedFromCache = false;
  let lastSyncTimeMs = null;

  if (cachedVal) {
    try {
      let cachedObj = cachedVal;
      if (typeof cachedVal === 'string') {
        try {
          cachedObj = JSON.parse(cachedVal);
        } catch (e) {
          cachedObj = null;
        }
      }

      if (cachedObj && typeof cachedObj === 'object' && cachedObj.csv && cachedObj.timestamp) {
        lastSyncTimeMs = parseCacheTimestamp(cachedObj.timestamp);
        if (Date.now() - cachedObj.timestamp < CACHE_TTL_MS) {
          cachedCsvText = cachedObj.encrypted ? decryptCacheData(cachedObj.csv) : cachedObj.csv;
        } else {
          console.log('[OpportunityTracker] Cache expired');
        }
      } else if (typeof cachedVal === 'string' && !cachedVal.startsWith('{')) {
        cachedCsvText = decryptCacheData(cachedVal);
      }
    } catch (e) {
      if (typeof cachedVal === 'string' && !cachedVal.startsWith('{')) {
        cachedCsvText = cachedVal;
      }
    }
  }

  if (cachedCsvText) {
    try {
      setSyncState('loading', 'Syncing...');
      parseAndInitializeData(cachedCsvText);
      hasLoadedFromCache = true;
    } catch (e) {
      console.error('[OpportunityTracker] Failed parsing cached CSV:', e);
      deleteCache(CSV_CACHE_KEY);
    }
  }

  if (isTabSwitch && hasLoadedFromCache && lastSyncTimeMs) {
    const timeDiffMs = Date.now() - lastSyncTimeMs;
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    if (timeDiffMs < FIFTEEN_MINUTES_MS) {
      console.log('[OpportunityTracker] Skipping fetch request on tab switch (last sync was < 15 min ago)');
      const lastUpdated = new Date(lastSyncTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      setSyncState('success', `Synced ${lastUpdated}`);
      emitComplete(true);
      return; // Skip fetch since cache is fresh
    }
  }

  if (!hasLoadedFromCache) {
    setSyncState('loading', 'Loading Registry...');
    if (dom.noResults) dom.noResults.classList.add('hidden');
  }

  if (activeFetchController) {
    activeFetchController.abort();
  }
  activeFetchController = new AbortController();
  const currentFetchId = ++fetchSequenceCounter;

  fetch(getSheetExportUrl(), { signal: activeFetchController.signal })
    .then(response => {
      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
      return response.text();
    })
    .then(csvText => {
      if (currentFetchId !== fetchSequenceCounter) return;
      if (!csvText || csvText.trim() === '') throw new Error('Received empty CSV data.');
      
      let cachedPlainText = cachedCsvText;
      if (!cachedPlainText && cachedVal) {
        try {
          const parsed = typeof cachedVal === 'object' ? cachedVal : JSON.parse(cachedVal);
          if (parsed && parsed.csv) {
            cachedPlainText = parsed.encrypted ? decryptCacheData(parsed.csv) : parsed.csv;
          }
        } catch (e) {}
      }

      if (!isForceRefresh && cachedPlainText && cachedPlainText === csvText) {
        console.log('[OpportunityTracker] Remote CSV is identical to cache. Skipping parse.');
        writeCacheIdle(csvText);
        const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        setSyncState('success', `Synced ${lastUpdated}`);
        if (!hasLoadedFromCache || !state.rawApplications || state.rawApplications.length === 0) {
          parseAndInitializeData(csvText);
        }
        emitComplete(true);
        return;
      }

      writeCacheIdle(csvText);

      try {
        parseAndInitializeData(csvText);
      } catch (parseErr) {
        console.error('[OpportunityTracker] Parse error on fetched data:', parseErr);
        showToast('Error parsing remote database update', 'error');
        emitComplete(false);
        return;
      }
      
      const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      setSyncState('success', `Synced ${lastUpdated}`);
      emitComplete(true);
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        return; // Silent cancellation
      }
      console.error('[OpportunityTracker] Fetch error:', error);
      if (hasLoadedFromCache) {
        const syncTime = (cachedVal && typeof cachedVal === 'object' && cachedVal.timestamp)
          ? new Date(cachedVal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
          : 'Cached';
        setSyncState('success', `Offline (${syncTime})`);
      } else {
        setSyncState('error', 'Sync Failed');
        if (dom.noResults) {
          dom.noResults.classList.remove('hidden');
          dom.noResults.innerHTML = `
            <div class="no-results-card">
              <svg class="no-results-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <h4>Network Error</h4>
              <p>Could not connect to the database. Check your internet connection and try again.</p>
              <button class="btn-reset" onclick="location.reload()" style="margin-top: 1rem;">Retry Connection</button>
            </div>
          `;
        }
      }
      emitComplete(false);
    });
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let fieldParts = null;
  let fieldStart = 0;
  let inQuotes = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);

    if (c === 34) { // quote '"'
      if (inQuotes) {
        if (i + 1 < len && text.charCodeAt(i + 1) === 34) {
          if (!fieldParts) fieldParts = [];
          fieldParts.push(text.substring(fieldStart, i));
          fieldStart = i + 1;
          i++;
        } else {
          inQuotes = false;
          if (!fieldParts) fieldParts = [];
          fieldParts.push(text.substring(fieldStart, i));
          fieldStart = i + 1;
        }
      } else {
        inQuotes = true;
        fieldStart = i + 1;
      }
    } else if (c === 44 && !inQuotes) { // comma ','
      if (fieldParts) {
        fieldParts.push(text.substring(fieldStart, i));
        currentRow.push(fieldParts.join(''));
        fieldParts = null;
      } else {
        currentRow.push(text.substring(fieldStart, i));
      }
      fieldStart = i + 1;
    } else if ((c === 13 || c === 10) && !inQuotes) { // \r or \n
      if (fieldParts) {
        fieldParts.push(text.substring(fieldStart, i));
        currentRow.push(fieldParts.join(''));
        fieldParts = null;
      } else {
        currentRow.push(text.substring(fieldStart, i));
      }
      if (c === 13 && i + 1 < len && text.charCodeAt(i + 1) === 10) {
        i++;
      }
      fieldStart = i + 1;
      rows.push(currentRow);
      currentRow = [];
    }
  }

  if (fieldStart < len || fieldParts || currentRow.length > 0) {
    if (fieldParts) {
      fieldParts.push(text.substring(fieldStart));
      currentRow.push(fieldParts.join(''));
    } else {
      currentRow.push(text.substring(fieldStart));
    }
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Map CSV rows into JSON objects and set initial state
 */
function parseAndInitializeData(csvText) {
  const parsedRows = parseCSV(csvText);
  if (parsedRows.length < 2) return;

  const headers = parsedRows[0].map(h => h.trim());
  state.rawApplications = [];

  for (let i = 1; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

    const app = {};
    headers.forEach((header, index) => {
      let val = row[index] !== undefined ? row[index].trim() : '';
      if (header === 'Application Status') {
        const lower = val.toLowerCase();
        if (lower === 'interviews' || lower === 'interview') {
          val = 'Interviewed';
        }
      }
      app[header] = val;
    });
    app.originalIndex = i;
    app._parsedDate = parseDate(app['Create Date']);

    // Single-pass column alias normalization
    if (!app['Job_Suitability'] && app['Job Suitability']) {
      app['Job_Suitability'] = app['Job Suitability'];
    }
    if (!app['Job_Suitability_Evaluation'] && app['Job Suitability Evaluation']) {
      app['Job_Suitability_Evaluation'] = app['Job Suitability Evaluation'];
    }

    // Apply local status override if present
    if (state.statusOverrides) {
      const key = (app['Company Name'] || '').trim() + '|' + (app['Job Title'] || '').trim();
      if (state.statusOverrides[key]) {
        app['Application Status'] = state.statusOverrides[key];
      }
    }

    state.rawApplications.push(app);
  }

  state.activeApplications = state.rawApplications;

  state.dataVersion++;
  updateFiltersUI();

  const activeNavBtn = document.querySelector('.topbar-nav-btn.active');
  const activeTab = activeNavBtn ? activeNavBtn.getAttribute('data-tab') : 'landing';

  // Compute filtered items; only render DOM if Applications tab is active
  applyFilters(activeTab !== 'home');

  const range = state.dashboardRange || 'yearly';
  const filtered = getFilteredDashboardApps(range);
  calculateStatistics(filtered);

  // Render dashboard range toggle switch UI state
  if (dom.dashboardRangeToggle) {
    if (range === 'yearly') {
      dom.dashboardRangeToggle.classList.add('active');
    } else {
      dom.dashboardRangeToggle.classList.remove('active');
    }
  }

  // Render dashboard widgets only if Dashboard tab is active
  if (activeTab === 'dashboard') {
    renderAllDashboardWidgets(filtered, true);
  }
}

function getFilteredDashboardApps(range) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let cutoff;

  if (range === 'weekly') {
    // Current week from Monday until Sunday
    const day = today.getDay();
    const distanceToMonday = day === 0 ? 6 : day - 1;
    cutoff = new Date(today);
    cutoff.setDate(today.getDate() - distanceToMonday);
    cutoff.setHours(0, 0, 0, 0);
  } else {
    // Yearly (YTD) — January 1st of current year
    cutoff = new Date(today.getFullYear(), 0, 1);
    cutoff.setHours(0, 0, 0, 0);
  }

  return state.rawApplications.filter(app => {
    const dateStr = (app['Create Date'] || '').trim();
    if (!dateStr) return false;
    const appDate = parseDate(dateStr);
    return appDate >= cutoff && appDate <= today;
  });
}

/**
 * Optimized dashboard statistics calculation in a single-pass loop.
 */
function calculateStatistics(apps = state.rawApplications) {
  if (dom.statTotal) dom.statTotal.textContent = apps.length;

  const activeAppsSubset = apps.filter(app => {
    const status = (app['Application Status'] || '').trim().toLowerCase();
    return status !== 'rejected' && status !== 'withdrawn';
  });
  if (dom.statActivePipeline) dom.statActivePipeline.textContent = activeAppsSubset.length;

  const uniqueCompanies = new Set();
  const uniqueJobs = new Set();
  let activeAppsCount = 0;
  let conversionCount = 0;
  let rejectedCount = 0;
  let totalSuitability = 0;
  let suitabilityCount = 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay();
  const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - distanceToMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  let appsThisWeek = 0;
  let appsThisMonth = 0;

  apps.forEach(app => {
    const company = (app['Company Name'] || '').trim();
    if (company) uniqueCompanies.add(company);

    const job = (app['Job Title'] || '').trim();
    if (job) uniqueJobs.add(job);

    const status = (app['Application Status'] || '').trim().toLowerCase();
    const isActive = status !== '' && status !== 'ready' && status !== 'applied' && status !== 'rejected' && status !== 'withdrawn';
    if (isActive) {
      activeAppsCount++;
    }

    if (status === 'rejected') {
      rejectedCount++;
    } else if (status && status !== 'ready' && status !== 'withdrawn') {
      conversionCount++;
    }

    const suitabilityVal = (app['Job_Suitability'] || '').trim();
    const score = parseFloat(suitabilityVal);
    if (!isNaN(score)) {
      totalSuitability += score;
      suitabilityCount++;
    }

    const dateStr = (app['Create Date'] || '').trim();
    if (dateStr) {
      if (state.dashboardRange === 'weekly') {
        // If range is weekly, we already filtered to only include this week
        appsThisWeek++;
        appsThisMonth++;
      } else {
        const appDate = parseDate(dateStr);
        appDate.setHours(0, 0, 0, 0);
        if (appDate >= startOfWeek) {
          appsThisWeek++;
        }
        if (appDate >= startOfMonth) {
          appsThisMonth++;
        }
      }
    }
  });

  if (dom.statCompanies) dom.statCompanies.textContent = uniqueCompanies.size;
  if (dom.statJobs) dom.statJobs.textContent = uniqueJobs.size;
  if (dom.statActiveApps) dom.statActiveApps.textContent = activeAppsCount;

  const conversionRate = apps.length > 0
    ? Math.round((conversionCount / apps.length) * 100)
    : 0;
  if (dom.statConversion) dom.statConversion.textContent = `${conversionRate}%`;

  const rejectionRate = apps.length > 0
    ? Math.round((rejectedCount / apps.length) * 100)
    : 0;
  if (dom.statRejectionRate) dom.statRejectionRate.textContent = `${rejectionRate}%`;

  const avgSuitability = suitabilityCount > 0 ? (totalSuitability / suitabilityCount).toFixed(1) : '0.0';
  if (dom.statAvgSuitability) dom.statAvgSuitability.textContent = `${avgSuitability}/5`;

  if (dom.statThisWeek) dom.statThisWeek.textContent = appsThisWeek;
  if (dom.statThisMonth) dom.statThisMonth.textContent = appsThisMonth;

  // Hide "Applied This Month" card in weekly view, show it in yearly (YTD) view
  if (dom.statCardThisMonth) {
    if (state.dashboardRange === 'weekly') {
      dom.statCardThisMonth.style.display = 'none';
    } else {
      dom.statCardThisMonth.style.display = '';
    }
  }
}

function updateFiltersUI() {
  const companySet = new Set();
  const jobSet = new Set();
  const statusSet = new Set();

  const selCompany = state.selectedCompany;
  const selJob = state.selectedJobTitle;
  const selStatus = state.selectedStatus;

  const apps = state.activeApplications || [];
  const len = apps.length;

  for (let i = 0; i < len; i++) {
    const app = apps[i];
    const company = (app['Company Name'] || '').trim();
    const job = (app['Job Title'] || '').trim();
    const status = (app['Application Status'] || '').trim();

    const matchCompany = !selCompany || company === selCompany;
    const matchJob = !selJob || job === selJob;
    const matchStatus = !selStatus || status === selStatus;

    if (company && matchJob && matchStatus) {
      companySet.add(company);
    }
    if (job && matchCompany && matchStatus) {
      jobSet.add(job);
    }
    if (status && matchCompany && matchJob) {
      statusSet.add(status);
    }
  }

  const sortFn = (a, b) => sortCollator.compare(a, b);
  const distinctCompanies = Array.from(companySet).sort(sortFn);
  const distinctJobs = Array.from(jobSet).sort(sortFn);
  const distinctStatuses = Array.from(statusSet).sort(sortFn);

  companySelect.populate(distinctCompanies, state.selectedCompany, (company) => {
    state.selectedCompany = company;
    if (state.selectedCompany && state.selectedJobTitle) {
      if (!jobSet.has(state.selectedJobTitle)) {
        state.selectedJobTitle = null;
      }
    }
    updateFiltersUI();
    applyFilters();
  });

  jobSelect.populate(distinctJobs, state.selectedJobTitle, (jobTitle) => {
    state.selectedJobTitle = jobTitle;
    if (state.selectedJobTitle && state.selectedCompany) {
      if (!companySet.has(state.selectedCompany)) {
        state.selectedCompany = null;
      }
    }
    updateFiltersUI();
    applyFilters();
  });

  statusSelect.populate(distinctStatuses, state.selectedStatus, (statusValue) => {
    state.selectedStatus = statusValue;
    updateFiltersUI();
    applyFilters();
  });
}

function getColKeyForStatus(status) {
  const s = (status || '').trim().toLowerCase();
  if (s === 'ready') return 'Ready';
  if (s === 'applied') return 'Applied';
  if (s.includes('interview')) return 'Interviewed';
  if (s === 'offered' || s === 'accepted' || s === 'offer') return 'Offered';
  if (s === 'rejected' || s === 'withdrawn' || s === 'withdraw') return 'Rejected';
  return 'Ready';
}

function sortCardsByDate(items, getApp, prioritizedApp = null) {
  items.sort((a, b) => {
    const appA = getApp ? getApp(a) : a;
    const appB = getApp ? getApp(b) : b;
    const dateA = appA ? (appA._parsedDate || parseDate(appA['Create Date'])) : null;
    const dateB = appB ? (appB._parsedDate || parseDate(appB['Create Date'])) : null;
    if (dateA && dateB) {
      const diff = dateB - dateA;
      if (diff !== 0) return diff;
    }
    // Tie-breaker for same date: recently moved card is placed first in the column
    if (prioritizedApp) {
      const pUrl = (prioritizedApp['Job URL'] || '').trim();
      const aUrl = appA ? (appA['Job URL'] || '').trim() : '';
      const bUrl = appB ? (appB['Job URL'] || '').trim() : '';
      const isAPriority = (appA === prioritizedApp) || (pUrl && aUrl === pUrl);
      const isBPriority = (appB === prioritizedApp) || (pUrl && bUrl === pUrl);
      if (isAPriority && !isBPriority) return -1;
      if (!isAPriority && isBPriority) return 1;
    }
    if (dateA) return -1;
    if (dateB) return 1;
    return 0;
  });
}

function applyFilters(skipRender = false) {
  dom.btnResetFilters.disabled = !state.selectedCompany && !state.selectedJobTitle && !state.selectedStatus;

  state.filteredApplications = state.activeApplications.filter(app => {
    const matchCompany = !state.selectedCompany || app['Company Name'] === state.selectedCompany;
    const matchJob = !state.selectedJobTitle || app['Job Title'] === state.selectedJobTitle;
    const matchStatus = !state.selectedStatus || app['Application Status'] === state.selectedStatus;
    return matchCompany && matchJob && matchStatus;
  });

  state.filteredApplications.sort((a, b) => {
    const dateA = a._parsedDate ? a._parsedDate.getTime() : 0;
    const dateB = b._parsedDate ? b._parsedDate.getTime() : 0;
    const comparison = dateB - dateA;
    if (comparison !== 0) return comparison;
    return (b.originalIndex || 0) - (a.originalIndex || 0);
  });

  if (!skipRender) {
    renderKanbanBoard();
  }
}

const AGE_TINT_CLASSES = ['age-green', 'age-amber', 'age-red'];

function computeApplicationAge(parsedDate, now = new Date()) {
  if (!parsedDate) return null;
  const start = new Date(parsedDate);
  if (isNaN(start.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  let level = 'green';
  if (days >= AGE_RED_LIMIT_DAYS) level = 'red';
  else if (days >= AGE_GREEN_LIMIT_DAYS) level = 'amber';
  return { days, level };
}

function syncCardAgeTint(cardEl, app, colKey) {
  if (!cardEl) return;
  AGE_TINT_CLASSES.forEach(cls => cardEl.classList.remove(cls));
  cardEl.removeAttribute('title');
  if (colKey === 'Rejected' || !app) return;
  const ageInfo = computeApplicationAge(app._parsedDate || parseDate((app['Create Date'] || '').trim()));
  if (ageInfo) {
    cardEl.classList.add(`age-${ageInfo.level}`);
    cardEl.title = `Applied ${ageInfo.days}d ago`;
  }
}

function renderKanbanBoard() {
  if (dom.resultsCount) {
    dom.resultsCount.textContent = (state.filteredApplications || []).length;
  }

  const columns = {
    Ready: document.getElementById('kanbanCardsReady'),
    Applied: document.getElementById('kanbanCardsApplied'),
    Interviewed: document.getElementById('kanbanCardsInterviewed'),
    Offered: document.getElementById('kanbanCardsOffered'),
    Rejected: document.getElementById('kanbanCardsRejected')
  };

  const counts = {
    Ready: document.getElementById('countReady'),
    Applied: document.getElementById('countApplied'),
    Interviewed: document.getElementById('countInterviewed'),
    Offered: document.getElementById('countOffered'),
    Rejected: document.getElementById('countRejected')
  };

  Object.values(columns).forEach(col => {
    if (col) col.innerHTML = '';
  });

  const columnApps = {
    Ready: [],
    Applied: [],
    Interviewed: [],
    Offered: [],
    Rejected: []
  };

  const apps = state.filteredApplications || [];

  apps.forEach((app, idx) => {
    const colKey = getColKeyForStatus(app['Application Status']);
    columnApps[colKey].push({ app, idx });
  });

  Object.keys(counts).forEach(key => {
    if (counts[key]) {
      counts[key].textContent = columnApps[key].length;
    }
  });

  // Sort each column by creation date (newest first) using unified sort helper
  Object.keys(columnApps).forEach(key => {
    sortCardsByDate(columnApps[key], item => item.app);
  });

  Object.keys(columnApps).forEach(colKey => {
    const container = columns[colKey];
    if (!container) return;

    if (columnApps[colKey].length === 0) {
      container.innerHTML = `<div class="kanban-empty-msg" style="font-size:0.8rem; color:var(--color-text-secondary); text-align:center; padding: 1.5rem 0;">No applications</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    columnApps[colKey].forEach(({ app, idx }) => {
      const company = (app['Company Name'] || '').trim();
      const title = (app['Job Title'] || '').trim();
      const dateStr = (app['Create Date'] || '').trim();
      const suitabilityScore = (app['Job_Suitability'] || '').trim();
      const scoreNum = parseInt(suitabilityScore, 10);
      let scoreClass = 'score-low';
      if (!isNaN(scoreNum)) {
        if (scoreNum >= 4) scoreClass = 'score-high';
        else if (scoreNum >= 3) scoreClass = 'score-mid';
      }

      const followUpRaw = (app['Follow-Up'] || app['Follow_Up'] || app['Link'] || app['Job Link'] || app['URL'] || '').trim();
      const isUrl = followUpRaw.startsWith('http://') || followUpRaw.startsWith('https://');
      const jobUrl = (app['Job URL'] || '').trim();
      const isDeleting = !!(state.deleteRequests && state.deleteRequests[jobUrl] && state.deleteRequests[jobUrl].status === 'submitting');
      
      const deleteControl = (colKey === 'Ready' && jobUrl) ? `
        <form class="kanban-delete-form" method="post" action="${escapeHtml(getDeleteApiEndpoint())}" data-job-url="${escapeHtml(jobUrl)}">
          <input type="hidden" name="jobUrl" value="${escapeHtml(jobUrl)}">
          <button type="submit" class="btn-kanban-delete" ${isDeleting ? 'disabled' : ''} aria-label="${escapeHtml('Delete application for ' + company)}" title="Delete application">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            ${isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </form>
      ` : '';

      const card = document.createElement('div');
      card.className = `kanban-card${isDeleting ? ' is-deleting' : ''}`;
      card.setAttribute('draggable', isDeleting ? 'false' : 'true');
      card.setAttribute('data-index', app.originalIndex !== undefined ? app.originalIndex : idx);
      syncCardAgeTint(card, app, colKey);

      card.innerHTML = `
        <div class="kanban-card-top">
          <span class="kanban-card-company">${escapeHtml(company)}</span>
          ${suitabilityScore ? `<span class="kanban-score-pill ${scoreClass}">★ ${escapeHtml(suitabilityScore)}/5</span>` : ''}
        </div>
        <h4 class="kanban-card-title">${escapeHtml(title)}</h4>
        <div class="kanban-card-meta">
          <span class="kanban-card-date">${escapeHtml(formatDisplayDate(dateStr))}</span>
          ${deleteControl}
        </div>
        <div class="kanban-card-actions">
          ${isUrl ? `
            <a href="${escapeHtml(followUpRaw)}" target="_blank" rel="noopener noreferrer" class="btn-kanban-followup">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Follow Up
            </a>
          ` : `
            <button type="button" class="btn-kanban-followup kanban-btn-details" data-index="${app.originalIndex !== undefined ? app.originalIndex : idx}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Follow Up
            </button>
          `}
          <button type="button" class="kanban-btn-details-link kanban-btn-details" data-index="${app.originalIndex !== undefined ? app.originalIndex : idx}">
            View Details &rarr;
          </button>
        </div>
      `;

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  });
}

function updateColumnEmptyState(container) {
  if (!container) return;
  const cards = container.querySelectorAll('.kanban-card');
  const emptyMsg = container.querySelector('.kanban-empty-msg');
  if (cards.length === 0) {
    if (!emptyMsg) {
      container.innerHTML = `<div class="kanban-empty-msg" style="font-size:0.8rem; color:var(--color-text-secondary); text-align:center; padding: 1.5rem 0;">No applications</div>`;
    }
  } else {
    if (emptyMsg) {
      emptyMsg.remove();
    }
  }
}

function updateColumnHeaderCount(colKey, delta) {
  const counterEl = document.getElementById(`count${colKey}`);
  if (counterEl) {
    const current = parseInt(counterEl.textContent, 10) || 0;
    counterEl.textContent = Math.max(0, current + delta);
  }
}

function setupKanbanDragAndDrop() {
  if (dom.kanbanBoard) {
    dom.kanbanBoard.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;
      if (card.classList.contains('is-deleting') || e.target.closest('.kanban-delete-form')) {
        e.preventDefault();
        return;
      }
      card.classList.add('dragging');
      const rawIdx = card.getAttribute('data-index');
      const idx = parseInt(rawIdx, 10);
      const app = (state.rawApplications || []).find(a => a.originalIndex === idx) || (state.filteredApplications || [])[idx];
      state.draggingKanbanApp = app;
      state.draggingKanbanEl = card;
      if (app) {
        e.dataTransfer.setData('text/plain', (app['Company Name'] || '') + '|' + (app['Job Title'] || ''));
      }
      e.dataTransfer.effectAllowed = 'move';
    });

    dom.kanbanBoard.addEventListener('dragend', (e) => {
      const card = e.target.closest('.kanban-card');
      if (card) card.classList.remove('dragging');
    });
  }

  const containers = document.querySelectorAll('.kanban-cards-container');
  containers.forEach(container => {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!container.classList.contains('drag-over')) {
        container.classList.add('drag-over');
      }
    });

    container.addEventListener('dragleave', (e) => {
      if (!container.contains(e.relatedTarget)) {
        container.classList.remove('drag-over');
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      
      const app = state.draggingKanbanApp;
      const cardEl = state.draggingKanbanEl;
      state.draggingKanbanApp = null;
      state.draggingKanbanEl = null;
      if (!app) return;

      const targetStatus = container.getAttribute('data-status');
      if (app && targetStatus) {
        updateApplicationStatusDirect(app, targetStatus, container, cardEl);
      }
    });
  });
}

function updateCardDeleteButton(cardEl, app, colKey) {
  if (!cardEl || !app) return;
  const metaContainer = cardEl.querySelector('.kanban-card-meta');
  if (!metaContainer) return;

  const existingForm = metaContainer.querySelector('.kanban-delete-form');
  const jobUrl = (app['Job URL'] || '').trim();

  if (colKey === 'Ready' && jobUrl) {
    if (!existingForm) {
      const company = (app['Company Name'] || '').trim();
      const isDeleting = !!(state.deleteRequests && state.deleteRequests[jobUrl] && state.deleteRequests[jobUrl].status === 'submitting');
      
      const form = document.createElement('form');
      form.className = 'kanban-delete-form';
      form.method = 'post';
      form.action = getDeleteApiEndpoint();
      form.setAttribute('data-job-url', jobUrl);
      form.innerHTML = `
        <input type="hidden" name="jobUrl" value="${escapeHtml(jobUrl)}">
        <button type="submit" class="btn-kanban-delete" ${isDeleting ? 'disabled' : ''} aria-label="${escapeHtml('Delete application for ' + company)}" title="Delete application">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
          ${isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      `;
      metaContainer.appendChild(form);
    }
  } else {
    if (existingForm) {
      existingForm.remove();
    }
  }
}

async function updateApplicationStatusDirect(app, newStatus, targetContainer, cardEl) {
  if (!app) return;
  const oldStatus = (app['Application Status'] || '').trim();
  if (oldStatus.toLowerCase() === newStatus.toLowerCase()) return;

  const oldColKey = getColKeyForStatus(oldStatus);
  const newColKey = getColKeyForStatus(newStatus);

  if (!cardEl && app.originalIndex !== undefined) {
    cardEl = document.querySelector(`.kanban-card[data-index="${app.originalIndex}"]`);
  }
  const sourceContainer = cardEl ? cardEl.parentElement : null;
  if (!targetContainer && newColKey) {
    targetContainer = document.getElementById(`kanbanCards${newColKey}`);
  }

  const appKey = (app['Company Name'] || '').trim() + '|' + (app['Job Title'] || '').trim();
  if (!state.statusOverrides) state.statusOverrides = {};

  // 1. Initial Toast
  showToast('Submitting updates... Please wait for feedback.', 'info');

  // Optimistically set model status & status overrides
  app['Application Status'] = newStatus;
  state.statusOverrides[appKey] = newStatus;

  // Optimistically update DOM position & column counts without re-rendering the full board
  const isCrossColumn = oldColKey !== newColKey;
  if (isCrossColumn && cardEl && targetContainer) {
    targetContainer.appendChild(cardEl);
    updateCardDeleteButton(cardEl, app, newColKey);
    syncCardAgeTint(cardEl, app, newColKey);
    // Re-sort target column cards by creation date (newest first), prioritizing the moved card on date ties
    const cards = Array.from(targetContainer.querySelectorAll('.kanban-card'));
    const appIndexMap = new Map((state.rawApplications || []).map(a => [a.originalIndex, a]));
    sortCardsByDate(cards, el => {
      const idx = parseInt(el.getAttribute('data-index'), 10);
      return appIndexMap.get(idx);
    }, app);
    cards.forEach(c => targetContainer.appendChild(c));
    updateColumnEmptyState(targetContainer);
    if (sourceContainer) updateColumnEmptyState(sourceContainer);
    updateColumnHeaderCount(oldColKey, -1);
    updateColumnHeaderCount(newColKey, 1);
  }

  // 2. Generate submit update payload
  const formData = new FormData();
  formData.append('drawerJobTitle', app['Job Title'] || '');
  formData.append('drawerCompanyName', app['Company Name'] || '');
  formData.append('drawerlinkJobUrl', app['Job URL'] || app['linkJobUrl'] || app['drawerlinkJobUrl'] || app['Link'] || '');
  formData.append('drawerApplicationStatus', newStatus);
  formData.append('drawerCommentsInput', app['Comments'] || '');
  formData.append('drawerFollowUp', app['Follow-Up'] || app['Follow_Up'] || '');
  formData.append('drawerHiringTeam', app['Hiring Team'] || '');

  const handleFailure = (err) => {
    delete state.statusOverrides[appKey];
    app['Application Status'] = oldStatus;

    if (isCrossColumn && cardEl && sourceContainer) {
      sourceContainer.appendChild(cardEl);
      updateCardDeleteButton(cardEl, app, oldColKey);
      syncCardAgeTint(cardEl, app, oldColKey);
      const cards = Array.from(sourceContainer.querySelectorAll('.kanban-card'));
      const appIndexMap = new Map((state.rawApplications || []).map(a => [a.originalIndex, a]));
      sortCardsByDate(cards, el => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        return appIndexMap.get(idx);
      }, app);
      cards.forEach(c => sourceContainer.appendChild(c));
      updateColumnEmptyState(sourceContainer);
      if (targetContainer) updateColumnEmptyState(targetContainer);
      updateColumnHeaderCount(oldColKey, 1);
      updateColumnHeaderCount(newColKey, -1);
    }

    const isTimeout = err && (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('timed out')));
    const errMsg = isTimeout
      ? 'Status change timed out after 60 seconds. Reverting card to original status.'
      : 'Submission error: ' + (err && err.message ? err.message : 'Failed to update status') + '. Reverting card to original status.';
    showToast(errMsg, 'error');
  };

  try {
    await postForm(getNotesApiEndpoint(), formData, {
      timeoutMs: 60000,
      setLoading: () => {},
      onSuccess: () => {
        showToast('Application status updated successfully! Syncing database...', 'success');
        if (state.currentApp && state.currentApp['Job URL'] === app['Job URL']) {
          state.currentApp['Application Status'] = newStatus;
          if (dom.drawerStatusSelect) {
            dom.drawerStatusSelect.value = newStatus;
            updateSelectColorClass(dom.drawerStatusSelect);
          }
        }
        // Invalidate cache to force a fresh pull from Google Sheets database
        deleteCache(CSV_CACHE_KEY);

        setTimeout(() => {
          fetchData(false, true, (ok) => {
            if (ok !== false) {
              showToast('Database confirmed and synchronized.', 'success');
            }
          });
        }, 2500);
      },
      onError: (err) => handleFailure(err)
    });
  } catch (err) {
    handleFailure(err);
  }
}

/* --------------------------------------------------------------------------
   DELETE APPLICATION FLOW
   -------------------------------------------------------------------------- */

function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'del_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function lockCard(cardEl, locked) {
  if (!cardEl) return;
  cardEl.classList.toggle('is-deleting', locked);
  cardEl.setAttribute('draggable', locked ? 'false' : 'true');
  cardEl.setAttribute('aria-busy', locked ? 'true' : 'false');

  cardEl.querySelectorAll('button, a, input').forEach(el => {
    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
      el.disabled = locked;
    }
    if (locked) el.setAttribute('tabindex', '-1');
    else el.removeAttribute('tabindex');
  });
}

function removeApplicationLocally(jobUrl) {
  if (!jobUrl) return;
  const removed = [];
  const isMatch = (a) => (a['Job URL'] || '').trim() === jobUrl;

  state.rawApplications = (state.rawApplications || []).filter(a => {
    const keep = !isMatch(a);
    if (!keep) removed.push(a);
    return keep;
  });
  state.activeApplications = (state.activeApplications || []).filter(a => !isMatch(a));
  state.filteredApplications = (state.filteredApplications || []).filter(a => !isMatch(a));

  removed.forEach(a => {
    const keyVer = (a['Company Name'] || '').trim() + '|' + (a['Job Title'] || '').trim();
    if (state.statusOverrides && state.statusOverrides[keyVer]) {
      delete state.statusOverrides[keyVer];
    }
  });

  if (state.currentApp && isMatch(state.currentApp)) state.currentApp = null;
}

async function deleteApplication(app, cardEl) {
  const jobUrl = (app['Job URL'] || '').trim();
  if (!jobUrl) {
    showToast('This application has no Job URL and cannot be deleted.', 'error');
    return;
  }

  if (state.deleteRequests && state.deleteRequests[jobUrl] && state.deleteRequests[jobUrl].status === 'submitting') {
    showToast('A deletion request is already in progress for this application.', 'warning');
    return;
  }

  const requestId = generateRequestId();
  if (!state.deleteRequests) state.deleteRequests = {};
  state.deleteRequests[jobUrl] = { requestId, jobUrl, status: 'submitting', startedAt: Date.now() };

  lockCard(cardEl, true);
  const toastId = showPersistentToast('Submitting deletion request to the database...', 'info');

  const formData = new FormData();
  formData.append('jobUrl', jobUrl);
  formData.append('requestId', requestId);
  formData.append('action', 'delete');
  formData.append('companyName', app['Company Name'] || '');
  formData.append('jobTitle', app['Job Title'] || '');

  const onFailure = (message) => {
    delete state.deleteRequests[jobUrl]; // allow retry
    lockCard(cardEl, false);
    updatePersistentToast(toastId, message, 'error');
    showToast('Deletion failed. The application remains available.', 'error');
    setTimeout(() => closePersistentToast(toastId), 3500);
  };

  try {
    await postForm(getDeleteApiEndpoint(), formData, {
      timeoutMs: DELETE_TIMEOUT_MS,
      setLoading: () => {},
      onSuccess: () => {
        if (state.deleteRequests[jobUrl]) {
          state.deleteRequests[jobUrl].status = 'deleted';
        }

        // Remove from local state immediately so the card disappears even if refresh fails.
        removeApplicationLocally(jobUrl);
        renderKanbanBoard();

        updatePersistentToast(toastId, 'Application deleted successfully!', 'success');

        // Invalidate cache and force a fresh database refresh to reconcile.
        deleteCache(CSV_CACHE_KEY);

        new Promise((resolve) => fetchData(false, true, resolve)).then((refreshOk) => {
          if (refreshOk !== false) {
            renderKanbanBoard();
          } else {
            updatePersistentToast(toastId, 'Deleted from database, but the latest board data could not be loaded. Use Refresh.', 'warning');
          }
          setTimeout(() => closePersistentToast(toastId), 3500);
          delete state.deleteRequests[jobUrl];
        });
      },
      onError: (err) => {
        const isTimeout = err && (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('timed out')));
        if (isTimeout) {
          if (state.deleteRequests[jobUrl]) {
            state.deleteRequests[jobUrl].status = 'unconfirmed';
          }
          updatePersistentToast(toastId, 'Deletion timed out after 60 seconds. Please refresh or retry.', 'warning');
          setTimeout(() => {
            lockCard(cardEl, false);
            if (state.deleteRequests && state.deleteRequests[jobUrl] && state.deleteRequests[jobUrl].status === 'unconfirmed') {
              delete state.deleteRequests[jobUrl];
            }
            closePersistentToast(toastId);
          }, 3500);
          return;
        }
        const msg = (err && err.message) ? err.message : 'Failed to delete application';
        onFailure(msg);
      }
    });
  } catch (err) {
    onFailure('Failed to delete application: ' + (err && err.message ? err.message : err));
  }
}

function selectTab(tabId) {
  const tabs = document.querySelectorAll('.drawer-tab');
  const panes = document.querySelectorAll('.drawer-tab-pane');
  
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    } else {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    }
  });
  
  const selectedTabEl = document.getElementById(tabId);
  const targetPaneId = selectedTabEl ? selectedTabEl.getAttribute('aria-controls') : '';
  
  panes.forEach(pane => {
    if (pane.id === targetPaneId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
}

function updateSelectColorClass(select) {
  if (!select) return;
  select.classList.remove('status-ready', 'status-applied', 'status-interviewed', 'status-accepted', 'status-offered', 'status-rejected', 'status-withdrawn');
  const statusClass = select.value.toLowerCase().replace(/\s+/g, '-');
  select.classList.add(`status-${statusClass}`);
}

function updateFollowUpLink() {
  if (!dom.drawerFollowUp || !dom.drawerFollowUpLink) return;
  const val = dom.drawerFollowUp.value.trim();
  if (val) {
    dom.drawerFollowUpLink.href = sanitizeUrl(val);
    dom.drawerFollowUpLink.style.display = 'inline-flex';
  } else {
    dom.drawerFollowUpLink.style.display = 'none';
  }
}

function updateHiringTeamLink() {
  if (!dom.drawerHiringTeam || !dom.drawerHiringTeamLink) return;
  const val = dom.drawerHiringTeam.value.trim();
  const isNotDefined = val.toLowerCase() === 'not defined';
  if (val && !isNotDefined) {
    dom.drawerHiringTeamLink.href = sanitizeUrl(val);
    dom.drawerHiringTeamLink.style.display = 'inline-flex';
  } else {
    dom.drawerHiringTeamLink.style.display = 'none';
  }
}

/**
 * Parse the JSON suitability evaluation string from the DB and render it
 * as human-readable HTML. Expected shape (array with one object):
 * [{ RecruiterVerdict, BiggestStrengths: [], CriticalConcerns: [] }]
 * Falls back to plain text if the string is not valid JSON.
 */
function renderSuitabilityEvaluation(raw) {
  try {
    let data = JSON.parse(raw);
    // Accept both a bare object and an array wrapping one object
    if (Array.isArray(data)) data = data[0];
    if (!data || typeof data !== 'object') throw new Error('not an object');

    const escHtml = (str) => {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    };

    let html = '<div class="suit-eval-grid">';

    // --- Recruiter Verdict ---
    if (data.RecruiterVerdict) {
      html += `<div class="suit-eval-section suit-eval-verdict">
        <div class="suit-eval-heading">
          <svg class="suit-eval-icon suit-eval-icon--verdict" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"/></svg>
          <span>Recruiter Verdict</span>
        </div>
        <p class="suit-eval-text">${escHtml(data.RecruiterVerdict)}</p>
      </div>`;
    }

    // --- Biggest Strengths ---
    if (Array.isArray(data.BiggestStrengths) && data.BiggestStrengths.length) {
      const items = data.BiggestStrengths.map(s =>
        `<li>
          <svg class="suit-eval-li-icon suit-eval-li-icon--strength" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
          <span>${escHtml(s)}</span>
        </li>`
      ).join('');
      html += `<div class="suit-eval-section suit-eval-strengths">
        <div class="suit-eval-heading">
          <svg class="suit-eval-icon suit-eval-icon--strength" viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"/></svg>
          <span>Biggest Strengths</span>
        </div>
        <ul class="suit-eval-list">${items}</ul>
      </div>`;
    }

    // --- Critical Concerns ---
    if (Array.isArray(data.CriticalConcerns) && data.CriticalConcerns.length) {
      const items = data.CriticalConcerns.map(c =>
        `<li>
          <svg class="suit-eval-li-icon suit-eval-li-icon--concern" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span>${escHtml(c)}</span>
        </li>`
      ).join('');
      html += `<div class="suit-eval-section suit-eval-concerns">
        <div class="suit-eval-heading">
          <svg class="suit-eval-icon suit-eval-icon--concern" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <span>Critical Concerns</span>
        </div>
        <ul class="suit-eval-list">${items}</ul>
      </div>`;
    }

    // --- Candidate Feedback ---
    if (data.CandidateFeedback) {
      if (Array.isArray(data.CandidateFeedback) && data.CandidateFeedback.length) {
        const items = data.CandidateFeedback.map(f =>
          `<li>
            <svg class="suit-eval-li-icon suit-eval-li-icon--feedback" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
            <span>${escHtml(f)}</span>
          </li>`
        ).join('');
        html += `<div class="suit-eval-section suit-eval-feedback">
          <div class="suit-eval-heading">
            <svg class="suit-eval-icon suit-eval-icon--feedback" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
            <span>Candidate Feedback</span>
          </div>
          <ul class="suit-eval-list">${items}</ul>
        </div>`;
      } else if (typeof data.CandidateFeedback === 'string' && data.CandidateFeedback.trim()) {
        html += `<div class="suit-eval-section suit-eval-feedback">
          <div class="suit-eval-heading">
            <svg class="suit-eval-icon suit-eval-icon--feedback" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
            <span>Candidate Feedback</span>
          </div>
          <p class="suit-eval-text">${escHtml(data.CandidateFeedback)}</p>
        </div>`;
      }
    }

    html += '</div>';
    return html;
  } catch {
    // Not valid JSON — show as-is with HTML escaping
    const d = document.createElement('div');
    d.textContent = raw;
    return `<p class="suit-eval-text">${d.innerHTML}</p>`;
  }
}

function openDetailsDrawer(app) {
  state.currentApp = app;

  const status = (app['Application Status'] || '').trim();
  
  const jobTitleVal = (app['Job Title'] || '').trim();
  const companyVal  = (app['Company Name'] || '').trim();

  if (dom.drawerJobTitleDisplay)   dom.drawerJobTitleDisplay.textContent   = jobTitleVal;
  if (dom.drawerCompanyNameDisplay) dom.drawerCompanyNameDisplay.textContent = companyVal;
  if (dom.drawerJobTitle)          dom.drawerJobTitle.value                = jobTitleVal;
  if (dom.drawerCompanyName)        dom.drawerCompanyName.value              = companyVal;
  dom.drawerDate.textContent = formatDisplayDate((app['Create Date'] || '').trim());
  
  const hiringTeamVal = (app['Hiring Team'] || '').trim();
  if (dom.drawerHiringTeam) {
    dom.drawerHiringTeam.value = hiringTeamVal;
    updateHiringTeamLink();
  }

  const followUpVal = (app['Follow-Up'] || '').trim();
  if (dom.drawerFollowUp) {
    dom.drawerFollowUp.value = followUpVal;
    updateFollowUpLink();
  }
  
  // Preparation tab: merge suitability + interview company/prep into one tab
  const score = (app['Job_Suitability'] || '').trim();
  const evaluation = (app['Job_Suitability_Evaluation'] || '').trim();
  const interviewCompany = (app['Interview_Company'] || '').trim();
  const interviewPrep = (app['Interview_Preparation'] || '').trim();

  const hasPreparation = !!(score || evaluation || interviewCompany || interviewPrep);

  if (hasPreparation) {
    if (dom.tabPreparation) {
      dom.tabPreparation.classList.remove('disabled');
      dom.tabPreparation.removeAttribute('disabled');
    }
    if (dom.btnCopyPreparation) dom.btnCopyPreparation.style.display = '';

    // --- A) Company Introduction ---
    const companyEl = dom.drawerInterviewCompany;
    const companyNoData = document.getElementById('prepNoDataCompany');
    if (interviewCompany) {
      if (companyEl) companyEl.innerHTML = parseMarkdown(interviewCompany);
      if (companyEl) companyEl.style.display = '';
      if (companyNoData) companyNoData.style.display = 'none';
    } else {
      if (companyEl) companyEl.style.display = 'none';
      if (companyNoData) companyNoData.style.display = '';
    }

    // --- B) Job Suitability: Score + Evaluation ---
    const suitabilityNoData = document.getElementById('prepNoDataSuitability');
    const scoreCircleFill = document.getElementById('scoreCircleFill');
    const suitabilityScoreCircle = document.getElementById('suitabilityScoreCircle');

    if (score || evaluation) {
      if (suitabilityNoData) suitabilityNoData.style.display = 'none';

      if (score) {
        if (dom.drawerSuitabilityScore) dom.drawerSuitabilityScore.textContent = score;
        const scoreNum = parseInt(score, 10);
        const scoreClass = !isNaN(scoreNum) && scoreNum >= 1 && scoreNum <= 5 ? `score-${scoreNum}` : '';
        if (suitabilityScoreCircle) suitabilityScoreCircle.className = `suitability-score-circle ${scoreClass}`;
        if (scoreCircleFill) {
          const scorePercent = !isNaN(scoreNum) && scoreNum >= 1 && scoreNum <= 5 ? scoreNum / 5 : 0;
          scoreCircleFill.style.strokeDashoffset = 251.2 * (1 - scorePercent);
        }
        if (dom.drawerSuitabilityScoreContainer) dom.drawerSuitabilityScoreContainer.style.display = '';
      } else {
        if (dom.drawerSuitabilityScoreContainer) dom.drawerSuitabilityScoreContainer.style.display = 'none';
        if (scoreCircleFill) scoreCircleFill.style.strokeDashoffset = 251.2;
        if (suitabilityScoreCircle) suitabilityScoreCircle.className = 'suitability-score-circle';
      }

      if (evaluation) {
        if (dom.drawerSuitabilityEval) dom.drawerSuitabilityEval.innerHTML = renderSuitabilityEvaluation(evaluation);
        if (dom.sectionSuitabilityEval) dom.sectionSuitabilityEval.classList.remove('hidden');
      } else {
        if (dom.sectionSuitabilityEval) dom.sectionSuitabilityEval.classList.add('hidden');
      }
    } else {
      if (dom.drawerSuitabilityScoreContainer) dom.drawerSuitabilityScoreContainer.style.display = 'none';
      if (dom.sectionSuitabilityEval) dom.sectionSuitabilityEval.classList.add('hidden');
      if (scoreCircleFill) scoreCircleFill.style.strokeDashoffset = 251.2;
      if (suitabilityScoreCircle) suitabilityScoreCircle.className = 'suitability-score-circle';
      if (suitabilityNoData) suitabilityNoData.style.display = '';
    }

    // --- C) Interview Preparation ---
    const prepEl = dom.drawerInterviewPreparation;
    const prepNoData = document.getElementById('prepNoDataInterview');
    if (interviewPrep) {
      if (prepEl) prepEl.innerHTML = parseMarkdown(interviewPrep);
      if (prepEl) prepEl.style.display = '';
      if (prepNoData) prepNoData.style.display = 'none';
    } else {
      if (prepEl) prepEl.style.display = 'none';
      if (prepNoData) prepNoData.style.display = '';
    }
  } else {
    if (dom.tabPreparation) {
      dom.tabPreparation.classList.add('disabled');
      dom.tabPreparation.setAttribute('disabled', 'true');
    }
    if (dom.btnCopyPreparation) dom.btnCopyPreparation.style.display = 'none';
  }

  // Notes tab: always available (enabled) for all applications
  const interviewNotes = (app['Interview_Notes'] || '').trim();
  if (dom.tabNotes) {
    dom.tabNotes.classList.remove('disabled');
    dom.tabNotes.removeAttribute('disabled');
  }
  if (dom.drawerInterviewNotes) dom.drawerInterviewNotes.value = interviewNotes;
  setInterviewLoadingState(false);

  if (dom.drawerStatusSelect) {
    const options = Array.from(dom.drawerStatusSelect.options);
    const matchedOption = options.find(opt => opt.value.toLowerCase() === status.toLowerCase());
    if (matchedOption) {
      dom.drawerStatusSelect.value = matchedOption.value;
    } else {
      dom.drawerStatusSelect.value = "Applied";
    }
    updateSelectColorClass(dom.drawerStatusSelect);
  }

  dom.drawerJobDescription.textContent = (app['Job Description'] || 'Not available.').trim();
  dom.drawerCompanyDescription.textContent = (app['Company Description'] || 'Not available.').trim();

  const jobUrl = (app['Job URL'] || '').trim();
  if (dom.drawerlinkJobUrl) dom.drawerlinkJobUrl.value = jobUrl;
  if (dom.linkJobUrlAnchor) {
    if (jobUrl) { dom.linkJobUrlAnchor.href = sanitizeUrl(jobUrl); dom.linkJobUrlAnchor.style.display = ''; }
    else        { dom.linkJobUrlAnchor.style.display = 'none'; }
  }

  const companyFolder = (app['Company_Folder'] || '').trim();
  if (dom.linkCompanyFolder) {
    if (companyFolder) {
      dom.linkCompanyFolder.href = sanitizeUrl(companyFolder);
      dom.linkCompanyFolder.style.display = '';
    } else {
      dom.linkCompanyFolder.style.display = 'none';
    }
  }

  const comments = (app['Comments'] || '').trim();
  if (dom.drawerCommentsTextarea) {
    dom.drawerCommentsTextarea.value = comments;
  }

  selectTab('tabOverview');

  drawerLastFocusedElement = document.activeElement;
  document.addEventListener('keydown', trapDrawerFocus);

  dom.drawerOverlay.classList.add('active');
  dom.detailsDrawer.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  dom.detailsDrawer.querySelector('.drawer-body').scrollTop = 0;
  if (dom.btnCloseDrawer) {
    dom.btnCloseDrawer.focus();
  }
}



function trapDrawerFocus(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeDetailsDrawer();
    return;
  }
  if (e.key !== 'Tab') return;
  if (!dom.detailsDrawer) return;

  const focusable = dom.detailsDrawer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function closeDetailsDrawer() {
  document.removeEventListener('keydown', trapDrawerFocus);
  dom.drawerOverlay.classList.remove('active');
  dom.detailsDrawer.classList.remove('active');
  document.body.style.overflow = '';
  if (drawerLastFocusedElement && typeof drawerLastFocusedElement.focus === 'function') {
    drawerLastFocusedElement.focus();
    drawerLastFocusedElement = null;
  }
}

function showEl(el) {
  if (!el) return;
  el.classList.remove('tab-hidden');
  el.classList.add('tab-fade-in');
}

function hideEl(el) {
  if (!el) return;
  el.classList.remove('tab-fade-in');
  el.classList.add('tab-hidden');
}

function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });
  
  revealElements.forEach(el => {
    observer.observe(el);
  });
}

function initTabNavigation() {
  function switchTab(targetTab) {
    // When selecting Applications menu option ('home'), force refresh database
    if (targetTab === 'home') {
      fetchData(false, true);
    } else if (targetTab === 'dashboard') {
      fetchData(true);
    }

    // Scroll to top on tab switch
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const navButtons = document.querySelectorAll('.topbar-nav-btn');
    navButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === targetTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (dom.fabBtn) {
      if (targetTab === 'landing' || targetTab === 'new-application') {
        dom.fabBtn.style.display = 'none';
        if (dom.refreshBtn) dom.refreshBtn.style.display = 'none';
      } else {
        dom.fabBtn.style.display = 'flex';
        if (dom.refreshBtn) dom.refreshBtn.style.display = 'flex';
      }
    }

    // Stop landing particles when navigating away
    if (targetTab !== 'landing' && window._landingParticles) {
      window._landingParticles.stop();
    }

    if (targetTab === 'landing') {
      showEl(dom.landingTabContent);
      hideEl(dom.filtersSection);
      hideEl(dom.applicationsSection);
      hideEl(dom.syncContainer);
      hideEl(dom.statsSection);
      hideEl(dom.analyticsSection);
      hideEl(dom.newApplicationSection);
      hideEl(dom.globalDashboardRangeContainer);

      // Start landing particle network
      if (!window._landingParticles) {
        window._landingParticles = new LandingParticles();
      }
      window._landingParticles.start();
    } else if (targetTab === 'home') {
      hideEl(dom.landingTabContent);
      showEl(dom.filtersSection);
      showEl(dom.applicationsSection);
      showEl(dom.syncContainer);
      showEl(dom.kanbanViewSection);
      renderKanbanBoard();
      hideEl(dom.statsSection);
      hideEl(dom.analyticsSection);
      hideEl(dom.newApplicationSection);
      hideEl(dom.globalDashboardRangeContainer);
    } else if (targetTab === 'dashboard') {
      hideEl(dom.landingTabContent);
      hideEl(dom.filtersSection);
      hideEl(dom.applicationsSection);
      showEl(dom.syncContainer);
      showEl(dom.statsSection);
      showEl(dom.analyticsSection);
      hideEl(dom.newApplicationSection);
      showEl(dom.globalDashboardRangeContainer);

      if (state.rawApplications.length > 0) {
        try {
          const range = state.dashboardRange || 'yearly';
          const filtered = getFilteredDashboardApps(range);
          calculateStatistics(filtered);
          renderAllDashboardWidgets(filtered);
        } catch (error) {
          console.error("Failed to render dashboard widgets on tab switch:", error);
        }
      }
    } else if (targetTab === 'new-application') {
      hideEl(dom.landingTabContent);
      hideEl(dom.filtersSection);
      hideEl(dom.applicationsSection);
      hideEl(dom.syncContainer);
      hideEl(dom.statsSection);
      hideEl(dom.analyticsSection);
      showEl(dom.newApplicationSection);
      hideEl(dom.globalDashboardRangeContainer);

      if (!window._formApp) {
        window._formApp = new FormApp();
      }
    }
  }

  window.switchTab = switchTab;

  const navButtons = document.querySelectorAll('.topbar-nav-btn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = btn.getAttribute('data-tab');
      if (target) {
        switchTab(target);
      }
    });
  });

  if (dom.fabBtn) {
    dom.fabBtn.addEventListener('click', () => {
      switchTab('new-application');
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const startTab = urlParams.get('tab');
  if (startTab) {
    switchTab(startTab);
  } else {
    switchTab('landing');
  }
}



function setInterviewLoadingState(isLoading) {
  if (dom.jobInterviewForm) {
    dom.jobInterviewForm.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  const elements = [
    dom.btnSubmitOverviewBottom,
    dom.btnSubmitNotesBottom,
    dom.btnResetInterviewNotes,
    dom.drawerInterviewNotes,
    dom.drawerStatusSelect,
    dom.drawerCommentsTextarea,
    dom.drawerFollowUp,
    dom.drawerHiringTeam
  ];
  elements.forEach(el => {
    if (el) el.disabled = isLoading;
  });
}

async function submitJobInterviewForm(submitMode) {
  const form = dom.jobInterviewForm;
  if (!form) return;

  if (isInterviewSubmitting) return;

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    showToast('Please fill in all required fields correctly.', 'warning');
    return;
  }

  isInterviewSubmitting = true;
  const isOverview = (submitMode === 'overview');
  const msg = isOverview ? 'Submitting updates... Please wait for feedback.' : 'Submitting your notes... Please wait for feedback.';
  showToast(msg, 'info');

  await postForm(getNotesApiEndpoint(), new FormData(form), {
    setLoading: (v) => setInterviewLoadingState(v),
    onSuccess: () => {
      form.classList.remove('was-validated');
      showToast('Changes submitted successfully!', 'success');
      if (state.currentApp) {
        if (isOverview) {
          if (dom.drawerStatusSelect) {
            const newStatus = dom.drawerStatusSelect.value;
            state.currentApp['Application Status'] = newStatus;
          }
          if (dom.drawerCommentsTextarea) {
            state.currentApp['Comments'] = dom.drawerCommentsTextarea.value.trim();
          }
          if (dom.drawerFollowUp) {
            state.currentApp['Follow-Up'] = dom.drawerFollowUp.value.trim();
          }
          if (dom.drawerHiringTeam) {
            state.currentApp['Hiring Team'] = dom.drawerHiringTeam.value.trim();
          }
        } else {
          const notesEl = document.getElementById('drawerInterviewNotes');
          state.currentApp['Interview_Notes'] = notesEl ? notesEl.value.trim() : '';
        }
      }
      if (isOverview) {
        fetchData(false, true);
      } else {
        setTimeout(fetchData, 3000);
      }
    },
    onError: (e) => {
      showToast(e.name === 'AbortError'
        ? 'Submission error: Request timed out after 90 seconds.'
        : 'Submission error: ' + e.message,
        'error');
    },
  });

  isInterviewSubmitting = false;
}

// Initialize application on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
