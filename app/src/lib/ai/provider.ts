/**
 * Provider-agnostic chat interface.
 *
 * There is exactly one provider today (Gemini — the only free option that
 * works on both phone and desktop). The interface stays so a swap is one
 * adapter file plus one registry entry, with no call sites touched.
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
  /** Where the user's data goes — surfaced in the settings UI. */
  readonly privacyNote: string;
  /** Whether the adapter has what it needs. */
  isConfigured(cfg: ProviderConfig): boolean;
  /** Streams the reply in chunks. Throws `AiError` on failure. */
  stream(req: ChatRequest, cfg: ProviderConfig): AsyncGenerator<string, void, unknown>;
  /** Lists selectable models, if the provider can be asked. */
  listModels?(cfg: ProviderConfig): Promise<string[]>;
}

export interface ProviderConfig {
  provider: ProviderId;
  geminiKey: string;
  geminiModel: string;
}

export const DEFAULT_CONFIG: ProviderConfig = {
  provider: "gemini",
  geminiKey: "",
  geminiModel: "gemini-2.0-flash",
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "rate_limit" | "config" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "AiError";
  }
}

const STORAGE_KEY = "gt_ai_config";

export function loadConfig(): ProviderConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ProviderConfig>) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: ProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}
