# Landing page copy audit prototype

This prototype safely captures one conversion-focused landing page, extracts its visible copy in reading order, and displays a script-disabled local preview. It can then run Jev's ten fixed universal copy questions against that immutable capture and the page intent you supplied. Copy suggestions and local edits are not implemented yet.

## Run locally

Requires Node.js 22+ and Playwright Chromium.

```powershell
npm ci
npx playwright install chromium
Copy-Item .env.example .env.local
```

Set `OPENAI_API_KEY`, a pinned Structured Outputs-capable `OPENAI_NICHE_MODEL`, and `OPENROUTER_API_KEY` in `.env.local` to run an audit. All three values are read only by the Node server. For example, use a pinned `gpt-4o-mini` snapshot for the cost-conscious niche-question step; do not use a `NEXT_PUBLIC_` name. Keep `JEV_MODEL=typesafe/jev-1.13` unless you deliberately need to use another pinned Jev model. Set `ALLOW_PRIVATE_CAPTURE=true` only for the controlled local demo, then start the app:

```powershell
npm run dev
```

Open `http://localhost:3000`, choose **Use local demo**, capture the populated form, then select **Run complete audit**. The API retains a one-hour, in-memory run record containing the Page intent, immutable capture version, original blocks, static snapshot, one generated niche label and question set, and one validated combined Jev audit. A process restart clears active runs.

## Safety boundaries

- Capture runs on the Node server with Playwright, never in browser code.
- HTTP(S) URLs only; URL credentials, unsafe DNS answers, private addresses, and too many redirects are rejected. Private/localhost capture is allowed only with the explicit development setting above.
- The preview is a sanitized static document in a sandboxed iframe. It removes source scripts, event handlers, frames, active form submission, and navigation; captured stylesheets are sanitized and inlined, and remaining resource URLs are retained only when the capture browser already allowed them.
- A page whose required stylesheet cannot be safely captured is reported as unsupported rather than shown as a misleading unstyled preview.
- Pages with under 100 or over 30,000 visible-copy characters, unreadable responses, timeouts, or unpreviewable snapshots report a bounded failure rather than an audit.
- Set `CAPTURE_MAX_COPY_CHARACTERS` only when a different validated visible-copy ceiling is needed; the default is 30,000.
- Each initial audit first calls OpenAI once with Structured Outputs to infer a niche and exactly three distinct positive-polarity yes/no questions. It sends the immutable visible copy as delimited untrusted data and retains only the validated niche set and token usage. A missing configuration, refusal, invalid response, timeout, or provider failure ends the audit before Jev is called.
- A completed combined audit is cached per capture run; concurrent requests share the OpenAI generation call and the one OpenRouter Decisions API call. Jev receives the ten fixed Score questions and the three retained niche Noul questions in the same request. The app validates all thirteen typed answers, calculates the equal-weight score from universal Scores only, and returns a clear error instead of a partial result when either provider fails.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```
