import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFraming,
  FRAMING,
  REFERENCE_ASPECT,
  COMPOSITION,
  BASE_SPHERE_RADIUS,
  HORIZON_HEIGHT_FRACTION,
} from "../src/core/framing.ts";

const ASPECTS = [REFERENCE_ASPECT, 1.6, 1.4, 1.2, 1.0];
const WIDE_ASPECTS = [2.0, 2.4, 4.0, 6.0];
const KEYS = ["near", "mid", "far"];

/** Screen fractions for one slot at one aspect, using the framing contract. */
function project(framing, key) {
  const slot = framing.slots[key];
  const depth = framing.cameraZ - slot.z;
  const tanHalf = Math.tan(framing.verticalFovRad / 2);
  const centreX = 0.5 + slot.x / (2 * depth * tanHalf * framing.aspect);
  const diameter = BASE_SPHERE_RADIUS / (depth * tanHalf);
  return { centreX, diameter, left: centreX - diameter / (2 * framing.aspect), right: centreX + diameter / (2 * framing.aspect) };
}

test("the reference aspect reproduces the shipped composition exactly", () => {
  assert.equal(FRAMING.aspect, REFERENCE_ASPECT);
  for (const key of KEYS) {
    const p = project(FRAMING, key);
    assert.ok(Math.abs(p.centreX - COMPOSITION[key].centerX) < 1e-9, `${key} centre`);
    assert.ok(Math.abs(p.diameter - COMPOSITION[key].diameter) < 1e-9, `${key} diameter`);
  }
});

test("every allowed aspect keeps the reference centre and diameter fractions", () => {
  for (const aspect of ASPECTS) {
    const framing = buildFraming(aspect);
    for (const key of KEYS) {
      const p = project(framing, key);
      assert.ok(Math.abs(p.centreX - COMPOSITION[key].centerX) < 1e-9, `${key} centre at ${aspect}`);
      assert.ok(Math.abs(p.diameter - COMPOSITION[key].diameter) < 1e-9, `${key} diameter at ${aspect}`);
    }
    // The camera, lens, horizon and depth are constant in V1.3.
    assert.equal(framing.cameraZ, FRAMING.cameraZ);
    assert.equal(framing.verticalFovRad, FRAMING.verticalFovRad);
    assert.equal(framing.pitchRad, FRAMING.pitchRad);
    assert.equal(framing.distances.near, FRAMING.distances.near);
  }
});

test("no sphere clips horizontally between 1:1 and the reference", () => {
  for (const aspect of [...ASPECTS, ...WIDE_ASPECTS]) {
    const framing = buildFraming(aspect);
    for (const key of KEYS) {
      const p = project(framing, key);
      assert.ok(p.left >= -1e-9, `${key} left edge at ${aspect}: ${p.left}`);
      assert.ok(p.right <= 1 + 1e-9, `${key} right edge at ${aspect}: ${p.right}`);
    }
  }
});

test("the horizon stays at the reference fraction of frame height", () => {
  assert.ok(Math.abs(HORIZON_HEIGHT_FRACTION * 227 - 125) < 1e-9);
  for (const aspect of ASPECTS) {
    const framing = buildFraming(aspect);
    // pitchForHorizon is independent of the aspect; assert the invariant.
    const implied = 0.5 + Math.tan(framing.pitchRad) / (2 * Math.tan(framing.verticalFovRad / 2));
    assert.ok(Math.abs(implied - HORIZON_HEIGHT_FRACTION) < 1e-9, `horizon at ${aspect}`);
  }
});

test("out-of-range or invalid aspects fall back to the reference", () => {
  for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(buildFraming(aspect).aspect, REFERENCE_ASPECT);
  }
});
