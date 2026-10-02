export const ASSISTANT_EMPTY_MESSAGE =
  "Écrivez une intention, collez un lien ou une recette, ou ajoutez une image.";

export const ASSISTANT_IMAGE_TYPE_MESSAGE = "Choisissez une image pour le Compositeur.";

export interface AssistantAttachment {
  name: string;
  file: File;
  previewUrl: string;
}

export interface AssistantComposerCommand {
  text: string;
  attachments: AssistantAttachment[];
}

export type AssistantComposerValidation =
  | { valid: true }
  | { valid: false; message: string };

export const ASSISTANT_STARTERS = [
  "J'ai envie de cuisiner quelque chose de rapide ce soir.",
  "Voici une recette à préparer :",
  "Que puis-je faire avec ce que j'ai dans le frigo ?"
] as const;

/** Le Compositeur est local : il valide et prépare, sans router ni persister. */
export function validateAssistantComposer(
  command: AssistantComposerCommand
): AssistantComposerValidation {
  return command.text.trim() || command.attachments.length ? { valid: true } : { valid: false, message: ASSISTANT_EMPTY_MESSAGE };
}

export function isImageAttachment(file: Pick<File, "type">): boolean {
  return file.type.toLocaleLowerCase().startsWith("image/");
}

export function insertAssistantTranscript(
  text: string,
  transcript: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; cursor: number } {
  const accepted = transcript.trim();
  if (!accepted) return { value: text, cursor: selectionStart };
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const prefix = text.slice(0, start);
  const separator = prefix && !/\s$/.test(prefix) ? " " : "";
  const value = `${prefix}${separator}${accepted}${text.slice(end)}`;
  return { value, cursor: prefix.length + separator.length + accepted.length };
}

export function isAssistantSubmitShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}
