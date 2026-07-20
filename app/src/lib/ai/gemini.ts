import { AiError, type AiProvider, type ChatRequest, type ProviderConfig } from "./provider";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

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

    const res = await fetch(
      `${BASE}/models/${encodeURIComponent(cfg.geminiModel)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": cfg.geminiKey },
        signal: req.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: req.maxTokens ?? 2048 },
        }),
      },
    );

    if (!res.ok) throw toError(res.status, await safeText(res));
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
  if (status === 429) return new AiError("Gemini-Kontingent erschöpft. Später erneut versuchen.", "rate_limit");
  return new AiError(`Gemini antwortete mit ${status}.`, status >= 500 ? "network" : "unknown");
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
