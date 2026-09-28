import { describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/audits/route";
import { UNIVERSAL_AUDIT_QUESTIONS } from "../src/domain/universal-audit";
import { createCaptureRun } from "../src/server/run-store";

function createStoredRun() {
  return createCaptureRun(
    {
      url: "https://example.com",
      audience: "Independent product teams",
      primaryAction: "Start a free trial",
    },
    {
      version: "capture_immutable",
      finalUrl: "https://example.com",
      extractedText: "Coordinate launches without the scramble. Start a free trial today.",
      snapshotHtml: "<!doctype html><p>Static preview</p>",
      blocks: [],
    },
  );
}

function validProviderResponse() {
  return {
    model: "typesafe/jev-1.13-20260917",
    id: "decision_123",
    provider: "typesafe",
    answers: Object.fromEntries(
      UNIVERSAL_AUDIT_QUESTIONS.map((question) => [
        question.id,
        {
          type: "score",
          score: 3,
          legend: { "0": "Absent", "1": "Weak", "2": "Partial", "3": "Clear", "4": "Excellent" },
          probabilities: { "0": 0, "1": 0, "2": 0, "3": 1, "4": 0 },
          confidence: 1,
        },
      ]),
    ),
    usage: { input_tokens: 420, output_tokens: 30, cost: 0.000018 },
  };
}

function auditRequest(runId: string) {
  return new Request("http://localhost/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
  });
}

describe("POST /api/audits", () => {
  it("audits a valid stored capture and returns only the public audit result", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-credential");
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(validProviderResponse()),
    );
    vi.stubGlobal("fetch", fetchImplementation);
    const run = createStoredRun();

    const response = await POST(auditRequest(run.id));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      runId: run.id,
      audit: { overallScore: 75, verdict: "Needs Improvement" },
    });
    expect(JSON.stringify(body)).not.toContain("unit-test-credential");
    expect(JSON.stringify(body)).not.toContain("input_tokens");
    expect(JSON.stringify(body)).not.toContain("probabilities");
    expect(JSON.stringify(body)).not.toContain("confidence");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    const cachedResponse = await POST(auditRequest(run.id));
    expect(cachedResponse.status).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shares a single provider call across concurrent requests for the same capture run", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-credential");
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(validProviderResponse()),
    );
    vi.stubGlobal("fetch", fetchImplementation);
    const run = createStoredRun();

    const [first, second] = await Promise.all([
      POST(auditRequest(run.id)),
      POST(auditRequest(run.id)),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns bounded errors for invalid run requests and provider failures", async () => {
    const invalid = await POST(
      new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: "not-a-run" }),
      }),
    );
    expect(invalid.status).toBe(400);

    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-credential");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("provider diagnostic that must not reach the UI", { status: 500 }),
      ),
    );
    const run = createStoredRun();

    const response = await POST(auditRequest(run.id));
    const body = (await response.json()) as { error: string };
    expect(response.status).toBe(502);
    expect(body.error).toMatch(/could not be completed/i);
    expect(body.error).not.toContain("provider diagnostic");

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
