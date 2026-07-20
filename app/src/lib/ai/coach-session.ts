import { DEFAULT_PARAMS, type CoachParams } from "./coach";

export type ChatMsg = { role: "user" | "assistant"; content: string };

/**
 * Scratch state for the coach page, kept at module scope on purpose.
 *
 * It survives client-side navigation (Coach → Dashboard → Coach keeps the
 * proposal and the chat) because the module stays loaded, but a full page
 * reload re-imports the module and resets everything — which is exactly the
 * "keep my messages until I reload the page" behaviour that was asked for.
 */
export const coachSession: {
  params: CoachParams;
  plan: string;
  chat: ChatMsg[];
} = {
  params: DEFAULT_PARAMS,
  plan: "",
  chat: [],
};
