import { randomUUID } from "node:crypto";

import type { PageCapture } from "../domain/capture";
import type { CaptureRequest } from "../domain/capture-request";
import type { JevAudit } from "./jev";
import type { NicheQuestionGeneration } from "./niche-questions";

const RUN_TTL_MS = 60 * 60 * 1_000;

export interface CaptureRun {
  id: string;
  intent: CaptureRequest;
  capture: PageCapture;
  createdAt: number;
  expiresAt: number;
  nicheGeneration?: NicheQuestionGeneration;
  audit?: JevAudit;
}

const runs = new Map<string, CaptureRun>();

function removeExpiredRuns(now: number): void {
  for (const [id, run] of runs) {
    if (run.expiresAt <= now) runs.delete(id);
  }
}

export function createCaptureRun(intent: CaptureRequest, capture: PageCapture): CaptureRun {
  const now = Date.now();
  removeExpiredRuns(now);
  const run: CaptureRun = {
    id: `run_${randomUUID()}`,
    intent,
    capture,
    createdAt: now,
    expiresAt: now + RUN_TTL_MS,
  };
  runs.set(run.id, run);
  return run;
}

export function getCaptureRun(runId: string): CaptureRun | undefined {
  const now = Date.now();
  removeExpiredRuns(now);
  return runs.get(runId);
}

export function saveNicheQuestionGeneration(
  runId: string,
  nicheGeneration: NicheQuestionGeneration,
): void {
  const run = getCaptureRun(runId);
  if (!run) return;
  run.nicheGeneration = nicheGeneration;
}

export function saveAudit(runId: string, audit: JevAudit): void {
  const run = getCaptureRun(runId);
  if (!run) return;
  run.audit = audit;
}
