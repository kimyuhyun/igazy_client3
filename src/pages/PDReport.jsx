import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getTodayTime, getToday } from "../utils/common";
import LiveGraph from "../components/LiveGraph";
import A4Page from "../components/A4Page";
import ExamResultTable from "../components/ExamResultTable";
import { interpolateEyeAngle } from "../utils/EyeAngleCalculator";
import useManualPointStore from "../stores/useManualPointStore";
import AngleTwoTrack from "../components/AngleTwoTrack";

const EXAM_TABLES = [
    { title: "1st Exam", hoverColor: "blue", suffix: "1st" },
    { title: "2nd Exam", hoverColor: "green", suffix: "2nd" },
    { title: "3rd Exam", hoverColor: "purple", suffix: "3rd" },
    { title: "OD Manual Exam", hoverColor: "orange", suffix: "4th" },
    { title: "OS Manual Exam", hoverColor: "orange", suffix: "5th" },
];
const examTitle = (suffix) => EXAM_TABLES.find((e) => e.suffix === suffix)?.title ?? suffix;

// 변위(mm) → "각도° / PD 방향" 문자열. 컴포넌트 상태를 쓰지 않아 모듈 스코프에 둔다.
const calculatePD = (points, axis, side, pitch) => {
    if (!points || points.length < 2 || points[0] == null || points[1] == null) {
        return "";
    }
    if (pitch === null || pitch === undefined || isNaN(pitch)) {
        return ""; // pitch 산출 불가(구버전 데이터 + URL angle 없음)
    }

    const differenceMM = points[0] - points[1];

    // 변위(mm)를 실측 캘리브레이션 표에 그대로 매칭한다. 보정계수를 곱하지 않는다.
    // (근거 없이 남아 있던 CORRECTION_FACTOR 0.61 을 제거. 안구모형 블라인드 5회
    //  검증에서 보정 없이 RMS 0.22° 였고, 0.61을 곱하면 각도가 39% 작아진다.
    //  게다가 5차 시험에만 곱해져 같은 보고서 안에서 기준이 섞여 있었다.)
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

export default function PDReport() {
    const [searchParams] = useSearchParams();

    const patientNum = searchParams.get("patient_num");
    const patientName = searchParams.get("patient_name");
    const angle = searchParams.get("angle") || "";
    // const distance = searchParams.get("distance") || "";
    const limbusMM = searchParams.get("limbus_mm") || "";
    const limbusPX = searchParams.get("limbus_px") || "";
    const axialLength = searchParams.get("al") || "";
    const acd = searchParams.get("acd") || "";

    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);

    const [data, setData] = useState([]);

    // 계산식(AngleTwoTrack)에 쓸 시험. 2페이지 표를 클릭하면 바뀐다.
    const [selectedExam, setSelectedExam] = useState("1st");



    useEffect(() => {
        (async () => {
            const od = localStorage.getItem("ODResultsData");
            const os = localStorage.getItem("OSResultsData");

            const odRaw = od ? JSON.parse(od) : [];
            if (od && os) {
                setOdResults(odRaw);
                setOsResults(JSON.parse(os));
            }

            const storedData = localStorage.getItem("PDReportData");
            if (storedData) {
                const rawData = JSON.parse(storedData);

                if (!rawData || rawData.length < 4) {
                    console.error("PDReportData requires at least 4 items");
                    return;
                }

                // 6개 미만이면 빈 값으로 강제 채움
                const empty = { odXMedian: 0, osXMedian: 0, odYMedian: 0, osYMedian: 0 };
                const jsonData = [...rawData];
                while (jsonData.length < 6) jsonData.push(empty);

                const xaxis_od_1st = [jsonData[0].odXMedian, jsonData[1].odXMedian];
                const xaxis_os_1st = [jsonData[0].osXMedian, jsonData[1].osXMedian];
                const yaxis_od_1st = [jsonData[0].odYMedian, jsonData[1].odYMedian];
                const yaxis_os_1st = [jsonData[0].osYMedian, jsonData[1].osYMedian];

                const xaxis_od_2nd = [jsonData[2].odXMedian, jsonData[3].odXMedian];
                const xaxis_os_2nd = [jsonData[2].osXMedian, jsonData[3].osXMedian];
                const yaxis_od_2nd = [jsonData[2].odYMedian, jsonData[3].odYMedian];
                const yaxis_os_2nd = [jsonData[2].osYMedian, jsonData[3].osYMedian];

                const xaxis_od_3rd = [jsonData[4].odXMedian, jsonData[5].odXMedian];
                const xaxis_os_3rd = [jsonData[4].osXMedian, jsonData[5].osXMedian];
                const yaxis_od_3rd = [jsonData[4].odYMedian, jsonData[5].odYMedian];
                const yaxis_os_3rd = [jsonData[4].osYMedian, jsonData[5].osYMedian];

                // Store에서 매뉴얼 포인트 좌표값 가져오기
                const { src4th, dst4th, src5th, dst5th } = useManualPointStore.getState();

                // 4th Exam (OD Manual)
                let xaxis_od_4th = [];
                let xaxis_os_4th = [];
                let yaxis_od_4th = [];
                let yaxis_os_4th = [];
                if (src4th && dst4th) {
                    xaxis_od_4th = [src4th.odX, dst4th.odX];
                    xaxis_os_4th = [src4th.osX, dst4th.osX];
                    yaxis_od_4th = [src4th.odY, dst4th.odY];
                    yaxis_os_4th = [src4th.osY, dst4th.osY];
                }

                // 5th Exam (OS Manual)
                let xaxis_od_5th = [];
                let xaxis_os_5th = [];
                let yaxis_od_5th = [];
                let yaxis_os_5th = [];
                if (src5th && dst5th) {
                    xaxis_od_5th = [src5th.odX, dst5th.odX];
                    xaxis_os_5th = [src5th.osX, dst5th.osX];
                    yaxis_od_5th = [src5th.odY, dst5th.odY];
                    yaxis_os_5th = [src5th.osY, dst5th.osY];
                }

                /**
                 * ─── pitch 산출 구조 ───
                 * 측정 중 기기 자세(피칭)가 서서히 드리프트하므로, 시작 순간의 단일 값 대신
                 * 각 시험이 실제 측정된 구간의 pitch을 데이터에서 직접 산출한다.
                 *
                 * 1) regionCamMedian(구간): 구간의 indexRange[s,e]로 원본 od 프레임을 잘라
                 *    프레임별 pitch의 "중앙값"을 낸다. (중앙값 = 프레임 단위 튐에 강함)
                 *    필드명: 현재는 pitch. 구버전 파일 호환으로 cam_angle(라이브),
                 *    cam_angel(저장 파일, 서버 오타)도 함께 허용한다.
                 *
                 * 2) cam_1st/2nd/3rd (avgCam): 한 시험 = 연속 두 구간이므로,
                 *    두 구간 중앙값의 "평균"을 그 시험의 CALIB 테이블 조회 키로 쓴다.
                 *    (같은 싸이클 내 두 구간은 몇 초 차이라 pitch이 거의 같음 → 평균이 대표값)
                 *
                 * 3) overallCam: 6개 구간 중앙값 전체의 평균. 용도 3가지 —
                 *    - PATIENT INFORMATION의 Angle 표시
                 *    - 4·5차 수동 시험 계산 키 (수동 포인트는 특정 구간에 안 속하므로 전체 대표값)
                 *    - 구간 pitch이 비었을 때(avgCam)의 폴백
                 *
                 * 폴백: 구간 pitch이 전무한 구버전 데이터는 URL angle(레거시),
                 *       그것도 없으면 null → Angle "-" 표시, 해당 계산 생략.
                 */
                const regionCamMedian = (region) => {
                    if (!region?.indexRange) return null;
                    const [s, e] = region.indexRange;
                    const seg = odRaw
                        .slice(s, e + 1)
                        .map((f) => f?.pitch ?? f?.cam_angle ?? f?.cam_angel)
                        .filter((v) => v !== null && v !== undefined && !isNaN(v));
                    if (seg.length === 0) return null;
                    const sorted = [...seg].sort((a, b) => a - b);
                    return sorted[Math.floor(sorted.length / 2)];
                };

                // 전체 대표 각도 = 측정 구간들의 pitch 중앙값 평균 (리포트 표시 + 수동시험·폴백용).
                // 구간 데이터가 없는 구버전은 URL angle(레거시), 그것도 없으면 null.
                const regionCams = jsonData.map(regionCamMedian).filter((v) => v !== null && !isNaN(v));
                const overallCam = regionCams.length
                    ? regionCams.reduce((s, n) => s + n, 0) / regionCams.length
                    : (angle !== "" && !isNaN(parseFloat(angle)) ? parseFloat(angle) : null);

                const avgCam = (a, b) => {
                    const vals = [regionCamMedian(a), regionCamMedian(b)].filter(
                        (v) => v !== null && v !== undefined && !isNaN(v),
                    );
                    if (vals.length === 0) return overallCam;
                    return vals.reduce((s, n) => s + n, 0) / vals.length;
                };
                const cam_1st = avgCam(jsonData[0], jsonData[1]);
                const cam_2nd = avgCam(jsonData[2], jsonData[3]);
                const cam_3rd = avgCam(jsonData[4], jsonData[5]);

                // 계산식 표시용 원시 변위(mm) — 각 시험의 OD x축
                const dxmm = (pts) => (pts?.[0] != null && pts?.[1] != null ? pts[0] - pts[1] : null);

                const obj = {
                    dxmm_od_1st: dxmm(xaxis_od_1st),
                    dxmm_od_2nd: dxmm(xaxis_od_2nd),
                    dxmm_od_3rd: dxmm(xaxis_od_3rd),
                    dxmm_od_4th: dxmm(xaxis_od_4th),
                    dxmm_od_5th: dxmm(xaxis_od_5th),
                    xaxis_od_1st: calculatePD(xaxis_od_1st, "x", "OD", cam_1st),
                    xaxis_os_1st: calculatePD(xaxis_os_1st, "x", "OS", cam_1st),
                    yaxis_od_1st: calculatePD(yaxis_od_1st, "y", "OD", cam_1st),
                    yaxis_os_1st: calculatePD(yaxis_os_1st, "y", "OS", cam_1st),

                    xaxis_od_2nd: calculatePD(xaxis_od_2nd, "x", "OD", cam_2nd),
                    xaxis_os_2nd: calculatePD(xaxis_os_2nd, "x", "OS", cam_2nd),
                    yaxis_od_2nd: calculatePD(yaxis_od_2nd, "y", "OD", cam_2nd),
                    yaxis_os_2nd: calculatePD(yaxis_os_2nd, "y", "OS", cam_2nd),

                    xaxis_od_3rd: calculatePD(xaxis_od_3rd, "x", "OD", cam_3rd),
                    xaxis_os_3rd: calculatePD(xaxis_os_3rd, "x", "OS", cam_3rd),
                    yaxis_od_3rd: calculatePD(yaxis_od_3rd, "y", "OD", cam_3rd),
                    yaxis_os_3rd: calculatePD(yaxis_os_3rd, "y", "OS", cam_3rd),

                    xaxis_od_4th: calculatePD(xaxis_od_4th, "x", "OD", overallCam),
                    xaxis_os_4th: calculatePD(xaxis_os_4th, "x", "OS", overallCam),
                    yaxis_od_4th: calculatePD(yaxis_od_4th, "y", "OD", overallCam),
                    yaxis_os_4th: calculatePD(yaxis_os_4th, "y", "OS", overallCam),

                    xaxis_od_5th: calculatePD(xaxis_od_5th, "x", "OD", overallCam),
                    xaxis_os_5th: calculatePD(xaxis_os_5th, "x", "OS", overallCam),
                    yaxis_od_5th: calculatePD(yaxis_od_5th, "y", "OD", overallCam),
                    yaxis_os_5th: calculatePD(yaxis_os_5th, "y", "OS", overallCam),

                    // 각 시험 계산에 사용된 pitch (테이블 제목에 표시)
                    cam_1st: cam_1st,
                    cam_2nd: cam_2nd,
                    cam_3rd: cam_3rd,
                    cam_4th: overallCam,
                    cam_5th: overallCam,
                };
                setData(obj);
            }
        })();
        // 마운트 시 localStorage를 한 번만 읽는다. angle을 deps에 넣으면 URL이 바뀔 때마다 재계산된다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);



    return (
        <div className="bg-gray-400 print:bg-white p-4 print:p-0 relative">
            {/* 왼쪽 상단 컨트롤 패널 */}
            <div className="fixed top-4 left-4 z-50 print:hidden flex flex-col gap-2">
                
            </div>

            {/* <div className="space-y-4 print:space-y-0"> */}
            <div className="flex flex-row">
                <A4Page>
                    <div className="border-b-4 border-yellow-400 flex flex-row justify-between">
                        <div className="bg-yellow-400 px-4 py-2 font-bold">1</div>
                        <div className="flex items-end text-xs pb-1">{getTodayTime()}</div>
                    </div>

                    <div className="my-6 flex items-baseline justify-between border-b-2 border-gray-800 pb-2">
                        <h1 className="text-4xl font-bold text-gray-900">IGazy Report</h1>
                        <span className="text-sm text-gray-600">{getToday()}</span>
                    </div>

                    <table className="w-full border-collapse border-1 border-gray-400">
                        <tbody>
                            <tr>
                                <td colSpan={4} className="text-xl font-bold border-1 border-gray-300 py-2 text-black">
                                    PATIENT INFORMATION
                                </td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Patient Number
                                </th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">
                                    {patientNum || "-"}
                                </td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Patient Name
                                </th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">
                                    {patientName || "-"}
                                </td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    White to White
                                </th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">
                                    {limbusPX && limbusMM
                                        ? `${parseFloat(limbusMM).toFixed(2)}mm = ${parseFloat(limbusPX).toFixed(1)}px`
                                        : "-"}
                                </td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Pitch
                                </th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">
                                    {(() => {
                                        // 시험별 pitch 각도만 순서대로 표시 (4·5차는 수동 시험 결과가 있을 때만)
                                        const items = [
                                            data.cam_1st,
                                            data.cam_2nd,
                                            data.cam_3rd,
                                            data.xaxis_od_4th ? data.cam_4th : null,
                                            data.xaxis_od_5th ? data.cam_5th : null,
                                        ].filter((v) => v !== null && v !== undefined && !isNaN(v));
                                        if (items.length === 0) return "-";
                                        return items.map((v) => `${Number(v).toFixed(1)}°`).join(" · ");
                                    })()}
                                </td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Axial Length (AL)
                                </th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">
                                    {axialLength ? `${parseFloat(axialLength).toFixed(2)}mm` : "-"}
                                </td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    ACD
                                </th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">
                                    {acd ? `${parseFloat(acd).toFixed(2)}mm` : "-"}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* 두 방식 비교 — 2페이지에서 고른 시험의 OD x축 기준 */}
                    {data[`dxmm_od_${selectedExam}`] != null && (
                        <AngleTwoTrack
                            className="mt-4"
                            title={`측정 각도 — 두 방식 비교 (${examTitle(selectedExam)} · OD x축)`}
                            deltaMM={data[`dxmm_od_${selectedExam}`]}
                            pitch={data[`cam_${selectedExam}`]}
                            axialLength={axialLength}
                            acd={acd}
                        />
                    )}

                    <div className="border-y border-yellow-400 py-10 mt-6">
                        <LiveGraph odResults={odResults} osResults={osResults} currentFrameRef={null} />
                    </div>
                </A4Page>

                <A4Page className="flex flex-col justify-between gap-8">
                    <div className="border-b-4 border-yellow-400 flex flex-row justify-between">
                        <div className="bg-yellow-400 px-4 py-2 font-bold">2</div>
                        <div className="flex items-end text-xs pb-1">{getTodayTime()}</div>
                    </div>

                    {EXAM_TABLES.map((exam) => (
                        <ExamResultTable
                            key={exam.suffix}
                            title={exam.title}
                            hoverColor={exam.hoverColor}
                            data={data}
                            suffix={exam.suffix}
                            selected={selectedExam === exam.suffix}
                            // 변위가 없는 시험(수동 미실시 등)은 계산식을 만들 수 없으니 선택도 막는다
                            onSelect={
                                data[`dxmm_od_${exam.suffix}`] != null
                                    ? () => setSelectedExam(exam.suffix)
                                    : undefined
                            }
                        />
                    ))}
                </A4Page>
            </div>
        </div>
    );
}
