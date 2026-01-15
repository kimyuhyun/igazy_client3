import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";

const CalibrationTable = () => {
    const [calibrationData, setCalibrationData] = useState({});

    // 초기 로드
    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const handleStorageChange = () => {
            loadData();
        };

        window.addEventListener("calibrationDataUpdated", handleStorageChange);

        return () => {
            window.removeEventListener("calibrationDataUpdated", handleStorageChange);
        };
    }, []);

    // localStorage 로드 함수
    const loadData = () => {
        const saved = localStorage.getItem("calibrationData");
        if (saved) {
            setCalibrationData(JSON.parse(saved));
        }
    };

    // 데이터 삭제
    const clearData = () => {
        if (window.confirm("모든 캘리브레이션 데이터를 삭제하시겠습니까?")) {
            localStorage.removeItem("calibrationData");
            setCalibrationData({});
        }
    };

    // JSON 다운로드
    const downloadJSON = () => {
        const dataStr = JSON.stringify(calibrationData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "calibration_data.json";
        link.click();
    };

    // 특정 카메라 각도 데이터 삭제
    const deleteAngleData = (tan_gaze) => {
        if (!window.confirm(`tan_gaze ${tan_gaze} 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("calibrationData");
        const data = saved ? JSON.parse(saved) : {};

        // 해당 키 삭제
        delete data[tan_gaze];

        localStorage.setItem("calibrationData", JSON.stringify(data));
        window.dispatchEvent(new Event("calibrationDataUpdated"));

        toast.success(`tan_gaze ${tan_gaze} 삭제됨`);
    };

    // 특정 카메라 각도 데이터 복사
    const copyAngleData = (tan_gaze, angles) => {
        angles["0"] = {
            delta_tan_x: 0,
            delta_tan_y: 0,
        };
        const angleData = {
            [tan_gaze]: angles,
        };
        const dataStr = JSON.stringify(angleData, null, 2);

        navigator.clipboard
            .writeText(dataStr)
            .then(() => {
                toast.success(`tan_gaze ${tan_gaze} 데이터 복사됨`);
            })
            .catch(() => {
                toast.error("복사 실패");
            });
    };

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">캘리브레이션 데이터</h2>
                <div className="space-x-2">
                    <button
                        onClick={downloadJSON}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        JSON 다운로드
                    </button>
                    <button onClick={clearData} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                        전체 삭제
                    </button>
                </div>
            </div>

            {Object.keys(calibrationData).length === 0 ? (
                <div className="text-center text-gray-500 py-8">저장된 캘리브레이션 데이터가 없습니다.</div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(calibrationData)
                        .reverse()
                        .map(([tan_gaze, angles]) => (
                            <div key={tan_gaze} className="border border-black p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-lg font-semibold">
                                        tan_gaze: {tan_gaze} (카메라:{" "}
                                        {((Math.atan(parseFloat(tan_gaze)) * 180) / Math.PI).toFixed(1)}°)
                                    </h3>

                                    <div className="space-x-2">
                                        <button
                                            onClick={() => copyAngleData(tan_gaze, angles)}
                                            className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                                        >
                                            복사
                                        </button>
                                        <button
                                            onClick={() => deleteAngleData(tan_gaze)}
                                            className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border px-4 py-2">안구 각도</th>
                                            <th className="border px-4 py-2">Δtan_X</th>
                                            <th className="border px-4 py-2">Δtan_Y</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(angles)
                                            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                                            .map(([eyeAngle, values]) => (
                                                <tr
                                                    key={eyeAngle}
                                                    className={eyeAngle === "0" ? "bg-green-50" : "hover:bg-gray-50"}
                                                >
                                                    <td className="border px-4 py-2 text-center font-medium">
                                                        {eyeAngle}° {eyeAngle === "0" && "(기준)"}
                                                    </td>
                                                    <td className="border px-4 py-2 text-right font-mono text-sm font-bold">
                                                        {values.delta_tan_X.toFixed(6)}
                                                    </td>
                                                    <td className="border px-4 py-2 text-right font-mono text-sm font-bold">
                                                        {values.delta_tan_Y.toFixed(6)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                </div>
            )}

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold mb-2">통계</h3>
                <p>카메라 각도: {Object.keys(calibrationData).length}개</p>
                <p>
                    총 측정 포인트:{" "}
                    {Object.values(calibrationData).reduce((sum, angles) => sum + Object.keys(angles).length, 0)}개
                </p>
            </div>
        </div>
    );
};

export default CalibrationTable;

// Export 함수
export const saveCalibrationMeasurement = (tan_gaze, delta_tan_x, delta_tan_y, strEyeAngle) => {
    // 숫자로 변환
    const tan_gaze_num = parseFloat(tan_gaze);
    const delta_x = parseFloat(delta_tan_x);
    const delta_y = parseFloat(delta_tan_y);
    const eyeAngle = parseInt(strEyeAngle);

    // 유효성 검사
    if (isNaN(tan_gaze_num) || isNaN(delta_x) || isNaN(delta_y)) {
        console.error("❌ 잘못된 값:", { tan_gaze, delta_tan_x, delta_tan_y });
        return;
    }

    const key = tan_gaze_num.toFixed(3);
    const saved = localStorage.getItem("calibrationData");
    const data = saved ? JSON.parse(saved) : {};

    if (!data[key]) {
        data[key] = {};
    }

    // 그냥 받은 delta 값을 그대로 저장
    data[key][eyeAngle] = {
        delta_tan_X: parseFloat(delta_x.toFixed(6)),
        delta_tan_Y: parseFloat(delta_y.toFixed(6)),
    };

    localStorage.setItem("calibrationData", JSON.stringify(data));
    window.dispatchEvent(new Event("calibrationDataUpdated"));

    console.log(`✅ 저장: tan_gaze=${key}, eye=${eyeAngle}°`);
};
