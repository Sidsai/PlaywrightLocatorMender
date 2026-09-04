import { z } from 'zod';

/**
 * TRD §6's schema-enforced reranker response. `chosenCandidateId` is nullable —
 * the decline path — and required to be explicitly present (null or a string),
 * not merely absent-and-defaulted, so a malformed response that omits the field
 * entirely is rejected rather than silently treated as a decline.
 */
export const RerankResponseSchema = z.object({
  chosenCandidateId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  rejectedReasons: z.record(z.string(), z.string()),
});

export type ValidatedRerankResponse = z.infer<typeof RerankResponseSchema>;

export function parseRerankResponse(raw: unknown): ValidatedRerankResponse {
  return RerankResponseSchema.parse(raw);
}
