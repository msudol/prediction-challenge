# Prediction Challenge Submission Tool

Minimal Express app with a public submission form and a password-protected results page.

## Run

```bash
npm install
export RESULTS_PASSWORD="use-a-random-password-at-least-16-characters"
export RESULTS_USER="manager"
npm start
```

Open `http://localhost:3000`. Results are at `/results`; the browser will request the configured Basic Auth credentials.

By default, submissions are stored at `./data/guesses.csv`, inside the application directory but outside the static web root (`public/`), so it is not served over HTTP. Override this with `DATA_FILE`. Ensure the service account can write to that directory. The app attempts to create the directory and file with owner-only permissions.

## Deployment notes

- Put the service behind HTTPS. Basic Auth is not safe over plain HTTP.
- Keep `RESULTS_PASSWORD` in the host's secret/environment configuration, not source control.
- If a reverse proxy is used, set `TRUST_PROXY=1` only when there is exactly one trusted proxy hop; otherwise configure Express for the actual topology.
- Persist the data directory on durable storage and back it up.
- A local CSV is appropriate for one app process. For multiple replicas or high concurrency, use a database instead.
- The duplicate-name check and append are not a transaction. This is acceptable for a small team challenge, not a high-volume/public contest.
- Adjust the bounds and closing time in both `.env` and `public/index.html` / `public/app.js`. Server-side settings remain authoritative.
