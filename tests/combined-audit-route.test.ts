import { describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/audits/route";
import { UNIVERSAL_AUDIT_QUESTIONS } from "../src/domain/universal-audit";
import { createCaptureRun, getCaptureRun } from "../src/server/run-store";

const nicheQuestions = [
  "Does the page explain how teams coordinate release work?",
  "Does the page communicate how release status stays visible to the team?",
  "Does the page make the free-trial next step clear for release teams?",
];

function createStoredRun() {
  return createCaptureRun(
    {
      url: "https://example.com",
      audience: "Independent product teams",
      primaryAction: "Start a free trial",
      trafficSource: "Direct product research",
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

function nicheGenerationResponse() {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              niche: "Release coordination software",
              questions: nicheQuestions,
            }),
          },
        ],
      },
    ],
    usage: { input_tokens: 400, output_tokens: 65 },
  };
}

function combinedJevResponse() {
  return {
    model: "typesafe/jev-1.13-20260917",
    id: "decision_123",
    provider: "typesafe",
    answers: {
      ...Object.fromEntries(
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
      niche_1: { type: "noul", noul: 0.88 },
      niche_2: { type: "noul", noul: 0.76 },
      niche_3: { type: "noul", noul: 0.64 },
    },
    usage: { input_tokens: 500, output_tokens: 40, cost: 0.00002 },
  };
}

function auditRequest(runId: string) {
  return new Request("http://localhost/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
  });
}

describe("POST /api/audits with generated niche questions", () => {
  it("retains one generated set and returns its Noul answers beside the universal audit", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-openai-credential");
    vi.stubEnv("OPENAI_NICHE_MODEL", "gpt-4o-mini-2024-07-18");
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-openrouter-credential");
    const fetchImplementation = vi.fn<typeof fetch>((url) => {
      if (url === "https://api.openai.com/v1/responses") {
        return Promise.resolve(Response.json(nicheGenerationResponse()));
      }
      if (url === "https://openrouter.ai/api/alpha/decisions") {
        return Promise.resolve(Response.json(combinedJevResponse()));
      }
      return Promise.reject(new Error("Unexpected provider URL"));
    });
    vi.stubGlobal("fetch", fetchImplementation);
    const run = createStoredRun();

    const response = await POST(auditRequest(run.id));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      runId: run.id,
      audit: { overallScore: 75, verdict: "Needs Improvement" },
      niche: {
        label: "Release coordination software",
        results: [
          { id: "niche_1", question: nicheQuestions[0], yesProbability: 0.88 },
          { id: "niche_2", question: nicheQuestions[1], yesProbability: 0.76 },
          { id: "niche_3", question: nicheQuestions[2], yesProbability: 0.64 },
        ],
      },
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    const stored = getCaptureRun(run.id);
    expect(stored?.nicheGeneration).toMatchObject({
      questionSet: {
        niche: "Release coordination software",
        questions: [
          { id: "niche_1", question: nicheQuestions[0] },
          { id: "niche_2", question: nicheQuestions[1] },
          { id: "niche_3", question: nicheQuestions[2] },
        ],
      },
      usage: { inputTokens: 400, outputTokens: 65 },
    });
    expect(stored?.audit?.niche).toMatchObject({
      label: "Release coordination software",
      results: [
        { id: "niche_1", yesProbability: 0.88 },
        { id: "niche_2", yesProbability: 0.76 },
        { id: "niche_3", yesProbability: 0.64 },
      ],
    });

    const cachedResponse = await POST(auditRequest(run.id));
    expect(cachedResponse.status).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports an OpenAI failure without calling Jev or exposing provider diagnostics", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-openai-credential");
    vi.stubEnv("OPENAI_NICHE_MODEL", "gpt-4o-mini-2024-07-18");
    vi.stubEnv("OPENROUTER_API_KEY", "unit-test-openrouter-credential");
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("provider diagnostic that must not reach the UI", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchImplementation);
    const run = createStoredRun();

    const response = await POST(auditRequest(run.id));

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/niche-question generation could not be completed/i);
    expect(body.error).not.toContain("provider diagnostic");
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(getCaptureRun(run.id)?.nicheGeneration).toBeUndefined();

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
