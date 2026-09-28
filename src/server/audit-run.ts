import type { UniversalAudit } from "../domain/universal-audit";
import { auditCapturedCopyWithJev, type JevUniversalAudit } from "./jev";
import { getCaptureRun, saveUniversalAudit } from "./run-store";

export class AuditRunError extends Error {
  constructor(public readonly kind: "not_found", message: string) {
    super(message);
    this.name = "AuditRunError";
  }
}

const inFlightAudits = new Map<string, Promise<UniversalAudit>>();

export async function auditStoredCaptureRun(runId: string): Promise<UniversalAudit> {
  const run = getCaptureRun(runId);
  if (!run) {
    throw new AuditRunError("not_found", "This capture run is no longer available. Capture the page again.");
  }

  if (run.universalAudit) return run.universalAudit.audit;

  const inFlightAudit = inFlightAudits.get(runId);
  if (inFlightAudit) return inFlightAudit;

  const audit = (async () => {
    const audited = await auditCapturedCopyWithJev({
      intent: run.intent,
      extractedText: run.capture.extractedText,
    });
    saveUniversalAudit(run.id, audited);
    return audited.audit;
  })();
  inFlightAudits.set(runId, audit);

  try {
    return await audit;
  } finally {
    inFlightAudits.delete(runId);
  }
}

export type { JevUniversalAudit };
