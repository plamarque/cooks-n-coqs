import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AssistantSession, assistantImageErrorMessage, projectAssistantTurnsForNetwork, routeAssistantImport } from "../src/utils/assistant-session";
import { AssistantImageRequestError } from "../src/services/assistant-service";

const draft = { title: "Soupe", category: "SALE" as const, ingredients: [], steps: [], source: { type: "TEXT" as const, capturedAt: "2026-10-02" } };

test("session Assistant : conversion et taille résiduelle ont des messages distincts", () => {
  const conversion = assistantImageErrorMessage(new AssistantImageRequestError("preparation", "12345678-0000-0000-0000-000000000000", undefined, "conversion"));
  const size = assistantImageErrorMessage(new AssistantImageRequestError("preparation", "12345678-0000-0000-0000-000000000000", 413, "size"));
  assert.match(conversion, /pas pu préparer une photo/);
  assert.match(size, /pas pu réduire une photo sous la limite de 4 Mio/);
  assert.notEqual(conversion, size);
  const second = assistantImageErrorMessage(new AssistantImageRequestError("preparation", "12345678-0000-0000-0000-000000000000", 413, "size", 2));
  assert.match(second, /Photo concernée : n° 2/);
});

test("session Assistant : image puis URL puis texte", () => {
  assert.equal(routeAssistantImport("https://example.test", [{} as File]), "image");
  assert.equal(routeAssistantImport("https://example.test", []), "url");
  assert.equal(routeAssistantImport("https://chatgpt.com/share/abc123?utm_source=share", []), "url");
  assert.equal(routeAssistantImport("Soupe", []), "text");
});

test("session Assistant : dispatch réel image, URL puis texte", async () => {
  const calls: Array<[string, string]> = [];
  const adapter = {
    importImage: async (_file: File, context: string) => { calls.push(["image", context]); return draft; },
    importUrl: async (url: string) => { calls.push(["url", url]); return draft; },
    importText: async (text: string) => { calls.push(["text", text]); return draft; }
  };
  await new AssistantSession().import("https://example.test/avec-contexte", {} as File, adapter);
  await new AssistantSession().import("  https://example.test/recette  ", null, adapter);
  await new AssistantSession().import("Recette collée", null, adapter);
  assert.deepEqual(calls, [
    ["image", "https://example.test/avec-contexte"],
    ["url", "https://example.test/recette"],
    ["text", "Recette collée"]
  ]);
});

test("App.vue : un lien ChatGPT seul est importé avant le routage Chef", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  const submission = /async function prepareAssistantRequest[\s\S]*?\n}\n\nasync function prepareAssistantTextRequest/.exec(app);
  assert.ok(submission, "prepareAssistantRequest est présent");
  const source = submission[0];
  assert.match(source, /routeAssistantImport\(assistantText\.value, \[\]\) === "url"/);
  assert.match(source, /const importPromise = directImport[\s\S]*?assistantSession\.import\(assistantText\.value, null, assistantImportAdapter\)/);
  assert.match(source, /: prepareAssistantTextRequest\(preparationId\)/);
});

test("App.vue : une photo évite le wire Conseil textuel et part vers Vision", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  const requestPreparation = /async function prepareAssistantTextRequest[\s\S]*?\n}\n\nfunction cancelAssistantImport/.exec(app);
  assert.ok(requestPreparation, "prepareAssistantTextRequest est présent");
  assert.match(requestPreparation[0], /if \(route !== "image"\) \{[\s\S]*?requestChefAdvice/);
  assert.match(requestPreparation[0], /route === "image" \? await summarizeAssistantImages\(attachments/);
});

test("App.vue : les quatre attentes conversationnelles montrent le Chef Réflexion à la place du spinner", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  const progress = /<li v-if="\['importing', 'analyzing', 'searching', 'creating'\]\.includes\(assistantPhase\)"[\s\S]*?<\/li>/.exec(app);
  assert.ok(progress, "le bloc de progression conversationnelle est présent");
  assert.match(progress[0], /assistant-import-progress--thinking/);
  assert.match(progress[0], /<ChefAvatar class="assistant-import-progress-chef" state="reflexion" :interactive="false" :loop="true"/);
  assert.match(progress[0], /assistant-import-progress-bubble[\s\S]*?assistant-progress-dots/);
  assert.doesNotMatch(progress[0], /assistant-import-progress-mark|<ProgressSpinner/);
});

test("App.vue : l'illustration asynchrone de la prévisualisation montre le Chef Proposition", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  assert.match(app, /class="assistant-preview-card-loading" role="status" aria-live="polite"[\s\S]*?<ChefAvatar class="assistant-preview-card-loading-chef" state="proposition" :interactive="false" :loop="true"/);
  assert.match(app, /class="assistant-preview-image-loading" role="status" aria-live="polite"[\s\S]*?<ChefAvatar class="assistant-preview-image-loading-chef" state="proposition" :interactive="false" :loop="true"/);
  assert.match(app, /assistant-preview-loading-bubble[\s\S]*?assistant-progress-dots/);
  assert.doesNotMatch(app, /assistant-preview-card-loading-mark|Illustration en préparation/);
});

test("ChefAvatar : un sprite indisponible garde une pose statique de secours", () => {
  const avatarPath = join(dirname(fileURLToPath(import.meta.url)), "../src/components/ChefAvatar.vue");
  const avatar = readFileSync(avatarPath, "utf8");
  assert.match(avatar, /const spriteUnavailable = ref\(false\)/);
  assert.match(avatar, /function showSpriteUnavailable\(\): void \{\s*spriteUnavailable\.value = true;/);
  assert.match(avatar, /v-else-if="activeState !== 'repos' && !spriteUnavailable"/);
  assert.match(avatar, /class="chef-avatar-image chef-avatar-static-fallback"[\s\S]*:src="chefReposFallback"/);
  assert.match(avatar, /:aria-hidden="interactive \? undefined : true"/);
});

test("ChefAvatar : les attentes peuvent boucler une planche active", () => {
  const avatarPath = join(dirname(fileURLToPath(import.meta.url)), "../src/components/ChefAvatar.vue");
  const avatar = readFileSync(avatarPath, "utf8");
  assert.match(avatar, /loop\?: boolean/);
  assert.match(avatar, /chef-avatar--loop/);
});

test("session Assistant : un import envoyé forme un tour utilisateur puis Chef", async () => {
  const session = new AssistantSession();
  await session.import("https://example.test/recette", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => draft });
  assert.deepEqual(session.turns.map(({ role }) => role), ["user", "assistant"]);
});

test("session Assistant : cancel abort réellement le signal de l'adaptateur", async () => {
  let receivedSignal: AbortSignal | undefined;
  const session = new AssistantSession();
  const pending = session.import("Recette", null, {
    importImage: async () => draft,
    importUrl: async () => draft,
    importText: async (_text, signal) => {
      receivedSignal = signal;
      return new Promise<never>(() => {});
    }
  });
  await Promise.resolve();
  session.cancel();
  assert.equal(receivedSignal?.aborted, true);
  // L'attente ne sera jamais résolue : la promesse est laissée sans effet après abort.
  void pending;
});

test("session Assistant : annulation ignore le résultat tardif", async () => {
  let resolve!: (value: typeof draft) => void;
  const pending = new Promise<typeof draft>((done) => { resolve = done; });
  const session = new AssistantSession();
  const importing = session.import("Soupe", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => pending });
  session.cancel(); resolve(draft);
  assert.equal(await importing, null);
  assert.equal(session.preview, null);
});

test("session Assistant : invalidate ignore le résultat tardif sans effacer le fil", async () => {
  let resolve!: (value: typeof draft) => void;
  const pending = new Promise<typeof draft>((done) => { resolve = done; });
  const session = new AssistantSession();
  const importing = session.import("Soupe", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => pending });
  session.invalidate(); resolve(draft);
  assert.equal(await importing, null);
  assert.deepEqual(session.turns.map(({ role }) => role), ["user"]);
});

test("session Assistant : fermeture détruit la preview", async () => {
  const session = new AssistantSession();
  await session.import("Soupe", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => draft });
  session.closePreview();
  assert.equal(session.preview, null);
});

test("session Assistant : annulation interrompt sélection et génération texte", async () => {
  let signal: AbortSignal | undefined;
  const session = new AssistantSession();
  const pending = session.resolveText("un dîner", {
    resolve: async (_text, received) => {
      signal = received;
      return new Promise<never>(() => {});
    }
  });
  await Promise.resolve();
  session.cancel();
  assert.equal(signal?.aborted, true);
  void pending;
});

test("session Assistant : un conseil tardif après annulation n’ajoute ni preview ni tour Chef", async () => {
  let resolve!: (value: { kind: "advice" }) => void;
  const session = new AssistantSession();
  const pending = session.resolveText("Ma sauce est trop épaisse", { resolve: async () => new Promise((done) => { resolve = done; }) });
  session.invalidate();
  resolve({ kind: "advice" });
  assert.equal(await pending, null);
  assert.equal(session.preview, null);
  assert.deepEqual(session.turns.map(({ role }) => role), ["user"]);
});

test("session Assistant : le résultat conseil ne crée pas de recette ou preview", async () => {
  const session = new AssistantSession();
  const result = await session.resolveText("Ma sauce est trop épaisse", { resolve: async () => ({ kind: "advice" }) });
  assert.equal(result?.kind, "advice");
  assert.equal(session.preview, null);
  assert.equal(session.phase, "idle");
});

test("session Assistant : une demande libre progresse d'analyse à recherche puis création", async () => {
  const session = new AssistantSession();
  const phases: string[] = [];
  const result = await session.resolveText("un dîner", {
    resolve: async (_text, _signal, progress) => {
      phases.push(session.phase);
      progress("searching");
      phases.push(session.phase);
      progress("creating");
      phases.push(session.phase);
      return { kind: "draft", draft };
    }
  });
  assert.equal(result?.kind, "draft");
  assert.deepEqual(phases, ["analyzing", "searching", "creating"]);
  assert.equal(session.phase, "ready");
});

test("session Assistant : le draft issu d'un noCandidate ouvre une preview éphémère", async () => {
  const session = new AssistantSession();
  const photo = {} as File;
  const result = await session.resolveText("une soupe inédite", {
    resolve: async (_text, _signal, progress) => {
      progress("searching");
      progress("creating");
      return { kind: "draft", draft };
    }
  }, { hasImages: true, sourceFiles: [photo] });
  assert.equal(result?.kind, "draft");
  assert.equal(session.preview?.draft.title, "Soupe");
  assert.deepEqual(session.preview?.sourceFiles, [photo]);
  assert.equal(session.phase, "ready");
});

test("session Assistant : création annulée ou invalidée quitte immédiatement la réflexion", async () => {
  for (const endRequest of [(session: AssistantSession) => session.cancel(), (session: AssistantSession) => session.invalidate()]) {
    let resolve!: (value: { kind: "draft"; draft: typeof draft }) => void;
    const session = new AssistantSession();
    const pending = session.resolveText("une soupe inédite", {
      resolve: async (_text, _signal, progress) => {
        progress("searching");
        progress("creating");
        return new Promise((done) => { resolve = done; });
      }
    });
    await Promise.resolve();
    assert.equal(session.phase, "creating");
    endRequest(session);
    assert.equal(session.phase, "idle");
    resolve({ kind: "draft", draft });
    assert.equal(await pending, null);
    assert.equal(session.preview, null);
  }
});

test("session Assistant : fil volatile, deux précisions puis remise à zéro", () => {
  const session = new AssistantSession();
  session.beginConversation("salade d'automne");
  session.showClarification("Pour combien de personnes ?");
  session.beginConversation("pour deux");
  session.showClarification("Vous préférez sucré ou salé ?");
  assert.equal(session.clarificationCount, 2);
  assert.equal(session.turns.length, 4);
  session.cancel();
  assert.deepEqual(session.turns, []);
  assert.equal(session.question, null);
});

test("session Assistant : une candidate refusée reste exclue jusqu’à la fin de la séance", () => {
  const session = new AssistantSession();
  assert.equal(session.rejectCandidate("cahier-1"), true);
  assert.equal(session.rejectCandidate("cahier-1"), false);
  assert.equal(session.isCandidateRejected("cahier-1"), true);

  session.cancel();
  assert.equal(session.isCandidateRejected("cahier-1"), false);

  session.rejectCandidate("cahier-1");
  session.closePreview();
  assert.equal(session.isCandidateRejected("cahier-1"), false);
});

test("session Assistant : l’écartement conserve la carte dans le fil et ajoute la relance Chef", () => {
  const session = new AssistantSession();
  session.beginConversation("une soupe");
  session.addChefTurn("J’ai trouvé une recette dans votre Cahier.");
  assert.equal(session.rejectCandidate("cahier-1"), true);
  session.addChefTurn("D’accord, je garde cette piste de côté. Dites-moi ce qui vous conviendrait mieux.");
  assert.equal(session.isCandidateRejected("cahier-1"), true);
  assert.deepEqual(session.turns.map(({ role }) => role), ["user", "assistant", "assistant"]);
  assert.match(session.turns.at(-1)?.text ?? "", /garde cette piste de côté/);
});

test("session Assistant : la projection réseau borne le fil sans tronquer son affichage", () => {
  const longRecipe = "Saucisses pommes de terre poivron chèvre. ".repeat(53).slice(0, 2_059);
  const session = new AssistantSession();
  session.beginConversation(longRecipe);
  const projected = projectAssistantTurnsForNetwork(session.turns);
  assert.equal(session.turns[0].text, longRecipe);
  assert.equal(session.turns[0].text.length, 2_059);
  assert.equal(projected.length, 1);
  assert.equal(projected[0].text.length, 1_200);
  assert.equal(projected[0].role, "user");
});

test("session Assistant : la projection réseau ne coupe jamais un emoji à la frontière UTF-16", () => {
  const turn = `${"a".repeat(1_199)}🍲fin`;
  const [projected] = projectAssistantTurnsForNetwork([{ role: "user", text: turn }]);
  assert.equal(projected.text.length, 1_199);
  assert.doesNotMatch(projected.text, /[\uD800-\uDBFF]$/);
});

test("session Assistant : la projection réseau retient les cinq derniers tours dans leur ordre", () => {
  const turns = Array.from({ length: 6 }, (_, index) => ({
    role: index % 2 ? "assistant" as const : "user" as const,
    text: `${index}-${"x".repeat(1_300)}`
  }));
  const projected = projectAssistantTurnsForNetwork(turns);
  assert.deepEqual(projected.map(({ role }) => role), ["assistant", "user", "assistant", "user", "assistant"]);
  assert.deepEqual(projected.map(({ text }) => text.slice(0, 2)), ["1-", "2-", "3-", "4-", "5-"]);
  assert.ok(projected.every(({ text }) => text.length <= 1_200));
});

test("session Assistant : l’échec de sélection texte ne mentionne pas de photos", async () => {
  const session = new AssistantSession();
  await session.resolveText("recette sans image", { resolve: async () => { throw new Error("assistant_stage:decision"); } });
  assert.match(session.error ?? "", /choix de la meilleure piste/);
  assert.match(session.error ?? "", /Votre demande est conservée/);
  assert.doesNotMatch(session.error ?? "", /photos/i);
});

test("session Assistant : l’échec de sélection avec photos conserve leur copy", async () => {
  const session = new AssistantSession();
  await session.resolveText("recette jointe", { resolve: async () => { throw new Error("assistant_stage:decision"); } }, { hasImages: true });
  assert.match(session.error ?? "", /Vos photos et votre demande sont conservées/);
});

test("session Assistant : une erreur de proposition reste neutre et conserve la saisie appelante", async () => {
  const command = "un dîner végétarien";
  const session = new AssistantSession();
  await session.resolveText(command, { resolve: async () => { throw new Error("upstream details"); } });
  assert.equal(session.phase, "error");
  assert.match(session.error ?? "", /Je n’ai pas pu finaliser cette proposition/);
  assert.equal(command, "un dîner végétarien");
});

test("session Assistant : un échec vision se décrit sans dupliquer le tour lors d'un nouvel essai", async () => {
  const session = new AssistantSession();
  const adapter = { resolve: async () => { throw new AssistantImageRequestError("http", "12345678-1234-4234-8234-123456789abc", 503); } };
  await session.resolveText("mes quatre photos", adapter);
  assert.match(session.error ?? "", /momentanément indisponible/);
  assert.match(session.error ?? "", /12345678/);
  assert.equal(session.turns.length, 0);
  await session.resolveText("mes quatre photos", adapter);
  assert.equal(session.turns.length, 0);
});

test("session Assistant : fallback draft devient une prévisualisation ouvrable", async () => {
  const fallback = { ...draft, title: "Recette depuis texte", source: { type: "TEXT" as const, capturedAt: "2026-10-02" } };
  const session = new AssistantSession();
  const preview = await session.import("Texte source", null, {
    importImage: async () => fallback,
    importUrl: async () => fallback,
    importText: async () => fallback
  });
  assert.equal(session.phase, "ready");
  assert.equal(preview?.draft.title, "Recette depuis texte");
  assert.equal(preview?.source?.type, "TEXT");
});

test("session Assistant : erreur sans draft laisse la commande appelante intacte", async () => {
  const command = "Une recette encore modifiable";
  const session = new AssistantSession();
  const preview = await session.import(command, null, {
    importImage: async () => { throw new Error("échec"); },
    importUrl: async () => { throw new Error("échec"); },
    importText: async () => { throw new Error("échec"); }
  });
  assert.equal(preview, null);
  assert.equal(session.phase, "error");
  assert.match(session.error ?? "", /Impossible d’importer/);
  assert.equal(command, "Une recette encore modifiable");
  assert.equal(session.preview, null);
});

test("session Assistant : un nouvel import efface la preview précédente avant son issue", async () => {
  const session = new AssistantSession();
  await session.import("première", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => draft });
  let resolve!: (value: typeof draft) => void;
  const pending = new Promise<typeof draft>((done) => { resolve = done; });
  const retry = session.import("seconde", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => pending });
  assert.equal(session.preview, null);
  session.cancel();
  resolve(draft);
  assert.equal(await retry, null);
  assert.equal(session.preview, null);
});
