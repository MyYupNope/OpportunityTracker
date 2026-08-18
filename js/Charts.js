import { parseDate } from './Utils.js';
import { state } from './State.js';

let cumulativeSubmissionsChartInstance = null;
let statusSplitChartInstance = null;
let suitabilityBarChartInstance = null;
let topCompaniesChartInstance = null;
let _latestTopCompaniesApps = null;
let _latestTopCompaniesTokens = null;
let lastRenderHash = '';

let cachedTokens = null;
let cachedThemeClass = '';

/**
 * Resolves CSS design tokens in a single layout read with theme caching.
 */
function getDesignTokens() {
  const currentThemeClass = document.documentElement.className;
  if (cachedTokens && cachedThemeClass === currentThemeClass) {
    return cachedTokens;
  }

  const style = getComputedStyle(document.documentElement);
  cachedTokens = {
    primary:      style.getPropertyValue('--color-primary').trim()       || '#1a73e8',
    warning:      style.getPropertyValue('--color-warning').trim()       || '#b06000',
    error:        style.getPropertyValue('--color-error').trim()         || '#d93025',
    textSecondary:style.getPropertyValue('--color-text-secondary').trim()|| '#5f6368',
    scores: [1, 2, 3, 4, 5].map(n =>
      style.getPropertyValue(`--color-score-${n}`).trim() || '#888'
    ),
  };
  cachedThemeClass = currentThemeClass;
  return cachedTokens;
}

function initCumulativeSubmissionsChart(applications, tokens) {
  const canvasEl = document.getElementById('cumulativeSubmissionsChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');

  // 1. Group applications by date
  const dateMap = {};
  applications.forEach(app => {
    const dateStr = (app['Create Date'] || '').trim();
    if (!dateStr) return;
    if (!dateMap[dateStr]) dateMap[dateStr] = 0;
    dateMap[dateStr]++;
  });

  // 2. Sort dates chronologically (parse dates once, avoiding O(N log N) re-parsing in sort)
  const dateEntries = Object.keys(dateMap).map(dateStr => ({
    dateStr,
    dateObj: parseDate(dateStr)
  }));
  dateEntries.sort((a, b) => a.dateObj - b.dateObj);

  // 3. Prepare cumulative dataset and labels in a single pass
  let runningTotal = 0;
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const cumulativeData = new Array(dateEntries.length);
  const chartLabels = new Array(dateEntries.length);

  for (let i = 0; i < dateEntries.length; i++) {
    const entry = dateEntries[i];
    runningTotal += dateMap[entry.dateStr];
    cumulativeData[i] = runningTotal;

    const date = entry.dateObj;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    chartLabels[i] = `${day}-${month} (${weekdays[date.getDay()]})`;
  }

  if (cumulativeSubmissionsChartInstance) {
    cumulativeSubmissionsChartInstance.data.labels = chartLabels;
    cumulativeSubmissionsChartInstance.data.datasets[0].data = cumulativeData;
    cumulativeSubmissionsChartInstance.data.datasets[0].borderColor = tokens.primary;
    cumulativeSubmissionsChartInstance.data.datasets[0].backgroundColor = tokens.primary + '14';
    cumulativeSubmissionsChartInstance.data.datasets[0].pointBackgroundColor = tokens.primary;
    cumulativeSubmissionsChartInstance.options.plugins.tooltip.callbacks.title = (items) => {
      const entry = dateEntries[items[0].dataIndex];
      return entry ? entry.dateStr : '';
    };
    cumulativeSubmissionsChartInstance.update();
  } else {
    cumulativeSubmissionsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'Total Submissions',
          data: cumulativeData,
          borderColor: tokens.primary,
          backgroundColor: tokens.primary + '14',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: tokens.primary,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            backgroundColor: '#202124',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                const entry = dateEntries[items[0].dataIndex];
                return entry ? entry.dateStr : '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(0, 0, 0, 0.05)' },
            ticks: { stepSize: 5, precision: 0, font: { size: 11 } },
            min: 0
          }
        }
      }
    });
  }
}

function initStatusSplitChart(applications, tokens) {
  const canvasEl = document.getElementById('statusSplitChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  
  const statusCounts = {};
  applications.forEach(app => {
    const status = (app['Application Status'] || '').trim();
    if (!status) return;
    
    const lower = status.toLowerCase();
    let normalized = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    if (lower.includes('interview')) {
      normalized = 'Interviewed';
    } else if (lower === 'applied') {
      normalized = 'Applied';
    } else if (lower === 'rejected') {
      normalized = 'Rejected';
    }
    
    statusCounts[normalized] = (statusCounts[normalized] || 0) + 1;
  });

  const statusColors = {
    'Ready': '#b5bab5',
    'Applied': '#7ebced',
    'Interviewed': '#ecc054',
    'Offered': '#87cdda',
    'Accepted': '#7ecb93',
    'Withdrawn': '#cca0f1',
    'Rejected': '#e5918a'
  };

  const activeStatuses = Object.keys(statusCounts).sort((a, b) => a.localeCompare(b));

  const data = activeStatuses.map(status => statusCounts[status]);
  const labels = activeStatuses;
  const colors = activeStatuses.map(status => statusColors[status] || '#70757a');
  const totalSum = data.reduce((a, b) => a + b, 0);

  if (statusSplitChartInstance) {
    statusSplitChartInstance.data.labels = labels;
    statusSplitChartInstance.data.datasets[0].data = data;
    statusSplitChartInstance.data.datasets[0].backgroundColor = colors;
    statusSplitChartInstance.options.plugins.tooltip.callbacks.label = (item) => {
      const val = item.dataset.data[item.dataIndex];
      const pct = totalSum > 0 ? Math.round((val / totalSum) * 100) : 0;
      return ` ${item.label}: ${val} (${pct}%)`;
    };
    statusSplitChartInstance.update();
  } else {
    statusSplitChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Status Split', data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 45 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#202124',
            titleFont: { size: 12, weight: 'bold' },
            bodyFont: { size: 12 },
            cornerRadius: 8,
            callbacks: {
              label: (item) => {
                const val = item.dataset.data[item.dataIndex];
                const pct = totalSum > 0 ? Math.round((val / totalSum) * 100) : 0;
                return ` ${item.label}: ${val} (${pct}%)`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { stepSize: 5, precision: 0, font: { size: 11 } }, min: 0 }
        }
      }
    });
  }
}

function initSuitabilityBarChart(applications, tokens) {
  const canvasEl = document.getElementById('suitabilityBarChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  applications.forEach(app => {
    const score = parseInt((app['Job_Suitability'] || '').trim(), 10);
    if (score >= 1 && score <= 5) counts[score]++;
  });
  
  const labels = ['Score 1', 'Score 2', 'Score 3', 'Score 4', 'Score 5'];
  const data = [counts[1], counts[2], counts[3], counts[4], counts[5]];
  
  if (suitabilityBarChartInstance) {
    suitabilityBarChartInstance.data.datasets[0].data = data;
    suitabilityBarChartInstance.data.datasets[0].backgroundColor = tokens.scores;
    suitabilityBarChartInstance.update();
  } else {
    suitabilityBarChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Applications', data, backgroundColor: tokens.scores, borderRadius: 4, maxBarThickness: 30 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#202124', titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 12 }, cornerRadius: 8 }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { stepSize: 5, precision: 0, font: { size: 11 } }, min: 0 }
        }
      }
    });
  }
}

function initTopCompaniesChart(applications, tokens) {
  const canvasEl = document.getElementById('topCompaniesChart');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  
  // Always store latest data so the toggle listener uses fresh data after Weekly/Yearly switch
  _latestTopCompaniesApps = applications;
  _latestTopCompaniesTokens = tokens;

  const toggleContainer = document.getElementById('companySegmentToggle');
  const mode = toggleContainer ? (toggleContainer.getAttribute('data-mode') || 'top') : 'top';
  const isTopMode = mode === 'top';

  const companyCounts = {};
  applications.forEach(app => {
    const company = app['Company Name'];
    if (!company) return;
    const status = (app['Application Status'] || '').toLowerCase();
    
    if (isTopMode) {
      if (status !== 'rejected' && status !== 'withdrawn') {
        companyCounts[company] = (companyCounts[company] || 0) + 1;
      }
    } else {
      if (status === 'rejected' || status === 'withdrawn') {
        companyCounts[company] = (companyCounts[company] || 0) + 1;
      }
    }
  });
  
  const sortedCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const labels = sortedCompanies.map(item => item[0]);
  const data = sortedCompanies.map(item => item[1]);
  
  // Style with primary color (blue) for Top companies, error color (red) for Worst companies
  const activeColor = isTopMode ? (tokens.primary + 'cc') : (tokens.error + 'cc');
  const hoverColor = isTopMode ? tokens.primary : tokens.error;

  const backgroundColors = sortedCompanies.map(() => activeColor);
  const hoverBackgroundColors = sortedCompanies.map(() => hoverColor);

  if (topCompaniesChartInstance) {
    topCompaniesChartInstance.data.labels = labels;
    topCompaniesChartInstance.data.datasets[0].data = data;
    topCompaniesChartInstance.data.datasets[0].backgroundColor = backgroundColors;
    topCompaniesChartInstance.data.datasets[0].hoverBackgroundColor = hoverBackgroundColors;
    topCompaniesChartInstance.update();
  } else {
    topCompaniesChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Applications', data, backgroundColor: backgroundColors, hoverBackgroundColor: hoverBackgroundColors, borderRadius: 4, maxBarThickness: 20 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#202124', titleFont: { size: 12, weight: 'bold' }, bodyFont: { size: 12 }, cornerRadius: 8 }
        },
        scales: {
          x: { 
            grid: { color: 'rgba(0, 0, 0, 0.05)' }, 
            ticks: { stepSize: 1, precision: 0, font: { size: 11 } }, 
            min: 0,
            grace: 1
          },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
      },
      plugins: [{
        id: 'datalabelsCustom',
        afterDatasetsDraw(chart) {
          const { ctx, data } = chart;
          ctx.save();
          const isDark = document.documentElement.classList.contains('theme-dark');
          ctx.font = 'bold 10px Roboto, sans-serif';
          ctx.fillStyle = isDark ? '#e8eaed' : '#3c4043';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          
          const meta = chart.getDatasetMeta(0);
          if (!meta.hidden) {
            meta.data.forEach((bar, index) => {
              const val = data.datasets[0].data[index];
              if (val !== undefined && val !== null) {
                ctx.fillText(val, bar.x + 6, bar.y);
              }
            });
          }
          ctx.restore();
        }
      }]
    });
  }

  // Wire toggle listener (once) for instant re-render
  if (toggleContainer && !toggleContainer._listenerAttached) {
    toggleContainer._listenerAttached = true;
    toggleContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.segment-btn');
      if (!btn) return;
      
      toggleContainer.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const newVal = btn.getAttribute('data-value');
      toggleContainer.setAttribute('data-mode', newVal);
      
      initTopCompaniesChart(_latestTopCompaniesApps, _latestTopCompaniesTokens);
    });
  }
}

export function renderAllDashboardWidgets(applications, force = false) {
  const mainGrid = document.querySelector('.analytics-main-grid');
  const secondaryGrid = document.querySelector('.analytics-secondary-grid');
  const noDataMsg = document.getElementById('analyticsNoDataMessage');

  if (!applications || applications.length === 0) {
    if (mainGrid) mainGrid.style.display = 'none';
    if (secondaryGrid) secondaryGrid.style.display = 'none';
    if (noDataMsg) noDataMsg.style.display = 'block';
    lastRenderHash = '';
    return;
  }

  if (mainGrid) mainGrid.style.display = '';
  if (secondaryGrid) secondaryGrid.style.display = '';
  if (noDataMsg) noDataMsg.style.display = 'none';

  const isDark = document.documentElement.classList.contains('theme-dark');
  let statusSummary = '';
  for (let i = 0; i < applications.length; i++) {
    const a = applications[i];
    statusSummary += (a['Application Status'] || a['Status'] || '')[0] || '';
  }
  const currentRenderHash = `theme:${isDark}-v:${state.dataVersion}-len:${applications.length}-range:${state.dashboardRange || 'weekly'}-sig:${statusSummary}`;
  if (!force && lastRenderHash === currentRenderHash) {
    return;
  }
  lastRenderHash = currentRenderHash;

  // Set Chart.js global font/color defaults once per render cycle
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = 'Roboto, sans-serif';
    Chart.defaults.color = '#5f6368';
  }

  // Resolve CSS design tokens in one layout read
  const tokens = getDesignTokens();

  try {
    initCumulativeSubmissionsChart(applications, tokens);
    initStatusSplitChart(applications, tokens);
    initSuitabilityBarChart(applications, tokens);
    initTopCompaniesChart(applications, tokens);
  } catch (error) {
    console.error("Error rendering dashboard widgets:", error);
  }
}
