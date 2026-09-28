import { describe, expect, it, vi } from "vitest";

import { UNIVERSAL_AUDIT_QUESTIONS } from "../src/domain/universal-audit";
import { auditCapturedCopyWithJev } from "../src/server/jev";

function successfulDecisionResponse() {
  return {
    model: "typesafe/jev-1.13-20260917",
    id: "decision_123",
    provider: "typesafe",
    answers: Object.fromEntries(
      UNIVERSAL_AUDIT_QUESTIONS.map((question, index) => [
        question.id,
        {
          type: "score",
          score: index === 0 ? 3.25 : 2,
          legend: { "0": "Absent", "1": "Weak", "2": "Partial", "3": "Clear", "4": "Excellent" },
          probabilities: { "0": 0, "1": 0, "2": 0.5, "3": 0.5, "4": 0 },
          confidence: 0.75,
        },
      ]),
    ),
    usage: { input_tokens: 430, output_tokens: 28, cost: 0.00001806 },
  };
}

const auditInput = {
  intent: {
    url: "https://example.com",
    audience: "Independent product teams",
    primaryAction: "Start a free trial",
    trafficSource: "Direct research",
  },
  extractedText: "Coordinate release work without status-chasing.",
};

describe("auditCapturedCopyWithJev", () => {
  it("sends all fixed score questions and the immutable capture state in one Decisions API request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(successfulDecisionResponse()),
    );

    const result = await auditCapturedCopyWithJev(auditInput, {
      apiKey: "unit-test-credential",
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer unit-test-credential",
      "Content-Type": "application/json",
    });

    const request = JSON.parse(String(init?.body)) as {
      model: string;
      state: Record<string, unknown>;
      questions: Record<string, { type: string; instructions: string; criteria: string[] }>;
    };
    expect(request.model).toBe("typesafe/jev-1.13");
    expect(request.state).toMatchObject({
      page_intent: {
        audience: auditInput.intent.audience,
        primary_visitor_action: auditInput.intent.primaryAction,
        traffic_source: auditInput.intent.trafficSource,
      },
      captured_visible_copy: auditInput.extractedText,
    });
    expect(Object.keys(request.questions)).toEqual(
      UNIVERSAL_AUDIT_QUESTIONS.map((question) => question.id),
    );
    expect(Object.values(request.questions).every((question) => question.type === "score")).toBe(
      true,
    );
    expect(result.audit.results).toHaveLength(10);
    expect(result.audit.results[0]).toMatchObject({ rawScore: 3.25, normalizedScore: 81.25 });
    expect(result.usage.cost).toBe(0.00001806);
  });

  it.each([
    ["missing answer", (response: ReturnType<typeof successfulDecisionResponse>) => {
      delete response.answers.offer_clarity;
      return response;
    }],
    ["out-of-range score", (response: ReturnType<typeof successfulDecisionResponse>) => {
      response.answers.offer_clarity = {
        ...response.answers.offer_clarity,
        score: 4.01,
      };
      return response;
    }],
    ["non-finite score", (response: ReturnType<typeof successfulDecisionResponse>) => {
      response.answers.offer_clarity = {
        ...response.answers.offer_clarity,
        score: null as never,
      };
      return response;
    }],
  ])("fails explicitly for a %s provider response", async (_scenario, modify) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(modify(successfulDecisionResponse())));

    await expect(
      auditCapturedCopyWithJev(auditInput, {
        apiKey: "unit-test-credential",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("fails explicitly for an unexpected provider response field", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ ...successfulDecisionResponse(), extra_response_field: "not allowlisted" }),
    );

    await expect(
      auditCapturedCopyWithJev(auditInput, {
        apiKey: "unit-test-credential",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("fails explicitly when a provider response exceeds the size limit", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("x".repeat(250_001)));

    await expect(
      auditCapturedCopyWithJev(auditInput, {
        apiKey: "unit-test-credential",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("turns provider failures and timeouts into safe explicit errors", async () => {
    await expect(
      auditCapturedCopyWithJev(auditInput, {
        apiKey: "unit-test-credential",
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
          new Response("provider diagnostic that must not reach the UI", { status: 500 }),
        ),
      }),
    ).rejects.toMatchObject({ kind: "provider" });

    const timeout = new DOMException("The operation was aborted.", "AbortError");
    await expect(
      auditCapturedCopyWithJev(auditInput, {
        apiKey: "unit-test-credential",
        fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(timeout),
      }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });
});
