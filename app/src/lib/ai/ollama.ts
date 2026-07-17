import { AiError, type AiProvider, type ChatRequest, type ProviderConfig } from "./provider";

/**
 * Ollama running on the user's own machine — nothing leaves the device.
 *
 * Two constraints worth knowing:
 *  - Only reachable while Ollama runs locally, so the coach is dead on a phone.
 *  - Ollama must allow this origin:  OLLAMA_ORIGINS=https://<deine-domain>
 *    Browsers treat http://localhost as trustworthy, so the HTTPS page may call
 *    it without a mixed-content block — but the CORS header is still required.
 */
export const ollamaProvider: AiProvider = {
  id: "ollama",
  label: "Ollama (lokal)",
  privacyNote: "Läuft komplett auf deinem Rechner. Nichts verlässt das Gerät.",

  isConfigured: (cfg) => cfg.ollamaUrl.trim().length > 0 && cfg.ollamaModel.trim().length > 0,

  async listModels(cfg: ProviderConfig) {
    let res: Response;
    try {
      res = await fetch(`${trim(cfg.ollamaUrl)}/api/tags`);
    } catch {
      throw unreachable(cfg);
    }
    if (!res.ok) throw new AiError(`Ollama antwortete mit ${res.status}.`, "network");
    const body = (await res.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) => m.name).sort();
  },

  async *stream(req: ChatRequest, cfg: ProviderConfig) {
    let res: Response;
    try {
      res = await fetch(`${trim(cfg.ollamaUrl)}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: req.signal,
        body: JSON.stringify({
          model: cfg.ollamaModel,
          stream: true,
          messages: [{ role: "system", content: req.system }, ...req.messages],
          options: { num_predict: req.maxTokens ?? 2048 },
        }),
      });
    } catch {
      throw unreachable(cfg);
    }

    if (res.status === 404) {
      throw new AiError(`Modell "${cfg.ollamaModel}" nicht gefunden. Erst "ollama pull ${cfg.ollamaModel}" ausführen.`, "config");
    }
    if (!res.ok) throw new AiError(`Ollama antwortete mit ${res.status}.`, "network");
    if (!res.body) throw new AiError("Ollama lieferte keinen Stream.", "network");

    // Ollama streams newline-delimited JSON, not SSE.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try {
          const ev = JSON.parse(t) as { message?: { content?: string }; error?: string; done?: boolean };
          if (ev.error) throw new AiError(ev.error, "unknown");
          if (ev.message?.content) yield ev.message.content;
        } catch (e) {
          if (e instanceof AiError) throw e;
        }
      }
    }
  },
};

const trim = (url: string) => url.replace(/\/+$/, "");

function unreachable(cfg: ProviderConfig): AiError {
  return new AiError(
    `Ollama unter ${cfg.ollamaUrl} nicht erreichbar. Läuft es? Und ist diese Seite in OLLAMA_ORIGINS erlaubt?`,
    "network",
  );
}
