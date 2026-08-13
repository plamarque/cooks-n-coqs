/**
 * Partage système natif (Web Share) — texte F2, avec fallback presse-papiers.
 * Story 3 : texte seul ; fichiers (vignette) en story 4.
 *
 * Note : `navigator.share` et `clipboard.writeText` exigent souvent un **contexte
 * sécurisé** (HTTPS ou localhost). En HTTP LAN/Tailscale les deux peuvent
 * échouer → fallback copie legacy puis UI « texte à copier » côté appelant.
 */

export type NativeShareTextResult =
  | { ok: true; method: "share" | "clipboard" }
  | {
      ok: false;
      reason: "aborted" | "needs-manual-copy" | "error";
      /** Texte F2 à afficher / sélectionner si copie auto impossible. */
      text?: string;
      message?: string;
    };

export type NativeShareDeps = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeText?: (text: string) => Promise<void>;
  /** Copie legacy (textarea + execCommand) — injectée pour tests. */
  legacyCopy?: (text: string) => boolean;
};

function resolveShareApi(deps?: NativeShareDeps): {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
} {
  if (deps?.share) {
    return { share: deps.share, canShare: deps.canShare };
  }
  if (typeof navigator === "undefined") {
    return {};
  }
  return {
    share: navigator.share?.bind(navigator),
    canShare: navigator.canShare?.bind(navigator)
  };
}

function resolveClipboardWrite(deps?: NativeShareDeps): ((text: string) => Promise<void>) | undefined {
  if (deps?.writeText) {
    return deps.writeText;
  }
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return undefined;
  }
  return navigator.clipboard.writeText.bind(navigator.clipboard);
}

/** Fallback hors contexte sécurisé : parfois encore accepté par le navigateur. */
export function copyTextViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function resolveLegacyCopy(deps?: NativeShareDeps): (text: string) => boolean {
  return deps?.legacyCopy ?? copyTextViaExecCommand;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

/**
 * Partage `text` via Web Share si possible, sinon copie presse-papiers
 * (API puis execCommand). Si rien ne marche → needs-manual-copy + text.
 *
 * Ne pas passer `title` à `navigator.share` : Android/Chrome affiche déjà un
 * bandeau « titre » au-dessus du texte → doublon avec le bloc F2 `Titre:`.
 * Le titre reste dans le payload F2 (contrat import / lecture messagerie).
 */
export async function shareRecipeTextNative(
  options: {
    text: string;
  },
  deps?: NativeShareDeps
): Promise<NativeShareTextResult> {
  const text = options.text.trim();
  if (!text) {
    return { ok: false, reason: "error", message: "Rien à partager." };
  }

  const data: ShareData = { text };

  const { share, canShare } = resolveShareApi(deps);
  if (share) {
    const allowed = typeof canShare === "function" ? canShare(data) : true;
    if (allowed) {
      try {
        await share(data);
        return { ok: true, method: "share" };
      } catch (error) {
        if (isAbortError(error)) {
          return { ok: false, reason: "aborted" };
        }
        // Fall through to clipboard.
      }
    }
  }

  const writeText = resolveClipboardWrite(deps);
  if (writeText) {
    try {
      await writeText(text);
      return { ok: true, method: "clipboard" };
    } catch {
      // Fall through to legacy / manual.
    }
  }

  const legacyCopy = resolveLegacyCopy(deps);
  if (legacyCopy(text)) {
    return { ok: true, method: "clipboard" };
  }

  return {
    ok: false,
    reason: "needs-manual-copy",
    text,
    message: "Impossible de copier automatiquement. Sélectionne le texte ci-dessous et copie-le."
  };
}
