import { randomUUID } from "node:crypto";

import type { PageCapture } from "../domain/capture";
import type { CaptureRequest } from "../domain/capture-request";

const RUN_TTL_MS = 60 * 60 * 1_000;

export interface CaptureRun {
  id: string;
  intent: CaptureRequest;
  capture: PageCapture;
  createdAt: number;
  expiresAt: number;
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
