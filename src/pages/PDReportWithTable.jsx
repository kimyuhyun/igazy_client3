import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getTodayTime, getToday } from "../utils/common";
import LiveGraph from "../components/LiveGraph";
import A4Page from "../components/A4Page";
import ExamResultTable from "../components/ExamResultTable";
import useManualPointStore from "../stores/useManualPointStore";
import AngleTwoTrack from "../components/AngleTwoTrack";
import { calculatePdTable, regionCamMedian as regionCamMedianOf, overallCamOf, avgCamOf } from "../utils/pdCalc";

const EXAM_TABLES = [
    { title: "1st Exam", hoverColor: "blue", suffix: "1st" },
    { title: "2nd Exam", hoverColor: "green", suffix: "2nd" },
    { title: "3rd Exam", hoverColor: "purple", suffix: "3rd" },
    { title: "OD Manual Exam", hoverColor: "orange", suffix: "4th" },
    { title: "OS Manual Exam", hoverColor: "orange", suffix: "5th" },
];
const examTitle = (suffix) => EXAM_TABLES.find((e) => e.suffix === suffix)?.title ?? suffix;

// 변위(mm) → "각도° / PD 방향" 문자열. 컴포넌트 상태를 쓰지 않아 모듈 스코프에 둔다.
//
// ★ 표 방식 리포트 (PDReportWithTable) ★
// pitch 별 실측 룩업테이블(EyeAngleCalculator)에 Δx(mm)를 매칭한다. 2026-10-23 이전의 기본 리포트와 같은 계산이다.
// R 방식(AL·ACD) 리포트는 PDReport.jsx. 오후에 프리즘 결과지가 오면 두 리포트를 비교한다.
const calculatePD = calculatePdTable;

export default function PDReportWithTable() {
    const [searchParams] = useSearchParams();

    const patientNum = searchParams.get("patient_num");
    const patientName = searchParams.get("patient_name");
    const angle = searchParams.get("angle") || "";
    // const distance = searchParams.get("distance") || "";
    const limbusMM = searchParams.get("limbus_mm") || "";
    const limbusPX = searchParams.get("limbus_px") || "";
    // 자세 영점 상태와 기준 pitch 는 리포트 묶음에서 읽는다 (아래 useEffect). 화면 표시용 state.
    const [poseInfo, setPoseInfo] = useState({ state: "absolute", refPitch: 0 });
    const [loadError, setLoadError] = useState("");
    // 눈별 윤부 (헤더 표시용). Δmm 자체는 LiveGraph 가 눈별 배율로 이미 환산해 묶음에 담는다.
    const [eyesInfo, setEyesInfo] = useState(null);

    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);

    const [data, setData] = useState([]);

    // 계산식(AngleTwoTrack)에 쓸 시험. 2페이지 표를 클릭하면 바뀐다.
    const [selectedExam, setSelectedExam] = useState("1st");

    useEffect(() => {
        (async () => {
            // 리포트 데이터는 rid 별 키(PDReport:{rid})에서 읽는다. 리포트를 여러 개 열어 두고 새로고침해도
            // 다른 리포트의 데이터와 섞이지 않는다 (Codex review-K). rid 가 없는 옛 URL 은 고정 키로 폴백.
            // 리포트 묶음(PDReport:{rid})에서 입력을 읽는다. rid 가 있는데 묶음이 없으면(만료·삭제) 다른 녹화의
            // 고정 키로 조용히 넘어가지 않고 중단한다 (Codex review-M). 고정 키 폴백은 rid 없는 옛 URL 에만.
            const rid = searchParams.get("rid");
            let bundle = null;
            if (rid) {
                try {
                    bundle = JSON.parse(localStorage.getItem(`PDReport:${rid}`) || "null");
                } catch (e) {
                    console.error("PDReportWithTable bundle parse error:", e);
                }
                if (!bundle) {
                    setLoadError(
                        "이 리포트의 데이터가 브라우저에 남아 있지 않습니다. 측정 화면에서 결과보기(표)를 다시 눌러 주세요.",
                    );
                    return;
                }
            } else {
                const od0 = localStorage.getItem("ODResultsData");
                const os0 = localStorage.getItem("OSResultsData");
                const data0 = localStorage.getItem("PDReportData");
                bundle = {
                    od: od0 ? JSON.parse(od0) : [],
                    os: os0 ? JSON.parse(os0) : [],
                    data: data0 ? JSON.parse(data0) : null,
                };
            }

            // 자세 영점 상태. 묶음에 없으면(옛 URL) URL 의 pose_ref_pitch 로 폴백.
            //   relative: 프레임 pitch = 절대값 − poseRefPitch → 복원해서 쓴다
            //   absolute: 영점 없는 파일, 프레임 값이 곧 절대값
            //   unknown : 영점을 못 읽음 → pitch 를 믿을 수 없으니 표 계산을 하지 않는다
            const urlRef = parseFloat(searchParams.get("pose_ref_pitch") ?? "");
            const poseState = bundle.poseState ?? (Number.isFinite(urlRef) ? "relative" : "absolute");
            const poseRefPitch =
                poseState === "relative" ? Number(bundle.poseRefPitch ?? (Number.isFinite(urlRef) ? urlRef : 0)) : 0;
            setPoseInfo({ state: poseState, refPitch: poseRefPitch });
            // 새 묶음은 눈별 메타, 옛 URL 은 단일 윤부를 양안에 (null 로 두면 그래프가 전역 스토어 배율로 폴백해 버린다 — review-Q Q9)
            setEyesInfo(
                bundle.meta?.eyes ?? {
                    od: { limbusMm: limbusMM, limbusPx: limbusPX, al: "", acd: "" },
                    os: { limbusMm: limbusMM, limbusPx: limbusPX, al: "", acd: "" },
                },
            );

            const odRaw = Array.isArray(bundle.od) ? bundle.od : [];
            setOdResults(odRaw);
            setOsResults(Array.isArray(bundle.os) ? bundle.os : []);

            if (bundle.data) {
                const rawData = bundle.data;

                if (!rawData || rawData.length < 4) {
                    console.error("PDReportData requires at least 4 items");
                    return;
                }

                // 6개 미만이면 없는 구간은 null 로 둔다 (0 으로 채우면 없는 시험이 0 PD 로 보인다)
                const empty = {
                    odXMedian: null,
                    osXMedian: null,
                    odYMedian: null,
                    osYMedian: null,
                };
                // 1~3차 = 앞 6개 구간만. 7번째 이후(새 프리셋에서 남는 꼬리 등)는 pitch 평균 등 어디에도 넣지 않는다 (Codex 규칙 리뷰 R2)
                const jsonData = [...rawData].slice(0, 6);
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

                // 수동 포인트: 묶음에 고정된 값을 쓴다 (다른 검사에서 포인트를 바꿔도 이 리포트는 안 변함). 옛 URL 만 스토어.
                const manualRaw = bundle.manual ?? useManualPointStore.getState();
                // Src/Dst 가 같은 영상의 포인트일 때만 쓴다. 파일 표시가 있는 두 점이 서로 다르면 다른 녹화가 섞인 것이라 버린다.
                // (파일 표시가 없는 옛 포인트는 그대로 둔다)
                const samePair = (a, b) =>
                    a && b && (a.file == null || b.file == null || a.file === b.file) ? [a, b] : [null, null];
                const [src4th, dst4th] = samePair(manualRaw.src4th, manualRaw.dst4th);
                const [src5th, dst5th] = samePair(manualRaw.src5th, manualRaw.dst5th);

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
                const regionCamMedian = (region) => regionCamMedianOf(odRaw, region, poseState, poseRefPitch);

                // 전체 대표 각도 = 측정 구간들의 pitch 중앙값 평균 (리포트 표시 + 수동시험·폴백용).
                // 구간 데이터가 없는 구버전은 URL angle(레거시), 그것도 없으면 null.
                const regionCams = jsonData.map(regionCamMedian).filter((v) => v !== null && !isNaN(v));
                const overallCam = overallCamOf(regionCams, poseState, angle);

                const avgCam = (a, b) => avgCamOf(regionCamMedian(a), regionCamMedian(b), overallCam);
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

                    // 각 시험 계산에 사용된 절대 pitch (상대값 + pose_ref.pitch). 테이블 제목에 표시
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

    if (loadError) {
        return <div className="p-8 text-center text-red-600 text-lg">{loadError}</div>;
    }

    return (
        <div className="bg-gray-400 print:bg-white p-4 print:p-0 relative">
            {/* 왼쪽 상단 컨트롤 패널 */}
            <div className="fixed top-4 left-4 z-50 print:hidden flex flex-col gap-2"></div>

            {/* <div className="space-y-4 print:space-y-0"> */}
            {/* 화면은 두 장을 가로로 나란히, 인쇄는 세로(A4 세로 한 장씩) */}
            <div className="flex flex-row justify-center print:flex-col print:justify-start">
                <A4Page>
                    <div className="border-b-4 border-yellow-400 flex flex-row justify-between">
                        <div className="bg-yellow-400 px-4 py-2 font-bold">1</div>
                        <div className="flex items-end text-xs pb-1">{getTodayTime()}</div>
                    </div>

                    <div className="my-6 print:my-2 flex items-baseline justify-between border-b-2 border-gray-800 pb-2">
                        <h1 className="text-4xl font-bold text-gray-900">
                            IGazy Report <span className="text-xl text-gray-500">(표 방식 · pitch)</span>
                        </h1>
                        <span className="text-sm text-gray-600">{getToday()}</span>
                    </div>

                    <table className="w-full border-collapse border-1 border-gray-400 print:break-inside-avoid">
                        <colgroup>
                            <col span={8} style={{ width: "12.5%" }} />
                        </colgroup>
                        <tbody>
                            <tr>
                                <td colSpan={8} className="text-xl font-bold border-1 border-gray-300 py-2 text-black">
                                    PATIENT INFORMATION
                                </td>
                            </tr>
                            <tr>
                                <th
                                    colSpan={2}
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left w-1/4"
                                >
                                    Patient Number
                                </th>
                                <td
                                    colSpan={2}
                                    className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                >
                                    {patientNum || "-"}
                                </td>
                                <th
                                    colSpan={2}
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left w-1/4"
                                >
                                    Patient Name
                                </th>
                                <td
                                    colSpan={2}
                                    className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                >
                                    {patientName || "-"}
                                </td>
                            </tr>
                            <tr>
                                <th
                                    colSpan={2}
                                    scope="col"
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left"
                                >
                                    항목
                                </th>
                                <th
                                    colSpan={3}
                                    scope="col"
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left"
                                >
                                    OD
                                </th>
                                <th
                                    colSpan={3}
                                    scope="col"
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left"
                                >
                                    OS
                                </th>
                            </tr>
                            <tr>
                                <th
                                    colSpan={2}
                                    scope="row"
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left"
                                >
                                    White to White
                                </th>
                                {["od", "os"].map((eye) => (
                                    <td
                                        key={eye}
                                        colSpan={3}
                                        className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                    >
                                        {(() => {
                                            // 눈별 윤부 (mm = px). 새 묶음(bundle.meta.eyes)이 없는 옛 URL 은 단일 값
                                            const f = (e) =>
                                                e && parseFloat(e.limbusMm) > 0 && parseFloat(e.limbusPx) > 0
                                                    ? `${parseFloat(e.limbusMm).toFixed(2)}mm = ${parseFloat(e.limbusPx).toFixed(1)}px`
                                                    : "-";
                                            if (eyesInfo) return f(eyesInfo[eye]);
                                            return limbusPX && limbusMM
                                                ? `${parseFloat(limbusMM).toFixed(2)}mm = ${parseFloat(limbusPX).toFixed(1)}px`
                                                : "-";
                                        })()}
                                    </td>
                                ))}
                            </tr>
                            <tr>
                                <th
                                    colSpan={2}
                                    scope="row"
                                    className="text-sm border bg-gray-100 border-gray-300 py-2 print:py-1 px-4 font-medium text-gray-800 text-left"
                                >
                                    Pitch
                                </th>
                                <td
                                    colSpan={6}
                                    className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                >
                                    {(() => {
                                        if (poseInfo.state === "unknown") return "영점 미확인 — 표 계산 불가";
                                        // 시험별 절대 pitch 를 순서대로 표시 (4·5차는 수동 시험 결과가 있을 때만)
                                        const items = [
                                            data.cam_1st,
                                            data.cam_2nd,
                                            data.cam_3rd,
                                            data.xaxis_od_4th ? data.cam_4th : null,
                                            data.xaxis_od_5th ? data.cam_5th : null,
                                        ].filter((v) => v !== null && v !== undefined && !isNaN(v));
                                        if (items.length === 0) return "-";
                                        const ref =
                                            poseInfo.state === "relative"
                                                ? ` (영점 ${poseInfo.refPitch.toFixed(1)}° 복원)`
                                                : "";
                                        return items.map((v) => `${Number(v).toFixed(1)}°`).join(" · ") + ref;
                                    })()}
                                </td>
                            </tr>
                            {/* AL/ACD 는 R 방식 입력이라 표 방식 리포트에는 넣지 않는다 (혼동 방지) */}
                        </tbody>
                    </table>

                    {/* 두 방식 비교 — 2페이지에서 고른 시험의 OD x축 기준 */}
                    {data[`dxmm_od_${selectedExam}`] != null && (
                        <AngleTwoTrack
                            className="mt-4 print:mt-2 print:break-inside-avoid"
                            showR={false}
                            title={`측정 각도 — 표 방식 계산식 (${examTitle(selectedExam)} · OD x축)`}
                            deltaMM={data[`dxmm_od_${selectedExam}`]}
                            pitch={data[`cam_${selectedExam}`]}
                        />
                    )}

                    {/* 차트는 1페이지 계산식 아래. 인쇄는 차트 120px·여백 축소로 한 장에 들어간다 (2026-10-29) */}
                    <div className="w-full border-y border-yellow-400 py-6 print:pt-4 print:pb-2 print:shrink-0 print:break-inside-avoid">
                        <LiveGraph
                            odResults={odResults}
                            osResults={osResults}
                            currentFrameRef={null}
                            eyesOverride={eyesInfo}
                            showToggles={false}
                        />
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
                                data[`dxmm_od_${exam.suffix}`] != null ? () => setSelectedExam(exam.suffix) : undefined
                            }
                        />
                    ))}
                </A4Page>
            </div>
        </div>
    );
}
