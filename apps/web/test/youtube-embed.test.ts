import assert from "node:assert/strict";
import test from "node:test";
import { buildYouTubeEmbedUrl } from "../src/utils/youtube-embed";

test("buildYouTubeEmbedUrl returns embed URL for watch URL", () => {
  const result = buildYouTubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(result, "https://www.youtube.com/embed/dQw4w9WgXcQ");
});

test("buildYouTubeEmbedUrl supports youtu.be short URLs", () => {
  const result = buildYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(result, "https://www.youtube.com/embed/dQw4w9WgXcQ");
});

test("buildYouTubeEmbedUrl supports watch URL with query params", () => {
  const result = buildYouTubeEmbedUrl(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxx&t=42"
  );
  assert.equal(result, "https://www.youtube.com/embed/dQw4w9WgXcQ");
});

test("buildYouTubeEmbedUrl supports embed URL", () => {
  const result = buildYouTubeEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(result, "https://www.youtube.com/embed/dQw4w9WgXcQ");
});

test("buildYouTubeEmbedUrl supports mobile host", () => {
  const result = buildYouTubeEmbedUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(result, "https://www.youtube.com/embed/dQw4w9WgXcQ");
});

test("buildYouTubeEmbedUrl returns undefined for non-youtube host", () => {
  const result = buildYouTubeEmbedUrl("https://example.com/watch?v=dQw4w9WgXcQ");
  assert.equal(result, undefined);
});

test("buildYouTubeEmbedUrl returns undefined for invalid URL", () => {
  const result = buildYouTubeEmbedUrl("not a url");
  assert.equal(result, undefined);
});

test("buildYouTubeEmbedUrl returns undefined for empty string", () => {
  const result = buildYouTubeEmbedUrl("");
  assert.equal(result, undefined);
});
