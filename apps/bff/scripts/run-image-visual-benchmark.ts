import { readFile } from "node:fs/promises";
import * as path from "node:path";
import "../src/load-env.js";
import { FLARE_MODEL, FLUX_SCHNELL_MODEL, MINI_MODEL, assertBenchmarkOutputOutsideCache, corpusSha256, requireBenchmarkApiKey, requireReplicateApiToken, runImageBenchmark, validateCorpus } from "../src/image-benchmark.js";

function help(): void { console.log(`Usage: npm run benchmark:images -w @cookies-et-coquilettes/bff -- [--corpus chemin] [--output dossier]\n\nRun fixe de 30 essais : 9 ${MINI_MODEL}, 9 ${FLARE_MODEL}, 9 ${FLUX_SCHNELL_MODEL} au profil production carré ~1 MP, puis 3 ingrédients Flare 816x816. Artefacts locaux hors cache BFF/R2; coûts estimés non facturés.`); }
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { help(); process.exit(0); }
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
if (args.includes("--models") || args.includes("--current-model")) { console.error("Erreur: le protocole décisionnel Mini, Flare et FLUX Schnell est fixe."); help(); process.exit(2); }
try {
  requireBenchmarkApiKey(process.env.OPENAI_API_KEY);
  requireReplicateApiToken(process.env.REPLICATE_API_TOKEN);
  const rawCorpus = await readFile(path.resolve(value("--corpus") ?? "benchmarks/image-visuals/corpus.json"), "utf8");
  const corpus = validateCorpus(JSON.parse(rawCorpus));
  const outputRoot = path.resolve(value("--output") ?? "benchmark-results");
  const generatedCache = path.resolve(process.env.GENERATED_IMAGE_CACHE_DIR?.trim() || ".cache/generated-images");
  assertBenchmarkOutputOutsideCache(outputRoot, generatedCache);
  const outputDir = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`);
  const manifest = await runImageBenchmark(corpus, corpusSha256(rawCorpus), [MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL], outputDir);
  console.log(`Benchmark écrit dans ${outputDir}`);
  process.exit(manifest.attempts.some((attempt) => attempt.status === "failed") ? 1 : 0);
} catch (error) { console.error(error instanceof Error ? `Erreur: ${error.message}` : "Erreur de benchmark."); process.exit(2); }
