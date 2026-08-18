# Opportunity Tracker

[![Deploy to GitHub Pages](https://github.com/MyYupNope/OpportunityTracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/MyYupNope/OpportunityTracker/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Opportunity Tracker** is a client-side Single Page Application (SPA) designed to track, organize, analyze, and manage job applications throughout the entire interview lifecycle.

It pairs a responsive web dashboard with real-time Google Sheets CSV synchronization and private `n8n` automation webhooks for AI-assisted note processing and status synchronization.

---

## 🌟 Key Features

- **Real-Time Data Synchronization**: Seamlessly pulls and parses tabular application records directly from Google Sheets with in-memory caching and offline fallback.
- **Interactive Analytics & Metrics**:
  - Funnel & status distribution charts powered by **Chart.js**.
  - Monthly application velocity & trends.
  - Active vs. archived vs. rejected opportunity breakdown.
- **Advanced Filtering & Faceted Search**:
  - Multi-attribute faceted filter system (Status, Location / Work Modality, Role Type, Date range).
  - Instant text search across company names, roles, notes, and tags.
- **Detailed Opportunity Drawer**:
  - Rich Markdown rendering for interview prep notes and stage debriefs.
  - Status progression stepper.
  - Salary, contact details, job description, and custom notes.
- **Direct Webhook Actions**:
  - Asynchronous webhook integration with `n8n` for adding applications, updating notes, and triggering deletion flows.
- **Dark & Light Mode**: Seamless theme switching with persistent local storage preferences and zero-flicker load state.
- **Zero-Build Architecture**: Built entirely with Vanilla JavaScript (ES Modules), HTML5, Bootstrap 5, and CSS3 — requires no transpilation step.

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
├── assets/                  # Application graphics, screenshots, avatars, favicon
├── css/
│   └── styles.css           # Core stylesheet & design system variables
├── documentation/           # Architecture diagrams, review reports, and process flows
├── introduction/            # Reference CV and introduction assets
├── js/
│   ├── app.js               # Main application orchestration & UI event handling
│   ├── Charts.js            # Chart.js visualizations & stats calculation
│   ├── Config.js            # Endpoint configuration & proxy resolution
│   ├── FacetedSelect.js     # Custom faceted dropdown & multi-select component
│   ├── FormApp.js           # Opportunity submission & validation modal logic
│   ├── Markdown.js          # In-app Markdown parsing & rendering
│   ├── State.js             # Reactive application state store
│   ├── Toast.js             # Floating UI notifications
│   └── Utils.js             # Formatting, sanitization, & DOM helpers
├── index.html               # Main Single Page Application entrypoint
├── package.json             # NPM package scripts & configuration
├── serve.js                 # Standalone local HTTP dev server
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

This project is licensed under the MIT License.
