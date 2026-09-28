# Landing page copy audit prototype

This prototype safely captures one conversion-focused landing page, extracts its visible copy in reading order, and displays a script-disabled local preview. It can then run Jev's ten fixed universal copy questions against that immutable capture and the page intent you supplied. Copy suggestions and local edits are not implemented yet.

## Run locally

Requires Node.js 22+ and Playwright Chromium.

```powershell
npm ci
npx playwright install chromium
Copy-Item .env.example .env.local
```

Set `OPENROUTER_API_KEY` in `.env.local` to run a Jev audit. The key is read only by the Node server. Keep `JEV_MODEL=typesafe/jev-1.13` unless you deliberately need to use another pinned Jev model. Set `ALLOW_PRIVATE_CAPTURE=true` only for the controlled local demo, then start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`, choose **Use local demo**, capture the populated form, then select **Run universal audit**. The API retains a one-hour, in-memory run record containing the Page intent, immutable capture version, original blocks, static snapshot, and one validated universal audit. A process restart clears active runs.

## Safety boundaries

- Capture runs on the Node server with Playwright, never in browser code.
- HTTP(S) URLs only; URL credentials, unsafe DNS answers, private addresses, and too many redirects are rejected. Private/localhost capture is allowed only with the explicit development setting above.
- The preview is a sanitized static document in a sandboxed iframe. It removes source scripts, event handlers, frames, active form submission, and navigation; captured stylesheets are sanitized and inlined, and remaining resource URLs are retained only when the capture browser already allowed them.
- A page whose required stylesheet cannot be safely captured is reported as unsupported rather than shown as a misleading unstyled preview.
- Pages with under 100 or over 30,000 visible-copy characters, unreadable responses, timeouts, or unpreviewable snapshots report a bounded failure rather than an audit.
- Set `CAPTURE_MAX_COPY_CHARACTERS` only when a different validated visible-copy ceiling is needed; the default is 30,000.
- A completed Jev audit is cached per capture run; concurrent requests share the same OpenRouter Decisions API call, which contains all ten fixed Score questions. The app validates the typed response, calculates the equal-weight score in application code, and returns a clear error instead of a partial score when the provider fails.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```
