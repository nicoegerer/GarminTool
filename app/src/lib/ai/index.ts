import { geminiProvider } from "./gemini";
import { ollamaProvider } from "./ollama";
import type { AiProvider, ProviderConfig, ProviderId } from "./provider";

/** Registry — adding a model means adding one entry here. */
export const PROVIDERS: Record<ProviderId, AiProvider> = {
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

export const PROVIDER_LIST: AiProvider[] = [geminiProvider, ollamaProvider];

export function getProvider(cfg: ProviderConfig): AiProvider {
  return PROVIDERS[cfg.provider] ?? geminiProvider;
}

export * from "./provider";
