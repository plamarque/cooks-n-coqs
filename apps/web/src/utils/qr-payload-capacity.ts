/** Capacité max (octets) QR Code v40, ECC M, mode byte (ISO/IEC 18004). */
export const QR_LEVEL_M_BYTE_CAPACITY = 2331;

/**
 * Longueur du ticket Mode B émis par le BFF
 * (`randomBytes(18).toString("base64url")` → 24 caractères).
 * Sert au pré-contrôle capacité QR avant `createProximityDrop` (évite drop orphelin).
 */
export const PROXIMITY_MODE_B_TICKET_ID_LENGTH = 24;

/** Message Alice si le deep link dépasse la capacité QR level M (distinct CAP-7 Bob). */
export const QR_PAYLOAD_TOO_LARGE_MESSAGE =
  "Le lien de partage est trop long pour le QR. Raccourcis le titre ou l’URL source de la recette.";

/** Nombre d’octets UTF-8 d’une chaîne (pas `String.length`). */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Vrai si le payload tient dans un QR level M (mode byte). */
export function qrPayloadFitsLevelM(payload: string): boolean {
  return utf8ByteLength(payload) <= QR_LEVEL_M_BYTE_CAPACITY;
}

/** Lance si le deep link dépasse la capacité QR level M. */
export function assertQrPayloadFitsLevelM(payload: string): void {
  if (!qrPayloadFitsLevelM(payload)) {
    throw new Error(QR_PAYLOAD_TOO_LARGE_MESSAGE);
  }
}
