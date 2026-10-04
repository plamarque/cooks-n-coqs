import { isChefConversation, type AssistantConversationTurnV1, type ChefConversation } from "@cookies-et-coquilettes/domain";

export type ChefConversationRecord = ChefConversation;

export function hydrateChefConversation(value: unknown): ChefConversationRecord | null {
  if (!isChefConversation(value)) return null;
  return { ...value, turns: value.turns.map((turn) => ({ ...turn })) };
}

export class ChefSession {
  active: ChefConversationRecord | null = null;
  begin(turns: readonly AssistantConversationTurnV1[], now = new Date()): ChefConversationRecord {
    if (this.active) return this.active;
    this.active = { id: crypto.randomUUID(), createdAt: now.toISOString(), turns: turns.map((turn) => ({ ...turn })) };
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
    this.active = { ...this.active, turns: turns.map((turn) => ({ ...turn })) };
    return this.active;
  }
  close(now = new Date()): ChefConversationRecord | null {
    if (!this.active) return null;
    const closed = { ...this.active, closedAt: now.toISOString() };
    this.active = null;
    return closed;
  }
}
