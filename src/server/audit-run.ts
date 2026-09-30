import { auditCapturedCopyWithJev, type JevAudit } from "./jev";
import { generateNicheQuestions } from "./niche-questions";
import {
  getCaptureRun,
  saveAudit,
  saveNicheQuestionGeneration,
} from "./run-store";

export class AuditRunError extends Error {
  constructor(public readonly kind: "not_found", message: string) {
    super(message);
    this.name = "AuditRunError";
  }
}

const inFlightAudits = new Map<string, Promise<JevAudit>>();

export async function auditStoredCaptureRun(runId: string): Promise<JevAudit> {
  const run = getCaptureRun(runId);
  if (!run) {
    throw new AuditRunError("not_found", "This capture run is no longer available. Capture the page again.");
  }

  if (run.audit) return run.audit;

  const inFlightAudit = inFlightAudits.get(runId);
  if (inFlightAudit) return inFlightAudit;

  const audit = (async () => {
    const nicheGeneration =
      run.nicheGeneration ??
      (await generateNicheQuestions({
        intent: run.intent,
        extractedText: run.capture.extractedText,
      }));
    if (!run.nicheGeneration) saveNicheQuestionGeneration(run.id, nicheGeneration);

    const audited = await auditCapturedCopyWithJev({
      intent: run.intent,
      extractedText: run.capture.extractedText,
      nicheQuestionSet: nicheGeneration.questionSet,
    });
    saveAudit(run.id, audited);
    return audited;
  })();
  inFlightAudits.set(runId, audit);

  try {
    return await audit;
  } finally {
    inFlightAudits.delete(runId);
  }
}

export type { JevAudit };
