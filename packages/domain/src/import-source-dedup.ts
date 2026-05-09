import type { ImportSource, Recipe } from "./recipe";

const TRACKING_PARAM_PREFIXES = ["utm_"] as const;
const TRACKING_PARAM_EXACT = new Set(["fbclid", "gclid", "_ga"]);

/**
 * Normalise une URL http(s) pour comparaison / hachage (hôte en minuscules, sans fragment,
 * paramètres de tracking courants retirés, query triée, slash final du chemin retiré sauf racine).
 */
export function normalizeUrlForDedup(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;

    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
      u.port = "";
    }
    u.hash = "";

    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAM_EXACT.has(lower)) {
        u.searchParams.delete(key);
        continue;
      }
      for (const p of TRACKING_PARAM_PREFIXES) {
        if (lower.startsWith(p)) {
          u.searchParams.delete(key);
          break;
        }
      }
    }

    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    u.pathname = path || "/";

    const sortedKeys = [...u.searchParams.keys()].sort((a, b) => a.localeCompare(b));
    const next = new URLSearchParams();
    for (const k of sortedKeys) {
      const v = u.searchParams.get(k);
      if (v !== null) next.set(k, v);
    }
    const q = next.toString();
    u.search = q ? `?${q}` : "";

    return u.href;
  } catch {
    return undefined;
  }
}

/** SHA-256 hex (UTF-8) sans `crypto.subtle` (contextes non sécurisés, vieux navigateurs). */
function sha256HexUtf8SyncJs(text: string): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0xfc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  const rotr = (n: number, x: number) => ((x >>> n) | (x << (32 - n))) >>> 0;
  const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
  const maj = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z);
  const s0 = (x: number) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const s1 = (x: number) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const g0 = (x: number) => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  const g1 = (x: number) => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);

  const msg = new TextEncoder().encode(text);
  const bitLen = BigInt(msg.length * 8);
  const padLen = Math.ceil((msg.length + 9) / 64) * 64;
  const buf = new Uint8Array(padLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  new DataView(buf.buffer).setBigUint64(padLen - 8, bitLen, false);

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] =
        (buf[i + 4 * t]! << 24) |
        (buf[i + 4 * t + 1]! << 16) |
        (buf[i + 4 * t + 2]! << 8) |
        buf[i + 4 * t + 3]!;
    }
    for (let t = 16; t < 64; t++) {
      w[t] = (g1(w[t - 2]!) + w[t - 7]! + g0(w[t - 15]!) + w[t - 16]!) >>> 0;
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + s1(e) + ch(e, f, g) + K[t]! + w[t]!) >>> 0;
      const t2 = (s0(a) + maj(a, b, c)) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const v = new DataView(out.buffer);
  v.setUint32(0, h0, false);
  v.setUint32(4, h1, false);
  v.setUint32(8, h2, false);
  v.setUint32(12, h3, false);
  v.setUint32(16, h4, false);
  v.setUint32(20, h5, false);
  v.setUint32(24, h6, false);
  v.setUint32(28, h7, false);
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexUtf8(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256HexUtf8SyncJs(text);
}

/**
 * Clé stable opaque (SHA-256 hex de l’URL normalisée) si `source.url` est exploitable.
 * Utilise `crypto.subtle` lorsqu’il est disponible ; sinon même algorithme en pur JavaScript
 * (pages non-HTTPS hors contexte sécurisé).
 */
export async function computeImportSourceStableKey(
  source: ImportSource | undefined
): Promise<string | undefined> {
  const raw = source?.url?.trim();
  if (!raw) return undefined;
  const normalized = normalizeUrlForDedup(raw);
  if (!normalized) return undefined;
  return sha256HexUtf8(normalized);
}

/**
 * Clé persistée sur la recette ou dérivée de `source` (priorité au champ déjà présent).
 */
export async function resolveImportSourceStableKey(
  recipe: Pick<Recipe, "source" | "importSourceStableKey">
): Promise<string | undefined> {
  const existing = recipe.importSourceStableKey?.trim();
  if (existing) return existing;
  return computeImportSourceStableKey(recipe.source);
}
