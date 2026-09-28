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
            localStorage.removeItem("XaxisCalibrationDetails");
            setCalibrationData({});
            toast.success("모든 데이터 삭제됨");
        }
    };

    // 성분 데이터(_details)에서 특정 항목 제거
    const removeDetail = (pitch, eyeAngle = null) => {
        const savedDetails = localStorage.getItem("XaxisCalibrationDetails");
        if (!savedDetails) return;
        const details = JSON.parse(savedDetails);
        if (!details[pitch]) return;

        if (eyeAngle === null) {
            delete details[pitch];
        } else if (details[pitch][eyeAngle] !== undefined) {
            delete details[pitch][eyeAngle];
            if (Object.keys(details[pitch]).length === 0) delete details[pitch];
        }
        localStorage.setItem("XaxisCalibrationDetails", JSON.stringify(details));
    };

    // JSON 다운로드
    const downloadJSON = () => {
        const sortedData = Object.keys(calibrationData)
            .sort((a, b) => parseFloat(a) - parseFloat(b))
            .reduce((acc, pitch) => {
                const sortedEyeAngles = Object.keys(calibrationData[pitch])
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .reduce((eyeAcc, eyeAngle) => {
                        eyeAcc[eyeAngle] = calibrationData[pitch][eyeAngle];
                        return eyeAcc;
                    }, {});
                acc[pitch] = sortedEyeAngles;
                return acc;
            }, {});

        // 성분 데이터(dx/dy 등)를 _details 키로 동봉 — 직선 피팅 검증·재분석용
        const savedDetails = localStorage.getItem("XaxisCalibrationDetails");
        if (savedDetails) {
            sortedData._details = JSON.parse(savedDetails);
        }

        const dataStr = JSON.stringify(sortedData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "x_axis_calibration_data.json";
        link.click();
        toast.success("JSON 다운로드 완료");
    };

    // 특정 pitch 데이터 삭제
    const deletePitchData = (pitch) => {
        if (!window.confirm(`pitch ${pitch} 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("XaxisCalibrationData");
        const data = saved ? JSON.parse(saved) : {};

        delete data[pitch];

        localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
        removeDetail(pitch);
        window.dispatchEvent(new Event("calibrationDataUpdated"));

        toast.success(`pitch ${pitch} 삭제됨`);
    };

    // 특정 distance 데이터 삭제
    const deleteDistanceData = (pitch, distance) => {
        if (!window.confirm(`pitch ${pitch}, distance ${distance} 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("XaxisCalibrationData");
        const data = saved ? JSON.parse(saved) : {};

        if (data[pitch] && data[pitch][distance]) {
            delete data[pitch][distance];

            // pitch에 distance가 하나도 없으면 pitch도 삭제
            if (Object.keys(data[pitch]).length === 0) {
                delete data[pitch];
            }

            localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
            window.dispatchEvent(new Event("calibrationDataUpdated"));

            toast.success(`distance ${distance} 삭제됨`);
        }
    };

    // 특정 pitch 데이터 복사
    const copyPitchData = (pitch, eyeAngles) => {
        const dataStr = JSON.stringify({ [pitch]: eyeAngles }, null, 2);
        navigator.clipboard
            .writeText(dataStr)
            .then(() => toast.success(`pitch ${pitch} 데이터 복사됨`))
            .catch(() => toast.error("복사 실패"));
    };

    // 특정 eye_angle 데이터 삭제
    const deleteEyeAngleData = (pitch, eyeAngle) => {
        if (!window.confirm(`pitch ${pitch}, eye_angle ${eyeAngle}° 데이터를 삭제하시겠습니까?`)) {
            return;
        }

        const saved = localStorage.getItem("XaxisCalibrationData");
        const data = saved ? JSON.parse(saved) : {};

        if (data[pitch] && data[pitch][eyeAngle] !== undefined) {
            delete data[pitch][eyeAngle];

            if (Object.keys(data[pitch]).length === 0) {
                delete data[pitch];
            }

            localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));
            removeDetail(pitch, eyeAngle);
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
                        .map(([pitch, eyeAngles]) => (
                            <div key={pitch} className="p-4 rounded-lg shadow-xl border">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-bold text-blue-600">Pitch: {pitch}°</h3>
                                    <div className="space-x-2 ml-2">
                                        <button
                                            onClick={() => copyPitchData(pitch, eyeAngles)}
                                            className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                                        >
                                            전체 복사
                                        </button>
                                        <button
                                            onClick={() => deletePitchData(pitch)}
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
                                                                deleteEyeAngleData(pitch, eyeAngle)
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
                <p>카메라 각도 (pitch): {Object.keys(calibrationData).length}개</p>
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
// detail: 측정 성분 데이터 { dx_px, dy_px, dx_mm, dy_mm, ref_x, ref_y, samples } — 수동 입력 시 null
export const saveCalibrationMeasurement = (pitch, delta_x, strEyeAngle, detail = null) => {
    const pitchVal = parseFloat(pitch);
    const deltaXVal = parseFloat(delta_x);
    const eyeAngle = parseInt(strEyeAngle);

    if (isNaN(pitchVal) || isNaN(deltaXVal) || isNaN(eyeAngle)) {
        console.error("❌ 잘못된 값:", { pitch, delta_x, strEyeAngle });
        toast.error("잘못된 데이터 형식");
        return;
    }

    const pitchKey = pitchVal.toFixed(1);

    const saved = localStorage.getItem("XaxisCalibrationData");
    const data = saved ? JSON.parse(saved) : {};

    if (!data[pitchKey]) {
        data[pitchKey] = {};
    }

    // 구조: { pitch: { eyeAngle: delta_x_mm } }
    data[pitchKey][eyeAngle] = parseFloat(deltaXVal.toFixed(3));

    localStorage.setItem("XaxisCalibrationData", JSON.stringify(data));

    // 성분 데이터는 별도 키에 저장 (직선 피팅 검증·재분석용)
    //
    // 같은 각도를 여러 번 재는 경우(반복 스윕)를 위해 **배열로 누적**한다.
    // 예전처럼 단일 객체로 덮어쓰면 2회차 측정이 1회차를 지워버려,
    // 모터 재현성과 공식 오차를 분리할 방법이 사라진다.
    // 위의 data[pitchKey][eyeAngle]은 표 표시용이라 마지막 값만 유지한다(기존 동작 그대로).
    if (detail) {
        const savedDetails = localStorage.getItem("XaxisCalibrationDetails");
        const details = savedDetails ? JSON.parse(savedDetails) : {};
        if (!details[pitchKey]) details[pitchKey] = {};

        const prev = details[pitchKey][eyeAngle];
        // 예전 형식(객체 1개)으로 저장된 데이터도 그대로 읽히도록 배열로 승격한다.
        const list = Array.isArray(prev) ? prev : prev ? [prev] : [];
        list.push(detail);
        details[pitchKey][eyeAngle] = list;

        localStorage.setItem("XaxisCalibrationDetails", JSON.stringify(details));
    }

    window.dispatchEvent(new Event("calibrationDataUpdated"));

    console.log(`저장: pitch=${pitchKey}, eye=${eyeAngle}°, delta_x=${deltaXVal.toFixed(3)}mm`, detail);
    toast.success(`저장 완료: ${eyeAngle}°`);
};
