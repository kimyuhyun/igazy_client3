import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getTodayTime, getToday } from "../utils/common";
import LiveGraph from "../components/LiveGraph";
import A4Page from "../components/A4Page";
import ExamResultTable from "../components/ExamResultTable";
import { calcMM } from "../utils/calcPxToMm";
import calculator from "../utils/oldRegressionEyeAngleCalculator";
// import calculator from "../utils/regressionEyeAngleCalculator";
import useManualPointStore from "../stores/useManualPointStore";

export default function PDReport() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const patientNum = searchParams.get("patient_num");
    const patientName = searchParams.get("patient_name");
    const angle = searchParams.get("angle") || "";
    // const distance = searchParams.get("distance") || "";
    const limbusMM = searchParams.get("limbus_mm") || "";
    const limbusPX = searchParams.get("limbus_px") || "";

    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);

    const [data, setData] = useState([]);

    const [newDistance, setNewDistance] = useState("");

    // limbus_mm 수정용 state
    const [editLimbusMM, setEditLimbusMM] = useState(limbusMM);

    // limbus_mm 값 변경 핸들러
    const handleLimbusMMChange = () => {
        if (!editLimbusMM || parseFloat(editLimbusMM) <= 0) {
            alert("유효한 윤부 지름 값을 입력해주세요.");
            return;
        }

        const newParams = new URLSearchParams(searchParams);
        newParams.set("limbus_mm", editLimbusMM);

        navigate(`?${newParams.toString()}`, { replace: true });
        window.location.reload();
    };

    useEffect(() => {
        (async () => {
            const od = localStorage.getItem("ODResultsData");
            const os = localStorage.getItem("OSResultsData");
            if (od && os) {
                setOdResults(JSON.parse(od));
                setOsResults(JSON.parse(os));
            }

            const storedData = localStorage.getItem("PDReportData");
            if (storedData) {
                const jsonData = JSON.parse(storedData);

                if (!jsonData || jsonData.length < 6) {
                    console.error("PDReportData requires at least 6 items");
                    return;
                }

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

                const obj = {
                    xaxis_od_1st: calculatePD(xaxis_od_1st, "x", "OD"),
                    xaxis_os_1st: calculatePD(xaxis_os_1st, "x", "OS"),
                    yaxis_od_1st: calculatePD(yaxis_od_1st, "y", "OD"),
                    yaxis_os_1st: calculatePD(yaxis_os_1st, "y", "OS"),

                    xaxis_od_2nd: calculatePD(xaxis_od_2nd, "x", "OD"),
                    xaxis_os_2nd: calculatePD(xaxis_os_2nd, "x", "OS"),
                    yaxis_od_2nd: calculatePD(yaxis_od_2nd, "y", "OD"),
                    yaxis_os_2nd: calculatePD(yaxis_os_2nd, "y", "OS"),

                    xaxis_od_3rd: calculatePD(xaxis_od_3rd, "x", "OD"),
                    xaxis_os_3rd: calculatePD(xaxis_os_3rd, "x", "OS"),
                    yaxis_od_3rd: calculatePD(yaxis_od_3rd, "y", "OD"),
                    yaxis_os_3rd: calculatePD(yaxis_os_3rd, "y", "OS"),

                    xaxis_od_4th: calculatePD(xaxis_od_4th, "x", "OD"),
                    xaxis_os_4th: calculatePD(xaxis_os_4th, "x", "OS"),
                    yaxis_od_4th: calculatePD(yaxis_od_4th, "y", "OD"),
                    yaxis_os_4th: calculatePD(yaxis_os_4th, "y", "OS"),

                    xaxis_od_5th: calculatePD(xaxis_od_5th, "x", "OD"),
                    xaxis_os_5th: calculatePD(xaxis_os_5th, "x", "OS"),
                    yaxis_od_5th: calculatePD(yaxis_od_5th, "y", "OD"),
                    yaxis_os_5th: calculatePD(yaxis_os_5th, "y", "OS"),
                };
                setData(obj);
            }
        })();
    }, []);

    // limbusMM URL 파라미터가 변경되면 editLimbusMM 업데이트
    useEffect(() => {
        setEditLimbusMM(limbusMM);
    }, [limbusMM]);

    const calculatePD = (points, axis, side) => {
        const difference = points[0] - points[1];

        const distance = calcMM(parseFloat(limbusMM), parseFloat(limbusPX));
        setNewDistance(distance);
        const degrees = calculator.calculateEyeAngle(parseFloat(angle), parseInt(distance), Math.abs(difference));

        if (Number.isNaN(degrees)) {
            return "";
        }

        const radians = degrees * (Math.PI / 180);
        const pdValue = Math.tan(radians) * 100;

        let direction = "";
        if (axis === "x") {
            direction = difference > 0 ? "ESO" : "EXO";
        } else {
            direction = difference > 0 ? "HYPO" : "HYPER";
        }

        return `${degrees.toFixed(1)}° / ${pdValue.toFixed(1)} ${direction}`;
    };

    const examTables = [
        { title: "1st Exam", hoverColor: "blue", suffix: "1st" },
        { title: "2nd Exam", hoverColor: "green", suffix: "2nd" },
        { title: "3rd Exam", hoverColor: "purple", suffix: "3rd" },
        { title: "OD Manual Exam", hoverColor: "orange", suffix: "4th" },
        { title: "OS Manual Exam", hoverColor: "orange", suffix: "5th" },
    ];

    return (
        <div className="bg-gray-400 print:bg-white p-4 print:p-0 relative">
            {/* 왼쪽 상단 limbus_mm 수정 input */}
            <div className="fixed top-4 left-4 z-50 print:hidden">
                <div className="bg-white rounded-lg shadow-lg p-3 border-2 border-blue-500">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">윤부 지름 (mm)</label>
                    <div className="flex gap-2 items-center">
                        <input
                            type="number"
                            step="0.1"
                            value={editLimbusMM}
                            onChange={(e) => setEditLimbusMM(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleLimbusMMChange();
                                }
                            }}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => setEditLimbusMM((prev) => (parseFloat(prev) + 0.1).toFixed(1))}
                                className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-semibold"
                                title="+0.1"
                            >
                                +0.1
                            </button>
                            <button
                                onClick={() =>
                                    setEditLimbusMM((prev) => Math.max(0, parseFloat(prev) - 0.1).toFixed(1))
                                }
                                className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
                                title="-0.1"
                            >
                                -0.1
                            </button>
                        </div>
                        <button
                            onClick={handleLimbusMMChange}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-semibold"
                        >
                            적용
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4 print:space-y-0">
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
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">Patient Number</th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">{patientNum || "-"}</td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">Patient Name</th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">{patientName || "-"}</td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">Distance</th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">{`${newDistance ? `${parseFloat(newDistance).toFixed(1)}mm` : "-"}`}</td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">Angle</th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">{`${angle}°` || "-"}</td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">White to White</th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">{`${limbusMM}mm` || "-"}</td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">White to White(px)</th>
                                <td className="text-sm border border-gray-300 py-2 px-4 text-gray-900 font-medium">{limbusPX ? `${parseFloat(limbusPX).toFixed(1)}px` : "-"}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="border-y border-yellow-400 py-10 mt-6">
                        <LiveGraph odResults={odResults} osResults={osResults} currentFrameRef={null} />
                    </div>
                </A4Page>

                <A4Page className="flex flex-col justify-between gap-8">
                    <div className="border-b-4 border-yellow-400 flex flex-row justify-between">
                        <div className="bg-yellow-400 px-4 py-2 font-bold">2</div>
                        <div className="flex items-end text-xs pb-1">{getTodayTime()}</div>
                    </div>

                    {examTables.map((exam) => (
                        <ExamResultTable
                            key={exam.suffix}
                            title={exam.title}
                            hoverColor={exam.hoverColor}
                            data={data}
                            suffix={exam.suffix}
                        />
                    ))}
                </A4Page>
            </div>
        </div>
    );
}
