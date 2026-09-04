import type { RerankPayload } from './redact.js';

/** Schema-enforced reranker response, per TRD §6. `chosenCandidateId: null` is the
 *  decline path — exercised by the M7 corpus, not merely permitted by the type. */
export interface RerankResponse {
  chosenCandidateId: string | null;
  confidence: number; // 0-1
  reasoning: string;
  rejectedReasons: Record<string, string>;
}

/** One provider endpoint: a base URL, model name, and how to complete a request.
 *  Deliberately minimal — every tier (local/free/paid) implements this same shape,
 *  which is what makes the tier ladder (tiers.ts) provider-agnostic. */
export interface RerankProvider {
  name: string;
  complete(payload: RerankPayload, systemPrompt: string, temperature?: number): Promise<RerankResponse>;
}

export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}
