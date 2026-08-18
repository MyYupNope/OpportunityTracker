# Opportunity Tracker Workspace Rules & Guidelines

## Project Overview
**Opportunity Tracker** is a client-side Single Page Application (SPA) designed to track, organize, and manage job applications throughout the interview lifecycle, with Google Sheets CSV sync and n8n webhook automation.

---

## Workspace Custom Rules

- **Git Commits & Live Deployment ("commit")**:
  - Never commit or push code until the user has manually tested and explicitly approved the changes.
  - Whenever the user requests a **"commit"** (or deploy), automatically:
    1. Review and sync `README.md` (ensuring listed features, directory structure tree, assets, and configurations reflect the latest changes).
    2. Stage all changes (`git add .`)
    3. Commit with a clear semantic message (`git commit -m "..."`)
    4. Push to `origin main` (`git push origin main`), which triggers automated GitHub Pages deployment via GitHub Actions (`.github/workflows/deploy.yml`).

- **Local Testing Environment**:
  - Always automatically launch a local test environment server (`node serve.js` or `npm run serve`) after applying any code changes so the user can manually evaluate before approving.

- **Architecture & Code Guidelines**:
  - **Technology**: Vanilla JavaScript (ES Modules), HTML5, Bootstrap 5, Chart.js, CSS3.
  - **Zero Build**: Do not add unnecessary bundlers or transpilation steps unless explicitly requested.
  - **API & Storage Integrity**: Preserve compatibility with the Google Sheets CSV format and `n8n` webhook payload structures (`getFormApiEndpoint`, `getNotesApiEndpoint`, `getDeleteApiEndpoint`).
