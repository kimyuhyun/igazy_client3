import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getTodayTime, getToday } from "../utils/common";
import LiveGraph from "../components/LiveGraph";
import A4Page from "../components/A4Page";
import ExamResultTable from "../components/ExamResultTable";
import { rotationRadiusCalibrated, R_GAIN, PUPIL_APPARENT_RATIO, ROT_CENTER_OFFSET } from "../utils/angleMethods";
import useManualPointStore from "../stores/useManualPointStore";
import AngleTwoTrack from "../components/AngleTwoTrack";
import { calculatePdR } from "../utils/pdCalc";

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
// ★ R 방식 리포트 (PDReport) ★  sin θ = Δx / R, R = R_GAIN × (AL/2 + c − 0.85×ACD) (angleMethods.js).
// 자세(pitch)는 쓰지 않는다. 2026-10-23 프리즘 2명 대조에서 해부식 × 0.79 가 두 환자 모두 1 PD 안 (잠정).
// pitch 별 실측 룩업테이블은 별도 리포트(PDReportWithTable)에 있다.
const calculatePD = calculatePdR;

export default function PDReport() {
    const [searchParams] = useSearchParams();

    const patientNum = searchParams.get("patient_num");
    const patientName = searchParams.get("patient_name");
    // ★ R 방식 리포트 ★  AL·ACD·WTW(limbus_mm)·limbus_px 만 쓴다. pitch·룩업테이블·자세 영점은 전혀 쓰지 않는다.
    // 표 방식(pitch + 룩업테이블)은 PDReportWithTable.jsx. 오후에 프리즘 결과지가 오면 두 리포트를 비교한다.
    const limbusMM = searchParams.get("limbus_mm") || "";
    const limbusPX = searchParams.get("limbus_px") || "";
    const axialLength = searchParams.get("al") || "";
    const acd = searchParams.get("acd") || "";
    const [loadError, setLoadError] = useState("");
    // 눈별 생체값 { od:{limbusMm,limbusPx,al,acd}, os:{...} } — 헤더 표시용 (계산은 useEffect 안에서)
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
                    console.error("PDReport bundle parse error:", e);
                }
                if (!bundle) {
                    setLoadError(
                        "이 리포트의 데이터가 브라우저에 남아 있지 않습니다. 측정 화면에서 결과보기를 다시 눌러 주세요.",
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
                const empty = { odXMedian: null, osXMedian: null, odYMedian: null, osYMedian: null };
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

                // R 방식은 자세(pitch)를 쓰지 않는다. 구간별 pitch 산출은 표 방식 리포트(PDReportWithTable)에만 있다.

                // 계산식 표시용 원시 변위(mm) — 각 시험의 OD x축
                const dxmm = (pts) => (pts?.[0] != null && pts?.[1] != null ? pts[0] - pts[1] : null);

                // 눈별 생체값. 새 묶음(bundle.meta.eyes)이 없으면(옛 URL) URL 의 단일 값을 양안에 쓴다.
                const eyes = bundle.meta?.eyes ?? {
                    od: { limbusMm: limbusMM, limbusPx: limbusPX, al: axialLength, acd },
                    os: { limbusMm: limbusMM, limbusPx: limbusPX, al: axialLength, acd },
                };
                setEyesInfo(eyes);

                // 회전반경 R = R_GAIN × 해부식, 눈별. AL/ACD 가 비면 표준 눈(24.0 / 3.6)으로 계산되고 isStd 가 true.
                const rOd = rotationRadiusCalibrated(eyes.od.al, eyes.od.acd);
                const rOs = rotationRadiusCalibrated(eyes.os.al, eyes.os.acd);
                const Rod = rOd.R;
                const Ros = rOs.R;

                const obj = {
                    rOd,
                    rOs,
                    dxmm_od_1st: dxmm(xaxis_od_1st),
                    dxmm_od_2nd: dxmm(xaxis_od_2nd),
                    dxmm_od_3rd: dxmm(xaxis_od_3rd),
                    dxmm_od_4th: dxmm(xaxis_od_4th),
                    dxmm_od_5th: dxmm(xaxis_od_5th),
                    xaxis_od_1st: calculatePD(xaxis_od_1st, "x", "OD", Rod),
                    xaxis_os_1st: calculatePD(xaxis_os_1st, "x", "OS", Ros),
                    yaxis_od_1st: calculatePD(yaxis_od_1st, "y", "OD", Rod),
                    yaxis_os_1st: calculatePD(yaxis_os_1st, "y", "OS", Ros),

                    xaxis_od_2nd: calculatePD(xaxis_od_2nd, "x", "OD", Rod),
                    xaxis_os_2nd: calculatePD(xaxis_os_2nd, "x", "OS", Ros),
                    yaxis_od_2nd: calculatePD(yaxis_od_2nd, "y", "OD", Rod),
                    yaxis_os_2nd: calculatePD(yaxis_os_2nd, "y", "OS", Ros),

                    xaxis_od_3rd: calculatePD(xaxis_od_3rd, "x", "OD", Rod),
                    xaxis_os_3rd: calculatePD(xaxis_os_3rd, "x", "OS", Ros),
                    yaxis_od_3rd: calculatePD(yaxis_od_3rd, "y", "OD", Rod),
                    yaxis_os_3rd: calculatePD(yaxis_os_3rd, "y", "OS", Ros),

                    xaxis_od_4th: calculatePD(xaxis_od_4th, "x", "OD", Rod),
                    xaxis_os_4th: calculatePD(xaxis_os_4th, "x", "OS", Ros),
                    yaxis_od_4th: calculatePD(yaxis_od_4th, "y", "OD", Rod),
                    yaxis_os_4th: calculatePD(yaxis_os_4th, "y", "OS", Ros),

                    xaxis_od_5th: calculatePD(xaxis_od_5th, "x", "OD", Rod),
                    xaxis_os_5th: calculatePD(xaxis_os_5th, "x", "OS", Ros),
                    yaxis_od_5th: calculatePD(yaxis_od_5th, "y", "OD", Rod),
                    yaxis_os_5th: calculatePD(yaxis_os_5th, "y", "OS", Ros),
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
                            IGazy Report{" "}
                            <span className="text-xl text-gray-500">(R 방식 · 해부식 × {R_GAIN} 잠정)</span>
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
                                            // 눈별 윤부 (mm = px). 값이 없으면 "-"
                                            const f = (e) =>
                                                e && parseFloat(e.limbusMm) > 0 && parseFloat(e.limbusPx) > 0
                                                    ? `${parseFloat(e.limbusMm).toFixed(2)}mm = ${parseFloat(e.limbusPx).toFixed(1)}px`
                                                    : "-";
                                            return f(eyesInfo?.[eye]);
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
                                    R (회전반경)
                                </th>
                                {["od", "os"].map((eye) => (
                                    <td
                                        key={eye}
                                        colSpan={3}
                                        className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                    >
                                        {(() => {
                                            const f = (r) =>
                                                r && Number.isFinite(r.R)
                                                    ? `${R_GAIN} × ${r.Ranat.toFixed(2)} = ${r.R.toFixed(2)}mm${r.isStd ? " (표준 눈)" : ""}`
                                                    : "-";
                                            return f(eye === "od" ? data.rOd : data.rOs);
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
                                    Axial Length (AL)
                                </th>
                                {["od", "os"].map((eye) => (
                                    <td
                                        key={eye}
                                        colSpan={3}
                                        className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                    >
                                        {(() => {
                                            const f = (e) =>
                                                e && parseFloat(e.al) > 0 ? `${parseFloat(e.al).toFixed(2)}mm` : "-";
                                            return f(eyesInfo?.[eye]);
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
                                    ACD
                                </th>
                                {["od", "os"].map((eye) => (
                                    <td
                                        key={eye}
                                        colSpan={3}
                                        className="text-sm border border-gray-300 py-2 print:py-1 px-4 text-gray-900 font-medium"
                                    >
                                        {(() => {
                                            const f = (e) =>
                                                e && parseFloat(e.acd) > 0 ? `${parseFloat(e.acd).toFixed(2)}mm` : "-";
                                            return f(eyesInfo?.[eye]);
                                        })()}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>

                    {/* R 방식 계산식 — 2페이지에서 고른 시험의 OD x축 기준 */}
                    {data[`dxmm_od_${selectedExam}`] != null && (
                        <AngleTwoTrack
                            className="my-4 print:my-2 print:break-inside-avoid"
                            showTable={false}
                            title={`측정 각도 — R 방식 계산식 (${examTitle(selectedExam)} · OD x축)`}
                            deltaMM={data[`dxmm_od_${selectedExam}`]}
                            axialLength={eyesInfo?.od?.al ?? axialLength}
                            acd={eyesInfo?.od?.acd ?? acd}
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
