import test from "node:test";
import assert from "node:assert/strict";
import { eyeMetaFromResults, eyeMetaToJson, eyeMetaComplete, eyeScale, pickEyeJson, EYE_JSON_KEYS, posNum } from "../src/utils/eyeMeta.js";
import { reportPoseReference } from "../src/utils/pose.js";

test("legacy metadata survives a cache roundtrip with absent eye keys", () => {
    const legacy = { limbus_mm: "12", limbus_px: "600", axial_length: "26", acd: "4" };
    const oldCache = { ...legacy, ...Object.fromEntries(EYE_JSON_KEYS.map((key) => [key, ""])) };
    const patched = { ...oldCache, ...Object.fromEntries(EYE_JSON_KEYS.map((key) => [key, undefined])), ...pickEyeJson(legacy) };
    const eyes = eyeMetaFromResults(structuredClone(patched));
    assert.equal(eyes.perEye, false);
    assert.equal(eyes.os.al, "26");
    assert.equal(eyes.os.acd, "4");
    assert.equal(eyeScale(eyes.os), 0.02);
});

test("explicitly missing OS never inherits OD values, including after editing", () => {
    const data = { limbus_mm: "12", limbus_px: "600", limbus_mm_od: "12", limbus_px_od: "600" };
    const eyes = eyeMetaFromResults(data);
    for (const value of [eyes, eyeMetaFromResults(eyeMetaToJson(eyes))]) {
        assert.equal(value.perEye, true);
        assert.equal(eyeScale(value.od), 0.02);
        assert.equal(eyeScale(value.os), null);
        assert.equal(eyeMetaComplete(value), false);
    }
});

test("OD and OS retain independent scales and strict positive inputs", () => {
    const eyes = eyeMetaFromResults({ limbus_mm_od: 12, limbus_px_od: 600, limbus_mm_os: 12, limbus_px_os: 400 });
    assert.equal(eyeScale(eyes.od) * 100, 2);
    assert.equal(eyeScale(eyes.os) * 100, 3);
    for (const invalid of ["12abc", "Infinity", Infinity, NaN, 0, -1, "", " ", null, true, [12], {}]) {
        assert.equal(posNum(invalid), null);
    }
});

test("pitch restoration distinguishes legacy, software, and hardware references", () => {
    assert.deepEqual(reportPoseReference(null), { poseState: "absolute", poseRefPitch: 0 });
    assert.deepEqual(reportPoseReference({ applied: ["pitch", "roll"], pitch: "-8.3" }), { poseState: "relative", poseRefPitch: -8.3 });
    assert.deepEqual(reportPoseReference({ source: "board", applied: [], restore: ["pitch", "roll"], pitch: 0 }), { poseState: "relative", poseRefPitch: 0 });
    for (const ref of [
        { source: "board", applied: [] },
        { source: "board", applied: ["pitch"], pitch: -8 },
        { unknown: true, restore: ["pitch"], pitch: -8 },
        { source: "board", restore_unknown: true, restore: ["pitch"], pitch: -8 },
        ...[undefined, null, "", " ", Infinity, true, [], "12abc"].map((pitch) => ({ source: "board", restore: ["pitch"], pitch })),
    ]) {
        assert.deepEqual(reportPoseReference(ref), { poseState: "unknown", poseRefPitch: null });
    }
});
