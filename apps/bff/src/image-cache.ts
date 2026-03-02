import { createHash, createHmac } from "node:crypto";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { Request } from "express";
import type {
  GenerateCookingStepImageInput,
  GenerateIngredientImageInput,
  GenerateRecipeImageInput
} from "./image-generator.js";

interface CachedImageMetadata {
  mimeType: string;
  createdAt: string;
}

export interface CachedImage {
  key: string;
  mimeType: string;
  buffer: Buffer;
}

interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  prefix: string;
}

const CACHE_VERSION = "v1";
const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), ".cache", "generated-images");
const CACHE_DIR = process.env.GENERATED_IMAGE_CACHE_DIR?.trim() || DEFAULT_CACHE_DIR;
const PUBLIC_BASE_URL = process.env.GENERATED_IMAGE_BASE_URL?.trim();
const VALID_KEY = /^[a-z0-9-]{20,120}$/;

const inFlightByKey = new Map<string, Promise<string | undefined>>();
const objectStorageConfig = loadObjectStorageConfig();

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Buffer(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function keyFromPayload(type: string, payload: unknown): string {
  return `${type}-${sha256(`${CACHE_VERSION}:${JSON.stringify(payload)}`)}`;
}

function imagePathForKey(key: string): string {
  return path.join(CACHE_DIR, `${key}.bin`);
}

function metadataPathForKey(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function isValidCacheKey(key: string): boolean {
  return VALID_KEY.test(key);
}

function objectKeyForImage(key: string): string {
  if (!objectStorageConfig?.prefix) {
    return `${key}.bin`;
  }

  return `${objectStorageConfig.prefix}/${key}.bin`;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUri(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }

  return `https://${trimmed.replace(/\/+$/, "")}`;
}

function loadObjectStorageConfig(): ObjectStorageConfig | undefined {
  const endpoint = normalizeEndpoint(process.env.GENERATED_IMAGE_S3_ENDPOINT ?? "");
  const bucket = process.env.GENERATED_IMAGE_S3_BUCKET?.trim() ?? "";
  const accessKeyId = process.env.GENERATED_IMAGE_S3_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.GENERATED_IMAGE_S3_SECRET_ACCESS_KEY?.trim() ?? "";
  const region = process.env.GENERATED_IMAGE_S3_REGION?.trim() || "auto";
  const sessionToken = process.env.GENERATED_IMAGE_S3_SESSION_TOKEN?.trim();
  const prefix = (process.env.GENERATED_IMAGE_S3_PREFIX?.trim() || "generated-images").replace(
    /^\/+|\/+$/g,
    ""
  );

  const values = [endpoint, bucket, accessKeyId, secretAccessKey];
  const enabledValues = values.filter(Boolean).length;
  if (enabledValues === 0) {
    return undefined;
  }

  if (enabledValues !== values.length) {
    // eslint-disable-next-line no-console
    console.warn(
      "Generated image object storage disabled: set GENERATED_IMAGE_S3_ENDPOINT, GENERATED_IMAGE_S3_BUCKET, GENERATED_IMAGE_S3_ACCESS_KEY_ID and GENERATED_IMAGE_S3_SECRET_ACCESS_KEY"
    );
    return undefined;
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    prefix
  };
}

function buildObjectStorageUrl(config: ObjectStorageConfig, objectKey: string): URL {
  const base = config.endpoint.endsWith("/") ? config.endpoint : `${config.endpoint}/`;
  return new URL(`${encodeRfc3986(config.bucket)}/${objectKey.split("/").map(encodeRfc3986).join("/")}`, base);
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const kDate = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update("s3").digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
}

async function signedObjectStorageRequest(options: {
  method: "GET" | "PUT" | "DELETE";
  objectKey: string;
  body?: Buffer;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<Response | undefined> {
  if (!objectStorageConfig) {
    return undefined;
  }

  const timeoutMs = options.timeoutMs ?? 15_000;
  const url = buildObjectStorageUrl(objectStorageConfig, options.objectKey);
  const now = new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const payloadHash = sha256Buffer(options.body ?? "");

  const allHeaders: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(options.headers ?? {})
  };

  if (objectStorageConfig.sessionToken) {
    allHeaders["x-amz-security-token"] = objectStorageConfig.sessionToken;
  }

  const sortedHeaderEntries = Object.entries(allHeaders)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim()] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  const canonicalHeaders = `${sortedHeaderEntries.map(([k, v]) => `${k}:${v}`).join("\n")}\n`;
  const signedHeaders = sortedHeaderEntries.map(([k]) => k).join(";");
  const canonicalRequest = [
    options.method,
    canonicalUri(url.pathname),
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/${objectStorageConfig.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Buffer(canonicalRequest)
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(objectStorageConfig.secretAccessKey, dateStamp, objectStorageConfig.region)
  )
    .update(stringToSign)
    .digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${objectStorageConfig.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers();
  for (const [key, value] of sortedHeaderEntries) {
    headers.set(key, value);
  }
  headers.set("authorization", authorization);

  try {
    return await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? new Uint8Array(options.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Generated image object storage request failed", error);
    return undefined;
  }
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export interface ImageCacheKeyOptions {
  model: string;
  quality: string;
}

export function buildRecipeImageCacheKey(
  input: GenerateRecipeImageInput,
  options?: ImageCacheKeyOptions
): string {
  const payload: Record<string, unknown> = {
    title: normalizeText(input.title),
    ingredients: input.ingredients.map((item) => normalizeText(item.label)).filter(Boolean).slice(0, 20),
    steps: input.steps.map((item) => normalizeText(item.text)).filter(Boolean).slice(0, 20)
  };
  if (options?.model) payload.model = options.model;
  if (options?.quality) payload.quality = options.quality;
  return keyFromPayload("recipe", payload);
}

export function buildIngredientImageCacheKey(
  input: GenerateIngredientImageInput,
  options?: ImageCacheKeyOptions
): string {
  const payload: Record<string, unknown> = {
    label: normalizeText(input.label)
  };
  if (options?.model) payload.model = options.model;
  if (options?.quality) payload.quality = options.quality;
  return keyFromPayload("ingredient", payload);
}

export function buildCookingStepImageCacheKey(
  input: GenerateCookingStepImageInput,
  options?: ImageCacheKeyOptions
): string {
  const payload: Record<string, unknown> = {
    stepText: normalizeText(input.stepText)
  };
  if (options?.model) payload.model = options.model;
  if (options?.quality) payload.quality = options.quality;
  return keyFromPayload("cooking-step", payload);
}

export function buildCachedImageUrl(req: Request, key: string): string {
  if (PUBLIC_BASE_URL) {
    const base = PUBLIC_BASE_URL.replace(/\/+$/, "");
    return `${base}/api/generated-images/${key}`;
  }

  return `${req.protocol}://${req.get("host")}/api/generated-images/${key}`;
}

export function describeGeneratedImageStorage(): string {
  if (!objectStorageConfig) {
    return `filesystem:${CACHE_DIR}`;
  }

  return `filesystem:${CACHE_DIR} + object:${objectStorageConfig.endpoint}/${objectStorageConfig.bucket}/${objectStorageConfig.prefix}`;
}

async function readCachedImageByKeyFromFilesystem(key: string): Promise<CachedImage | undefined> {
  const imagePath = imagePathForKey(key);
  const metadataPath = metadataPathForKey(key);

  try {
    const [buffer, metadataRaw] = await Promise.all([
      fs.readFile(imagePath),
      fs.readFile(metadataPath, "utf-8")
    ]);
    const metadata = JSON.parse(metadataRaw) as CachedImageMetadata;
    if (!metadata.mimeType?.startsWith("image/")) {
      return undefined;
    }

    return { key, mimeType: metadata.mimeType, buffer };
  } catch {
    return undefined;
  }
}

async function readCachedImageByKeyFromObjectStorage(key: string): Promise<CachedImage | undefined> {
  const response = await signedObjectStorageRequest({
    method: "GET",
    objectKey: objectKeyForImage(key)
  });

  if (!response || response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.warn("Generated image object storage read failed", response.status);
    return undefined;
  }

  const mimeType = response.headers.get("content-type") || "";
  if (!mimeType.startsWith("image/")) {
    return undefined;
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    key,
    mimeType,
    buffer: Buffer.from(arrayBuffer)
  };
}

export async function getCachedImageByKey(key: string): Promise<CachedImage | undefined> {
  if (!isValidCacheKey(key)) {
    return undefined;
  }

  const localImage = await readCachedImageByKeyFromFilesystem(key);
  if (localImage) {
    return localImage;
  }

  const objectImage = await readCachedImageByKeyFromObjectStorage(key);
  if (objectImage) {
    await storeCachedImageToFilesystem(key, objectImage.buffer, objectImage.mimeType).catch(() => {
      // Ignore local mirror failure; object storage already has the source of truth.
    });
  }

  return objectImage;
}

async function storeCachedImageToFilesystem(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  await ensureCacheDir();
  const imagePath = imagePathForKey(key);
  const metadataPath = metadataPathForKey(key);
  const metadata: CachedImageMetadata = {
    mimeType,
    createdAt: new Date().toISOString()
  };

  await Promise.all([
    fs.writeFile(imagePath, buffer),
    fs.writeFile(metadataPath, JSON.stringify(metadata))
  ]);
}

async function storeCachedImageToObjectStorage(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  if (!objectStorageConfig) {
    return;
  }

  const response = await signedObjectStorageRequest({
    method: "PUT",
    objectKey: objectKeyForImage(key),
    body: buffer,
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": mimeType,
      "x-amz-meta-created-at": new Date().toISOString()
    }
  });

  if (!response || !response.ok) {
    const status = response?.status ?? "network";
    let detail = "";
    try {
      if (response?.ok === false && response.body) {
        const body = await response.text();
        if (body) detail = ` | ${body.slice(0, 200)}`;
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Object storage PUT failed (${status})${detail}`);
  }
}

async function storeCachedImage(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  const operations: Array<Promise<void>> = [storeCachedImageToFilesystem(key, buffer, mimeType)];
  if (objectStorageConfig) {
    operations.push(storeCachedImageToObjectStorage(key, buffer, mimeType));
  }

  const results = await Promise.allSettled(operations);
  const allFailed = results.every((result) => result.status === "rejected");
  if (allFailed) {
    throw new Error("Failed to store generated image in every configured cache backend");
  }

  for (const result of results) {
    if (result.status === "rejected") {
      // eslint-disable-next-line no-console
      console.warn("Generated image cache backend write failed", result.reason);
    }
  }
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return undefined;
    }
    const mimeType = response.headers.get("content-type") || "";
    if (!mimeType.startsWith("image/")) {
      return undefined;
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType
    };
  } catch {
    return undefined;
  }
}

async function deleteCachedImageByKeyFromFilesystem(key: string): Promise<boolean> {
  const imagePath = imagePathForKey(key);
  const metadataPath = metadataPathForKey(key);

  const [imageDeleted, metadataDeleted] = await Promise.all([
    fs.unlink(imagePath).then(() => true).catch(() => false),
    fs.unlink(metadataPath).then(() => true).catch(() => false)
  ]);

  return imageDeleted || metadataDeleted;
}

async function deleteCachedImageByKeyFromObjectStorage(key: string): Promise<boolean> {
  if (!objectStorageConfig) {
    return false;
  }

  const response = await signedObjectStorageRequest({
    method: "DELETE",
    objectKey: objectKeyForImage(key)
  });

  if (!response || response.status === 404) {
    return false;
  }

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.warn("Generated image object storage delete failed", response.status);
    return false;
  }

  return true;
}

export async function deleteCachedImageByKey(key: string): Promise<boolean> {
  if (!isValidCacheKey(key)) {
    return false;
  }

  const [localDeleted, objectDeleted] = await Promise.all([
    deleteCachedImageByKeyFromFilesystem(key),
    deleteCachedImageByKeyFromObjectStorage(key)
  ]);

  return localDeleted || objectDeleted;
}

/** Test minimal : envoie un petit fichier dans R2 pour valider config et permissions. */
export async function testR2Upload(): Promise<{ ok: boolean; error?: string }> {
  if (!objectStorageConfig) {
    return { ok: false, error: "Object storage not configured (missing env vars)" };
  }

  const testKey = "test-r2-upload-12345678901234567890123456789012";
  const minimalPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  try {
    await storeCachedImageToObjectStorage(testKey, minimalPng, "image/png");
    await deleteCachedImageByKeyFromObjectStorage(testKey);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function resolveCachedImageUrl(
  key: string,
  req: Request,
  generateImageUrl: () => Promise<string | undefined>
): Promise<string | undefined> {
  const existing = await getCachedImageByKey(key);
  if (existing) {
    return buildCachedImageUrl(req, key);
  }

  const currentGeneration = inFlightByKey.get(key);
  if (currentGeneration) {
    return currentGeneration;
  }

  const generation = (async () => {
    const remoteUrl = await generateImageUrl();
    if (!remoteUrl) {
      return undefined;
    }

    const image = await fetchImageBuffer(remoteUrl);
    if (!image) {
      return undefined;
    }

    await storeCachedImage(key, image.buffer, image.mimeType);
    return buildCachedImageUrl(req, key);
  })().finally(() => {
    inFlightByKey.delete(key);
  });

  inFlightByKey.set(key, generation);
  return generation;
}
