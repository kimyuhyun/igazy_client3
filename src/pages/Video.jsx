// pages/Videos.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import Table from "../components/Table";
import useLoadingStore from "../stores/useLoadingStore";
import useVariableStore from "../stores/useVariableStore";
import axios from "axios";
import DualImagePlayer from "../components/DualImagePlayer";
import VideoPopup from "../components/VideoPopup";
import Popup from "../components/Popup";
import MySlider from "../components/MySlider";
import LiveGraph from "../components/LiveGraph";
import JSZip from "jszip";
import {
    initDB,
    saveZipToDB,
    getZipFromDB,
    checkStorageQuota,
    cleanupOldFiles,
    calculateTotalSize,
    getAllZipsFromDB,
    deleteZipFromDB,
    clearAllCache,
} from "../utils/indexedDB";
import { Database, Trash2, Edit2 } from "lucide-react";
import RippleButton from "../components/RippleButton";

export default function Video() {
    const { IP, setPatientNum, setPatientName, setAngle, setDistance, setLimbusPX, setLimbusMM } = useVariableStore();
    const { setLoading } = useLoadingStore();
    const API_URL = `http://${IP}:8080`;

    const [maxFrame, setMaxFrame] = useState(600);
    const [isPlaying, setIsPlaying] = useState(false);

    const [vids, setVids] = useState([]);

    const [storageInfo, setStorageInfo] = useState(null);
    const [cachedFiles, setCachedFiles] = useState(new Set());
    const [selectedFiles, setSelectedFiles] = useState(new Set());

    // 환자 정보 수정 관련 state
    const [editingFile, setEditingFile] = useState(null);
    const [editPatientNum, setEditPatientNum] = useState("");
    const [editPatientName, setEditPatientName] = useState("");
    const [editLimbusMM, setEditLimbusMM] = useState("");
    const [editLimbusPX, setEditLimbusPX] = useState("");

    const playerRef = useRef(null);
    const intervalRef = useRef(null);
    const currentFrameRef = useRef(0);

    const [odImages, setOdImages] = useState([]);
    const [osImages, setOsImages] = useState([]);
    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);


    const updateStorageInfo = useCallback(async () => {
        const quota = await checkStorageQuota();
        const totalSize = await calculateTotalSize();
        setStorageInfo({ ...quota, dbSize: totalSize });
    }, []);

    const updateCachedFilesList = useCallback(async () => {
        const allZips = await getAllZipsFromDB();
        const paths = new Set(allZips.map((z) => z.filePath));
        setCachedFiles(paths);
    }, []);

    // 파일 크기를 MB로 변환하는 함수
    const formatFileSize = (sizeStr) => {
        // "123.45 MB" 형식이면 그대로 반환
        if (typeof sizeStr === 'string' && sizeStr.includes('MB')) {
            return sizeStr;
        }

        // "캐시됨" 같은 텍스트면 그대로 반환
        if (typeof sizeStr === 'string' && isNaN(parseFloat(sizeStr))) {
            return sizeStr;
        }

        // 숫자로 변환 가능하면 MB로 계산
        const bytes = parseFloat(sizeStr);
        if (isNaN(bytes)) {
            return sizeStr;
        }

        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    };

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const url = `${API_URL}/api/zip/list`;
            const { data } = await axios({
                url,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 1000,
            });
            console.log(data);

            const arr = [];
            for (const o of data.files) {
                const tmp = o.fileName.split("_");
                const date = tmp[2]?.split("-") || [];

                const obj = {
                    num: tmp[0] || "N/A",
                    name1: tmp[1] || "N/A",
                    fileName: o.fileName,
                    fileSize: formatFileSize(o.fileSize),
                    filePath: o.filePath,
                    date: date.length >= 5
                        ? `${date[0]}-${date[1]}-${date[2]} ${date[3]}:${date[4]}`
                        : "N/A",
                    // 정렬용 타임스탬프 추가
                    timestamp: date.length >= 5
                        ? `${date[0]}${date[1]}${date[2]}${date[3]}${date[4]}`
                        : "0",
                };
                arr.push(obj);
            }

            // 날짜순 정렬 (최신순)
            arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

            setVids(arr);
        } catch (error) {
            console.error("Failed to fetch video list:", error);

            // 서버 연결 실패 시 캐시된 파일 목록 표시
            try {
                const cachedZips = await getAllZipsFromDB();
                if (cachedZips.length > 0) {
                    const arr = cachedZips.map((zip) => {
                        const tmp = zip.fileName.split("_");
                        const date = tmp[2]?.split("-") || [];

                        return {
                            num: tmp[0] || "N/A",
                            name1: tmp[1] || "N/A",
                            fileName: zip.fileName,
                            fileSize: "캐시됨",
                            filePath: zip.filePath,
                            date: date.length >= 5
                                ? `${date[0]}-${date[1]}-${date[2]} ${date[3]}:${date[4]}`
                                : "N/A",
                            // 정렬용 타임스탬프 추가
                            timestamp: date.length >= 5
                                ? `${date[0]}${date[1]}${date[2]}${date[3]}${date[4]}`
                                : "0",
                        };
                    });

                    // 날짜순 정렬 (최신순)
                    arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

                    setVids(arr);
                    toast.error("서버 연결 실패 - 캐시된 파일만 표시됩니다", { id: "error" });
                } else {
                    toast.error("비디오 목록을 불러오는데 실패했습니다", { id: "error" });
                }
            } catch (cacheError) {
                console.error("Failed to load cached files:", cacheError);
                toast.error("비디오 목록을 불러오는데 실패했습니다", { id: "error" });
            }
        } finally {
            setLoading(false);
        }
    }, [API_URL, setLoading]);

    useEffect(() => {
        initDB();
        fetchData();
        updateStorageInfo();
        updateCachedFilesList();

        // Cleanup: 컴포넌트 언마운트 시 interval 정리
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [fetchData, updateStorageInfo, updateCachedFilesList]);

    async function handleVideoClick(filePath, fileName) {
        if (!filePath) {
            return;
        }

        try {
            setLoading(true);

            // 1. IndexedDB에서 먼저 확인
            const cachedData = await getZipFromDB(filePath);

            console.log(cachedData);

            if (cachedData) {
                toast.success("캐시에서 불러왔습니다", { id: "success" });


                setOdResults(cachedData.od);
                setOsResults(cachedData.os);
                setOdImages(cachedData.odImages);
                setOsImages(cachedData.osImages);

                setPatientNum(cachedData.patient_num);
                setPatientName(cachedData.patient_name);
                setAngle(cachedData.angle);
                setDistance(cachedData.distance);
                setLimbusPX(cachedData.limbus_px);
                setLimbusMM(cachedData.limbus_mm);

                setLoading(false);
                return;
            }

            // 2. IndexedDB에 없으면 서버 API로 ZIP 파일 다운로드
            toast.loading("ZIP 파일 다운로드 중...", { id: "download" });

            const downloadUrl = `${API_URL}/api/zip/download?zipPath=${encodeURIComponent(filePath)}`;

            const response = await axios({
                url: downloadUrl,
                method: "GET",
                responseType: "blob",
                onDownloadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        toast.loading(`다운로드 중... ${percentCompleted}%`, { id: "download" });
                    }
                },
            });

            toast.loading("ZIP 파일 파싱 중...", { id: "download" });

            // 3. JSZip으로 파싱
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(response.data);

            // 4. results.json 읽기
            const resultsJsonFile = Object.values(zipContent.files).find((f) => f.name.endsWith("results.json"));

            if (!resultsJsonFile) {
                toast.error("results.json을 찾을 수 없습니다", { id: "download" });
                return;
            }

            const resultsText = await resultsJsonFile.async("text");
            const results = JSON.parse(resultsText);

            toast.loading("이미지 로딩 중...", { id: "download" });

            // 5. 이미지 파일들 로드
            const odImagesList = [];
            const osImagesList = [];

            let processedCount = 0;
            const totalFiles = Object.values(zipContent.files).filter((f) => !f.dir && f.name.endsWith(".jpg")).length;

            // OD/OS 이미지 수집
            const odFiles = [];
            const osFiles = [];

            for (const [path, file] of Object.entries(zipContent.files)) {
                if (!file.dir && path.endsWith(".jpg")) {
                    const frameIndex = parseInt(path.match(/(\d+)\.jpg$/)?.[1]);

                    if (!isNaN(frameIndex)) {
                        if (path.includes("od/")) {
                            odFiles.push({ frameIndex, file });
                        } else if (path.includes("os/")) {
                            osFiles.push({ frameIndex, file });
                        }
                    }
                }
            }

            // frameIndex 순서대로 정렬
            odFiles.sort((a, b) => a.frameIndex - b.frameIndex);
            osFiles.sort((a, b) => a.frameIndex - b.frameIndex);

            // OD 이미지 로드
            for (let i = 0; i < odFiles.length; i++) {
                const base64 = await odFiles[i].file.async("base64");
                odImagesList.push(base64);


                processedCount++;
                if (processedCount % 10 === 0 || processedCount === totalFiles) {
                    toast.loading(`이미지 처리 중... ${processedCount}/${totalFiles}`, {
                        id: "download",
                    });
                }
            }
            // OS 이미지 로드
            for (let i = 0; i < osFiles.length; i++) {
                const base64 = await osFiles[i].file.async("base64");
                osImagesList.push(base64);

                processedCount++;
                if (processedCount % 10 === 0 || processedCount === totalFiles) {
                    toast.loading(`이미지 처리 중... ${processedCount}/${totalFiles}`, {
                        id: "download",
                    });
                }
            }

            // od, os 배열도 0부터 재정렬
            const odData = results.od
                .sort((a, b) => a.frame_index - b.frame_index)
                .map((item, index) => ({
                    ...item,
                    frame_index: index,
                }));

            const osData = results.os
                .sort((a, b) => a.frame_index - b.frame_index)
                .map((item, index) => ({
                    ...item,
                    frame_index: index,
                }));

            const zipData = {
                patient_num: results.patient_num,
                patient_name: results.patient_name,
                distance: results.distance,
                angle: results.angle,
                limbus_px: results.limbus_px,
                limbus_mm: results.limbus_mm,
                od: odData,
                os: osData,
                odImages: odImagesList,
                osImages: osImagesList,
            };

            // 6. 저장 공간 확인
            const storage = await checkStorageQuota();
            const estimatedSize = JSON.stringify(zipData).length;

            if (storage.available > 0 && estimatedSize > storage.available) {
                toast.loading("저장 공간 확보 중...", { id: "download" });
                const deleted = await cleanupOldFiles(5);
                toast.success(`오래된 파일 ${deleted}개 삭제됨`, { id: "success" });
            }

            // 7. IndexedDB에 저장
            toast.loading("캐시에 저장 중...", { id: "download" });
            await saveZipToDB(filePath, fileName, zipData);

            // 8. 화면에 표시
            setOdResults(zipData.od);
            setOsResults(zipData.os);
            setOdImages(zipData.odImages);
            setOsImages(zipData.osImages);

            setPatientNum(zipData.patient_num);
            setPatientName(zipData.patient_name);
            setAngle(zipData.angle);
            setDistance(zipData.distance);
            setLimbusPX(zipData.limbus_px);
            setLimbusMM(zipData.limbus_mm);


            // 9. 상태 업데이트
            await updateStorageInfo();
            await updateCachedFilesList();

            toast.success("영상을 불러왔습니다", { id: "success" });
        } catch (error) {
            console.error("Failed to load video:", error);
            toast.error("영상을 불러오는데 실패했습니다", { id: "error" });
        } finally {
            setLoading(false);
        }
    }

    // 개별 캐시 삭제
    const handleDeleteCache = async (filePath, fileName) => {
        try {
            if (!confirm(`"${fileName}" 캐시를 삭제하시겠습니까?`)) {
                return;
            }

            await deleteZipFromDB(filePath);
            toast.success("캐시가 삭제되었습니다", { id: "success" });

            // 상태 업데이트
            await updateStorageInfo();
            await updateCachedFilesList();
        } catch (error) {
            console.error("Failed to delete cache:", error);
            toast.error("캐시 삭제에 실패했습니다", { id: "error" });
        }
    };

    // 전체 캐시 삭제
    const handleClearAllCache = async () => {
        try {
            const cachedCount = cachedFiles.size;

            if (cachedCount === 0) {
                toast.error("삭제할 캐시가 없습니다");
                return;
            }

            if (!confirm(`모든 캐시 파일 ${cachedCount}개를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
                return;
            }

            setLoading(true);
            await clearAllCache();

            toast.success(`${cachedCount}개의 캐시가 삭제되었습니다`, { id: "success" });

            // 상태 업데이트
            await updateStorageInfo();
            await updateCachedFilesList();
        } catch (error) {
            console.error("Failed to clear all cache:", error);
            toast.error("전체 캐시 삭제에 실패했습니다", { id: "error" });
        } finally {
            setLoading(false);
        }
    };

    // 파일 선택/해제
    const handleSelectFile = (filePath) => {
        setSelectedFiles((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(filePath)) {
                newSet.delete(filePath);
            } else {
                newSet.add(filePath);
            }
            return newSet;
        });
    };

    // 전체 선택/해제
    const handleSelectAll = () => {
        if (selectedFiles.size === vids.length) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(vids.map((v) => v.filePath)));
        }
    };

    // zip 삭제
    // 환자 정보 수정 모달 열기
    const handleEditPatient = async (row) => {
        console.log(row);

        setEditingFile(row);
        setEditPatientNum(row.num);
        setEditPatientName(row.name1);

        // 캐시된 ZIP 파일에서 limbus_mm, limbus_px 로드
        try {
            const cachedData = await getZipFromDB(row.filePath);

            console.log(cachedData);


            if (cachedData) {
                setEditLimbusMM(cachedData.limbus_mm || "");
                setEditLimbusPX(cachedData.limbus_px ? parseFloat(cachedData.limbus_px).toFixed(1) : "");
            } else {
                // 캐시에 없으면 빈 값
                setEditLimbusMM("");
                setEditLimbusPX("");
                toast.error("캐시된 데이터가 없습니다. 먼저 파일을 열어주세요.", { id: "error" });
            }
        } catch (error) {
            console.error("Failed to load limbus data:", error);
            setEditLimbusMM("");
            setEditLimbusPX("");
        }
    };

    // 환자 정보 수정 모달 닫기
    const handleCloseEditModal = () => {
        setEditingFile(null);
        setEditPatientNum("");
        setEditPatientName("");
        setEditLimbusMM("");
        setEditLimbusPX("");
    };

    // 환자 정보 수정 API 호출
    const handleUpdatePatientInfo = async () => {
        if (!editPatientNum.trim() || !editPatientName.trim()) {
            toast.error("환자번호와 이름을 모두 입력해주세요");
            return;
        }

        try {
            setLoading(true);

            const { data } = await axios({
                url: `${API_URL}/api/zip/update-patient`,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
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

                // 목록 새로고침
                await fetchData();

                // 캐시에 해당 파일이 있으면 삭제 (재다운로드 필요)
                if (cachedFiles.has(editingFile.filePath)) {
                    await deleteZipFromDB(editingFile.filePath);
                    await updateCachedFilesList();
                    toast.success("캐시가 삭제되었습니다. 다시 불러와주세요.", { id: "success" });
                }

                handleCloseEditModal();
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

    const handleDelete = async () => {
        if (selectedFiles.size === 0) {
            toast.error("삭제할 파일을 선택해주세요");
            return;
        }

        if (!confirm(`선택한 ${selectedFiles.size}개의 파일을 삭제하시겠습니까 ? `)) {
            return;
        }

        try {
            setLoading(true);
            const zipPaths = Array.from(selectedFiles);

            const { data } = await axios({
                url: `${API_URL}/api/zip/delete`,
                method: "POST",
                headers: {
                    "Content-Type": "application/json; charset=UTF-8",
                },
                data: { zipPaths },
            });

            console.log(data);

            if (data.status === "success") {
                // 결과 메시지
                if (data.failed > 0) {
                    toast.error(`${data.success}개 삭제 성공, ${data.failed}개 실패`, { id: "error" });
                } else {
                    toast.success(`${data.success}개 파일 삭제 완료`, { id: "success" });
                }

                // 선택 초기화
                setSelectedFiles(new Set());

                // 목록 새로고침
                await fetchData();

                // 삭제 성공한 파일들만 캐시에서도 제거
                const successfulDeletes = data.results
                    .filter(r => r.deleted)
                    .map(r => r.path);

                for (const path of successfulDeletes) {
                    await deleteZipFromDB(path);
                }

                await updateCachedFilesList();
                await updateStorageInfo();
            } else {
                toast.error(data.error || "파일 삭제에 실패했습니다");
            }
        } catch (error) {
            console.error("Failed to delete files:", error);
            toast.error("파일 삭제에 실패했습니다");
        } finally {
            setLoading(false);
        }
    };

    // DualImagePlayer에서 호출되는 콜백 함수
    const handleFrameChange = (frame, totalFrames) => {
        currentFrameRef.current = frame;
        setMaxFrame(totalFrames);
    };

    // 슬라이더나 버튼에서 프레임 변경
    const handleSliderFrameChange = (frameNumber) => {
        if (isPlaying) {
            togglePlay();
        }

        currentFrameRef.current = frameNumber;

        if (playerRef.current && playerRef.current.setFrame) {
            playerRef.current.setFrame(frameNumber);
        }
    };

    const togglePlay = () => {
        if (isPlaying) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setIsPlaying(false);
        } else {
            if (maxFrame === 0) return;

            intervalRef.current = setInterval(() => {
                const nextFrame = currentFrameRef.current + 1;
                if (nextFrame >= maxFrame) {
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                    setIsPlaying(false);
                    currentFrameRef.current = maxFrame - 1;
                } else {
                    currentFrameRef.current = nextFrame;
                    // DualImagePlayer에게 프레임 변경 알림
                    if (playerRef.current && playerRef.current.setFrame) {
                        playerRef.current.setFrame(nextFrame);
                    }
                }
            }, 33);

            setIsPlaying(true);
        }
    };

    const handleClose = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
        currentFrameRef.current = 0;
        setMaxFrame(0);
        setOdImages([]);
        setOsImages([]);
        setOdResults([]);
        setOsResults([]);
    };

    return (
        <Layout>

            {/* 저장 공간 정보 */}
            {storageInfo && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                            <Database className="w-4 h-4" />
                            <span>
                                캐시 사용량: {(storageInfo.usage / 1024 / 1024).toFixed(1)} MB /{" "}
                                {(storageInfo.quota / 1024 / 1024 / 1024).toFixed(1)} GB
                            </span>
                            <span className="text-gray-500">
                                (DB: {(storageInfo.dbSize / 1024 / 1024).toFixed(1)} MB)
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {cachedFiles.size > 0 && (
                                <button
                                    onClick={handleClearAllCache}
                                    className="flex items-center gap-1 px-3 py-1 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded transition-colors"
                                    title="전체 캐시 삭제"
                                >
                                    <Database className="w-4 h-4" />
                                    전체 캐시 삭제
                                </button>
                            )}
                            {/* {selectedFiles.size > 0 && (
                                <button
                                    onClick={handleDelete}
                                    className="flex items-center gap-1 px-3 py-1 text-sm text-white bg-black rounded"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    서버파일삭제 ({selectedFiles.size})
                                </button>
                            )} */}
                        </div>
                    </div>
                </div>
            )}

            <Table>
                <Table.Header>
                    {/* <Table.Head className="w-[40px]">
                        <input
                            type="checkbox"
                            checked={vids.length > 0 && selectedFiles.size === vids.length}
                            onChange={handleSelectAll}
                            className="size-4 cursor-pointer mt-1"
                        />
                    </Table.Head> */}
                    <Table.Head className="w-[50px]">No.</Table.Head>
                    <Table.Head className="w-[120px]">번호</Table.Head>
                    <Table.Head>성명</Table.Head>
                    <Table.Head>파일명</Table.Head>
                    <Table.Head>용량</Table.Head>
                    <Table.Head className="w-[150px]">날짜</Table.Head>
                    <Table.Head className="w-[100px]">캐시</Table.Head>
                    <Table.Head className="w-[80px]">수정</Table.Head>
                </Table.Header>
                <Table.Body>
                    {vids.map((row, i) => (
                        <Table.Row key={i} index={i}>
                            {/* <Table.Cell>
                                <input
                                    type="checkbox"
                                    checked={selectedFiles.has(row.filePath)}
                                    onChange={() => handleSelectFile(row.filePath)}
                                    className="size-4 cursor-pointer mt-1"
                                />
                            </Table.Cell> */}
                            <Table.Cell>{i + 1}</Table.Cell>
                            <Table.Cell>{row.num}</Table.Cell>
                            <Table.Cell className="text-start">{row.name1}</Table.Cell>
                            <Table.Cell>
                                <button
                                    type="button"
                                    className="text-blue-600 hover:text-blue-400 font-semibold"
                                    onClick={() => handleVideoClick(row.filePath, row.fileName)}
                                >
                                    {row.fileName}
                                </button>
                            </Table.Cell>
                            <Table.Cell>{row.fileSize}</Table.Cell>
                            <Table.Cell>{row.date}</Table.Cell>
                            <Table.Cell>
                                {cachedFiles.has(row.filePath) ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-green-600 text-xs">✓ 저장됨</span>
                                        <RippleButton
                                            onClick={() => handleDeleteCache(row.filePath, row.fileName)}
                                            className="text-red-500 hover:text-red-700 text-xs"
                                            title="캐시 삭제"
                                        >캐시삭제
                                        </RippleButton>
                                    </div>
                                ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                )}
                            </Table.Cell>
                            <Table.Cell>
                                <button
                                    onClick={() => handleEditPatient(row)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                    title="환자 정보 수정"
                                >
                                    <Edit2 className="w-3 h-3" />
                                    수정
                                </button>
                            </Table.Cell>
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table>

            {/* 환자 정보 수정 모달 */}
            {editingFile && (
                <Popup width="xl" height="h-fit" onClose={handleCloseEditModal}>
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
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">환자번호 <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={editPatientNum}
                            onChange={(e) => setEditPatientNum(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600"
                            placeholder="환자번호를 입력하세요"
                        />
                    </div>

                    <div className="flex flex-col mt-4">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">환자명 <span className="text-red-500">*</span></label>
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
                            <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">윤부 지름 (mm)</label>
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
                            <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">윤부 지름 (px)</label>
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
                        onClick={handleUpdatePatientInfo}
                    >
                        수정
                    </RippleButton>
                </Popup>
            )}

            {/* 비디오 플레이어 팝업 */}
            {osImages.length > 0 && odImages.length > 0 && (
                <VideoPopup
                    onClose={() => {
                        handleClose();
                    }}
                >
                    <DualImagePlayer
                        ref={playerRef}
                        odImages={odImages}
                        osImages={osImages}
                        currentFrameRef={currentFrameRef} // ref 사용
                        onFrameChange={handleFrameChange}
                    />

                    <div className="flex flex-row my-4">
                        <div className="w-5" />
                        <MySlider
                            max_frame={maxFrame}
                            currentFrameRef={currentFrameRef} // ref 사용
                            onCurrent={handleSliderFrameChange}
                        />
                    </div>

                    <div className="my-4">
                        <LiveGraph
                            odResults={odResults}
                            osResults={osResults}
                            maxFrame={maxFrame}
                            currentFrameRef={currentFrameRef} // ref 대신 state 전달
                        />
                    </div>
                </VideoPopup>
            )}
        </Layout>
    );
}
