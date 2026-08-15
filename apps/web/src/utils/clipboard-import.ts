/** API clipboard injectable (navigateur ou mock de test). */
export type ClipboardReader = {
  read?: () => Promise<readonly ClipboardItemLike[]>;
  readText?: () => Promise<string>;
};

/** Sous-ensemble de ClipboardItem utilisable hors DOM. */
export type ClipboardItemLike = {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
};

export type ClipboardImportResult =
  | { kind: "image"; file: File }
  | { kind: "text"; text: string };

export const CLIPBOARD_UNSUPPORTED_MESSAGE =
  "Lecture du presse-papiers non supportée ici. Collez manuellement dans le champ.";

export const CLIPBOARD_EMPTY_MESSAGE = "Le presse-papiers est vide.";

const IMAGE_TYPE_PREFIX = "image/";

function isImageMime(type: string): boolean {
  return type.toLowerCase().startsWith(IMAGE_TYPE_PREFIX);
}

function imageMimes(types: readonly string[]): string[] {
  return types.filter(isImageMime);
}

function asClipboardItems(value: unknown): ClipboardItemLike[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value as ClipboardItemLike[];
  if (typeof value === "object" && typeof (value as Iterable<unknown>)[Symbol.iterator] === "function") {
    try {
      return [...(value as Iterable<ClipboardItemLike>)];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function extensionForMime(mime: string): string {
  const normalized = mime.toLowerCase();
  const subtype = normalized.slice(IMAGE_TYPE_PREFIX.length).split(";")[0]?.trim();
  if (!subtype) return "png";
  if (subtype === "jpeg") return "jpg";
  if (subtype === "svg+xml") return "svg";
  return subtype.replace(/[^a-z0-9]+/g, "") || "png";
}

async function tryFileFromImageItem(
  item: ClipboardItemLike,
  mime: string
): Promise<File | undefined> {
  try {
    const blob = await item.getType(mime);
    if (!blob || blob.size === 0) return undefined;
    const ext = extensionForMime(mime);
    const type = mime.toLowerCase().startsWith(IMAGE_TYPE_PREFIX) ? mime.toLowerCase() : mime;
    return new File([blob], `clipboard.${ext}`, { type });
  } catch {
    return undefined;
  }
}

async function textFromItems(items: readonly ClipboardItemLike[]): Promise<string | undefined> {
  for (const item of items) {
    const textType = item.types.find((t) => t.toLowerCase() === "text/plain");
    if (!textType) continue;
    try {
      const blob = await item.getType(textType);
      const text = (await blob.text()).trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Résout le contenu du presse-papiers pour l’import :
 * image prioritaire (premier item `image/*` utilisable), sinon texte.
 */
export async function resolveClipboardImport(
  clipboard: ClipboardReader
): Promise<ClipboardImportResult> {
  const canRead = typeof clipboard.read === "function";
  const canReadText = typeof clipboard.readText === "function";

  if (!canRead && !canReadText) {
    throw new Error(CLIPBOARD_UNSUPPORTED_MESSAGE);
  }

  if (canRead) {
    const raw = await clipboard.read!();
    const items = asClipboardItems(raw);
    if (items) {
      for (const item of items) {
        if (!item?.types) continue;
        for (const mime of imageMimes(item.types)) {
          const file = await tryFileFromImageItem(item, mime);
          if (file) return { kind: "image", file };
        }
      }

      const fromItems = await textFromItems(items);
      if (fromItems) {
        return { kind: "text", text: fromItems };
      }
    }
  }

  if (canReadText) {
    const text = (await clipboard.readText!()).trim();
    if (text) {
      return { kind: "text", text };
    }
  }

  throw new Error(CLIPBOARD_EMPTY_MESSAGE);
}
