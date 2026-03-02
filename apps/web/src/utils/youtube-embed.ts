/** Extrait l'ID vidéo depuis une URL YouTube. */
function extractYouTubeVideoId(rawUrl: string): string | undefined {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined;
    }
    if (
      host === "youtube.com" ||
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

/** Construit l'URL d'embed YouTube pour une URL vidéo. */
export function buildYouTubeEmbedUrl(rawUrl?: string): string | undefined {
  if (!rawUrl?.trim()) {
    return undefined;
  }
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    return undefined;
  }
  return `https://www.youtube.com/embed/${videoId}`;
}
