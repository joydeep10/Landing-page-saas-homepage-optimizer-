import { describe, expect, it } from "vitest";

import {
  calculateUniversalAudit,
  normalizeUniversalScore,
  UNIVERSAL_AUDIT_QUESTIONS,
} from "../src/domain/universal-audit";

function answersWithScore(score: number) {
  return UNIVERSAL_AUDIT_QUESTIONS.map((question) => ({
    id: question.id,
    score,
  }));
}

describe("universal audit scoring", () => {
  it("normalizes native zero-based Jev scores without rounding their internal values", () => {
    expect(normalizeUniversalScore(0)).toBe(0);
    expect(normalizeUniversalScore(2.5)).toBe(62.5);
    expect(normalizeUniversalScore(4)).toBe(100);
  });

  it.each([
    [0, 0, "Major Issues Found"],
    [1.96, 49, "Major Issues Found"],
    [2, 50, "Needs Improvement"],
    [3.16, 79, "Needs Improvement"],
    [3.2, 80, "Strong"],
    [4, 100, "Strong"],
  ])("applies the fixed verdict boundary for a %s native score", (score, overall, verdict) => {
    const audit = calculateUniversalAudit(answersWithScore(score));

    expect(audit.overallScore).toBe(overall);
    expect(audit.verdict).toBe(verdict);
  });

  it("averages unrounded normalized scores and rounds only the displayed overall score", () => {
    const audit = calculateUniversalAudit([
      ...answersWithScore(2).slice(0, 5),
      ...answersWithScore(2.02).slice(5),
    ]);

    expect(audit.results[0]?.normalizedScore).toBe(50);
    expect(audit.results[5]?.normalizedScore).toBe(50.5);
    expect(audit.results[5]?.displayScore).toBe(51);
    expect(audit.overallScore).toBe(50);
  });

  it("rejects a partial or invalid set of universal scores", () => {
    expect(() => calculateUniversalAudit(answersWithScore(3).slice(0, 9))).toThrow(/ten/i);
    expect(() =>
      calculateUniversalAudit([
        ...answersWithScore(3).slice(0, 9),
        { id: "offer_clarity", score: 3 },
      ]),
    ).toThrow(/exactly one/i);
  });
});
