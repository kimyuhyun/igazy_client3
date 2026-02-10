import { useState } from "react";
import Popup from "./Popup";
import RippleButton from "./RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import useLoadingStore from "../stores/useLoadingStore";
import { deleteZipFromDB } from "../utils/indexedDB";

export default function PatientInfoEditModal({ editingFile, cachedFiles, apiUrl, onClose, onUpdated }) {
    const { setLoading } = useLoadingStore();
    const [editPatientNum, setEditPatientNum] = useState(editingFile.num || "");
    const [editPatientName, setEditPatientName] = useState(editingFile.name1 || "");
    const [editLimbusMM, setEditLimbusMM] = useState(editingFile.limbus_mm || "");
    const [editLimbusPX, setEditLimbusPX] = useState(editingFile.limbus_px || "");

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
                },
            });

            if (data.status === "success") {
                toast.success("환자 정보가 수정되었습니다", { id: "success" });

                if (cachedFiles.has(editingFile.filePath)) {
                    await deleteZipFromDB(editingFile.filePath);
                    toast.success("캐시가 삭제되었습니다. 다시 불러와주세요.", { id: "success" });
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
                        윤부 지름 (mm)
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
                        윤부 지름 (px)
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

            <RippleButton
                className="bg-blue-600 hover:bg-blue-400 text-white w-full py-2 mt-8"
                onClick={handleUpdate}
            >
                수정
            </RippleButton>
        </Popup>
    );
}
