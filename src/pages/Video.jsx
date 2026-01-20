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
} from "../utils/indexedDB";
import { Database, Trash2 } from "lucide-react";
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
                const date = tmp[2].split("-");

                const obj = {
                    num: tmp[0],
                    name1: tmp[1],
                    fileName: o.fileName,
                    fileSize: o.fileSize,
                    filePath: o.filePath,
                    date: `${date[0]}-${date[1]}-${date[2]} ${date[3]}:${date[4]}`,
                };
                arr.push(obj);
            }

            setVids(arr);
        } catch (error) {
            console.error("Failed to fetch video list:", error);
            toast.error("비디오 목록을 불러오는데 실패했습니다");
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

            if (estimatedSize > storage.available) {
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
    const handleDelete = async () => {
        if (selectedFiles.size === 0) {
            toast.error("삭제할 파일을 선택해주세요");
            return;
        }

        if (!confirm(`선택한 ${selectedFiles.size}개의 파일을 삭제하시겠습니까?`)) {
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
                            {selectedFiles.size > 0 && (
                                <button
                                    onClick={handleDelete}
                                    className="flex items-center gap-1 px-3 py-1 text-sm text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    선택 삭제 ({selectedFiles.size})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <Table>
                <Table.Header>
                    <Table.Head className="w-[40px]">
                        <input
                            type="checkbox"
                            checked={vids.length > 0 && selectedFiles.size === vids.length}
                            onChange={handleSelectAll}
                            className="size-4 cursor-pointer mt-1"
                        />
                    </Table.Head>
                    <Table.Head className="w-[50px]">No.</Table.Head>
                    <Table.Head className="w-[120px]">번호</Table.Head>
                    <Table.Head>성명</Table.Head>
                    <Table.Head>파일명</Table.Head>
                    <Table.Head>용량</Table.Head>
                    <Table.Head className="w-[150px]">날짜</Table.Head>
                    <Table.Head className="w-[100px]">캐시</Table.Head>
                </Table.Header>
                <Table.Body>
                    {vids.map((row, i) => (
                        <Table.Row key={i} index={i}>
                            <Table.Cell>
                                <input
                                    type="checkbox"
                                    checked={selectedFiles.has(row.filePath)}
                                    onChange={() => handleSelectFile(row.filePath)}
                                    className="size-4 cursor-pointer mt-1"
                                />
                            </Table.Cell>
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
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table>

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
