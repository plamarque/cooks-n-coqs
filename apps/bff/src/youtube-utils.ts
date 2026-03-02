/** Détecte si l'URL pointe vers YouTube. */
export function isYouTubeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be"
    );
  } catch {
    return false;
  }
}

/** Extrait l'ID vidéo depuis une URL YouTube (watch, youtu.be, embed, v). */
export function extractYouTubeVideoId(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined;
    }
    if (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com"
    ) {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const pathMatch = parsed.pathname.match(/\/(?:embed|v)\/([a-zA-Z0-9_-]{11})/);
      return pathMatch?.[1];
    }
    return undefined;
  } catch {
    return undefined;
  }
}
