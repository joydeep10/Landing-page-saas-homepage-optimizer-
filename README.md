# Landing page copy audit prototype

This prototype safely captures one conversion-focused landing page, extracts its visible copy in reading order, and displays a script-disabled local preview. It is the first vertical slice of the controlled audit workflow; scoring and copy suggestions are intentionally not implemented yet.

## Run locally

Requires Node.js 22+ and Playwright Chromium.

```powershell
npm ci
npx playwright install chromium
Copy-Item .env.example .env.local
```

Set `ALLOW_PRIVATE_CAPTURE=true` in `.env.local` only for the controlled local demo, then start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`, choose **Use local demo**, and capture the populated form. The API retains a one-hour, in-memory run record containing the Page intent, immutable capture version, original blocks, and static snapshot. A process restart clears active runs.

## Safety boundaries

- Capture runs on the Node server with Playwright, never in browser code.
- HTTP(S) URLs only; URL credentials, unsafe DNS answers, private addresses, and too many redirects are rejected. Private/localhost capture is allowed only with the explicit development setting above.
- The preview is a sanitized static document in a sandboxed iframe. It removes source scripts, event handlers, frames, active form submission, and navigation; captured stylesheets are sanitized and inlined, and remaining resource URLs are retained only when the capture browser already allowed them.
- A page whose required stylesheet cannot be safely captured is reported as unsupported rather than shown as a misleading unstyled preview.
- Pages with under 100 or over 30,000 visible-copy characters, unreadable responses, timeouts, or unpreviewable snapshots report a bounded failure rather than an audit.
- Set `CAPTURE_MAX_COPY_CHARACTERS` only when a different validated visible-copy ceiling is needed; the default is 30,000.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```
