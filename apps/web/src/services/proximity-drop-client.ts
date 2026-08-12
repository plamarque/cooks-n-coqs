/** Client HTTP dépôt éphémère Mode B (CAP-5) — miroir `VITE_BFF_URL` / import-service. */

const API_BASE_URL = import.meta.env?.VITE_BFF_URL || "http://localhost:8787";

export type ProximityDropCreateResult = {
  id: string;
  expiresAt: string;
};

export type ProximityDropFailureReason =
  | "not_found"
  | "expired"
  | "consumed"
  | "bad_request"
  | "network"
  | "invalid_response";

/** Erreur explicite minimale (CAP-7 soft) sur le chemin drop. */
export class ProximityDropClientError extends Error {
  readonly reason: ProximityDropFailureReason;

  constructor(message: string, reason: ProximityDropFailureReason) {
    super(message);
    this.name = "ProximityDropClientError";
    this.reason = reason;
  }
}

export const PROXIMITY_DROP_UNAVAILABLE_MESSAGE =
  "Ce partage n'est plus disponible. Redemandez-le à la personne qui vous l'a envoyé.";

export const PROXIMITY_DROP_CREATE_FAIL_MESSAGE =
  "Impossible de préparer le partage de cette recette.";

function dropUrl(pathSuffix = ""): string {
  return `${API_BASE_URL}/api/proximity-drop${pathSuffix}`;
}

async function readJsonUnknown(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function reasonFromBody(body: unknown, fallback: ProximityDropFailureReason): ProximityDropFailureReason {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const reason = (body as { reason?: unknown }).reason;
    if (reason === "not_found" || reason === "expired" || reason === "consumed") {
      return reason;
    }
  }
  return fallback;
}

/** POST `/api/proximity-drop` → `{ id, expiresAt }` (201). */
export async function createProximityDrop(
  payload: Record<string, unknown>
): Promise<ProximityDropCreateResult> {
  let response: Response;
  try {
    response = await fetch(dropUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new ProximityDropClientError(PROXIMITY_DROP_CREATE_FAIL_MESSAGE, "network");
  }

  if (response.status === 400) {
    throw new ProximityDropClientError(PROXIMITY_DROP_CREATE_FAIL_MESSAGE, "bad_request");
  }

  if (response.status !== 201) {
    throw new ProximityDropClientError(PROXIMITY_DROP_CREATE_FAIL_MESSAGE, "invalid_response");
  }

  const body = (await readJsonUnknown(response)) as { id?: unknown; expiresAt?: unknown } | undefined;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt.trim() : "";
  if (!id || !expiresAt) {
    throw new ProximityDropClientError(PROXIMITY_DROP_CREATE_FAIL_MESSAGE, "invalid_response");
  }

  return { id, expiresAt };
}

/** GET burn `/api/proximity-drop/:id` → payload (200) ; 404/410 → erreur explicite. */
export async function consumeProximityDrop(ticketId: string): Promise<unknown> {
  const id = ticketId.trim();
  if (!id) {
    throw new ProximityDropClientError(PROXIMITY_DROP_UNAVAILABLE_MESSAGE, "not_found");
  }

  let response: Response;
  try {
    response = await fetch(dropUrl(`/${encodeURIComponent(id)}`), {
      method: "GET",
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new ProximityDropClientError(PROXIMITY_DROP_UNAVAILABLE_MESSAGE, "network");
  }

  if (response.status === 404) {
    const body = await readJsonUnknown(response);
    throw new ProximityDropClientError(
      PROXIMITY_DROP_UNAVAILABLE_MESSAGE,
      reasonFromBody(body, "not_found")
    );
  }

  if (response.status === 410) {
    const body = await readJsonUnknown(response);
    throw new ProximityDropClientError(
      PROXIMITY_DROP_UNAVAILABLE_MESSAGE,
      reasonFromBody(body, "expired")
    );
  }

  if (!response.ok) {
    throw new ProximityDropClientError(PROXIMITY_DROP_UNAVAILABLE_MESSAGE, "invalid_response");
  }

  const body = await readJsonUnknown(response);
  if (body === undefined) {
    throw new ProximityDropClientError(PROXIMITY_DROP_UNAVAILABLE_MESSAGE, "invalid_response");
  }
  return body;
}
