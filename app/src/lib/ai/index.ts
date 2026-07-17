import { geminiProvider } from "./gemini";
import type { AiProvider, ProviderConfig, ProviderId } from "./provider";

/** Registry — adding a model means adding one entry here. */
export const PROVIDERS: Record<ProviderId, AiProvider> = {
  gemini: geminiProvider,
};

export const PROVIDER_LIST: AiProvider[] = [geminiProvider];

export function getProvider(_cfg: ProviderConfig): AiProvider {
  return geminiProvider;
}

export * from "./provider";
