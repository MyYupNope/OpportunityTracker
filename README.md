# Opportunity Tracker

[![Deploy to GitHub Pages](https://github.com/MyYupNope/OpportunityTracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/MyYupNope/OpportunityTracker/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Opportunity Tracker** is a client-side Single Page Application (SPA) designed to track, organize, analyze, and manage job applications throughout the entire interview lifecycle.

It pairs a responsive web dashboard with real-time Google Sheets CSV synchronization and private `n8n` automation webhooks for AI-assisted note processing and status synchronization.

---

## 🌟 Key Features

- **Interactive Kanban Board**:
  - 5 dynamic pipeline stages (*Ready*, *Applied*, *Interviewed*, *Offered/Accepted*, *Rejected/Withdrawn*).
  - Drag-and-drop status transitions with optimistic UI updates and automatic rollback on network failure.
  - Single-click deletion requests with confirmation guards for unsent/draft applications.
- **Real-Time Data Synchronization**:
  - Direct HTTP streaming and client-side CSV parsing of Google Sheets records.
  - Offline-first encrypted `localStorage` cache with 24-hour TTL and smart 15-minute tab-switch sync.
- **Detailed Opportunity Drawer**:
  - Modular tabs for *Overview*, *Job Details*, *Preparation*, and *Notes*.
  - AI Suitability scoring (1–5 scale) with breakdown of recruiter verdicts, strengths, and critical concerns.
  - Specialized Microsoft Word-ready HTML copy exporter with clean native table styling.
  - Live markdown rendering for company briefs and interview preparation notes.
- **Interactive Analytics & Metrics**:
  - Visual metrics and distributions powered by **Chart.js** (Cumulative Submissions, Status Split, Job Suitability, Top/Worst Companies).
  - Weekly vs. Yearly (YTD) dashboard range toggle.
  - Conversion rates, active pipeline counts, and velocity metrics.
- **Faceted Multi-Attribute Filtering**:
  - Instant faceted dropdown filtering by **Company Name**, **Job Title**, and **Application Status**.
  - Accessible keyboard navigation (Arrow keys, Enter, Escape) with real-time search.
- **Interactive Landing Page**:
  - Dynamic canvas particle physics network responding to theme changes.
  - Bento grid showcase cards linking to core workspaces and the interactive resume.
- **Direct Webhook Automation**:
  - Asynchronous webhook integration with `n8n` for adding new opportunities, updating notes, and triggering deletions.
- **Dark & Light Mode**:
  - Seamless theme switching with persistent local storage preferences and zero-flicker inline detection.
- **Zero-Build Architecture**:
  - Pure native Vanilla JavaScript (ES Modules), HTML5, Bootstrap 5, and CSS3 — requires no bundlers or transpilation step.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended) or any static file server.

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/MyYupNope/OpportunityTracker.git
   cd OpportunityTracker
   ```

2. Start the local development server:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

---

## 📁 Repository Structure

```
OpportunityTracker/
├── assets/                  # Application graphics, screenshots, favicon
├── css/
│   └── styles.css           # Core stylesheet & design system variables
├── documentation/           # Architecture diagrams, review reports, and process flows
├── introduction/            # Reference CV data and profile media
├── js/
│   ├── app.js               # Main application orchestration, Kanban, & drawer logic
│   ├── Charts.js            # Chart.js visualizations & stats calculation
│   ├── Config.js            # Base64-encoded endpoints & proxy configuration
│   ├── FacetedSelect.js     # Custom faceted dropdown & search component
│   ├── FormApp.js           # New Application submission form & draft autosave
│   ├── Markdown.js          # In-app Markdown parser with LRU cache
│   ├── State.js             # Global application state store
│   ├── Toast.js             # Floating UI notifications
│   └── Utils.js             # Formatting, sanitization, encryption, & DOM helpers
├── index.html               # Main Single Page Application entrypoint
├── package.json             # NPM package scripts & configuration
├── serve.js                 # Standalone local HTTP dev server
├── LICENSE                  # MIT License
├── .gitignore               # Git ignored patterns
└── README.md                # Project documentation
```

---

## ⚙️ Configuration

Application endpoints can be customized dynamically using `window.APP_CONFIG` in `index.html` or configured via `js/Config.js`:

```javascript
window.APP_CONFIG = {
  SHEET_EXPORT_URL: "https://docs.google.com/spreadsheets/d/.../export?format=csv",
  FORM_API_ENDPOINT: "https://your-n8n-instance/webhook/new-opportunity",
  NOTES_API_ENDPOINT: "https://your-n8n-instance/webhook/update-notes",
  DELETE_API_ENDPOINT: "https://your-n8n-instance/webhook/delete-opportunity"
};
```

---

## 🚢 Deployment

The repository includes a GitHub Actions workflow located at `.github/workflows/deploy.yml` configured to automatically deploy the application to GitHub Pages whenever changes are pushed to the `main` branch.

To enable GitHub Pages in your repository settings:
1. Navigate to **Settings** > **Pages** in GitHub.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push to `main` to trigger the automated build and deployment.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
