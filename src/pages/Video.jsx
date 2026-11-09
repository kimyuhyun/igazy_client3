import { useDialog } from "../utils/dialog";
// pages/Videos.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Layout from "../components/Layout";
import toast from "react-hot-toast";
import useLoadingStore from "../stores/useLoadingStore";
import useVariableStore from "../stores/useVariableStore";
import ViewerColorSettings from "../components/ViewerColorSettings";
import DualImagePlayer from "../components/DualImagePlayer";
import VideoPopup from "../components/VideoPopup";
import MySlider from "../components/MySlider";
import LiveGraph from "../components/LiveGraph";
import useManualPointStore from "../stores/useManualPointStore";
import ManualPointButtons from "../components/ManualPointButtons";
import PatientInfoEditModal from "../components/PatientInfoEditModal";
import { eyeMetaFromResults, pickEyeJson } from "../utils/eyeMeta";
import JSZip from "jszip";
import DevicePosePip from "../components/DevicePosePip";
import { readPose } from "../utils/pose";
import { useShallow } from "zustand/react/shallow";
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
    LOCAL_PREFIX,
    isLocalPath,
} from "../utils/indexedDB";
import { transformFileData } from "../utils/transformFileData";
import RippleButton from "../components/RippleButton";
import { fpsOf } from "../utils/cameraFps";
import { setAt, placeByFrameIndex, hasFrameIndex } from "../utils/frameIndex";

const listInputClass =
    "h-8 max-[640px]:h-11 min-w-0 rounded border border-[var(--video-control)] bg-white px-2 text-[14px] text-[var(--video-text)] tabular-nums placeholder:text-[var(--video-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";
const listLabelClass =
    "flex min-w-0 flex-col gap-1 text-[13px] text-[var(--video-muted)] max-[640px]:flex-row max-[640px]:items-center max-[640px]:gap-2 max-[640px]:whitespace-nowrap [&>input]:w-full [&>select]:w-full";
const listButtonClass =
    "min-h-8 max-[640px]:min-h-11 shrink-0 rounded px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";
const listCheckboxClass =
    "size-4 cursor-pointer align-middle accent-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";
const PAGE_SIZE = 10; // 사용자 결정 2026-11-03: 한 페이지 10건
const pageButtonClass =
    "h-8 min-w-8 px-2 text-[13px] tabular-nums max-[640px]:h-11 max-[640px]:min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700 disabled:cursor-default disabled:text-[var(--video-muted)]";

const ViewerShell = ({ children }) => <main className="min-h-screen bg-white">{children}</main>;

// bare: 사이드바·상단바 없이 결과 ZIP 뷰어만 보여 준다(pages/Viewer.jsx, 2026-11-09)
export default function Video({ bare = false }) {
    const Shell = bare ? ViewerShell : Layout;
    const dialog = useDialog();
    // selector 구독: 인자 없이 useVariableStore() 를 쓰면 스토어의 아무 값이 바뀌어도(PiP 위치·크기·3D 시점 저장 등)
    // 이 페이지 전체가 리렌더되므로, 실제로 쓰는 값만 골라 구독한다
    const {
        setPatientNum,
        setPatientName,
        setAngle,
        setPoseRef,
        setEyeMeta,
        setLimbusPX,
        setLimbusMM,
        setAxialLength,
        setAcd,
    } = useVariableStore(
        useShallow((s) => ({
            setPatientNum: s.setPatientNum,
            setPatientName: s.setPatientName,
            setAngle: s.setAngle,
            setPoseRef: s.setPoseRef,
            setEyeMeta: s.setEyeMeta,
            setLimbusPX: s.setLimbusPX,
            setLimbusMM: s.setLimbusMM,
            setAxialLength: s.setAxialLength,
            setAcd: s.setAcd,
        })),
    );
    const { setLoading } = useLoadingStore();

    const [maxFrame, setMaxFrame] = useState(600);
    const [isPlaying, setIsPlaying] = useState(false);

    const [vids, setVids] = useState([]);
    const currentVids = useRef([]);
    useEffect(() => {
        currentVids.current = vids;
    }, [vids]);

    const [storageInfo, setStorageInfo] = useState(null);
    // 뷰어(2026-11-09): 폰에서 공유한 ZIP 을 이 화면에 끌어다 놓으면 브라우저에 저장하고 목록에 올린다.
    // dragging = 파일을 끌고 있는 중
    const [dragging, setDragging] = useState(false);
    const [colorSettingsOpen, setColorSettingsOpen] = useState(false);
    // 가져오기 배치 잠금(겹친 드롭이 조용히 빠지지 않게) · 저장 대기 중인 가져온 경로 · 저장 전에 사용자가 지운 가져온 경로
    const importingRef = useRef(false);
    const pendingLocalRef = useRef(new Set());
    const canceledLocalRef = useRef(new Set());
    const [cachedFiles, setCachedFiles] = useState(new Set());
    const [selectedFiles, setSelectedFiles] = useState(new Set());

    // 검색 필터 (2026-10-28 상세화): 기간(시작·종료일) · 년/월 · 환자번호 · 이름 · 파일명 · 캐시 여부 · 정렬
    const [searchYear, setSearchYear] = useState("");
    const [searchMonth, setSearchMonth] = useState("");
    const [searchNum, setSearchNum] = useState("");
    const [searchName, setSearchName] = useState("");
    const [searchFile, setSearchFile] = useState("");
    const [sortKey, setSortKey] = useState("dateDesc"); // dateDesc | dateAsc | num | name | sizeDesc — 목록 위 정렬 선택
    // 입력값은 위 state(초안)에 두고, "검색" 버튼(또는 Enter)을 눌렀을 때만 applied 로 복사해 필터링한다 — 글자마다 거르지 않는다
    const EMPTY_FILTER = { year: "", month: "", num: "", name: "", file: "" };
    const [applied, setApplied] = useState(EMPTY_FILTER);
    const searchButtonRef = useRef(null);
    // 어느 검색 조건에서든 Tab 을 누르면 바로 "검색" 버튼으로 (조건마다 Tab 을 여러 번 치지 않게). Shift+Tab 은 기본 동작.
    const focusSearchOnTab = (e) => {
        if (e.key !== "Tab" || e.shiftKey) return;
        const t = e.target;
        if (t === searchButtonRef.current || !(t.tagName === "INPUT" || t.tagName === "SELECT")) return;
        e.preventDefault();
        searchButtonRef.current?.focus();
    };
    const applyFilters = () =>
        setApplied({ year: searchYear, month: searchMonth, num: searchNum, name: searchName, file: searchFile });
    const hasFilter = Object.keys(EMPTY_FILTER).some((k) => applied[k] !== EMPTY_FILTER[k]);
    const resetFilters = () => {
        setSearchYear("");
        setSearchMonth("");
        setSearchNum("");
        setSearchName("");
        setSearchFile("");
        setApplied(EMPTY_FILTER);
    };

    const filteredVids = useMemo(() => {
        const lc = (v) => (v ?? "").toString().toLowerCase();
        const f = applied;
        const list = vids.filter((row) => {
            const day = row.date?.slice(0, 10) ?? ""; // "yyyy-mm-dd"
            if (f.year && !day.startsWith(f.year)) return false;
            if (f.month && day.split("-")[1] !== f.month) return false;
            if (f.num && !lc(row.num).includes(lc(f.num))) return false;
            if (f.name && !lc(row.name1).includes(lc(f.name))) return false;
            if (f.file && !lc(row.fileName).includes(lc(f.file))) return false;
            return true;
        });
        const cmp =
            {
                dateDesc: (a, b) => b.timestamp.localeCompare(a.timestamp),
                dateAsc: (a, b) => a.timestamp.localeCompare(b.timestamp),
                num: (a, b) => a.num.localeCompare(b.num, "ko") || b.timestamp.localeCompare(a.timestamp),
                name: (a, b) => a.name1.localeCompare(b.name1, "ko") || b.timestamp.localeCompare(a.timestamp),
                sizeDesc: (a, b) => (b.fileSizeBytes ?? 0) - (a.fileSizeBytes ?? 0),
            }[sortKey] ?? ((a, b) => b.timestamp.localeCompare(a.timestamp));
        return list.sort(cmp);
    }, [vids, applied, sortKey]);

    const [page, setPage] = useState(1);
    const [pagingInputs, setPagingInputs] = useState({ applied, sortKey, vids });
    const pageCount = Math.max(1, Math.ceil(filteredVids.length / PAGE_SIZE));
    // 입력 결과가 바뀐 렌더에서 함께 보정해 새 목록에 옛 페이지가 잠깐 표시되지 않게 한다.
    // 검색·정렬은 첫 페이지, 재조회는 첫 페이지. 삭제로 범위를 벗어났다면 마지막 페이지를 우선한다.
    if (pagingInputs.applied !== applied || pagingInputs.sortKey !== sortKey || pagingInputs.vids !== vids) {
        const queryChanged = pagingInputs.applied !== applied || pagingInputs.sortKey !== sortKey;
        setPagingInputs({ applied, sortKey, vids });
        setPage(queryChanged ? 1 : page > pageCount ? pageCount : 1);
    }
    const pageVids = useMemo(() => filteredVids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredVids, page]);
    const pageNumbers = useMemo(() => {
        if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
        const start = Math.max(2, Math.min(page - 2, pageCount - 5));
        const end = start + 4;
        return [
            1,
            ...(start > 2 ? ["start-ellipsis"] : []),
            ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
            ...(end < pageCount - 1 ? ["end-ellipsis"] : []),
            pageCount,
        ];
    }, [page, pageCount]);
    const listTopRef = useRef(null);
    const previousPageRef = useRef(page);
    useEffect(() => {
        if (previousPageRef.current === page) return;
        previousPageRef.current = page;
        listTopRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }, [page]);

    // 환자 정보 수정 관련 state
    const [editingFile, setEditingFile] = useState(null);

    const playerRef = useRef(null);
    const currentFrameRef = useRef(0);
    const isLoadingRef = useRef(false);
    // 로드 세대: 파일을 열 때마다(캐시 적중 포함)·닫을 때 올린다. 뒤에서 도는 캐시 저장의 토스트는 세대가 같을 때만 띄운다 (Codex ZIPSPEED R4)
    const loadGenRef = useRef(0);
    // 캐시 버전: 캐시 삭제·파일 삭제·환자정보 수정 때 올린다. 대기 중이던 백그라운드 저장은 버전이 바뀌었으면 옛 스냅샷을 쓰지 않고 건너뛴다 (R1)
    const cacheVersionRef = useRef(0);
    // 백그라운드 캐시 저장은 한 번에 하나씩(직렬) — 여러 대용량 스냅샷의 IDB 복제가 겹치지 않게 (R3)
    const cacheQueueRef = useRef(Promise.resolve());
    // 지금 팝업에 열려 있는 파일 {filePath, fileName}. 팝업 툴바의 "환자정보·윤부 수정"에 쓴다
    const openedFileRef = useRef(null);
    // 수정 모달을 열 때 고정한 프레임 스냅샷 {filePath, index, od, os}. 모달이 떠 있는 동안 프레임이 바뀌어도 측정 대상은 이것
    const [editFrames, setEditFrames] = useState(null);

    const [odImages, setOdImages] = useState([]);
    const [osImages, setOsImages] = useState([]);
    const [odResults, setOdResults] = useState([]);
    const [osResults, setOsResults] = useState([]);
    // 재생 화면 동공 타원·셔터 아이콘은 React 가 좌표로 그린다. coordWidth = 좌표 기준 폭(results.json frame_width)
    const [coordWidth, setCoordWidth] = useState(1280);
    const [captureMode, setCaptureMode] = useState("measure"); // 파일의 mode: measure | record (없는 옛 파일 = measure)

    // 현재 재생 프레임의 기기 자세. DevicePosePip(DevicePose3D) 가 매 렌더 프레임 직접 읽는다.
    const poseRef = useRef({ pitch: NaN, roll: NaN, yaw: NaN, t: 0 });
    const popupOpen = osImages.length > 0 && odImages.length > 0;

    // DualImagePlayer 가 프레임을 그릴 때마다 호출 → 그 프레임의 pitch/roll/yaw 를 poseRef 에 쓴다 (구버전 키 폴백은 readPose)
    const handleFrameDrawn = useCallback(
        (frameIndex) => {
            poseRef.current = readPose(odResults?.[frameIndex] ?? osResults?.[frameIndex]);
        },
        [odResults, osResults],
    );

    // yaw 영점은 녹화의 0프레임 값으로 고정한다 → 언제 재생을 시작하든, 누가 보든 같은 Yaw 가 나온다 (없으면 NaN → 첫 샘플)
    const poseYawZero = useMemo(() => readPose(odResults?.[0] ?? osResults?.[0]).yaw, [odResults, osResults]);

    // LiveGraph의 processedData를 ref로 받아서 ManualPointButtons에서 사용
    const processedDataRef = useRef(null);

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
        if (typeof sizeStr === "string" && sizeStr.includes("MB")) {
            return sizeStr;
        }

        // "캐시됨" 같은 텍스트면 그대로 반환
        if (typeof sizeStr === "string" && isNaN(parseFloat(sizeStr))) {
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

    // 브라우저에만 있는 결과(직접 넣은 ZIP · 기기에서 지워진 캐시)를 목록 행 모양으로
    const cachedRows = useCallback(async (excludePaths = new Set()) => {
        const cachedZips = await getAllZipsFromDB();
        return cachedZips
            .filter((z) => !excludePaths.has(z.filePath))
            .map((z) => ({
                fileName: z.fileName,
                fileSize: typeof z.zipData?.file_size === "number" ? z.zipData.file_size : "캐시됨",
                filePath: z.filePath,
            }));
    }, []);

    // 목록 = 브라우저에 저장된 결과뿐이다. React 는 결과 ZIP 뷰어이고 기기에 연결하지 않는다(2026-11-09 사용자 결정)
    const fetchData = useCallback(async () => {
        const rows = await cachedRows().catch(() => []);
        setVids(transformFileData(rows, formatFileSize));
    }, [cachedRows]);

    useEffect(() => {
        initDB();
        fetchData();
        updateStorageInfo();
        updateCachedFilesList();

        // Cleanup: 컴포넌트 언마운트 시 정리
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [fetchData, updateStorageInfo, updateCachedFilesList]);

    const localReadError = () =>
        Object.assign(
            new Error(
                "브라우저에 저장된 결과를 읽지 못했습니다. 다시 열어 보고, 계속 안 되면 원본 ZIP 파일을 다시 넣어 주세요.",
            ),
            { localOnly: true },
        );

    // 반환: 직접 넣은 ZIP 이면 저장 결과("saved" | "failed" | "canceled")를 기다리는 Promise, 열지 못했으면 undefined.
    // localFile: 사용자가 넣은 ZIP(File). 있으면 캐시·기기 내려받기를 건너뛰고 이 파일을 풀어 열고, 브라우저에 저장한다
    async function handleVideoClick(filePath, fileName, localFile = null) {
        let loadGeneration = null;
        if (!filePath || isLoadingRef.current) {
            return;
        }

        try {
            isLoadingRef.current = true;
            setLoading(true);
            loadGenRef.current += 1;
            loadGeneration = loadGenRef.current;
            // 수동 포인트(4·5차)는 localStorage 에 남으므로 영상을 열 때마다 비운다. 닫기 없이 다른 영상을 열거나 새로고침 뒤
            // 열면 이전 영상의 Src 와 새 영상의 Dst 가 섞여 동공 절대 위치 차이가 그대로 Δx 가 된다 (76.7°/421 PD 사례)
            if (!localFile) {
                useManualPointStore.getState().reset();
                // 팝업 툴바의 "환자정보·윤부 수정"이 어느 파일인지 알도록 기억해 둔다
                openedFileRef.current = { filePath, fileName };
            }

            // 1. IndexedDB에서 먼저 확인. 캐시가 손상(청크 누락 등)이면 캐시를 지우고 서버에서 다시 받는다 (Codex ZIPSPEED R2)
            let cachedData = null;
            try {
                cachedData = localFile ? null : await getZipFromDB(filePath);
            } catch {
                throw localReadError();
            }

            console.log(cachedData);
            if (!localFile && cachedData?.layout !== "frame_index") throw localReadError();

            if (cachedData && cachedData.layout !== "frame_index") {
                console.log("옛 배치 방식 캐시 — 다시 내려받아 frame_index 자리로 재배치합니다");
            }
            if (cachedData && cachedData.layout === "frame_index") {
                toast.success("캐시에서 불러왔습니다", { id: "success" });

                setOdResults(cachedData.od);
                setOsResults(cachedData.os);
                setOdImages(cachedData.odImages);
                setOsImages(cachedData.osImages);

                setPatientNum(cachedData.patient_num);
                setPatientName(cachedData.patient_name);
                setAngle(cachedData.angle);
                setPoseRef(cachedData.pose_ref ?? null);
                setCoordWidth(cachedData.frame_width ?? 1280);
                setCaptureMode(cachedData.mode === "record" ? "record" : "measure"); // layout 표시가 있는 새 캐시에만 들어온다
                setLimbusPX(cachedData.limbus_px);
                setLimbusMM(cachedData.limbus_mm);

                // 안 넣으면 결과보기(PDReport)로 al/acd가 빈 값으로 넘어가 R 방식이 표준 눈으로 계산된다.
                // AL/ACD를 캐시에 담기 전에 저장된 파일은 이 값이 아예 없으므로 ZIP에서 한 번 읽어 메운다.
                const al = cachedData.axial_length;
                const ac = cachedData.acd;
                // pose_ref 도 같은 방식으로 메운다. 캐시에 필드 자체가 없으면(undefined) 자세 영점을 담기 전에
                // 캐시된 것이라 ZIP 메타를 다시 읽어야 한다. null 은 "영점 없는 절대값 파일"로 확정된 상태라 그대로 둔다.
                const poseRef = cachedData.pose_ref;
                // 눈별 윤부·AL·ACD 도 같은 방식. 눈별 키 백필을 한 번도 안 한 캐시(eye_meta_checked 없음)는 ZIP 메타에서 다시 읽는다.
                // 서버에 있는 눈별 키만 복사하고 없는 키는 그대로 둔다(옛 파일 = 단일 키 폴백 유지). "확인했음" 은 플래그로 남긴다 (review-P P3).
                const eyeSrc = cachedData;
                // fps 도 같은 방식. 캐시에 fps 가 없으면 원본이 옛 15fps 인지 저장 버그로 빠진 25fps 인지 모르므로 ZIP 메타로 확인한다.
                const fps = cachedData.fps;
                setAxialLength(al ?? "");
                setAcd(ac ?? "");
                setEyeMeta(eyeMetaFromResults(eyeSrc));
                // 메타를 못 읽었으면(fps 여전히 없음) 옛 파일 기준 15 로 재생한다
                setPlaybackFps(fpsOf(fps));
                // 메타를 못 읽었으면 영점을 모르는 상태다. 상대값을 절대값으로 오인하지 않도록 리포트에서 보정이 비는 것보다는
                // 경고가 낫다.
                if (poseRef === undefined) {
                    toast.error("자세 영점 정보를 읽지 못했습니다. 표 방식 리포트의 pitch 계산이 비활성화됩니다.", {
                        duration: 6000,
                    });
                    setPoseRef({ unknown: true });
                } else {
                    setPoseRef(poseRef ?? null);
                }

                setLoading(false);
                return;
            }

            // 2. 넣은 ZIP 을 푼다
            toast.loading("ZIP 파일 읽는 중...", { id: "download" });
            const t0 = performance.now();

            const response = { data: localFile };

            toast.loading("ZIP 파일 파싱 중...", { id: "download" });

            const T = { download: performance.now() - t0 }; // 단계별 시간(ms) — 실기 병목 확인용 (콘솔)
            let tStage = performance.now();
            const mark = (k) => {
                T[k] = Math.round(performance.now() - tStage);
                tStage = performance.now();
            };

            // 3. JSZip으로 파싱
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(response.data);
            mark("unzip");

            // 4. results.json 읽기
            const resultsJsonFile = Object.values(zipContent.files).find((f) => f.name.endsWith("results.json"));

            if (!resultsJsonFile) {
                throw new Error("results.json을 찾을 수 없습니다");
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

            // OD 이미지 로드 — 파일명의 프레임 번호 자리에 놓는다(빠진 번호는 null). 순서대로 push 하면 결손 뒤 영상이 한 칸씩 어긋난다.
            // 결과에 frame_index 가 없는 옛 파일은 결과도 순서대로이므로 이미지도 순서대로 놓아야 짝이 맞는다 (Codex 3차 C4)
            const indexed = hasFrameIndex(results.od) || hasFrameIndex(results.os);
            // 32장 배치로 꺼내고(await 왕복 감소), 진행 토스트는 200ms 에 한 번만 (ZIPSPEED 1차)
            let lastToast = 0;
            const extract = async (files, list) => {
                for (let i = 0; i < files.length; i += 32) {
                    const batch = files.slice(i, i + 32);
                    const decoded = await Promise.all(batch.map((f) => f.file.async("base64")));
                    decoded.forEach((base64, k) => {
                        if (indexed) setAt(list, batch[k].frameIndex, base64);
                        else list.push(base64);
                    });
                    processedCount += batch.length;
                    const now = performance.now();
                    if (now - lastToast > 200 || processedCount === totalFiles) {
                        lastToast = now;
                        toast.loading(`이미지 처리 중... ${processedCount}/${totalFiles}`, { id: "download" });
                    }
                }
            };
            await extract(odFiles, odImagesList);
            await extract(osFiles, osImagesList);
            mark("extract");

            // od, os 는 frame_index 자리에 놓고 원래 번호를 유지한다(예전엔 0부터 재번호를 매겨 결손 뒤가 전부 어긋났다)
            const odData = placeByFrameIndex(results.od ?? []);
            const osData = placeByFrameIndex(results.os ?? []);

            const zipData = {
                patient_num: results.patient_num,
                patient_name: results.patient_name,
                distance: results.distance,
                angle: results.angle,
                limbus_px: results.limbus_px,
                limbus_mm: results.limbus_mm,
                // IOL Master 값 (R 방식 계산용) — 여기서 빠뜨리면 캐시·스토어·PDReport까지 전부 빈 값이 된다
                axial_length: results.axial_length,
                acd: results.acd,
                // 자세 영점(2026-10-23 이후 파일). 프레임 pitch/roll 이 이 기준 대비 상대값이다. 없으면 절대값 파일.
                pose_ref: results.pose_ref ?? null,
                // 녹화 fps. 2026-10-27(25fps 전환) 이전 파일에는 없고 15fps 다.
                fps: fpsOf(results.fps),
                // 좌표(x, y, major_r…)의 기준 폭. 이미지(2026-10-27 부터 640×360)와 다르면 환산해 그린다.
                frame_width: results.frame_width ?? 1280,
                // "measure"(셔터 교대 측정) | "record"(교대 없이 녹화). 없으면 옛 파일 = measure
                mode: results.mode === "record" ? "record" : "measure",
                // 배열 배치 방식. "frame_index" = 결과·이미지가 frame_index 자리(결손은 null). 이 표시가 없는 캐시는 옛 방식(순서대로
                // 압축 + 재번호)이라 시간축이 달라 캐시를 쓰지 않고 다시 내려받는다 (Codex 3차 C3)
                layout: "frame_index",
                // 눈별 윤부·AL·ACD. 있는 키만 복사한다 — 없는 키를 "" 로 채우면 옛 파일의 단일 AL/ACD 폴백이 끊긴다 (review-P P3)
                ...pickEyeJson(results),
                // 직접 넣은 ZIP: 자동 정리에서 빼고(indexedDB.cleanupOldFiles), 목록에 크기를 보여 준다
                ...(localFile ? { imported: true, file_size: localFile.size } : {}),
                od: odData,
                os: osData,
                odImages: odImagesList,
                osImages: osImagesList,
            };

            // 6. 화면 먼저 — 캐시 저장(수 초)을 기다리지 않는다 (ZIPSPEED 1차 A). 캐시는 아래에서 백그라운드로.
            const gen = loadGenRef.current;
            const cacheVer = cacheVersionRef.current;
            // 넣은 ZIP 은 열지 않고 저장해서 목록에만 올린다(2026-11-09 사용자 결정)
            if (!localFile) {
                setOdResults(zipData.od);
                setOsResults(zipData.os);
                setOdImages(zipData.odImages);
                setOsImages(zipData.osImages);

                setPatientNum(zipData.patient_num);
                setPatientName(zipData.patient_name);
                setAngle(zipData.angle);
                setPoseRef(zipData.pose_ref ?? null);
                setPlaybackFps(zipData.fps);
                setCoordWidth(zipData.frame_width);
                setCaptureMode(zipData.mode);
                setLimbusPX(zipData.limbus_px);
                setLimbusMM(zipData.limbus_mm);
                setAxialLength(zipData.axial_length ?? "");
                setAcd(zipData.acd ?? "");
                setEyeMeta(eyeMetaFromResults(zipData));
            }
            mark("display");
            if (localFile) toast.loading(`브라우저에 저장 중... ${fileName}`, { id: "download" });
            else toast.success("영상을 불러왔습니다", { id: "download" });
            isLoadingRef.current = false;
            setLoading(false);
            console.log("[영상 로드 ms]", T);

            // 7. 캐시 저장은 뒤에서. 실패해도 화면은 유지(토스트만). 그 사이 다른 파일을 열었으면(gen 변경) 목록·용량 갱신만 한다.
            //    용량 추정은 전체 JSON 문자열(100MB+ 복제) 대신 이미지 문자열 길이 합 + 여유 (ZIPSPEED 1차 B).
            //    저장은 직렬 큐로 하나씩. 그 사이 캐시 삭제·파일 삭제·환자정보 수정이 있었으면(cacheVersion 변경) 옛 스냅샷을 쓰지 않는다.
            // 직접 넣은 ZIP 은 이 저장이 유일한 보관 경로다. 다른 파일의 삭제·수정(cacheVersion)이나 다른 영상을 연 것(gen)으로
            // 버리거나 실패를 숨기지 않는다 — 그 결과 자체를 사용자가 지웠을 때만 건너뛴다 (Codex VIEWER R2/R3)
            const stale = () =>
                localFile ? canceledLocalRef.current.has(filePath) : cacheVer !== cacheVersionRef.current;
            const saveTask = cacheQueueRef.current.then(async () => {
                let saved = false;
                try {
                    if (stale()) {
                        console.log("캐시 저장 건너뜀: 저장 전에 캐시/파일/메타가 바뀜 — 다음에 열 때 다시 내려받음");
                        return "canceled";
                    }
                    const sum = (arr) => arr.reduce((n, b) => n + (b?.length ?? 0), 0);
                    const estimatedSize = sum(zipData.odImages) + sum(zipData.osImages) + 2 * 1024 * 1024;
                    const storage = await checkStorageQuota();
                    if (storage.available > 0 && estimatedSize > storage.available) {
                        const deleted = await cleanupOldFiles(5);
                        if (deleted > 0) toast(`저장 공간 확보: 오래된 캐시 ${deleted}개 삭제`, { icon: "🧹" });
                    }
                    if (stale()) return "canceled"; // 공간 확보를 기다리는 사이 바뀌었으면 역시 건너뜀
                    const tc = performance.now();
                    await saveZipToDB(filePath, fileName, zipData);
                    saved = true;
                    console.log("[영상 캐시 저장 ms]", Math.round(performance.now() - tc));
                    return "saved";
                } catch (e) {
                    console.warn("캐시 저장 실패 (영상은 열려 있음):", e);
                    // 가져오기의 저장 실패는 importZipFiles 가 파일명과 함께 모아서 알린다(다른 영상을 열었어도)
                    if (!saved && !localFile && gen === loadGenRef.current) {
                        toast.error("브라우저 캐시 저장에 실패했습니다. 다음에 열 때 다시 내려받습니다.", {
                            duration: 5000,
                        });
                    }
                    return "failed";
                } finally {
                    if (localFile) pendingLocalRef.current.delete(filePath);
                    // 성공·실패·공간 정리 어느 경우든 목록/용량은 실제 DB 상태로 맞춘다
                    await updateStorageInfo().catch(() => {});
                    await updateCachedFilesList().catch(() => {});
                    // 넣은 ZIP 이 목록에 없으면 행을 추가한다(기기 목록은 다시 받지 않는다)
                    if (localFile && saved) {
                        const have = new Set(currentVids.current.map((v) => v.filePath));
                        const extra = await cachedRows(have).catch(() => []);
                        if (extra.length > 0)
                            setVids((prev) =>
                                [...prev, ...transformFileData(extra, formatFileSize)].sort((a, b) =>
                                    b.timestamp.localeCompare(a.timestamp),
                                ),
                            );
                    }
                }
            });
            cacheQueueRef.current = saveTask;
            if (localFile) return saveTask;
        } catch (error) {
            console.error("Failed to load video:", error);
            if (loadGeneration === loadGenRef.current) {
                toast.dismiss("download");
                toast.remove("download");
                isLoadingRef.current = false;
                setLoading(false);
            }
            // 직접 넣은 ZIP 의 실패는 그 사이 재생 창을 닫았어도(세대 변경) 알린다 — 아니면 넣은 파일이 말없이 사라진다 (재확인 4)
            if (loadGeneration === loadGenRef.current || localFile) {
                dialog.alert({
                    title: "영상 로드 실패",
                    message: error.localOnly
                        ? error.message
                        : localFile
                          ? `"${fileName}" 을(를) 열지 못했습니다: ${/central directory|zip file/i.test(error.message || "") ? "ZIP 형식이 아니거나 파일이 덜 받아졌습니다" : error.message || "알 수 없는 오류"}\niGazy 결과 ZIP 파일이 맞는지 확인해 주세요.`
                          : `${error.message || "영상을 불러오지 못했습니다"}\n서버 연결과 ZIP 파일을 확인한 뒤 다시 열어 주세요.`,
                });
            }
        } finally {
            isLoadingRef.current = false;
            setLoading(false);
        }
    }

    // ZIP 가져오기(끌어다 놓기). 한 개씩 풀어 브라우저 저장이 끝난 것을 확인한 뒤 다음으로 간다. 열지는 않고 목록에만 올린다.
    // 키는 항상 "local/파일명"(기기 행과 이름이 같아도 기기 경로를 쓰지 않는다 — 보기와 수정·삭제의 원본이 갈린다, Codex VIEWER R1).
    // 같은 파일명을 다시 넣으면 그 저장분을 새로 넣은 내용으로 바꾼다(파일명에 측정 시각이 초까지 들어 있어 같은 측정으로 본다).
    const importZipFiles = async (fileList) => {
        const zips = Array.from(fileList ?? []).filter((f) => /\.zip$/i.test(f.name));
        if (zips.length === 0) {
            toast.error("ZIP 파일만 가져올 수 있습니다", { id: "error" });
            return;
        }
        // 첫 await 전에 잠근다 — 겹친 드롭이 검사를 함께 통과해 뒤 배치가 조용히 빠지지 않게 (Codex VIEWER R7)
        if (importingRef.current || isLoadingRef.current) {
            toast.error("다른 영상을 여는 중입니다. 끝난 뒤 다시 넣어 주세요", { id: "error" });
            return;
        }
        // 수정 창이 떠 있는 동안에는 받지 않는다 — 같은 결과를 다시 넣으면 수정과 저장의 순서가 엇갈린다
        if (editingFile) {
            toast.error("환자정보 수정 창을 닫은 뒤 다시 넣어 주세요", { id: "error" });
            return;
        }
        importingRef.current = true;
        const failed = [];
        let savedCount = 0;
        try {
            // 브라우저가 저장 공간이 모자랄 때 임의로 비우지 않게 요청한다(거절돼도 동작은 같다)
            navigator.storage?.persist?.().catch(() => {});
            for (const f of zips) {
                // 맥이 같은 이름을 또 받으면 "이름 (1).zip" 이 된다 — 날짜 인식이 깨지지 않게 떼어 낸다
                const fileName = f.name.replace(/\s*\(\d+\)(?=\.zip$)/i, "");
                const filePath = `${LOCAL_PREFIX}${fileName}`;
                canceledLocalRef.current.delete(filePath);
                pendingLocalRef.current.add(filePath);
                let result;
                try {
                    result = await handleVideoClick(filePath, fileName, f);
                } finally {
                    if (result === undefined) pendingLocalRef.current.delete(filePath);
                }
                if (result === "saved") savedCount += 1;
                else if (result === "failed")
                    failed.push(`${fileName} — 브라우저에 저장하지 못했습니다(저장 공간 부족일 수 있습니다)`);
                else if (result === "canceled") failed.push(`${fileName} — 저장 전에 삭제되어 저장하지 않았습니다`);
                else failed.push(`${fileName} — 열지 못했습니다`);
            }
        } finally {
            importingRef.current = false;
            toast.dismiss("download");
        }
        // 하나만 넣었는데 열지 못한 경우는 "영상 로드 실패" 창이 이미 떴다 — 같은 말을 두 번 하지 않는다
        if (zips.length === 1 && savedCount === 0 && failed[0]?.endsWith("열지 못했습니다")) return;
        if (failed.length > 0)
            dialog.alert({
                title: "가져오기 결과 확인",
                message: `${savedCount}개 저장, ${failed.length}개 실패했습니다.\n\n${failed.join("\n")}\n\n저장하지 못한 결과는 목록에 남지 않습니다.${failed.some((line) => line.includes("저장 공간")) ? " 필요 없는 결과를 지워 공간을 만든 뒤 ZIP 파일을 다시 넣어 주세요." : ""}`,
            });
        else toast.success(`${savedCount}개 결과를 브라우저에 저장했습니다`, { id: "import" });
    };
    const importRef = useRef(importZipFiles);
    importRef.current = importZipFiles;

    // 창 어디에 놓아도 받는다(재생 팝업이 떠 있어도). 파일을 끌 때만 반응한다
    useEffect(() => {
        const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
        let depth = 0;
        const onEnter = (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth += 1;
            setDragging(true);
        };
        const onOver = (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        };
        const onLeave = (e) => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setDragging(false);
        };
        const onDrop = (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            setDragging(false);
            importRef.current(e.dataTransfer.files);
        };
        window.addEventListener("dragenter", onEnter);
        window.addEventListener("dragover", onOver);
        window.addEventListener("dragleave", onLeave);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onEnter);
            window.removeEventListener("dragover", onOver);
            window.removeEventListener("dragleave", onLeave);
            window.removeEventListener("drop", onDrop);
        };
    }, []);

    // 개별 캐시 삭제
    const handleDeleteCache = async (filePath, fileName) => {
        cacheVersionRef.current += 1; // 대기 중인 백그라운드 저장이 지운 캐시를 되살리지 않게
        try {
            if (
                !(await dialog.confirm({
                    title: "파일 삭제 확인",
                    message: `"${fileName}" 을(를) 브라우저에서 삭제하시겠습니까?\n다시 보려면 ZIP 파일을 다시 넣어야 합니다.`,
                    danger: true,
                }))
            ) {
                return;
            }

            // 저장 대기 중인 가져온 결과를 지우는 것이면 그 저장이 되살리지 않게 표시한다
            if (isLocalPath(filePath)) canceledLocalRef.current.add(filePath);
            if (!(await getAllZipsFromDB()).some((file) => file.filePath === filePath)) return;
            await deleteZipFromDB(filePath);
            toast.success("삭제되었습니다", { id: "success" });
            // 기기에 없는 행은 원본이 브라우저뿐이었으므로 목록에서도 뺀다
            setVids((prev) => prev.filter((v) => v.filePath !== filePath));

            // 상태 업데이트
            await updateStorageInfo();
            await updateCachedFilesList();
        } catch (error) {
            console.error("Failed to delete cache:", error);
            dialog.alert({
                title: "캐시 삭제 실패",
                message: "캐시를 삭제하지 못했습니다. 브라우저 저장공간 상태를 확인하고 다시 시도하세요.",
            });
        }
    };

    // 전체 캐시 삭제
    const handleClearAllCache = async () => {
        cacheVersionRef.current += 1;
        try {
            const cacheSnapshot = (await getAllZipsFromDB()).map((file) => file.filePath).sort();
            const cachedCount = cacheSnapshot.length;

            if (cachedCount === 0) {
                toast.error("삭제할 캐시가 없습니다");
                return;
            }

            if (
                !(await dialog.confirm({
                    title: "파일 삭제 확인",
                    message: `브라우저에 저장된 결과 ${cachedCount}개를 모두 삭제하시겠습니까?\n직접 넣은 ZIP 결과도 함께 지워지며, 다시 보려면 ZIP 파일을 다시 넣어야 합니다.\n\n이 작업은 되돌릴 수 없습니다.`,
                    danger: true,
                }))
            ) {
                return;
            }

            setLoading(true);
            const currentCache = (await getAllZipsFromDB()).map((file) => file.filePath).sort();
            if (JSON.stringify(cacheSnapshot) !== JSON.stringify(currentCache)) return;
            pendingLocalRef.current.forEach((path) => canceledLocalRef.current.add(path));
            await clearAllCache();
            setVids([]);

            toast.success(`${cachedCount}개의 캐시가 삭제되었습니다`, { id: "success" });

            // 상태 업데이트
            await updateStorageInfo();
            await updateCachedFilesList();
        } catch (error) {
            console.error("Failed to clear all cache:", error);
            setLoading(false);
            dialog.alert({
                title: "캐시 삭제 실패",
                message: "전체 캐시를 삭제하지 못했습니다. 저장공간 상태를 확인하고 다시 시도하세요.",
            });
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
    // 이 페이지의 선택만 바꾸고 다른 페이지의 선택은 보존한다.
    const allVisibleSelected = pageVids.length > 0 && pageVids.every((v) => selectedFiles.has(v.filePath));
    const handleSelectAll = () => {
        setSelectedFiles((prev) => {
            const next = new Set(prev);
            for (const row of pageVids) {
                if (allVisibleSelected) next.delete(row.filePath);
                else next.add(row.filePath);
            }
            return next;
        });
    };

    // 환자 정보 수정 모달 열기.
    // 값의 원본은 ZIP 안 results.json이다. 브라우저 캐시(IndexedDB)는 사본일 뿐이라
    // 캐시를 지우면 값이 사라진다 -> 서버에서 먼저 읽고, 실패할 때만 캐시로 내려간다.
    const handleEditPatient = async (row) => {
        // 방금 넣은 결과가 아직 브라우저에 저장되는 중이면 수정을 받지 않는다 — 대기 중인 저장이 수정 전 내용으로 덮어쓰거나,
        // 이름을 바꾼 뒤 옛 이름의 결과가 다시 생긴다 (Codex VIEWER 재확인 1)
        if (isLocalPath(row.filePath) && pendingLocalRef.current.has(row.filePath)) {
            toast("브라우저에 저장하는 중입니다. 저장이 끝난 뒤 다시 눌러 주세요", { id: "error", icon: "ℹ️" });
            return;
        }
        const fill = (src) =>
            setEditingFile({
                ...row,
                // 환자번호·이름은 results.json 이 원본. 목록 행이 없을 때(팝업 툴바 경로)도 비지 않게
                num: src?.patient_num || row.num || "",
                name1: src?.patient_name || row.name1 || "",
                limbus_mm: src?.limbus_mm || "",
                limbus_px: src?.limbus_px ? parseFloat(src.limbus_px).toFixed(1) : "",
                axial_length: src?.axial_length || "",
                acd: src?.acd || "",
                // 눈별 값. 눈별 키가 없는 옛 파일은 단일 값을 양안에 채워 보여 준다
                eyes: eyeMetaFromResults(src),
            });

        try {
            const cachedData = await getZipFromDB(row.filePath);
            fill(cachedData);
            if (!cachedData)
                dialog.alert({
                    title: "환자정보 조회 실패",
                    message: "저장된 환자정보를 읽지 못했습니다. 연결을 확인한 뒤 다시 열어 주세요.",
                });
        } catch (error) {
            console.error("Failed to load limbus data:", error);
            fill(null);
            dialog.alert({
                title: "환자정보 조회 실패",
                message: "서버와 캐시에서 환자정보를 읽지 못했습니다. 연결을 확인한 뒤 다시 열어 주세요.",
            });
        }
    };

    // 선택 삭제 = 브라우저 저장분만 지운다(2026-11-09 사용자 결정). 앱(기기)의 ZIP 파일은 건드리지 않는다.
    // 기기 목록에 있는 행은 남고(다시 열면 내려받는다), 브라우저에만 있던 결과는 목록에서도 사라진다.
    const handleDelete = async () => {
        const zipPaths = Array.from(selectedFiles);
        if (zipPaths.length === 0) {
            toast.error("삭제할 파일을 선택해주세요");
            return;
        }
        const targets = zipPaths.filter((path) => cachedFiles.has(path) || pendingLocalRef.current.has(path));
        if (targets.length === 0) {
            toast.error("선택한 항목 중 브라우저에 저장된 것이 없습니다");
            return;
        }

        if (
            !(await dialog.confirm({
                title: "브라우저에서 삭제",
                message: `선택한 ${targets.length}개를 브라우저에서 삭제합니다.\n앱(기기)의 ZIP 파일과 맥의 원본 ZIP 파일은 지워지지 않습니다.\n직접 넣은 결과는 다시 보려면 ZIP 파일을 다시 넣어야 합니다.`,
                danger: true,
            }))
        ) {
            return;
        }

        cacheVersionRef.current += 1; // 대기 중인 백그라운드 저장이 지운 캐시를 되살리지 않게
        const deleted = [];
        try {
            setLoading(true);
            for (const path of targets) {
                if (isLocalPath(path)) canceledLocalRef.current.add(path);
                try {
                    await deleteZipFromDB(path);
                    deleted.push(path);
                } catch (error) {
                    console.error("Failed to delete from browser:", path, error);
                }
            }
            setVids((prev) => prev.filter((v) => !deleted.includes(v.filePath)));
            setSelectedFiles(new Set(zipPaths.filter((path) => targets.includes(path) && !deleted.includes(path))));
            await updateCachedFilesList();
            await updateStorageInfo();
        } finally {
            setLoading(false);
            if (deleted.length < targets.length)
                dialog.alert({
                    title: "브라우저 삭제 결과 확인",
                    message: `${deleted.length}개 삭제, ${targets.length - deleted.length}개 실패했습니다. 다시 시도하세요.`,
                });
            else toast.success(`브라우저에서 ${deleted.length}개 삭제했습니다`, { id: "success" });
        }
    };

    // DualImagePlayer에서 호출되는 콜백 함수
    const handleFrameChange = useCallback((frame, totalFrames) => {
        currentFrameRef.current = frame;
        setMaxFrame(totalFrames);
    }, []);

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

    const rafRef = useRef(null);
    const lastTimeRef = useRef(0);
    // 실제 프레임 진행 속도 = 그 파일의 녹화 fps (MySlider의 표시 갱신 주기와 별개). 파일을 열 때 정해진다.
    const [playbackFps, setPlaybackFps] = useState(fpsOf(undefined));

    const saveCurrentFrame = (side) => {
        const frame = currentFrameRef.current;
        const base64 = (side === "OD" ? odImages : osImages)[frame];
        if (!base64) {
            dialog.alert({
                title: "원본 이미지 없음",
                message: `${side} 프레임 ${frame}의 원본 이미지가 없습니다. 다른 프레임을 선택하거나 ZIP 파일을 다시 열어 주세요.`,
            });
            return;
        }
        // 저장할 프레임을 고정한다. 화면 캔버스를 재인코딩하지 않고 ZIP의 JPEG를 그대로 저장한다.
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setIsPlaying(false);
        const link = document.createElement("a");
        link.href = `data:image/jpeg;base64,${base64}`;
        link.download = `${side}_frame_${String(frame).padStart(6, "0")}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const togglePlay = () => {
        if (isPlaying) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            setIsPlaying(false);
        } else {
            if (maxFrame === 0) return;

            lastTimeRef.current = 0;
            const msPerFrame = 1000 / playbackFps;

            const animate = (timestamp) => {
                if (!lastTimeRef.current) lastTimeRef.current = timestamp;
                const elapsed = timestamp - lastTimeRef.current;
                const framesToAdvance = Math.floor(elapsed / msPerFrame);

                if (framesToAdvance > 0) {
                    // rAF 주기와 프레임 간격이 나누어떨어지지 않아도 남은 시간을 보존한다.
                    lastTimeRef.current += framesToAdvance * msPerFrame;
                    const nextFrame = currentFrameRef.current + framesToAdvance;

                    if (nextFrame >= maxFrame) {
                        currentFrameRef.current = maxFrame - 1;
                        if (playerRef.current?.setFrame) {
                            playerRef.current.setFrame(maxFrame - 1);
                        }
                        rafRef.current = null;
                        setIsPlaying(false);
                        return;
                    }

                    currentFrameRef.current = nextFrame;
                    if (playerRef.current?.setFrame) {
                        playerRef.current.setFrame(nextFrame);
                    }
                }

                rafRef.current = requestAnimationFrame(animate);
            };

            rafRef.current = requestAnimationFrame(animate);
            setIsPlaying(true);
        }
    };

    const handleClose = () => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setIsPlaying(false);
        currentFrameRef.current = 0;
        setMaxFrame(0);
        setOdImages([]);
        setOsImages([]);
        setOdResults([]);
        setOsResults([]);
        useManualPointStore.getState().reset();
        // 닫힌 파일에 대한 늦은 수정 응답이 "열린 파일" 로 오인되지 않게
        openedFileRef.current = null;
        loadGenRef.current += 1; // 닫은 뒤 늦게 끝난 저장의 토스트는 띄우지 않는다
        setEditFrames(null);
    };

    return (
        <Shell>
            <div
                data-video-list
                style={{
                    "--video-line": "#e6e6e6",
                    "--video-control": "#d1d1d1",
                    "--video-text": "#171717",
                    "--video-muted": "#626262",
                    fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
                }}
                className={`w-full max-w-[1320px] bg-white px-4 min-[1100px]:px-6 pb-4 text-[13px] leading-5 text-[var(--video-text)] ${bare ? "mx-auto" : ""}`}
            >
                {/* 왼쪽 고정 작업면. 내부 폭 = 작업면 - 48px. 표의 고정 열 756px + 파일명 가변 열. */}
                <div className="flex min-h-14 flex-wrap max-[640px]:flex-nowrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--video-line)] py-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 max-[640px]:gap-x-2">
                        <span className="font-medium">캐시 사용량</span>
                        <span className="text-[14px] tabular-nums">
                            {storageInfo ? (
                                <>
                                    {(storageInfo.usage / 1024 / 1024).toFixed(1)} MB
                                    <span className="text-[var(--video-muted)]">
                                        {" "}
                                        / {(storageInfo.quota / 1024 / 1024 / 1024).toFixed(1)} GB
                                    </span>
                                </>
                            ) : (
                                <span className="text-[var(--video-muted)]">확인 중…</span>
                            )}
                        </span>
                        {storageInfo && (
                            <span className="text-[var(--video-muted)] tabular-nums">
                                DB {(storageInfo.dbSize / 1024 / 1024).toFixed(1)} MB
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* 가져오기는 끌어다 놓기만(2026-11-09 사용자 결정: 버튼 없음) — 놓을 수 있다는 것만 글로 알린다 */}
                        <span className="text-[var(--video-muted)]">
                            결과 ZIP 파일을 이 화면에 끌어다 놓으면 목록에 저장합니다
                        </span>
                        {cachedFiles.size > 0 && storageInfo && (
                            <button
                                onClick={handleClearAllCache}
                                className={`${listButtonClass} border border-[var(--video-control)] hover:bg-neutral-50`}
                                title="전체 캐시 삭제"
                            >
                                전체 캐시 삭제
                            </button>
                        )}
                        {bare && (
                            <button
                                type="button"
                                onClick={() => setColorSettingsOpen(true)}
                                className={`${listButtonClass} border border-[var(--video-control)] hover:bg-neutral-50`}
                            >
                                설정
                            </button>
                        )}
                    </div>
                </div>

                {/* 검색 초안은 기존 submit/Enter 흐름에서만 적용한다. */}
                <form
                    className="border-b border-[var(--video-line)] py-5 max-[640px]:py-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        applyFilters();
                    }}
                    onKeyDown={focusSearchOnTab}
                    aria-labelledby="video-search-title"
                >
                    <h2 id="video-search-title" className="mb-3 text-[14px] font-semibold">
                        검색 조건
                    </h2>
                    <div className="grid grid-cols-2 min-[700px]:grid-cols-4 min-[1200px]:grid-cols-[100px_80px_120px_140px_minmax(160px,1fr)_auto] gap-3 items-end">
                        <label className={listLabelClass}>
                            년도
                            <select
                                value={searchYear}
                                onChange={(e) => setSearchYear(e.target.value)}
                                className={listInputClass}
                            >
                                <option value="">전체</option>
                                {[...new Set(vids.map((v) => v.date?.split("-")[0]).filter((y) => y && y !== "N/A"))]
                                    .sort()
                                    .reverse()
                                    .map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <label className={listLabelClass}>
                            월
                            <select
                                value={searchMonth}
                                onChange={(e) => setSearchMonth(e.target.value)}
                                className={listInputClass}
                            >
                                <option value="">전체</option>
                                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className={listLabelClass}>
                            환자번호
                            <input
                                type="text"
                                placeholder="포함 검색"
                                value={searchNum}
                                onChange={(e) => setSearchNum(e.target.value)}
                                className={listInputClass}
                            />
                        </label>
                        <label className={listLabelClass}>
                            이름
                            <input
                                type="text"
                                placeholder="포함 검색"
                                value={searchName}
                                onChange={(e) => setSearchName(e.target.value)}
                                className={listInputClass}
                            />
                        </label>
                        <label
                            className={`${listLabelClass} col-span-2 max-[640px]:col-span-1 min-[1200px]:col-span-1`}
                        >
                            파일명
                            <input
                                type="text"
                                placeholder="포함 검색"
                                value={searchFile}
                                onChange={(e) => setSearchFile(e.target.value)}
                                className={listInputClass}
                            />
                        </label>
                        <div className="col-span-2 max-[640px]:col-span-1 min-[1200px]:col-span-1 flex items-end justify-end gap-2">
                            {hasFilter && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className={`${listButtonClass} border border-[var(--video-control)] hover:bg-neutral-50`}
                                >
                                    초기화
                                </button>
                            )}
                            <button
                                ref={searchButtonRef}
                                type="submit"
                                className={`${listButtonClass} min-w-20 max-[640px]:min-w-16 bg-[var(--video-text)] text-white hover:bg-neutral-700`}
                            >
                                검색
                            </button>
                        </div>
                    </div>
                </form>

                <section
                    ref={listTopRef}
                    className={bare ? "scroll-mt-4" : "scroll-mt-[69px]"}
                    aria-labelledby="video-list-title"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div className="flex items-baseline gap-3">
                            <h2 id="video-list-title" className="text-[14px] font-semibold">
                                영상 목록
                            </h2>
                            <span className="tabular-nums text-[var(--video-muted)]">
                                {filteredVids.length} / {vids.length}건
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 max-[640px]:w-full max-[640px]:justify-between">
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value)}
                                className={listInputClass}
                                title="정렬"
                                aria-label="영상 목록 정렬"
                            >
                                <option value="dateDesc">날짜 최신순</option>
                                <option value="dateAsc">날짜 오래된순</option>
                                <option value="num">환자번호순</option>
                                <option value="name">이름순</option>
                                <option value="sizeDesc">용량 큰순</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={selectedFiles.size === 0}
                                className={`${listButtonClass} border border-[var(--video-control)] enabled:hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-[var(--video-muted)] disabled:bg-neutral-50`}
                            >
                                선택 삭제{selectedFiles.size > 0 ? ` (${selectedFiles.size})` : ""}
                            </button>
                        </div>
                    </div>

                    <table className="w-full table-fixed max-[1199px]:block" aria-labelledby="video-list-title">
                        <thead
                            className={`sticky ${bare ? "top-0" : "top-[53px]"} z-[1] bg-white text-left text-[12px] text-[var(--video-muted)] max-[1199px]:block`}
                        >
                            <tr className="border-b border-[var(--video-line)] max-[1199px]:flex max-[1199px]:items-center">
                                <th scope="col" className="h-10 w-8 text-left font-normal">
                                    <label className="inline-flex h-8 w-8 max-[640px]:h-11 max-[640px]:w-11 items-center">
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={handleSelectAll}
                                            className={listCheckboxClass}
                                            title="이 페이지 전체 선택"
                                            aria-label="이 페이지 전체 선택"
                                        />
                                    </label>
                                </th>
                                <th scope="col" className="w-10 pr-4 text-right font-normal max-[1199px]:sr-only">
                                    No.
                                </th>
                                <th scope="col" className="w-[104px] pr-4 font-normal max-[1199px]:sr-only">
                                    번호
                                </th>
                                <th scope="col" className="w-[160px] pr-4 font-normal max-[1199px]:sr-only">
                                    성명
                                </th>
                                <th scope="col" className="pr-4 font-normal max-[1199px]:pl-3">
                                    파일명
                                </th>
                                <th scope="col" className="w-[120px] pr-4 text-right font-normal max-[1199px]:sr-only">
                                    용량
                                </th>
                                <th scope="col" className="w-[152px] pr-4 text-right font-normal max-[1199px]:sr-only">
                                    날짜
                                </th>
                                <th scope="col" className="w-[148px] text-right font-normal max-[1199px]:sr-only">
                                    캐시
                                </th>
                            </tr>
                        </thead>
                        <tbody className="max-[1199px]:block">
                            {pageVids.map((row, i) => (
                                <tr
                                    key={i}
                                    className="border-b border-[var(--video-line)] last:border-b-0 max-[1199px]:grid max-[1199px]:grid-cols-[32px_minmax(0,1fr)_auto] max-[1199px]:gap-x-3 max-[1199px]:gap-y-1 max-[1199px]:py-4"
                                >
                                    <td className="py-3 align-middle max-[1199px]:col-start-1 max-[1199px]:row-start-1 max-[1199px]:row-span-2 max-[1199px]:self-center max-[1199px]:py-0">
                                        <label className="inline-flex h-8 w-8 max-[640px]:h-11 max-[640px]:w-11 items-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedFiles.has(row.filePath)}
                                                onChange={() => handleSelectFile(row.filePath)}
                                                className={listCheckboxClass}
                                                aria-label={`${row.fileName} 선택`}
                                            />
                                        </label>
                                    </td>
                                    <td className="pr-4 text-right tabular-nums text-[var(--video-muted)] max-[1199px]:col-start-1 max-[1199px]:row-start-3 max-[1199px]:pr-0 max-[1199px]:text-center">
                                        {(page - 1) * PAGE_SIZE + i + 1}
                                    </td>
                                    <td className="pr-4 tabular-nums text-[var(--video-muted)] max-[1199px]:col-start-2 max-[1199px]:row-start-1 max-[1199px]:pr-0">
                                        {row.num}
                                    </td>
                                    <td className="pr-4 break-words max-[1199px]:col-start-2 max-[1199px]:row-start-2 max-[1199px]:pr-0">
                                        {row.name1}
                                    </td>
                                    <td className="py-3 pr-4 max-[1199px]:col-start-2 max-[1199px]:col-span-2 max-[1199px]:row-start-3 max-[1199px]:py-1 max-[1199px]:pr-0">
                                        <button
                                            type="button"
                                            className="text-left text-[14px] leading-5 font-medium [overflow-wrap:anywhere] underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700 max-[640px]:min-h-11"
                                            onClick={() => handleVideoClick(row.filePath, row.fileName)}
                                        >
                                            {row.fileName}
                                        </button>
                                    </td>
                                    <td className="pr-4 text-right tabular-nums whitespace-nowrap text-[var(--video-muted)] max-[1199px]:col-start-3 max-[1199px]:row-start-1 max-[1199px]:pr-0">
                                        {row.fileSize}
                                    </td>
                                    <td className="pr-4 text-right tabular-nums whitespace-nowrap text-[var(--video-muted)] max-[1199px]:col-start-2 max-[1199px]:col-span-2 max-[1199px]:row-start-4 max-[1199px]:pr-0 max-[1199px]:text-left">
                                        {row.date}
                                    </td>
                                    <td className="text-right max-[1199px]:col-start-3 max-[1199px]:row-start-2">
                                        {cachedFiles.has(row.filePath) ? (
                                            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                                                <span className="text-[var(--video-muted)]">저장됨</span>
                                                <RippleButton
                                                    onClick={() => handleDeleteCache(row.filePath, row.fileName)}
                                                    className="min-h-8 max-[640px]:min-h-11 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700"
                                                    title="브라우저에서 삭제"
                                                >
                                                    삭제
                                                </RippleButton>
                                            </div>
                                        ) : (
                                            <span className="text-[var(--video-muted)]">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {pageCount > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--video-line)] pt-4">
                            <span className="text-[12px] tabular-nums text-[var(--video-muted)]">
                                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredVids.length)} /{" "}
                                {filteredVids.length}
                            </span>
                            <nav aria-label="영상 목록 페이지" className="flex flex-wrap items-center gap-1">
                                <button
                                    type="button"
                                    className={`${pageButtonClass} bg-white`}
                                    disabled={page === 1}
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                >
                                    이전
                                </button>
                                {pageNumbers.map((number) =>
                                    typeof number === "number" ? (
                                        <button
                                            key={number}
                                            type="button"
                                            aria-label={`${number}페이지`}
                                            aria-current={number === page ? "page" : undefined}
                                            className={`${pageButtonClass} ${number === page ? "bg-[var(--video-text)] text-white font-semibold" : "bg-white"}`}
                                            onClick={() => setPage(number)}
                                        >
                                            {number}
                                        </button>
                                    ) : (
                                        <span
                                            key={number}
                                            className="px-1 text-[var(--video-muted)]"
                                            aria-hidden="true"
                                        >
                                            …
                                        </span>
                                    ),
                                )}
                                <button
                                    type="button"
                                    className={`${pageButtonClass} bg-white`}
                                    disabled={page === pageCount}
                                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                                >
                                    다음
                                </button>
                            </nav>
                        </div>
                    )}
                    {filteredVids.length === 0 && (
                        <p
                            className="border-b border-[var(--video-line)] py-8 text-[14px] text-[var(--video-muted)]"
                            role="status"
                        >
                            {hasFilter
                                ? "검색 조건에 맞는 영상이 없습니다."
                                : "표시할 영상이 없습니다. 결과 ZIP 파일을 이 화면에 끌어다 놓으면 목록에 저장합니다."}
                        </p>
                    )}
                </section>
                {dragging && (
                    <div
                        className="pointer-events-none fixed inset-0 z-[1000] flex items-center justify-center bg-white/85"
                        role="status"
                    >
                        <div className="border-2 border-dashed border-neutral-900 px-10 py-8 text-center">
                            <p className="text-[18px] font-semibold text-neutral-900">여기에 ZIP 파일을 놓으세요</p>
                            <p className="mt-2 text-[14px] text-[var(--video-muted)]">
                                브라우저에 저장하고 목록에 올립니다
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* 비디오 플레이어 팝업 */}
            {osImages.length > 0 && odImages.length > 0 && (
                <VideoPopup
                    toolbarActions={
                        <div className="flex items-center gap-2 px-2">
                            {/* 연구실 흐름: 열린 파일의 현재 프레임으로 눈별 윤부를 재고 ARGOS 값을 넣는다 */}
                            <button
                                type="button"
                                onClick={() => {
                                    const opened = openedFileRef.current;
                                    if (!opened) return;
                                    // 재생을 멈추고 지금 프레임을 스냅샷으로 고정한다 (모달이 열린 뒤 프레임이 바뀌어도 측정 대상은 그대로)
                                    if (isPlaying) togglePlay();
                                    const idx = currentFrameRef.current;
                                    setEditFrames({
                                        filePath: opened.filePath,
                                        index: idx,
                                        od: odImages[idx] || null,
                                        os: osImages[idx] || null,
                                        coordWidth, // 좌표 기준 폭 — 윤부 px 를 이미지 px 가 아니라 좌표 px 로 저장하기 위해
                                    });
                                    const row = vids.find((v) => v.filePath === opened.filePath) || {
                                        filePath: opened.filePath,
                                        fileName: opened.fileName,
                                        num: "",
                                        name1: "",
                                    };
                                    handleEditPatient(row);
                                }}
                                className="rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs text-blue-800 hover:bg-blue-100"
                                title="현재 프레임에서 OD/OS 윤부 px 를 재고 ARGOS 값(WTW·AL·ACD)을 눈별로 입력"
                            >
                                환자정보·윤부 수정
                            </button>
                        </div>
                    }
                    onClose={() => {
                        handleClose();
                    }}
                >
                    <div className="relative">
                        <DualImagePlayer
                            ref={playerRef}
                            odImages={odImages}
                            osImages={osImages}
                            odResults={odResults}
                            osResults={osResults}
                            coordWidth={coordWidth}
                            currentFrameRef={currentFrameRef} // ref 사용
                            onFrameChange={handleFrameChange}
                            onFrameDrawn={handleFrameDrawn}
                        />
                        <ManualPointButtons
                            currentFrameRef={currentFrameRef}
                            processedDataRef={processedDataRef}
                            odResults={odResults}
                            osResults={osResults}
                            fileKey={openedFileRef.current?.filePath ?? null}
                        />
                    </div>

                    <div className="flex flex-row my-4">
                        {/* <div className="w-5" /> */}
                        <MySlider
                            max_frame={maxFrame}
                            currentFrameRef={currentFrameRef} // ref 사용
                            onCurrent={handleSliderFrameChange}
                            isPlaying={isPlaying}
                            onTogglePlay={togglePlay}
                        />
                    </div>

                    <div className="my-4">
                        <LiveGraph
                            odResults={odResults}
                            osResults={osResults}
                            maxFrame={maxFrame}
                            currentFrameRef={currentFrameRef}
                            processedDataRef={processedDataRef}
                            captureMode={captureMode}
                        />
                    </div>
                </VideoPopup>
            )}

            {/* 기기 자세 PiP — 재생 프레임의 자세. 일시정지 중에도 마지막 값을 유지(staleMs=null) */}
            {popupOpen && <DevicePosePip poseRef={poseRef} staleMs={null} yawZero={poseYawZero} />}

            {/* 환자 정보·윤부 수정 모달. 플레이어 팝업보다 뒤에 두어야(같은 z-index) 팝업 위에 뜬다.
                팝업이 열린 같은 파일이면 현재 프레임을 넘겨 그 프레임에서 OD/OS 윤부 px 를 잴 수 있게 한다. */}
            {colorSettingsOpen && <ViewerColorSettings onClose={() => setColorSettingsOpen(false)} />}
            {editingFile && (
                <PatientInfoEditModal
                    onResult={(result) => dialog.alert(result)}
                    editingFile={editingFile}
                    cachedFiles={cachedFiles}
                    localOnly
                    frames={popupOpen && editFrames && editFrames.filePath === editingFile.filePath ? editFrames : null}
                    onClose={() => {
                        setEditingFile(null);
                        setEditFrames(null);
                    }}
                    onUpdated={async ({ eyes, newFilePath, newFileName, patientNum, patientName }) => {
                        cacheVersionRef.current += 1; // 대기 중인 백그라운드 저장이 수정 전 메타를 캐시에 쓰지 않게 (Codex ZIPSPEED R1)
                        // 열려 있는 파일을 고친 것이면: 파일 경로(이름 변경 시)·환자·눈별 메타를 모두 갱신하고,
                        // 배율이 바뀌었으니 이미 찍어 둔 수동 포인트(mm 로 저장됨)는 무효화한다 (review-P P6/P7)
                        const wasOpened = popupOpen && openedFileRef.current?.filePath === editingFile.filePath;
                        if (wasOpened) {
                            openedFileRef.current = {
                                filePath: newFilePath || editingFile.filePath,
                                fileName: newFileName || editingFile.fileName,
                            };
                            setPatientNum(patientNum);
                            setPatientName(patientName);
                            setEyeMeta({ ...eyes, perEye: true });
                            setLimbusMM(eyes.od.limbusMm);
                            setLimbusPX(eyes.od.limbusPx);
                            setAxialLength(eyes.od.al);
                            setAcd(eyes.od.acd);
                            const mp = useManualPointStore.getState();
                            if (mp.src4th || mp.dst4th || mp.src5th || mp.dst5th) {
                                mp.reset();
                                toast("윤부가 바뀌어 수동 포인트(4·5차)를 초기화했습니다. 다시 선택해 주세요.", {
                                    icon: "ℹ️",
                                    duration: 6000,
                                });
                            }
                        }
                        await fetchData();
                        await updateCachedFilesList();
                    }}
                />
            )}
        </Shell>
    );
}
