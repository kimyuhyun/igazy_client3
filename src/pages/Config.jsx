import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import RippleButton from "../components/RippleButton";
import toast from "react-hot-toast";
import { SaveIcon } from "lucide-react";
import axios from "axios";
import useVariableStore from "../stores/useVariableStore";

export default function Config() {
    const { IP, setIp, MAX_FRAME, setMaxFrame, FRAME_HEIGHT, setFrameHeight } = useVariableStore();
    const API_URL = `http://${IP}:8080`;

    const [igazyIP, setIgazyIP] = useState("");

    const [formData, setFormData] = useState({
        max_frame: "",
        frame_height: "",
        ip1: "",
        ip2: "",
        ip3: "",
        ip4: "",
    });

    useEffect(() => {
        if (IP) {
            const tmp = IP.split(".");
            setFormData((prev) => ({
                ...prev,
                max_frame: MAX_FRAME,
                frame_height: FRAME_HEIGHT,
                ip1: tmp[0] || "",
                ip2: tmp[1] || "",
                ip3: tmp[2] || "",
                ip4: tmp[3] || "",
            }));
        }

        getIGazyIp();
    }, [IP, MAX_FRAME]);

    const getIGazyIp = async () => {
        try {
            const { data } = await axios({
                url: `${API_URL}/api/igazy_address`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json; charset=UTF-8",
                },
            });

            if (data.status !== "success") {
                toast.error("IGazy IP 주소를 불러오는데 실패했습니다.");
                return;
            }

            console.log(data);
            setIgazyIP(data.ip);
        } catch (error) {
            toast.error("IGazy IP 주소를 불러오는데 실패했습니다.");
        }
    };

    const handleSave = () => {
        const parts = [formData.ip1, formData.ip2, formData.ip3, formData.ip4].map((s) => (s ?? "").trim());

        const okIp = parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
        if (!okIp) {
            toast.error("안드로이드 앱에서 보여지는 올바른 IP 주소를 입력 해 주세요. (0~255)");
            return;
        }

        const max = formData.max_frame;
        if (!max || Number.isNaN(max)) {
            toast.error("영상의 기본 프레임수를 입력 해 주세요.");
            return;
        }

        const frameHeight = formData.frame_height;
        if (!frameHeight || Number.isNaN(frameHeight)) {
            toast.error("프레임 높이를 입력 해 주세요.");
            return;
        }

        const ip = parts.join(".");
        setIp(ip);
        setMaxFrame(max);
        setFrameHeight(frameHeight);

        toast.success("저장되었습니다.");
    };

    return (
        <Layout>
            <div className="flex flex-col gap-4">
                {/* MAX_FRAME */}
                <div className="flex items-center gap-4">
                    <label className="w-32 font-semibold text-gray-700 dark:text-gray-200">MAX_FRAME</label>
                    <input
                        type="text"
                        value={formData.max_frame || "0"}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) {
                                setFormData((prev) => ({
                                    ...prev,
                                    max_frame: v,
                                }));
                            }
                        }}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                    />
                </div>

                {/* FRAME_HEIGHT */}
                <div className="flex items-center gap-4">
                    <label className="w-32 font-semibold text-gray-700 dark:text-gray-200">FRAME_HEIGHT</label>
                    <input
                        type="text"
                        value={formData.frame_height || "480"}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) {
                                setFormData((prev) => ({
                                    ...prev,
                                    frame_height: v,
                                }));
                            }
                        }}
                        className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                    />
                </div>

                {/* IP */}
                <div className="flex items-center gap-4">
                    <label className="w-32 font-semibold text-gray-700 dark:text-gray-200">IP</label>
                    <div className="flex flex-row items-end">
                        <input
                            type="text"
                            value={formData.ip1 || ""}
                            onChange={(e) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    ip1: e.target.value,
                                }));
                            }}
                            maxLength={3}
                            className="w-16 px-3 py-2 border border-gray-300 text-center rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                        <div className="mx-1">.</div>
                        <input
                            type="text"
                            value={formData.ip2 || ""}
                            onChange={(e) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    ip2: e.target.value,
                                }));
                            }}
                            maxLength={3}
                            className="w-16 px-3 py-2 border border-gray-300 text-center rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                        <div className="mx-1">.</div>
                        <input
                            type="text"
                            value={formData.ip3 || ""}
                            onChange={(e) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    ip3: e.target.value,
                                }));
                            }}
                            maxLength={3}
                            className="w-16 px-3 py-2 border border-gray-300 text-center rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                        <div className="mx-1">.</div>
                        <input
                            type="text"
                            value={formData.ip4 || ""}
                            onChange={(e) => {
                                setFormData((prev) => ({
                                    ...prev,
                                    ip4: e.target.value,
                                }));
                            }}
                            maxLength={3}
                            className="w-16 px-3 py-2 border border-gray-300 text-center rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <label className="w-32 font-semibold text-gray-700 dark:text-gray-200"></label>
                    <div className="flex flex-row items-center gap-4">
                        <a
                            href={`http://${igazyIP}:8088/cam_on`}
                            target="_blank"
                            className="border-b border-blue-600 text-blue-600"
                        >
                            OD,OD 같이보기
                        </a>

                        <a
                            href={`http://${igazyIP}:8081/1/stream`}
                            target="_blank"
                            className="border-b border-blue-600 text-blue-600"
                        >
                            OD
                        </a>

                        <a
                            href={`http://${igazyIP}:8081/2/stream`}
                            target="_blank"
                            className="border-b border-blue-600 text-blue-600"
                        >
                            OS
                        </a>
                    </div>
                </div>

                <div className="flex mt-4">
                    <RippleButton className="bg-blue-600 text-white px-4 py-2" onClick={() => handleSave()}>
                        <SaveIcon />
                        저장
                    </RippleButton>
                </div>
            </div>
        </Layout>
    );
}
