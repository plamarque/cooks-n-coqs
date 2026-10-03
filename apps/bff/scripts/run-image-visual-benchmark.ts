import { readFile } from "node:fs/promises";
import * as path from "node:path";
import "../src/load-env.js";
import { assertBenchmarkOutputOutsideCache, corpusSha256, requireBenchmarkApiKey, runImageBenchmark, validateCorpus, validateModels } from "../src/image-benchmark.js";

function help(): void { console.log("Usage: npm run benchmark:images -w @cookies-et-coquilettes/bff -- --current-model <courant> --models <courant,candidat> [--corpus chemin] [--output dossier]\n\nCorpus et modèles explicites; sortie locale exclusive avec manifest.json et review.html, hors cache BFF/R2."); }
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { help(); process.exit(0); }
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const modelsValue = value("--models"); const current = value("--current-model");
if (!modelsValue || !current) { console.error("Erreur: --models et --current-model sont requis."); help(); process.exit(2); }
try {
  requireBenchmarkApiKey(process.env.OPENAI_API_KEY);
  const rawCorpus = await readFile(path.resolve(value("--corpus") ?? "benchmarks/image-visuals/corpus.json"), "utf8");
  const corpus = validateCorpus(JSON.parse(rawCorpus));
  const outputRoot = path.resolve(value("--output") ?? "benchmark-results");
  const generatedCache = path.resolve(process.env.GENERATED_IMAGE_CACHE_DIR?.trim() || ".cache/generated-images");
  assertBenchmarkOutputOutsideCache(outputRoot, generatedCache);
  const outputDir = path.join(outputRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`);
  const manifest = await runImageBenchmark(corpus, corpusSha256(rawCorpus), validateModels(modelsValue.split(","), current), outputDir);
  console.log(`Benchmark écrit dans ${outputDir}`);
  process.exit(manifest.attempts.some((attempt) => attempt.status === "failed") ? 1 : 0);
} catch (error) { console.error(error instanceof Error ? `Erreur: ${error.message}` : "Erreur de benchmark."); process.exit(2); }
