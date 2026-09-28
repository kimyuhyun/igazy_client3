#!/usr/bin/env node
/**
 * X축 캘리브레이션 JSON(여러 camAngle 세트)에서 안구각도별 "중앙값" 단일 테이블 생성.
 *
 * 배경: 실측 결과 camAngle 0~-8° 범위에서 실제 각도 의존성(~1.5%)이
 * 세션 간 측정 노이즈(±3~11%)보다 작아서, 세트별 보간 대신
 * 세트들의 중앙값 단일 테이블이 더 정확하다 (중앙값 = 세션 스케일 편향·이상치 자동 제거).
 *
 * 사용법:
 *   node eyectrl_control/make_median_table.mjs <x_axis_calibration_data.json 경로>
 *
 * 출력: EyeAngleCalculator.js의 CALIB_TABLES에 붙여 넣을 코드 블록.
 * 재측정 후 뷰어에서 "JSON 다운로드" → 이 스크립트 재실행 → 출력 붙여넣기.
 */
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
    console.error("사용법: node make_median_table.mjs <calibration_json>");
    process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path, "utf8"));
const cams = Object.keys(raw).filter((k) => k !== "_details");
if (cams.length === 0) {
    console.error("camAngle 세트가 없습니다.");
    process.exit(1);
}

const angles = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
const median = {};
const spread = {};
for (const a of angles) {
    const vals = cams
        .map((c) => raw[c]?.[a])
        .filter((v) => v !== null && v !== undefined && !isNaN(v))
        .sort((x, y) => x - y);
    if (vals.length === 0) {
        console.error(`경고: ${a}° 값이 없는 세트만 있음`);
        continue;
    }
    const n = vals.length;
    const m = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    median[a] = Math.abs(m); // CALIB_TABLES는 절대값(mm) 규약
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    spread[a] = ((sd / Math.abs(mean)) * 100).toFixed(1);
}

console.log(`세트 ${cams.length}개 (camAngle: ${cams.join(", ")})`);
console.log("각도별 세트 간 산포(%):", JSON.stringify(spread));
console.log("\n=== EyeAngleCalculator.js CALIB_TABLES에 붙여넣기 ===\n");
console.log("const CALIB_TABLES = {");
console.log(`    // ${cams.length}개 세트(camAngle ${cams.join("/")})의 안구각도별 중앙값 (${new Date().toISOString().slice(0, 10)} 생성)`);
console.log("    0: {");
for (const a of angles) {
    console.log(`        ${a}: ${median[a].toFixed(3)},`);
}
console.log("    },");
console.log("};");
