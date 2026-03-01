import assert from "node:assert/strict";
import test from "node:test";
import { extractStepTimerDurationSeconds } from "../src/utils/step-timer";

test("extractStepTimerDurationSeconds returns undefined for empty step", () => {
  assert.equal(extractStepTimerDurationSeconds(""), undefined);
  assert.equal(extractStepTimerDurationSeconds(undefined), undefined);
});

test("extractStepTimerDurationSeconds extracts minutes", () => {
  const result = extractStepTimerDurationSeconds(
    "Faites cuire les coquillettes pendant 4 minutes puis égouttez-les."
  );
  assert.equal(result, 240);
});

test("extractStepTimerDurationSeconds keeps first duration when multiple are present", () => {
  const result = extractStepTimerDurationSeconds(
    "Cuire 4 minutes puis poursuivre la cuisson pendant 2 minutes supplémentaires."
  );
  assert.equal(result, 240);
});

test("extractStepTimerDurationSeconds extracts compact hour and minute format", () => {
  const result = extractStepTimerDurationSeconds("Laissez mijoter 1h30 à feu doux.");
  assert.equal(result, 5400);
});

test("extractStepTimerDurationSeconds extracts hour minute and seconds", () => {
  const result = extractStepTimerDurationSeconds("Repos 1 heure 5 min 30 sec.");
  assert.equal(result, 3930);
});

test("extractStepTimerDurationSeconds extracts seconds", () => {
  const result = extractStepTimerDurationSeconds("Remuez 45 sec avant de servir.");
  assert.equal(result, 45);
});

test("extractStepTimerDurationSeconds extracts trailing range duration with explicit unit", () => {
  const result = extractStepTimerDurationSeconds("Enfournez 20 à 25 minutes.");
  assert.equal(result, 1500);
});

test("extractStepTimerDurationSeconds returns undefined when no explicit duration exists", () => {
  const result = extractStepTimerDurationSeconds("Mélangez bien et assaisonnez.");
  assert.equal(result, undefined);
});
