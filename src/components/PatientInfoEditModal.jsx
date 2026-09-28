import { useState } from "react";
import Popup from "./Popup";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import useLoadingStore from "../stores/useLoadingStore";
import { deleteZipFromDB, updateZipMetaInDB } from "../utils/indexedDB";

export default function PatientInfoEditModal({ editingFile, cachedFiles, apiUrl, onClose, onUpdated }) {
    const { setLoading } = useLoadingStore();
    const [editPatientNum, setEditPatientNum] = useState(editingFile.num || "");
    const [editPatientName, setEditPatientName] = useState(editingFile.name1 || "");
    const [editLimbusMM, setEditLimbusMM] = useState(editingFile.limbus_mm || "");
    const [editLimbusPX, setEditLimbusPX] = useState(editingFile.limbus_px || "");
    // IOL Master 값 — 회전반경 R = 0.5625 x AL - 0.847 x ACD 산출용. 선택 입력.
    const [editAxialLength, setEditAxialLength] = useState(editingFile.axial_length || "");
    const [editAcd, setEditAcd] = useState(editingFile.acd || "");

    const handleUpdate = async () => {
        if (!editPatientNum.trim() || !editPatientName.trim()) {
            toast.error("환자번호와 이름을 모두 입력해주세요");
            return;
        }

        try {
            setLoading(true);

            const { data } = await axios({
                url: `${apiUrl}/api/zip/update-patient`,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                data: {
                    zipPath: encodeURIComponent(editingFile.filePath),
                    patientNum: encodeURIComponent(editPatientNum.trim()),
                    patientName: encodeURIComponent(editPatientName.trim()),
                    limbusMM: editLimbusMM ? encodeURIComponent(editLimbusMM.toString()) : null,
                    limbusPX: editLimbusPX ? encodeURIComponent(editLimbusPX.toString()) : null,
                    // 빈 문자열도 보낸다 — 값을 지운 것을 서버가 구분할 수 있어야 한다
                    axialLength: encodeURIComponent(editAxialLength.toString().trim()),
                    acd: encodeURIComponent(editAcd.toString().trim()),
                },
            });

            if (data.status === "success") {
                toast.success("환자 정보가 수정되었습니다", { id: "success" });

                // 이미지는 안 바뀌었으니 캐시를 버리지 않고 메타만 갈아끼운다.
                // (예전엔 캐시를 지워서 37~110MB를 다시 내려받아야 했다)
                if (cachedFiles.has(editingFile.filePath)) {
                    // 경로는 서버가 목록과 같은 형식으로 준다 — 직접 조립하면 인코딩이 어긋나
                    // 캐시를 못 찾고 다시 내려받게 된다
                    const newFilePath = data.newFilePath || editingFile.filePath;
                    try {
                        await updateZipMetaInDB(editingFile.filePath, newFilePath, data.newFileName, {
                            patient_num: editPatientNum.trim(),
                            patient_name: editPatientName.trim(),
                            limbus_mm: editLimbusMM?.toString() ?? "",
                            limbus_px: editLimbusPX?.toString() ?? "",
                            axial_length: editAxialLength.toString().trim(),
                            acd: editAcd.toString().trim(),
                        });
                    } catch (error) {
                        // 캐시 갱신이 실패하면 낡은 값이 남는 게 더 위험하니 버린다
                        console.error("Failed to patch cache:", error);
                        await deleteZipFromDB(editingFile.filePath);
                        toast.error("캐시를 갱신하지 못해 삭제했습니다. 다시 불러와주세요.");
                    }
                }

                onUpdated();
                onClose();
            } else {
                toast.error(data.error || "환자 정보 수정에 실패했습니다");
            }
        } catch (error) {
            console.error("Failed to update patient info:", error);
            toast.error("환자 정보 수정에 실패했습니다");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Popup width="xl" height="h-fit" onClose={onClose}>
            <div className="flex flex-col">
                <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">파일명</label>
                <input
                    type="text"
                    value={editingFile.fileName}
                    disabled
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600"
                />
            </div>

            <div className="flex flex-col mt-4">
                <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                    환자번호 <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={editPatientNum}
                    onChange={(e) => setEditPatientNum(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                    placeholder="환자번호를 입력하세요"
                />
            </div>

            <div className="flex flex-col mt-4">
                <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                    환자명 <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={editPatientName}
                    onChange={(e) => setEditPatientName(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                    placeholder="환자명을 입력하세요"
                />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex flex-col">
                    <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                        윤부 지름 (mm) <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={editLimbusMM}
                        onChange={(e) => setEditLimbusMM(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        placeholder="윤부 지름 (mm)"
                    />
                </div>
                <div className="flex flex-col">
                    <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                        윤부 지름 (px) <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        value={editLimbusPX}
                        onChange={(e) => setEditLimbusPX(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        placeholder="윤부 지름 (px)"
                    />
                </div>
            </div>

            {/* IOL Master 검사지 값. 비워두면 표준 눈(AL 24.0 / ACD 3.6)으로 계산된다. */}
            <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex flex-col">
                    <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">안축장 AL (mm)</label>
                    <input
                        type="number"
                        step="0.01"
                        value={editAxialLength}
                        onChange={(e) => setEditAxialLength(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        placeholder="예: 24.00 (비우면 표준값)"
                    />
                </div>
                <div className="flex flex-col">
                    <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">전방깊이 ACD (mm)</label>
                    <input
                        type="number"
                        step="0.01"
                        value={editAcd}
                        onChange={(e) => setEditAcd(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        placeholder="예: 3.60 (비우면 표준값)"
                    />
                </div>
            </div>

            <RippleButton
                className="bg-blue-600 hover:bg-blue-400 text-white w-full py-2 mt-8"
                onClick={handleUpdate}
            >
                수정
            </RippleButton>
        </Popup>
    );
}
