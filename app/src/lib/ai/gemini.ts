import { AiError, GEMINI_FALLBACKS, type AiProvider, type ChatRequest, type ProviderConfig } from "./provider";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Primary model first, then the shared fallback chain (deduped). */
function modelChain(primary: string): string[] {
  return [primary, ...GEMINI_FALLBACKS.filter((m) => m !== primary)];
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

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 2048,
        // The flash-latest aliases are 2.5+ models with "thinking" on by
        // default. Those hidden tokens count against maxOutputTokens, so a long
        // reply hit the cap and got cut off mid-sentence. We don't show the
        // thoughts anyway — turn them off so the whole budget is the answer.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    // Try each model in turn: if one's free daily quota is spent (429), fall
    // through to the next instead of dead-ending the chat.
    const models = modelChain(cfg.geminiModel);
    let res: Response | null = null;
    for (let i = 0; i < models.length; i++) {
      res = await fetch(`${BASE}/models/${encodeURIComponent(models[i])}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": cfg.geminiKey },
        signal: req.signal,
        body,
      });
      if (res.ok) break;
      // On a rate limit with models left, try the next one; otherwise report.
      if (res.status === 429 && i < models.length - 1) continue;
      throw toError(res.status, await safeText(res));
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
