import { NextResponse } from "next/server";

import {
  AuditRequestValidationError,
  parseAuditRequest,
} from "../../../src/domain/audit-request";
import { AuditRunError, auditStoredCaptureRun } from "../../../src/server/audit-run";
import { JevAuditError } from "../../../src/server/jev";
import { NicheQuestionGenerationError } from "../../../src/server/niche-questions";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 1_000;

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AuditRequestValidationError("Send the audit request with Content-Type: application/json.");
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new AuditRequestValidationError("The audit request is too large.");
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
    throw new AuditRequestValidationError("The audit request is too large.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AuditRequestValidationError("Send the audit request as valid JSON.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = parseAuditRequest(await readJsonBody(request));
    const result = await auditStoredCaptureRun(input.runId);

    return NextResponse.json({ runId: input.runId, audit: result.audit, niche: result.niche });
  } catch (error) {
    if (error instanceof AuditRequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AuditRunError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof JevAuditError) {
      const status =
        error.kind === "configuration" ? 503 : error.kind === "timeout" ? 504 : 502;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }
    if (error instanceof NicheQuestionGenerationError) {
      const status =
        error.kind === "configuration" ? 503 : error.kind === "timeout" ? 504 : 502;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }

    return NextResponse.json(
      { error: "The audit could not be completed. Try again." },
      { status: 500 },
    );
  }
}
