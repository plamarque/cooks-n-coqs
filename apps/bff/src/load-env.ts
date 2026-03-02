/**
 * Charge dotenv en premier, avant tout autre module qui lit process.env à l'import.
 * Doit être importé en tête de server.ts.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPathFromDir = path.resolve(__dirname, "..", "..", "..", ".env");
const envPathFromCwd = path.resolve(process.cwd(), ".env");

let envResult = config({ path: envPathFromDir });
let envPath = envPathFromDir;
if (envResult.error) {
  envPath = envPathFromCwd;
  envResult = config({ path: envPathFromCwd });
}

export { envPath, envResult };
