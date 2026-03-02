#!/usr/bin/env npx tsx
/**
 * Teste l'upload R2 en local.
 * Usage : npm run test:r2 (depuis la racine) ou depuis apps/bff
 */
import "../src/load-env.js";
import { testR2Upload } from "../src/image-cache.js";

const result = await testR2Upload();
if (result.ok) {
  console.log("✓ R2 upload OK — config et permissions valides");
  process.exit(0);
} else {
  console.error("✗ R2 upload failed:", result.error);
  process.exit(1);
}
