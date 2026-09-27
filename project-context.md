# Project context

This is the living project record for the Landing Page SaaS Homepage Optimizer. Keep it accurate as the project evolves; do not turn it into a copy of implementation details or issue text.

**Last updated:** 2026-09-27
**Canonical PRD:** [GitHub issue #1](https://github.com/joydeep10/Landing-page-saas-homepage-optimizer-/issues/1)
**Delivery plan:** [Issues #2–#9](https://github.com/joydeep10/Landing-page-saas-homepage-optimizer-/issues)

## Product in one sentence

A page owner submits one conversion-focused landing-page URL and their intended audience/action; the app safely captures its visible copy, produces a structured Jev copy audit, offers bounded human-approved copy edits when appropriate, previews the revised local draft, and performs exactly one comparable re-audit.

## Intended workflow

1. The user provides a URL, intended audience, primary visitor action, and optional traffic source.
2. The backend renders and captures one page, extracts visible marketing copy in reading order, and creates a styled static local preview with immutable capture-scoped text-block references.
3. OpenAI infers a business niche and produces a bounded, validated set of niche questions from captured copy and the stated intent.
4. Jev, through OpenRouter's Decisions API, answers the ten universal questions and the niche questions. The UI shows universal results, niche results, overall score, and verdict.
5. If the original score is below 80, OpenAI may make one structured set of safe, block-linked copy proposals targeting at most the three lowest universal dimensions. Strong results stop after the audit.
6. The owner independently approves or rejects each proposal. Application code applies only verified, unambiguous, approved replacements to the local capture; the live site is never changed.
7. The user sees the revised static preview and one second Jev audit using the original intent and exact original niche questions. It is labelled a draft-copy audit, not a conversion prediction. No automatic second writer pass occurs.
8. The UI shows one calculated whole-run API cost based only on calls that succeeded; unavailable cost is different from zero.

## Fixed audit rules

- Universal dimensions: Offer Clarity; Audience Clarity; Problem Relevance; Value / Outcome; Specificity; Differentiation; Credibility / Proof; Objection / Friction Handling; CTA Clarity; Information Hierarchy (message order).
- Each Jev Score is on a zero-based 0–4 scale. Application code normalizes it to 0–100, averages all ten unrounded normalized scores equally, then rounds the final score once.
- Verdicts: **Strong** 80–100; **Needs Improvement** 50–79; **Major Issues Found** 0–49.
- Niche answers are visible but never affect the overall score or verdict.
- The app never invents Jev reasoning, weak-block evidence, audit findings, provider results, or cost.

## Non-negotiable safety and scope boundaries

- Capture rendered visible copy and preserve a static local snapshot; do not score raw HTML, CSS, screenshots, metadata, or visual hierarchy.
- A capture with insufficient (<100 characters), oversized (default >30,000 characters), blocked, unreadable, or inadequately previewable content ends in a bounded failure/unsupported state.
- Only headlines, subheadlines, product/benefit descriptions, and CTA wording can be writer-editable. Testimonials, prices, legal text, and factual figures are excluded.
- Writer edits may use only page facts or user-provided facts. Missing support must be surfaced as information needed, not invented claims.
- Exact original text, capture version, and immutable block reference must match before an edit. Stale and repeated/ambiguous text is never silently changed.
- Model keys stay server-side. Captured pages, URLs, HTML, model replies, and preview messages are untrusted input.
- Public deployments must defend against SSRF; localhost/private-network capture is for the intentional local demo only.
- No authentication, database, audit history, multi-page crawling, accessibility/SEO/performance auditing, visual-model audit, live-site publishing, competitor research, or unlimited revision loops are in scope.

## Confirmed architecture

- **Application:** a small Next.js App Router application using React and TypeScript.
- **Server work:** Node.js Route Handlers handle Playwright capture, provider calls, scoring, edit validation, cost accounting, and per-run state. Do not depend on serverless memory/filesystem persistence.
- **State:** one server-side, one-hour-TTL in-memory run store keyed by a unique run ID. A restart may clear active runs; no database is required for the prototype.
- **Preview:** static sanitized HTML displayed in a sandboxed iframe; source-page scripts stay disabled.
- **AI providers:** OpenAI (server-held key) handles structured niche/question generation and one optional structured writer pass. OpenRouter (server-held key) calls Jev Decisions, with `typesafe/jev-1.13` as the configurable default pinned model.
- **Validation:** Zod contracts at all external boundaries. Business rules should remain framework-independent so they can later be reused outside the Next.js layer.
- **Testing:** Playwright for capture and end-to-end workflow; narrow deterministic tests for scoring and edit-safety rules; a real-API controlled-demo run is the principal acceptance seam.

## Implementation roadmap

| Issue | Vertical slice | Status |
| --- | --- | --- |
| #2 | Capture one landing page and show a local preview | Complete |
| #3 | Audit captured copy with Jev's universal questions | Not started |
| #4 | Add generated niche questions | Not started |
| #5 | Suggest safe copy changes below 80 | Not started |
| #6 | Apply individually approved changes locally | Not started |
| #7 | Resolve ambiguous edit targets in preview | Not started |
| #8 | Re-audit the revised draft once | Not started |
| #9 | Show whole-run cost and verify real-API demo | Not started |

## Current repository state

- Issue #2 is implemented as a small Next.js App Router/TypeScript application with a Node.js capture route, Zod-validated intake, Playwright/Chromium capture, and a controlled `/demo` landing page.
- Each successful capture creates a one-hour in-memory run keyed by a unique run ID. It retains authoritative Page intent, an immutable capture version, capture-scoped block references and locations, original text, and the static snapshot. Process restarts clear this prototype state.
- Capture validates submitted and browser-request URLs at every HTTP(S) request in a fresh Playwright context with service workers blocked. Production denies loopback, private, link-local, multicast, unspecified, cloud-metadata, and documentation/test address ranges; private capture is available only when the non-production `ALLOW_PRIVATE_CAPTURE=true` configuration is explicit. Capture has bounded document, individual-resource, total-response, stylesheet, visible-copy, and snapshot limits; `CAPTURE_MAX_COPY_CHARACTERS` optionally overrides the default 30,000-character visible-copy ceiling.
- The preview is sanitized static HTML in an iframe sandboxed with `allow-same-origin` only. Source scripts, event handlers, active/nested frames, form submission, navigation, and raw-text serialization hazards are removed. Captured stylesheets are sanitized and inlined; remaining resource URLs are absolute only when the capture browser admitted them.
- The first slice stops after capture and preview; it deliberately contains no provider calls, scoring, suggested edits, or persistence beyond the active one-hour run.

## Open decisions

- Exact OpenAI model IDs and configured cost rates for the niche and writer calls.
- Local/demo and production deployment packaging, including the production egress/SSRF controls.
- The final visual design system and component composition.

## Change log

- **2026-09-26:** Reviewed PRD and vertical-slice issues; confirmed the lean Next.js/TypeScript architecture and documented the initial context and repository guidance.
- **2026-09-26:** Created the initial application, domain, server, and test directory skeleton; no vertical-slice implementation has started.
- **2026-09-27:** Completed Issue #2: scaffolded the Next.js application; added validated Node/Playwright page capture, SSRF-aware URL policy, immutable capture blocks and one-hour run state, a sanitized static iframe preview, local demo page, and focused validation/capture tests.
