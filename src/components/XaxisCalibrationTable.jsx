import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";

const XaxisCalibrationTable = () => {
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
        const saved = localStorage.getItem("XaxisCalibrationData");
        if (saved) {
            setCalibrationData(JSON.parse(saved));
        }
    };

    // 데이터 삭제
    const clearData = () => {
        if (window.confirm("모든 캘리브레이션 데이터를 삭제하시겠습니까?")) {
            localStorage.removeItem("XaxisCalibrationData");
            setCalibrationData({});
            toast.success("모든 데이터 삭제됨");
        }
    };

    // JSON 다운로드
    const downloadJSON = () => {
        const sortedData = Object.keys(calibrationData)
            .sort((a, b) => parseFloat(a) - parseFloat(b))
            .reduce((acc, camAngle) => {
                const sortedEyeAngles = Object.keys(calibrationData[camAngle])
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .reduce((eyeAcc, eyeAngle) => {
                        eyeAcc[eyeAngle] = calibrationData[camAngle][eyeAngle];
                        return eyeAcc;
                    }, {});
                acc[camAngle] = sortedEyeAngles;
                return acc;
            }, {});

        const dataStr = JSON.stringify(sortedData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "x_axis_calibration_data.json";
        link.click();
        toast.success("JSON 다운로드 완료");
    };

    // 특정 cam_angle 데이터 삭제
    const deleteCamAngleData = (cam_angle) => {
        if (!window.confirm(`cam_angle ${cam_angle} 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("XaxisCalibrationData");
        const data = saved ? JSON.parse(saved) : {};

        delete data[cam_angle];

        localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
        window.dispatchEvent(new Event("calibrationDataUpdated"));

        toast.success(`cam_angle ${cam_angle} 삭제됨`);
    };

    // 특정 distance 데이터 삭제
    const deleteDistanceData = (cam_angle, distance) => {
        if (!window.confirm(`cam_angle ${cam_angle}, distance ${distance} 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("XaxisCalibrationData");
        const data = saved ? JSON.parse(saved) : {};

        if (data[cam_angle] && data[cam_angle][distance]) {
            delete data[cam_angle][distance];

            // cam_angle에 distance가 하나도 없으면 cam_angle도 삭제
            if (Object.keys(data[cam_angle]).length === 0) {
                delete data[cam_angle];
            }

            localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
            window.dispatchEvent(new Event("calibrationDataUpdated"));

            toast.success(`distance ${distance} 삭제됨`);
        }
    };

    // 특정 cam_angle 데이터 복사
    const copyCamAngleData = (cam_angle, eyeAngles) => {
        const dataStr = JSON.stringify({ [cam_angle]: eyeAngles }, null, 2);
        navigator.clipboard
            .writeText(dataStr)
            .then(() => toast.success(`cam_angle ${cam_angle} 데이터 복사됨`))
            .catch(() => toast.error("복사 실패"));
    };

    // 특정 eye_angle 데이터 삭제
    const deleteEyeAngleData = (cam_angle, eyeAngle) => {
        if (!window.confirm(`cam_angle ${cam_angle}, eye_angle ${eyeAngle}° 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("XaxisCalibrationData");
        const data = saved ? JSON.parse(saved) : {};

        if (data[cam_angle] && data[cam_angle][eyeAngle] !== undefined) {
            delete data[cam_angle][eyeAngle];

            if (Object.keys(data[cam_angle]).length === 0) {
                delete data[cam_angle];
            }

            localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
            window.dispatchEvent(new Event("calibrationDataUpdated"));
            toast.success(`eye_angle ${eyeAngle}° 삭제됨`);
        }
    };

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">X축 캘리브레이션 데이터</h2>
                <div className="space-x-2">
                    <button
                        onClick={downloadJSON}
                        className="text-sm px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        JSON 다운로드
                    </button>
                    <button
                        onClick={clearData}
                        className="text-sm px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        전체 삭제
                    </button>
                </div>
            </div>

            {Object.keys(calibrationData).length === 0 ? (
                <div className="text-center text-gray-500 py-8">저장된 캘리브레이션 데이터가 없습니다.</div>
            ) : (
                <div className="grid grid-cols-4 gap-2">
                    {Object.entries(calibrationData)
                        .reverse()
                        .map(([cam_angle, eyeAngles]) => (
                            <div key={cam_angle} className="p-4 rounded-lg shadow-xl border">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-blue-600">CamAngle: {cam_angle}°</h3>
                                    <div className="space-x-2 ml-2">
                                        <button
                                            onClick={() => copyCamAngleData(cam_angle, eyeAngles)}
                                            className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                                        >
                                            전체 복사
                                        </button>
                                        <button
                                            onClick={() => deleteCamAngleData(cam_angle)}
                                            className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                                        >
                                            전체 삭제
                                        </button>
                                    </div>
                                </div>

                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border px-2 py-1">안구 각도</th>
                                            <th className="border px-2 py-1">delta_x (mm)</th>
                                            <th className="border px-0"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(eyeAngles)
                                            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                                            .map(([eyeAngle, delta_x]) => (
                                                <tr
                                                    key={eyeAngle}
                                                    className={
                                                        eyeAngle === "0"
                                                            ? "bg-green-50"
                                                            : "hover:bg-gray-50"
                                                    }
                                                >
                                                    <td className="border px-2 py-1 text-center font-medium">
                                                        {eyeAngle}° {eyeAngle === "0" && "(기준)"}
                                                    </td>
                                                    <td className="border px-2 py-1 text-right font-mono text-sm font-bold">
                                                        {typeof delta_x === "number"
                                                            ? delta_x.toFixed(3)
                                                            : delta_x}
                                                    </td>
                                                    <td className="border px-2 py-1 text-center">
                                                        <button
                                                            onClick={() =>
                                                                deleteEyeAngleData(cam_angle, eyeAngle)
                                                            }
                                                            className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                                                        >
                                                            ✕
                                                        </button>
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
                <p>카메라 각도 (cam_angle): {Object.keys(calibrationData).length}개</p>
                <p>
                    총 측정 포인트:{" "}
                    {Object.values(calibrationData).reduce(
                        (sum, eyeAngles) => sum + Object.keys(eyeAngles).length,
                        0
                    )}
                    개
                </p>
            </div>
        </div>
    );
};

export default XaxisCalibrationTable;

// Export 함수
export const saveCalibrationMeasurement = (camAngle, delta_x, strEyeAngle) => {
    const camAngleVal = parseFloat(camAngle);
    const deltaXVal = parseFloat(delta_x);
    const eyeAngle = parseInt(strEyeAngle);

    if (isNaN(camAngleVal) || isNaN(deltaXVal) || isNaN(eyeAngle)) {
        console.error("❌ 잘못된 값:", { camAngle, delta_x, strEyeAngle });
        toast.error("잘못된 데이터 형식");
        return;
    }

    const camAngleKey = camAngleVal.toFixed(1);

    const saved = localStorage.getItem("XaxisCalibrationData");
    const data = saved ? JSON.parse(saved) : {};

    if (!data[camAngleKey]) {
        data[camAngleKey] = {};
    }

    // 구조: { cam_angle: { eyeAngle: delta_x_mm } }
    data[camAngleKey][eyeAngle] = parseFloat(deltaXVal.toFixed(3));

    localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
    window.dispatchEvent(new Event("calibrationDataUpdated"));

    console.log(`저장: cam_angle=${camAngleKey}, eye=${eyeAngle}°, delta_x=${deltaXVal.toFixed(3)}mm`);
    toast.success(`저장 완료: ${eyeAngle}°`);
};
