import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getTodayTime, getToday } from "../utils/Common";
import LiveGraph from "../components/LiveGraph";
import A4Page from "../components/A4Page";
import { calcMM } from "../utils/CalcPxToMm";
import calculator from "../utils/OldRegressionEyeAngleCalculator";
// import calculator from "../utils/RegressionEyeAngleCalculator";

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

        // URL 파라미터 업데이트
        const newParams = new URLSearchParams(searchParams);
        newParams.set("limbus_mm", editLimbusMM);

        // 페이지 새로고침
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

                // console.log(jsonData);

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

                let xaxis_od_4th = [];
                let xaxis_os_4th = [];
                let yaxis_od_4th = [];
                let yaxis_os_4th = [];
                if (jsonData.length === 8) {
                    xaxis_od_4th = [jsonData[6].odXMedian, jsonData[7].odXMedian];
                    xaxis_os_4th = [jsonData[6].osXMedian, jsonData[7].osXMedian];
                    yaxis_od_4th = [jsonData[6].odYMedian, jsonData[7].odYMedian];
                    yaxis_os_4th = [jsonData[6].osYMedian, jsonData[7].osYMedian];
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
                };
                // console.log(obj);
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
        console.log("difference", difference);

        let degrees = 0;

        /**
         * distance 값은 쓰지 않는다. 
         * limbusMM과 limbusPX를 사용하여 계산하여 사용한다.
         */

        const distance = calcMM(parseFloat(limbusMM), parseFloat(limbusPX));
        console.log("distance", distance);

        setNewDistance(distance);

        // const newDistance = calcMM(parseFloat(limbusMM), parseFloat(limbusPX));
        // console.log("newDistance", newDistance);

        // if (distance === "") {
        //     degrees = calculator.calculateEyeAngle(parseFloat(angle), parseInt(newDistance), Math.abs(difference));
        // } else {
        //     degrees = calculator.calculateEyeAngle(parseFloat(angle), parseInt(distance), Math.abs(difference));
        // }

        degrees = calculator.calculateEyeAngle(parseFloat(angle), parseInt(distance), Math.abs(difference));

        console.log(degrees);

        if (Number.isNaN(degrees)) {
            return "";
        }

        // PD 계산
        const radians = degrees * (Math.PI / 180);
        const pdValue = Math.tan(radians) * 100;

        // 방향 결정
        let direction = "";
        if (axis === "x") {
            // X축: ESO(내사시) / EXO(외사시)
            if (side === "OD") {
                direction = difference > 0 ? "ESO" : "EXO";
            } else {
                // OS
                direction = difference > 0 ? "ESO" : "EXO";
            }
        } else {
            // Y축: HYPER(상사위) / HYPO(하사위)
            direction = difference > 0 ? "HYPO" : "HYPER";
        }

        // return `${degrees.toFixed(2)}° / ${pdValue.toFixed(2)} ${direction}`;
        return `${degrees.toFixed(1)}° / ${pdValue.toFixed(1)} ${direction}`;
    };

    return (
        <div className="bg-gray-400 print:bg-white p-4 print:p-0 relative">
            {/* 왼쪽 상단 limbus_mm 수정 input */}
            <div className="fixed top-4 left-4 z-50 print:hidden">
                <div className="bg-white rounded-lg shadow-lg p-3 border-2 border-blue-500">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                        윤부 지름 (mm)
                    </label>
                    <div className="flex gap-2 items-center">
                        <input
                            type="number"
                            step="0.1"
                            value={editLimbusMM}
                            onChange={(e) => setEditLimbusMM(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
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
                                onClick={() => setEditLimbusMM((prev) => Math.max(0, parseFloat(prev) - 0.1).toFixed(1))}
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

                    {/* Patient Information Table */}
                    <table className="w-full border-collapse border-1 border-gray-400">
                        <tbody>
                            <tr>
                                <td colSpan={4} className="text-xl font-bold border-1 border-gray-300 py-3 text-black">
                                    PATIENT INFORMATION
                                </td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Patient Number
                                </th>
                                <td className="text-sm border border-gray-300 py-3 px-4 text-gray-900 font-medium">
                                    {patientNum || '-'}
                                </td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Patient Name
                                </th>
                                <td className="text-sm border border-gray-300 py-3 px-4 text-gray-900 font-medium">
                                    {patientName || '-'}
                                </td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Distance
                                </th>
                                <td className="text-sm border border-gray-300 py-3 px-4 text-gray-900 font-medium">
                                    {`${newDistance ? `${parseFloat(newDistance).toFixed(1)}mm` : '-'}`}
                                </td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    Angle
                                </th>
                                <td className="text-sm border border-gray-300 py-3 px-4 text-gray-900 font-medium">
                                    {`${angle}°` || '-'}
                                </td>
                            </tr>
                            <tr>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    White to White
                                </th>
                                <td className="text-sm border border-gray-300 py-3 px-4 text-gray-900 font-medium">
                                    {`${limbusMM}mm` || '-'}
                                </td>
                                <th className="text-sm border bg-gray-100 border-gray-300 py-2 px-4 font-medium text-gray-800 text-left w-1/4">
                                    White to White(px)
                                </th>
                                <td className="text-sm border border-gray-300 py-3 px-4 text-gray-900 font-medium">
                                    {limbusPX ? `${parseFloat(limbusPX).toFixed(1)}px` : '-'}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="border-y border-yellow-400 py-10 mt-6">
                        <LiveGraph odResults={odResults} osResults={osResults} currentFrameRef={null} />
                    </div>
                </A4Page>

                <A4Page>
                    <div className="border-b-4 border-yellow-400 flex flex-row justify-between">
                        <div className="bg-yellow-400 px-4 py-2 font-bold">2</div>
                        <div className="flex items-end text-xs pb-1">{getTodayTime()}</div>
                    </div>

                    <table className="w-full mt-12 border-collapse border border-gray-300">
                        <tbody>
                            <tr className="bg-gray-300">
                                <td colSpan={3} className="text-center text-xl font-bold border border-gray-300 py-3 text-white">
                                    1st Exam
                                </td>
                            </tr>
                            <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700 w-24"></th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">X-axis</th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">Y-axis</th>
                            </tr>
                            <tr className="text-center hover:bg-blue-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OD</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_od_1st"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_od_1st"]}</td>
                            </tr>
                            <tr className="text-center hover:bg-blue-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OS</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_os_1st"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_os_1st"]}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full mt-12 border-collapse border border-gray-300 shadow-sm">
                        <tbody>
                            <tr className="bg-gray-300">
                                <td colSpan={3} className="text-center text-xl font-bold border border-gray-300 py-3 text-white">
                                    2nd Exam
                                </td>
                            </tr>
                            <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700 w-24"></th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">X-axis</th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">Y-axis</th>
                            </tr>
                            <tr className="text-center hover:bg-green-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OD</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_od_2nd"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_od_2nd"]}</td>
                            </tr>
                            <tr className="text-center hover:bg-green-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OS</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_os_2nd"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_os_2nd"]}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full mt-12 border-collapse border border-gray-300 shadow-sm">
                        <tbody>
                            <tr className="bg-gray-300">
                                <td colSpan={3} className="text-center text-xl font-bold border border-gray-300 py-3 text-white">
                                    3rd Exam
                                </td>
                            </tr>
                            <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700 w-24"></th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">X-axis</th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">Y-axis</th>
                            </tr>
                            <tr className="text-center hover:bg-purple-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OD</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_od_3rd"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_od_3rd"]}</td>
                            </tr>
                            <tr className="text-center hover:bg-purple-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OS</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_os_3rd"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_os_3rd"]}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full mt-12 border-collapse border border-gray-300 shadow-sm">
                        <tbody>
                            <tr className="bg-gray-300">
                                <td colSpan={3} className="text-center text-xl font-bold border border-gray-300 py-3 text-white">
                                    4th Exam
                                </td>
                            </tr>
                            <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700 w-24"></th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">X-axis</th>
                                <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">Y-axis</th>
                            </tr>
                            <tr className="text-center hover:bg-orange-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OD</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_od_4th"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_od_4th"]}</td>
                            </tr>
                            <tr className="text-center hover:bg-orange-50 transition-colors">
                                <td className="border border-gray-300 py-3 px-4 font-medium bg-gray-50 text-gray-700">OS</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["xaxis_os_4th"]}</td>
                                <td className="border border-gray-300 py-3 px-4 text-gray-800">{data["yaxis_os_4th"]}</td>
                            </tr>
                        </tbody>
                    </table>
                </A4Page>
            </div>
        </div>
    );
}
