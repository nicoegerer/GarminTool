import { geminiProvider } from "./gemini";
import type { AiProvider, ProviderConfig } from "./provider";

/** One provider today; a swap is one entry here plus one adapter file. */
export function getProvider(_cfg: ProviderConfig): AiProvider {
  return geminiProvider;
}

export * from "./provider";
