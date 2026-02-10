import React, { useState } from "react";
import ManualDistanceMeasurement from "../components/ManualDistanceMeasurement";
import { calcMM } from "../utils/calcPxToMm";
import { Upload, Info } from "lucide-react";
import Layout from "../components/Layout";

export default function LimbusTest() {
    const [uploadedImage, setUploadedImage] = useState(null);
    const [measuredPx, setMeasuredPx] = useState(null);
    const [limbusMM, setLimbusMM] = useState(13.81);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            setUploadedImage(event.target.result);
            setMeasuredPx(null); // Reset measurement
        };
        reader.readAsDataURL(file);
    };

    const handleMeasurementComplete = (limbusPxDiameter) => {
        setMeasuredPx(limbusPxDiameter);
    };

    const calculateDistance = (limbusMMValue) => {
        if (!measuredPx) return null;
        return calcMM(limbusMMValue, measuredPx);
    };

    const testValues = [10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 13.81, 14.0, 14.5];

    return (
        <Layout>
            <div className="bg-white rounded-lg shadow-lg p-4">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                    이미지를 업로드하고 윤부(White to White)의 양 끝을 클릭하여 픽셀 지름을 측정하세요.
                </p>

                {/* Image Upload */}
                <div className="mb-6">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-4">
                            <Upload className="w-10 h-10 mb-3 text-gray-400" />
                            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                <span className="font-semibold">클릭하여 이미지 업로드</span>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                PNG, JPG (최대 10MB)
                            </p>
                        </div>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleImageUpload}
                        />
                    </label>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-2 flex-shrink-0" />
                        <div className="text-sm text-blue-800 dark:text-blue-300">
                            <p className="font-semibold mb-1">측정 방법:</p>
                            <ol className="list-decimal list-inside space-y-1">
                                <li>윤부(흰자)의 왼쪽 끝을 클릭</li>
                                <li>윤부(흰자)의 오른쪽 끝을 클릭</li>
                                <li>확인 버튼을 눌러 측정 완료</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>

            {/* Measurement Area */}
            {uploadedImage && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                    <div className="col-span-2 bg-white rounded-lg shadow-lg p-4">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            이미지 측정
                        </h2>
                        <ManualDistanceMeasurement
                            imageSource={uploadedImage}
                            onMeasurementComplete={handleMeasurementComplete}
                        />
                    </div>

                    {/* Results */}
                    <div className="bg-white rounded-lg shadow-lg p-4">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            측정 결과
                        </h2>

                        {measuredPx ? (
                            <div className="space-y-4">
                                {/* Measured Value */}
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <p className="text-sm text-green-800 dark:text-green-300 mb-1">
                                        측정된 윤부 지름 (픽셀)
                                    </p>
                                    <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                                        {measuredPx.toFixed(2)} px
                                    </p>
                                </div>

                                {/* Input for LIMBUS_MM */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        실제 윤부 지름 (mm) - 병원 기기 측정값
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={limbusMM}
                                        onChange={(e) => setLimbusMM(parseFloat(e.target.value))}
                                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                {/* Calculated Distance */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <p className="text-sm text-blue-800 dark:text-blue-300 mb-1">
                                        계산된 카메라-눈 거리
                                    </p>
                                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                                        {calculateDistance(limbusMM)?.toFixed(2)} mm
                                    </p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                                        공식: (410 × {limbusMM}) / {measuredPx.toFixed(2)}
                                    </p>
                                </div>

                                {/* Test Table */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                        다양한 LIMBUS_MM 값에 따른 거리 계산
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse border border-gray-300 dark:border-gray-600">
                                            <thead>
                                                <tr className="bg-gray-100 dark:bg-gray-700">
                                                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">
                                                        LIMBUS_MM
                                                    </th>
                                                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">
                                                        거리 (mm)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {testValues.map((value) => {
                                                    const distance = calculateDistance(value);
                                                    const isSelected = value === limbusMM;
                                                    return (
                                                        <tr
                                                            key={value}
                                                            className={`${isSelected
                                                                ? "bg-blue-100 dark:bg-blue-900/30 font-bold"
                                                                : "hover:bg-gray-50 dark:hover:bg-gray-700"
                                                                }`}
                                                        >
                                                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-gray-900 dark:text-white">
                                                                {value.toFixed(2)} mm
                                                            </td>
                                                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-gray-900 dark:text-white">
                                                                {distance?.toFixed(2)} mm
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                                <p>윤부 지름을 측정해주세요</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </Layout>
    );
}
