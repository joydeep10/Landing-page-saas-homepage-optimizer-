import { z } from "zod";

export const auditRequestSchema = z
  .object({
    runId: z.string().regex(/^run_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  })
  .strict();

export type AuditRequest = z.infer<typeof auditRequestSchema>;

export class AuditRequestValidationError extends Error {
  constructor(message = "Send a valid capture run before requesting an audit.") {
    super(message);
    this.name = "AuditRequestValidationError";
  }
}

export function parseAuditRequest(value: unknown): AuditRequest {
  const result = auditRequestSchema.safeParse(value);
  if (result.success) return result.data;
  throw new AuditRequestValidationError();
}
