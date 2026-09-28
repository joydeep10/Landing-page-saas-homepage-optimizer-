"use client";

import { FormEvent, useState } from "react";

import { AuditResults } from "./audit-results";
import type { UniversalAudit } from "../domain/universal-audit";

interface CaptureResponse {
  runId: string;
  capture: {
    version: string;
    finalUrl: string;
    extractedText: string;
    snapshotHtml: string;
    blockCount: number;
  };
}

interface AuditResponse {
  runId: string;
  audit: UniversalAudit;
}

export function CaptureForm() {
  const [url, setUrl] = useState("");
  const [audience, setAudience] = useState("");
  const [primaryAction, setPrimaryAction] = useState("");
  const [trafficSource, setTrafficSource] = useState("");
  const [result, setResult] = useState<CaptureResponse | null>(null);
  const [audit, setAudit] = useState<UniversalAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);

  const useLocalDemo = () => {
    setUrl(`${window.location.origin}/demo`);
    setAudience("Independent product teams coordinating releases");
    setPrimaryAction("Start a free trial");
    setTrafficSource("Direct product research");
    setError(null);
    setAuditError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    setAudit(null);
    setAuditError(null);
    setIsCapturing(true);

    try {
      const response = await fetch("/api/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, audience, primaryAction, trafficSource }),
      });
      const payload = (await response.json()) as CaptureResponse | { error?: string };
      if (!response.ok || !("capture" in payload)) {
        setError("error" in payload ? payload.error ?? "Capture failed." : "Capture failed.");
        return;
      }
      setResult(payload);
    } catch {
      setError("The capture request could not be completed. Check that the local server is running.");
    } finally {
      setIsCapturing(false);
    }
  };

  const runAudit = async () => {
    if (!result) return;

    setAuditError(null);
    setIsAuditing(true);

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: result.runId }),
      });
      const payload = (await response.json()) as AuditResponse | { error?: string };
      if (!response.ok || !("audit" in payload)) {
        setAuditError("error" in payload ? payload.error ?? "Audit failed." : "Audit failed.");
        return;
      }
      setAudit(payload.audit);
    } catch {
      setAuditError("The audit request could not be completed. Check that the local server is running.");
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <>
      <section className="capture-card" aria-labelledby="capture-heading">
        <h2 id="capture-heading">Capture a landing page</h2>
        <p>Your stated audience and visitor action are retained for the later audit; no judgment is made yet.</p>
        <form className="capture-form" onSubmit={submit}>
          <label className="field">
            Landing page URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" type="url" required />
          </label>
          <label className="field">
            Intended audience
            <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Who should this page reach?" required />
          </label>
          <label className="field">
            Primary visitor action
            <input value={primaryAction} onChange={(event) => setPrimaryAction(event.target.value)} placeholder="What should a visitor do next?" required />
          </label>
          <label className="field">
            Traffic source <span className="field-help">Optional</span>
            <input value={trafficSource} onChange={(event) => setTrafficSource(event.target.value)} placeholder="For example: paid search" />
          </label>
          <div className="actions">
            <button type="submit" disabled={isCapturing}>{isCapturing ? "Capturing…" : "Capture page"}</button>
            <button type="button" className="secondary" onClick={useLocalDemo}>Use local demo</button>
          </div>
        </form>
        <p className="field-help">Local demo capture requires <code>ALLOW_PRIVATE_CAPTURE=true</code> in <code>.env.local</code>. Public deployments always deny private-network targets.</p>
      </section>

      {error ? <p className="notice error" role="alert">{error}</p> : null}

      {result ? (
        <section className="result-card" aria-labelledby="preview-heading">
          <div className="result-head">
            <p className="eyebrow">Capture ready</p>
            <h2 id="preview-heading">Static local preview</h2>
            <p className="result-meta">{result.capture.blockCount} visible copy blocks · scripts, forms, and navigation are disabled · run {result.runId}</p>
          </div>
          <div className="preview-wrap">
            <iframe
              className="preview"
              title="Captured landing page preview"
              sandbox="allow-same-origin"
              referrerPolicy="no-referrer"
              srcDoc={result.capture.snapshotHtml}
            />
          </div>
          <div className="copy-readout">
            <h2>Extracted visible copy</h2>
            <pre>{result.capture.extractedText}</pre>
          </div>
          <div className="audit-action">
            <div>
              <h2>Ready to audit this captured copy?</h2>
              <p>
                Run the ten fixed universal questions against this immutable capture and the page
                intent you provided.
              </p>
            </div>
            <button type="button" onClick={runAudit} disabled={isAuditing || Boolean(audit)}>
              {audit ? "Universal audit complete" : isAuditing ? "Auditing…" : "Run universal audit"}
            </button>
          </div>
          {auditError ? <p className="notice error audit-error" role="alert">{auditError}</p> : null}
          {audit ? <AuditResults audit={audit} /> : null}
        </section>
      ) : null}
    </>
  );
}
