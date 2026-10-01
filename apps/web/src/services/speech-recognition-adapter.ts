export const SPEECH_UNAVAILABLE_MESSAGE =
  "La dictée n'est pas disponible ici. Vous pouvez écrire votre demande.";
export const SPEECH_ERROR_MESSAGE =
  "La dictée s'est arrêtée. Votre texte est conservé.";

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0?: { transcript?: string };
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface SpeechRecognitionWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export interface SpeechRecognitionCallbacks {
  onTranscript(transcript: string): void;
  onUnavailable(message: string): void;
  onError(message: string): void;
  onEnd(): void;
}

export interface SpeechRecognitionSession {
  stop(): void;
}

/** Adaptateur navigateur facultatif : aucune capture ni donnée audio n'est exposée. */
export function startBrowserSpeechRecognition(
  browser: SpeechRecognitionWindow | undefined,
  callbacks: SpeechRecognitionCallbacks
): SpeechRecognitionSession | null {
  const Recognition = browser?.SpeechRecognition ?? browser?.webkitSpeechRecognition;
  if (!Recognition) {
    callbacks.onUnavailable(SPEECH_UNAVAILABLE_MESSAGE);
    return null;
  }

  const recognition = new Recognition();
  recognition.lang = "fr-FR";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim();
      if (result?.isFinal && transcript) callbacks.onTranscript(transcript);
    }
  };
  recognition.onerror = () => callbacks.onError(SPEECH_ERROR_MESSAGE);
  recognition.onend = () => callbacks.onEnd();
  try {
    recognition.start();
  } catch {
    callbacks.onError(SPEECH_ERROR_MESSAGE);
    return null;
  }
  return { stop: () => recognition.stop() };
}
