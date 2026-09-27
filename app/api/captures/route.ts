import { NextResponse } from "next/server";

import {
  CaptureRequestValidationError,
  parseCaptureRequest,
} from "../../../src/domain/capture-request";
import { CaptureFailureError, captureLandingPage } from "../../../src/server/capture";
import { createCaptureRun } from "../../../src/server/run-store";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 10_000;

function captureEnvironment(): "development" | "production" | "test" {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

function configuredMaximumCopyCharacters(): number | undefined {
  const configured = Number(process.env.CAPTURE_MAX_COPY_CHARACTERS);
  return Number.isInteger(configured) && configured >= 100 && configured <= 1_000_000
    ? configured
    : undefined;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new CaptureRequestValidationError(
      {},
      "Send the capture request with Content-Type: application/json.",
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new CaptureRequestValidationError({}, "The capture request is too large.");
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
    throw new CaptureRequestValidationError({}, "The capture request is too large.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new CaptureRequestValidationError({}, "Send the capture request as valid JSON.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = parseCaptureRequest(await readJsonBody(request));
    const capture = await captureLandingPage(input.url, {
      environment: captureEnvironment(),
      allowPrivateNetwork:
        process.env.NODE_ENV !== "production" && process.env.ALLOW_PRIVATE_CAPTURE === "true",
      maxCopyCharacters: configuredMaximumCopyCharacters(),
    });
    const run = createCaptureRun(input, capture);

    return NextResponse.json({
      runId: run.id,
      intent: run.intent,
      capture: {
        version: capture.version,
        finalUrl: capture.finalUrl,
        extractedText: capture.extractedText,
        snapshotHtml: capture.snapshotHtml,
        blockCount: capture.blocks.length,
      },
    });
  } catch (error) {
    if (error instanceof CaptureRequestValidationError) {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 400 },
      );
    }
    if (error instanceof CaptureFailureError) {
      const status = error.kind === "timeout" ? 504 : 422;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }

    return NextResponse.json(
      { error: "The landing page could not be captured. Try another supported page." },
      { status: 500 },
    );
  }
}
