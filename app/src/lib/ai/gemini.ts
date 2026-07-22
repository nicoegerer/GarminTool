import { AiError, GEMINI_MODELS, type AiProvider, type ChatRequest, type ProviderConfig } from "./provider";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Primary model first, then the rest of the chain (deduped). */
function modelChain(primary: string): { id: string; thinking: boolean }[] {
  const known = GEMINI_MODELS.find((m) => m.id === primary);
  return [known ?? { id: primary, thinking: false }, ...GEMINI_MODELS.filter((m) => m.id !== primary)];
}

/**
 * Google Gemini via the free tier.
 * Uses streamGenerateContent with alt=sse; the key rides in a header rather
 * than the query string so it never lands in a URL log.
 */
export const geminiProvider: AiProvider = {
  id: "gemini",
  label: "Google Gemini",

  isConfigured: (cfg) => cfg.geminiKey.trim().length > 0,

  async *stream(req: ChatRequest, cfg: ProviderConfig) {
    if (!cfg.geminiKey.trim()) throw new AiError("Kein Gemini-API-Key hinterlegt.", "config");

    const buildBody = (thinking: boolean) =>
      JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 2048,
          // Only for models that reason by default: their hidden thoughts count
          // against maxOutputTokens and would truncate the answer mid-sentence.
          // Models that don't reason reject the field with a 400.
          ...(thinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      });

    // Try each model in turn: if one's free daily quota is spent (429), fall
    // through to the next instead of dead-ending the chat. A 400 on a model we
    // sent thinkingConfig to means the alias moved to a model that rejects it —
    // retry the same model without the field rather than failing the chat.
    const models = modelChain(cfg.geminiModel);
    let res: Response | null = null;
    outer: for (let i = 0; i < models.length; i++) {
      const last = i === models.length - 1;
      for (const thinking of models[i].thinking ? [true, false] : [false]) {
        res = await fetch(`${BASE}/models/${encodeURIComponent(models[i].id)}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": cfg.geminiKey },
          signal: req.signal,
          body: buildBody(thinking),
        });
        if (res.ok) break outer;
        if (res.status === 400 && thinking) continue; // retry same model, no thinkingConfig
        if (res.status === 429 && !last) continue outer; // quota spent → next model
        throw toError(res.status, await safeText(res));
      }
    }
    if (!res || !res.ok) throw new AiError("Gemini ist gerade nicht erreichbar.", "network");
    if (!res.body) throw new AiError("Gemini lieferte keinen Stream.", "network");

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
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as {
            candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
            error?: { message?: string };
          };
          if (ev.error?.message) throw new AiError(ev.error.message, "unknown");
          const text = ev.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (text) yield text;
        } catch (e) {
          if (e instanceof AiError) throw e;
          // A truncated SSE frame — the next chunk completes it.
        }
      }
    }
  },
};

function toError(status: number, body: string): AiError {
  if (status === 400 && /API key not valid/i.test(body)) return new AiError("Gemini-API-Key ist ungültig.", "auth");
  if (status === 401 || status === 403) return new AiError("Gemini-API-Key wurde abgelehnt.", "auth");
  if (status === 429) return new AiError("Das kostenlose Tageslimit von Gemini ist erreicht. Morgen geht's wieder.", "rate_limit");
  return new AiError(`Gemini antwortete mit ${status}.`, status >= 500 ? "network" : "unknown");
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
