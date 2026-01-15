import React, { useEffect, useState } from "react";
import useMyTableStore from "../stores/useMyTableStore";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";


export default function CalibrationTable({ avgValue, onSaved }) {
    const { degTable, setDegTable } = useMyTableStore();
    const { kyhTemp, setKyhTemp } = useVariableStore();

    // console.log(degTable);

    const distances = [28, 30, 32, 34];
    const degrees = Array.from({ length: 7 }, (_, i) => i * 5);

    const [formData, setFormData] = useState({ deg: "", points: "" });

    const onSave = () => {
        if (!formData.deg) {
            alert("각도를 입력해주세요");
            return;
        }

        if (!kyhTemp) {
            alert("거리를 입력해주세요");
            return;
        }

        if (!formData.avg) {
            alert("avg를 입력해주세요");
            return;
        }

        const distanceMm = Number(kyhTemp);
        const deg = Number(formData.deg);
        const avg = formData.avg;

        if (isNaN(deg)) {
            alert("숫자를 입력해주세요");
            return;
        }

        const newTable = JSON.parse(JSON.stringify(degTable || {}));

        if (!newTable[distanceMm]) {
            newTable[distanceMm] = {};
        }

        newTable[distanceMm][deg] = avg;

        console.log(newTable);

        setDegTable(newTable);

        let newDeg = 0;
        if (deg < 30) {
            newDeg = deg + 5;
        }

        setFormData({ deg: newDeg, avg: "" });

        onSaved();
    };

    const clearTable = () => {
        if (window.confirm("is clear?")) {
            setDegTable(null);
        }
    };

    useEffect(() => {
        console.log("@@@@", avgValue);

        if (avgValue) {
            const text = `${avgValue}`;
            console.log(text);
            setFormData({
                ...formData,
                avg: text,
            });
        }
    }, [avgValue]);

    return (
        <div className="p-0">
            <div className="flex flex-row items-center mb-2 gap-2">
                <input
                    type="text"
                    className="border p-2 w-20 rounded"
                    placeholder="각도"
                    value={formData.deg || ""}
                    onChange={(e) => setFormData({ ...formData, deg: e.target.value })}
                />
                <input
                    type="text"
                    className="border p-2 w-36 rounded text-center"
                    placeholder="평균값"
                    value={formData.avg || ""}
                    onChange={(e) => setFormData({ ...formData, avg: e.target.value })}
                />

                <input
                    type="text"
                    className="border p-2 w-20 rounded"
                    placeholder="거리(mm)"
                    value={kyhTemp}
                    onChange={(e) => setKyhTemp(e.target.value)}
                />
                <RippleButton onClick={() => onSave()} className="px-6 py-2 bg-blue-600 text-white rounded">
                    저장
                </RippleButton>

                <RippleButton onClick={() => clearTable()} className="px-6 py-2 bg-red-600 text-white rounded ml-auto">
                    테이블 클리어
                </RippleButton>
            </div>
            <div className="overflow-x-auto scrollbar-thin">
                <table className="border-collapse border border-gray-400 text-sm">
                    <thead>
                        <tr className="bg-gray-800 text-white">
                            <th className="border border-gray-400 px-2 py-2"></th>
                            {degrees.map((deg) => (
                                <th key={deg} className="border border-gray-400">
                                    <button
                                        type="button"
                                        className="px-2 py-2"
                                        onClick={() => setFormData({ ...formData, deg })}
                                    >
                                        {deg}°
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {distances.map((distance, idx) => (
                            <tr
                                key={distance}
                                className={`
                                    ${idx % 2 === 0 ? "bg-white" : "bg-gray-100"} 
                                    ${Number(kyhTemp) === distance ? "bg-yellow-200" : ""}
                                `}
                            >
                                <td
                                    className={`
                                        border border-gray-400 px-3 py-2 font-bold
                                    `}
                                >
                                    {distance}mm
                                </td>
                                {degrees.map((deg) => {
                                    const cellData = degTable?.[distance]?.[deg];
                                    const displayValue = cellData ? cellData : "-";
                                    return (
                                        <td
                                            key={deg}
                                            className={`
                                        border border-gray-400 px-2 py-2 text-center
                                        ${formData.deg == deg ? "bg-yellow-200" : ""}
                                    `}
                                        >
                                            {displayValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
