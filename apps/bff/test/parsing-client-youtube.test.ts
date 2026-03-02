import assert from "node:assert/strict";
import test from "node:test";
import {
  isYouTubeUrl,
  extractYouTubeVideoId
} from "../src/youtube-utils.js";

test("isYouTubeUrl returns true for youtube.com", () => {
  assert.equal(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYouTubeUrl("https://youtube.com/watch?v=abc12345678"), true);
});

test("isYouTubeUrl returns true for youtu.be", () => {
  assert.equal(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ"), true);
});

test("isYouTubeUrl returns true for m.youtube.com", () => {
  assert.equal(isYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), true);
});

test("isYouTubeUrl returns false for non-youtube hosts", () => {
  assert.equal(isYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), false);
  assert.equal(isYouTubeUrl("https://www.instagram.com/p/abc/"), false);
});

test("isYouTubeUrl returns false for invalid URL", () => {
  assert.equal(isYouTubeUrl("not a url"), false);
});

test("extractYouTubeVideoId extracts from watch URL", () => {
  assert.equal(
    extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractYouTubeVideoId extracts from youtu.be", () => {
  assert.equal(
    extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractYouTubeVideoId extracts from embed URL", () => {
  assert.equal(
    extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractYouTubeVideoId extracts from v path", () => {
  assert.equal(
    extractYouTubeVideoId("https://www.youtube.com/v/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractYouTubeVideoId returns undefined for non-youtube", () => {
  assert.equal(
    extractYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ"),
    undefined
  );
});
