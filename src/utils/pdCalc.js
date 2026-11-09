// PD 리포트 계산(순수 함수) — PDReport(R 방식)·PDReportWithTable(표 방식)에서 옮겨 왔다 (2026-11-04).
// IGazyServer4(안드로이드 네이티브)가 같은 결과를 내는지 parity 시험의 기준으로 쓴다. 규칙을 바꾸면 Kotlin calc/Angles.kt 도 같이.
import { interpolateEyeAngle } from "./EyeAngleCalculator";

// ★ R 방식 ★ sin θ = Δx / R. 변위(mm) → "각도° / PD 방향" 문자열. 계산 불가면 ""
export const calculatePdR = (points, axis, side, R) => {
    if (!points || points.length < 2 || points[0] == null || points[1] == null) {
        return "";
    }
    if (!(R > 0)) {
        return ""; // 회전반경을 못 만듦
    }
    if (!Number.isFinite(points[0]) || !Number.isFinite(points[1])) {
        return ""; // 구간 대표값이 없거나(미측정) NaN
    }

    const differenceMM = points[0] - points[1];

    // 변위(mm) 크기가 R 을 넘으면 기하적으로 성립하지 않는다 (검출 오류)
    const ratio = Math.abs(differenceMM) / R;
    if (ratio > 1) return "";
    const degrees = (Math.asin(ratio) * 180) / Math.PI;
    const pdValue = Math.tan(degrees * (Math.PI / 180)) * 100;

    let direction;
    if (axis === "x") {
        if (side === "OD") {
            if (differenceMM > 0) {
                direction = "EXO";
            } else {
                direction = "ESO";
            }
        } else {
            if (differenceMM > 0) {
                direction = "EXO";
            } else {
                direction = "ESO";
            }
        }
    } else {
        direction = "";
        // if (differenceMM > 0) {
        //     direction = "HYPO";
        // } else {
        //     direction = "HYPER";
        // }
    }

    return `${degrees.toFixed(1)}° / ${pdValue.toFixed(1)} ${direction}`;
};

// ★ 표 방식 ★ pitch 별 실측 룩업테이블에 Δx(mm)를 매칭. 방향 문구가 R 방식과 다르다(현행 그대로)
export const calculatePdTable = (points, axis, side, pitch) => {
    if (!points || points.length < 2 || points[0] == null || points[1] == null) {
        return "";
    }
    if (pitch === null || pitch === undefined || isNaN(pitch)) {
        return ""; // pitch 산출 불가(영점 미확인, 또는 구버전 데이터 + URL angle 없음)
    }
    if (!Number.isFinite(points[0]) || !Number.isFinite(points[1])) {
        return ""; // 구간 대표값이 없거나(미측정) NaN
    }

    const differenceMM = points[0] - points[1];

    // 변위(mm)를 실측 캘리브레이션 표에 그대로 매칭한다. 보정계수를 곱하지 않는다.
    // (근거 없이 남아 있던 CORRECTION_FACTOR 0.61 을 제거. 안구모형 블라인드 5회
    //  검증에서 보정 없이 RMS 0.22° 였고, 0.61을 곱하면 각도가 39% 작아진다.)
    const degrees = interpolateEyeAngle(differenceMM, pitch);
    const pdValue = Math.tan(degrees * (Math.PI / 180)) * 100;

    let direction;
    if (axis === "x") {
        if (side === "OD") {
            if (differenceMM > 0) {
                direction = "ESO";
            } else {
                direction = "EXO";
            }
        } else {
            if (differenceMM > 0) {
                direction = "ESO";
            } else {
                direction = "EXO";
            }
        }
    } else {
        if (differenceMM > 0) {
            direction = "HYPO";
        } else {
            direction = "HYPER";
        }
    }

    return `${degrees.toFixed(1)}° / ${pdValue.toFixed(1)} ${direction}`;
};

/**
 * 구간 [s, e] 의 OD 프레임 pitch 중앙값(정렬 후 floor(n/2) — 짝수면 위쪽). 영점 대비 상대값이면 poseRefPitch 를 더해 절대 pitch.
 * 영점 상태 unknown 이면 null (상대/절대를 알 수 없음).
 */
export const regionCamMedian = (odRaw, region, poseState, poseRefPitch) => {
    // 영점을 못 읽은 파일은 pitch 가 상대값인지 절대값인지 알 수 없다 → 표 계산을 하지 않는다
    if (poseState === "unknown") return null;
    if (!region?.indexRange) return null;
    const [s, e] = region.indexRange;
    const seg = odRaw
        .slice(s, e + 1)
        .map((f) => f?.pitch ?? f?.cam_angle ?? f?.cam_angel)
        // 숫자 또는 비어 있지 않은 숫자 문자열만. 문자열이 섞이면 아래 덧셈이 문자열 연결("-5.01")이 되므로 Number 로 바꾼다
        .filter((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== ""))
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
        // 영점 대비 상대 pitch → 절대 pitch (poseRefPitch 는 영점이 없으면 0)
        .map((v) => v + poseRefPitch);
    if (seg.length === 0) return null;
    const sorted = [...seg].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

/** 전체 대표 pitch = 구간 중앙값들의 평균. 없으면 레거시 angle, 그것도 없으면 null. unknown 이면 null */
export const overallCamOf = (regionCams, poseState, angle) =>
    poseState === "unknown"
        ? null
        : regionCams.length
          ? regionCams.reduce((s, n) => s + n, 0) / regionCams.length
          : angle !== "" && !isNaN(parseFloat(angle))
            ? parseFloat(angle)
            : null;

/** 두 구간 pitch 중 유효한 것의 평균, 없으면 overallCam */
export const avgCamOf = (a, b, overallCam) => {
    const vals = [a, b].filter((v) => v !== null && v !== undefined && !isNaN(v));
    if (vals.length === 0) return overallCam;
    return vals.reduce((s, n) => s + n, 0) / vals.length;
};
