import { z } from "zod";

export const NICHE_QUESTION_IDS = ["niche_1", "niche_2", "niche_3"] as const;

export type NicheQuestionId = (typeof NICHE_QUESTION_IDS)[number];

export interface NicheQuestion {
  id: NicheQuestionId;
  question: string;
}

export interface NicheQuestionSet {
  niche: string;
  questions: NicheQuestion[];
}

export interface NicheAuditResult {
  id: NicheQuestionId;
  question: string;
  yesProbability: number;
}

export interface NicheAudit {
  label: string;
  results: NicheAuditResult[];
}

const boundedText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), "Text must not have leading or trailing whitespace.");

const yesNoQuestionPattern = /^(?:Do|Does|Did|Is|Are|Can|Could|Will|Would|Has|Have|Should)\b[^?]*\?$/;
const instructionLikeTextPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)?\s*instructions?|follow\s+(?:these|the)\s+instructions?|reveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message)|system\s+prompt|developer\s+message|<\/?[a-z])/i;
const negativePolarityPattern =
  /\b(?:no|not|lack(?:s|ing)?|without|missing|unclear|difficult|hard|weak|poor|unable|cannot|can't)\b/i;
const multiPartQuestionPattern = /(?:\b(?:and|or)\b|[;:])/i;
const universalRestatementPattern =
  /(?:what\s+(?:the\s+)?(?:product|service|offer)\s+(?:is|does)|who\s+(?:the\s+)?(?:product|service|offer)\s+is\s+(?:for|intended\s+for)|reason\s+to\s+choose|trust\s+signals|next\s+action|message\s+order)/i;

function isSafeNicheQuestion(question: string): boolean {
  return (
    yesNoQuestionPattern.test(question) &&
    !instructionLikeTextPattern.test(question) &&
    !negativePolarityPattern.test(question) &&
    !multiPartQuestionPattern.test(question) &&
    !universalRestatementPattern.test(question)
  );
}

export const generatedNicheQuestionSetSchema = z
  .object({
    niche: boundedText(120),
    questions: z.array(boundedText(500)).length(NICHE_QUESTION_IDS.length),
  })
  .strict();

export function createNicheQuestionSet(value: unknown): NicheQuestionSet {
  const parsed = generatedNicheQuestionSetSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("A niche question set requires one short niche and exactly three questions.");
  }

  const normalizedQuestions = parsed.data.questions.map((question) => question.toLocaleLowerCase());
  if (new Set(normalizedQuestions).size !== NICHE_QUESTION_IDS.length) {
    throw new Error("A niche question set requires three distinct questions.");
  }
  if (!parsed.data.questions.every(isSafeNicheQuestion)) {
    throw new Error("A niche question set requires safe positive yes/no questions.");
  }

  return {
    niche: parsed.data.niche,
    questions: parsed.data.questions.map((question, index) => ({
      id: NICHE_QUESTION_IDS[index]!,
      question,
    })),
  };
}
