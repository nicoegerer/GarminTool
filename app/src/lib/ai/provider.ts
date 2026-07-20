/**
 * Provider-agnostic chat interface.
 *
 * One provider today (Gemini — the only free option that runs on phone and
 * desktop alike). The interface stays so a swap is one adapter file plus one
 * registry entry, with no call sites touched.
 *
 * The API key is baked in at build time (NEXT_PUBLIC_GEMINI_KEY) so the coach
 * works everywhere without any per-device setup.
 */

export type ProviderId = "gemini";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  /** Rough ceiling; adapters map it to their own field. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly id: ProviderId;
  readonly label: string;
  isConfigured(cfg: ProviderConfig): boolean;
  /** Streams the reply in chunks. Throws `AiError` on failure. */
  stream(req: ChatRequest, cfg: ProviderConfig): AsyncGenerator<string, void, unknown>;
}

export interface ProviderConfig {
  provider: ProviderId;
  geminiKey: string;
  geminiModel: string;
}

/**
 * Only the "-latest" aliases carry free-tier quota on this AI-Studio key format
 * (pinned gemini-2.0-* return a zero-quota 429). Among those, the plain
 * flash-latest currently resolves to gemini-3.5-flash with a brutal 20
 * requests/day free cap — a handful of chat turns and it's exhausted. The
 * lite alias has a much higher daily allowance, so it's the primary; the
 * adapter falls back through the rest on a 429.
 */
export const DEFAULT_CONFIG: ProviderConfig = {
  provider: "gemini",
  geminiKey: process.env.NEXT_PUBLIC_GEMINI_KEY ?? "",
  geminiModel: "gemini-flash-lite-latest",
};

/** Tried in order; a rate-limited model hands off to the next. */
export const GEMINI_FALLBACKS = ["gemini-flash-lite-latest", "gemini-flash-latest"];

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "rate_limit" | "config" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** No per-device config anymore — the key is compiled in. */
export function loadConfig(): ProviderConfig {
  return DEFAULT_CONFIG;
}
