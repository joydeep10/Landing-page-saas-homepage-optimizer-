export const UNIVERSAL_AUDIT_QUESTIONS = [
  {
    id: "offer_clarity",
    dimension: "Offer Clarity",
    question:
      "Can a first-time visitor quickly understand what the product or service is and what it does?",
    criteria: [
      "The offer and its function cannot be identified.",
      "A broad category is hinted at, but the actual offer or function is unclear.",
      "The offer is named, but its function must be inferred from scattered copy.",
      "The offer and its main function are stated plainly.",
      "A first-time visitor can identify the offer and main function immediately from the primary copy.",
    ],
  },
  {
    id: "audience_clarity",
    dimension: "Audience Clarity",
    question: "Is it clear who this product or service is intended for?",
    criteria: [
      "No intended customer can be identified.",
      "The copy implies it is for everyone or gives only a very broad audience.",
      "Some audience clues appear, but the primary customer remains uncertain.",
      "The intended customer is stated clearly.",
      "The primary customer and relevant use context are clear and consistent across the copy.",
    ],
  },
  {
    id: "problem_relevance",
    dimension: "Problem Relevance",
    question:
      "Does the page clearly communicate a problem, need, or goal that matters to the intended customer?",
    criteria: [
      "No customer problem, need, or goal is communicated.",
      "Only a generic pain point or aspiration is mentioned.",
      "A plausible need appears, but its connection to the stated audience is weak.",
      "A meaningful problem, need, or goal for that audience is clear.",
      "The audience-specific problem or goal and why it matters are clearly communicated.",
    ],
  },
  {
    id: "value_outcome",
    dimension: "Value / Outcome",
    question:
      "Does the page clearly communicate the meaningful outcome or benefit the customer will receive?",
    criteria: [
      "No customer benefit or outcome is communicated.",
      "The page uses generic benefit words without a discernible outcome.",
      "A benefit is hinted at, but the resulting change for the customer is unclear.",
      "A meaningful customer outcome is stated clearly.",
      "The outcome is clear, relevant to the stated audience, and connected to the offer.",
    ],
  },
  {
    id: "specificity",
    dimension: "Specificity",
    question:
      "Are the important claims concrete and specific rather than vague, generic, or buzzword-heavy?",
    criteria: [
      "Important claims are almost entirely generic or buzzword-heavy.",
      "Most important claims remain vague despite an occasional concrete term.",
      "Some important claims are concrete, but key promises remain vague.",
      "The main claims are concrete enough for a visitor to understand what is meant.",
      "Important claims consistently use concrete scope, actions, or details instead of vague language.",
    ],
  },
  {
    id: "differentiation",
    dimension: "Differentiation",
    question:
      "Does the page give the visitor a meaningful reason to choose this offering over alternatives?",
    criteria: [
      "No reason to choose the offer over alternatives is communicated.",
      "Only generic superiority claims such as “best” or “leading” appear.",
      "A difference is asserted, but its practical relevance to the customer is unclear.",
      "A meaningful, customer-relevant distinction is communicated.",
      "The distinction is clear and supported by specific details presented on the page. This does not verify market uniqueness.",
    ],
  },
  {
    id: "credibility_proof",
    dimension: "Credibility / Proof",
    question:
      "Does the page provide sufficient evidence or trust signals to make its important claims believable?",
    criteria: [
      "Important claims have no supporting evidence or trust signals on the page.",
      "The page makes broad trust assertions without identifiable support.",
      "Some proof appears, but the most important claims remain unsupported.",
      "Relevant page-presented evidence or trust signals support the main claims.",
      "Specific, relevant page-presented evidence supports the main claims. This does not independently verify the evidence.",
    ],
  },
  {
    id: "objection_friction_handling",
    dimension: "Objection / Friction Handling",
    question:
      "Does the page address the major uncertainties or concerns that could prevent the visitor from taking the next step?",
    criteria: [
      "Major likely concerns are not addressed.",
      "The page gives only generic reassurance without useful detail.",
      "One concern is addressed, while other obvious blockers to the next step remain.",
      "The main likely concerns are addressed well enough to understand the next step.",
      "The main concerns are addressed with specific, practical details relevant to the stated audience and action.",
    ],
  },
  {
    id: "cta_clarity",
    dimension: "CTA Clarity",
    question:
      "Is the desired next action obvious, understandable, and consistent with what the page is asking the visitor to do?",
    criteria: [
      "No clear next action can be identified from the copy.",
      "An action is present, but its wording is too vague to understand.",
      "An action can be identified, but what happens next or which action is primary is unclear.",
      "The primary action and what the visitor should expect are clear.",
      "The primary action and expectation are clear and consistently worded across the page. Judge wording, not visual prominence.",
    ],
  },
  {
    id: "information_hierarchy",
    dimension: "Information Hierarchy (message order)",
    question:
      "Does the order of the page's messages help a first-time visitor understand the offer before supporting details?",
    criteria: [
      "Message order prevents a first-time visitor from understanding the offer.",
      "Supporting details appear before the offer in a way that causes substantial confusion.",
      "The offer appears, but the sequence of messages is inconsistent or hard to follow.",
      "The copy introduces the offer before its supporting details in a useful order.",
      "The offer, relevant value, and supporting details follow a clear sequence for a first-time visitor. Judge text order, not layout or styling.",
    ],
  },
] as const;

export type UniversalAuditQuestionId = (typeof UNIVERSAL_AUDIT_QUESTIONS)[number]["id"];

export type UniversalAuditVerdict =
  | "Strong"
  | "Needs Improvement"
  | "Major Issues Found";

export interface UniversalAuditScoreInput {
  id: UniversalAuditQuestionId;
  score: number;
}

export interface UniversalAuditResult {
  id: UniversalAuditQuestionId;
  dimension: string;
  question: string;
  rawScore: number;
  normalizedScore: number;
  displayScore: number;
}

export interface UniversalAudit {
  results: UniversalAuditResult[];
  overallScore: number;
  verdict: UniversalAuditVerdict;
}

export function normalizeUniversalScore(score: number): number {
  if (!Number.isFinite(score) || score < 0 || score > 4) {
    throw new Error("Universal Jev scores must be finite values from 0 through 4.");
  }

  return (score / 4) * 100;
}

export function universalAuditVerdict(score: number): UniversalAuditVerdict {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("The overall universal audit score must be a whole number from 0 through 100.");
  }

  if (score >= 80) return "Strong";
  if (score >= 50) return "Needs Improvement";
  return "Major Issues Found";
}

export function calculateUniversalAudit(scores: UniversalAuditScoreInput[]): UniversalAudit {
  if (scores.length !== UNIVERSAL_AUDIT_QUESTIONS.length) {
    throw new Error("An audit requires all ten universal scores.");
  }

  const scoresById = new Map<UniversalAuditQuestionId, number>();
  for (const score of scores) {
    if (scoresById.has(score.id)) {
      throw new Error("An audit requires exactly one score for every universal question.");
    }
    scoresById.set(score.id, score.score);
  }

  const normalizedScores = UNIVERSAL_AUDIT_QUESTIONS.map((question) => {
    const score = scoresById.get(question.id);
    if (score === undefined) {
      throw new Error("An audit requires exactly one score for every universal question.");
    }

    return normalizeUniversalScore(score);
  });

  const overallScore = Math.round(
    normalizedScores.reduce((total, score) => total + score, 0) / normalizedScores.length,
  );

  return {
    results: UNIVERSAL_AUDIT_QUESTIONS.map((question, index) => ({
      id: question.id,
      dimension: question.dimension,
      question: question.question,
      rawScore: scoresById.get(question.id)!,
      normalizedScore: normalizedScores[index]!,
      displayScore: Math.round(normalizedScores[index]!),
    })),
    overallScore,
    verdict: universalAuditVerdict(overallScore),
  };
}
