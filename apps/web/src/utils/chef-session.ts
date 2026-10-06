import { isChefConversation, type AssistantConversationTurnV1, type ChefConversation } from "@cookies-et-coquilettes/domain";

export type ChefConversationRecord = ChefConversation;

function cloneTurn(turn: AssistantConversationTurnV1): AssistantConversationTurnV1 {
  return {
    ...turn,
    ...(turn.attachments ? { attachments: turn.attachments.map((asset) => ({ ...asset })) } : {}),
    ...(turn.cards ? { cards: turn.cards.map((card) => card.kind === "candidate"
      ? { ...card }
      : { kind: "preview", preview: { draft: structuredClone(card.preview.draft), ...(card.preview.source ? { source: { ...card.preview.source } } : {}) } }) } : {})
  };
}

export function hydrateChefConversation(value: unknown): ChefConversationRecord | null {
  if (!isChefConversation(value)) return null;
  return { ...value, turns: value.turns.map(cloneTurn) };
}

export class ChefSession {
  active: ChefConversationRecord | null = null;
  begin(turns: readonly AssistantConversationTurnV1[], now = new Date()): ChefConversationRecord {
    if (this.active) return this.active;
    this.active = { id: crypto.randomUUID(), createdAt: now.toISOString(), turns: turns.map(cloneTurn) };
    return this.active;
  }
  hydrate(value: unknown): ChefConversationRecord | null {
    const conversation = hydrateChefConversation(value);
    if (!conversation) return null;
    this.active = { ...conversation, closedAt: undefined };
    return this.active;
  }
  sync(turns: readonly AssistantConversationTurnV1[]): ChefConversationRecord | null {
    if (!this.active) return null;
    this.active = { ...this.active, turns: turns.map(cloneTurn) };
    return this.active;
  }
  close(now = new Date()): ChefConversationRecord | null {
    if (!this.active) return null;
    const closed = { ...this.active, closedAt: now.toISOString() };
    this.active = null;
    return closed;
  }
}
