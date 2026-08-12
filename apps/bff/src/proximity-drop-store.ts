import { randomBytes } from "node:crypto";

/** TTL Mode B v1 (hypothèse SPEC ~10–15 min). */
export const PROXIMITY_DROP_TTL_MS = 15 * 60 * 1000;

export type ProximityDropPayload = Record<string, unknown>;

export type ProximityDropConsumeError = "not_found" | "expired" | "consumed";

export type ProximityDropConsumeResult =
  | { ok: true; payload: ProximityDropPayload }
  | { ok: false; error: ProximityDropConsumeError };

export interface ProximityDropCreateResult {
  id: string;
  expiresAt: string;
}

interface DropEntry {
  payload: ProximityDropPayload;
  expiresAtMs: number;
  consumed: boolean;
}

export interface ProximityDropStoreOptions {
  /** Horloge injectable pour forcer le TTL en tests. */
  now?: () => number;
  ttlMs?: number;
}

/**
 * Dépôt éphémère Mode B (mémoire process, mono-instance).
 * Burn-after-read au premier consume réussi ; pas de persistence durable.
 */
export class ProximityDropStore {
  private readonly entries = new Map<string, DropEntry>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: ProximityDropStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? PROXIMITY_DROP_TTL_MS;
  }

  /** Nombre d’entrées en mémoire (tests / diagnostic). */
  get size(): number {
    return this.entries.size;
  }

  create(payload: ProximityDropPayload): ProximityDropCreateResult {
    this.sweep();
    const id = createOpaqueUrlSafeId();
    const expiresAtMs = this.now() + this.ttlMs;
    this.entries.set(id, {
      payload: structuredClone(payload),
      expiresAtMs,
      consumed: false
    });
    return { id, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  consume(id: string): ProximityDropConsumeResult {
    const key = String(id ?? "").trim();
    if (!key) {
      this.sweep();
      return { ok: false, error: "not_found" };
    }

    // Ne pas sweeper la clé demandée : le tombstone doit encore répondre `consumed`.
    this.sweep(key);

    const entry = this.entries.get(key);
    if (!entry) {
      return { ok: false, error: "not_found" };
    }

    if (entry.consumed) {
      return { ok: false, error: "consumed" };
    }

    if (this.now() >= entry.expiresAtMs) {
      this.entries.delete(key);
      return { ok: false, error: "expired" };
    }

    entry.consumed = true;
    // Tombstone sans payload : distingue consumed de not_found au 2ᵉ GET.
    const payload = structuredClone(entry.payload);
    entry.payload = {};
    return { ok: true, payload };
  }

  /**
   * Test helper : force l’expiration d’une entrée (TTL simulé sans attendre).
   * @returns false si l’id est absent.
   */
  forceExpire(id: string): boolean {
    const key = String(id ?? "").trim();
    const entry = this.entries.get(key);
    if (!entry || entry.consumed) {
      return false;
    }
    entry.expiresAtMs = this.now() - 1;
    return true;
  }

  /**
   * Retire les entrées expirées et les tombstones `consumed`.
   * @param exceptId clé à conserver (ex. ticket en cours de lecture).
   */
  private sweep(exceptId?: string): void {
    const nowMs = this.now();
    for (const [id, entry] of this.entries) {
      if (exceptId !== undefined && id === exceptId) {
        continue;
      }
      if (entry.consumed || nowMs >= entry.expiresAtMs) {
        this.entries.delete(id);
      }
    }
  }
}

/** Valide le body POST : objet JSON avec `title` string non vide (trim). */
export function validateProximityDropBody(
  body: unknown
): { ok: true; payload: ProximityDropPayload } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }

  const title = (body as { title?: unknown }).title;
  if (typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "title is required" };
  }

  return {
    ok: true,
    payload: { ...(body as ProximityDropPayload), title: title.trim() }
  };
}

function createOpaqueUrlSafeId(): string {
  return randomBytes(18).toString("base64url");
}
