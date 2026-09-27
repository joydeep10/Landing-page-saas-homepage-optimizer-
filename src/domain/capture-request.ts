import { z } from "zod";

const optionalNonBlankString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(500).optional(),
);

export const captureRequestSchema = z.object({
  url: z.string().trim().min(1, "A landing page URL is required").max(2_048),
  audience: z
    .string()
    .trim()
    .min(1, "An intended audience is required")
    .max(500),
  primaryAction: z
    .string()
    .trim()
    .min(1, "A primary visitor action is required")
    .max(500),
  trafficSource: optionalNonBlankString,
});

export type CaptureRequest = z.infer<typeof captureRequestSchema>;

export class CaptureRequestValidationError extends Error {
  constructor(
    public readonly fieldErrors: Record<string, string[]>,
    message = "Please correct the page intent fields and try again.",
  ) {
    super(message);
    this.name = "CaptureRequestValidationError";
  }
}

export function parseCaptureRequest(value: unknown): CaptureRequest {
  const result = captureRequestSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const fieldErrors = result.error.flatten().fieldErrors as Record<
    string,
    string[]
  >;
  const missingFields = result.error.issues
    .filter((issue) => issue.code === "invalid_type")
    .map((issue) => String(issue.path[0]))
    .map((field) => {
      if (field === "audience") return "intended audience";
      if (field === "primaryAction") return "primary visitor action";
      return field;
    });

  const message =
    missingFields.length > 0
      ? `Required: ${missingFields.join(", ")}`
      : "Please correct the page intent fields and try again.";

  throw new CaptureRequestValidationError(fieldErrors, message);
}
