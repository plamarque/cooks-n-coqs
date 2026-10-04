import type { AssistantConversationTurnV1 } from "@cookies-et-coquilettes/domain";

export interface ChefConversationRecord {
  id: string;
  createdAt: string;
  closedAt?: string;
  turns: AssistantConversationTurnV1[];
}

export class ChefSession {
  active: ChefConversationRecord | null = null;
  begin(turns: readonly AssistantConversationTurnV1[], now = new Date()): ChefConversationRecord {
    if (this.active) return this.active;
    this.active = { id: crypto.randomUUID(), createdAt: now.toISOString(), turns: turns.map((turn) => ({ ...turn })) };
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
