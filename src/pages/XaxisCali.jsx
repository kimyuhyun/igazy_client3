import { useState, useRef, useEffect } from "react";
import Layout from "../components/Layout";
import MeasurementScale from "../components/MeasurementScale";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "../components/RippleButton";
import toast from "react-hot-toast";
import axios from "axios";
import LimbusLineMeasure from "../components/LimbusLineMeasure";
import Popup from "../components/Popup";
import XaxisCalibrationTable, { saveCalibrationMeasurement } from "../components/XaxisCalibrationTable";
import EyeWsClient from "../utils/eyeWsClient";
import { drawBase64ToCanvas } from "../utils/canvasUtils";

export default function XaxisCali() {
    const { IP, LIMBUS_MM, LIMBUS_PX, setLimbusPX, setLimbusMM } = useVariableStore();

    const aspectClass = "aspect-[16/9]";

    const API_URL = `http://${IP}:8080`;
    const SOCKET_URL = `ws://${IP}:3000`;

    const wsClientRef = useRef(null);
    const [isStreaming, setStreaming] = useState(false);
    const liveUnsubscribeRef = useRef(null);

    const [connectionStatus, setConnectionStatus] = useState("disconnected");

    const [progress, setProgress] = useState(0);
    const [progressCount, setProgressCount] = useState(0);
    const [isLoading, setLoading] = useState(false);

    const [resultImage, setResultImage] = useState(null);
    const [resultImage2, setResultImage2] = useState(null);
    const [formData, setFormData] = useState({
        pitch: 0.0,
        delta_x: 0.0,
        eye_angle: 0.0,
    });

    const [pupilCenter, setPupilCenter] = useState(null); // 윤부 자동 제안 앵커(동공 중심 px)

    // 기준측정(0°)에서 평균한 동공 절대 좌표(px). 측정 delta_x는 이 기준점 대비 이동량.
    const [refPoint, setRefPoint] = useState(null);

    // 직전 측정의 성분 데이터 (dx/dy 등) — 저장 시 delta_x와 함께 기록해 직선 피팅 검증에 사용
    const lastDetailRef = useRef(null);

    // Eyectrl 안구모형 각도 제어 (CORS 프록시 127.0.0.1:9999 → 폰2 adb 릴레이 → Eyectrl)
    const EYECTRL_PROXY = "http://127.0.0.1:9999";
    const EYECTRL_WS = "ws://127.0.0.1:19999/ws"; // 실제 각도 상태(폰2 릴레이 경유)
    const [eyeAngle, setEyeAngle] = useState(0); // 현재 명령 각도(°)
    const [eyeBusy, setEyeBusy] = useState(false);
    const latestAngleRef = useRef(null); // WS로 받은 실제 각도 {left,right}

    // Eyectrl 상태 WebSocket 열기 (실제 각도 추적). 실패 시 null.
    const openStatusWs = () =>
        new Promise((resolve) => {
            let ws;
            try {
                ws = new WebSocket(EYECTRL_WS);
            } catch {
                resolve(null);
                return;
            }
            const t = setTimeout(() => resolve(ws), 1500); // 열리든 말든 진행
            ws.onopen = () => {
                clearTimeout(t);
                resolve(ws);
            };
            ws.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data);
                    if (d.type === "status") latestAngleRef.current = d;
                } catch {
                    /* ignore */
                }
            };
            ws.onerror = () => {
                clearTimeout(t);
                resolve(null);
            };
        });

    // 목표 각도로 이동 후 실제 각도를 검증 (안 맞으면 재시도). ws 있으면 검증, 없으면 무검증.
    /**
     * 목표 각도로 이동 후 "실제로 도착했는지" 확인하고, 미달이면 재시도한다.
     * TOL이 헐거우면(예전 2.0°) 안구가 덜 이동한 상태로 측정돼 그 각도 값이 통째로 틀어진다.
     * (저각도일수록 치명적: 12°에서 1° 오차 = 변위 약 8% 오차)
     * @returns {Promise<{left:number,right:number,tries:number}|null>} 도달 시 실제 각도, 실패 시 null
     */
    const moveEyeVerified = async (target, ws) => {
        const TOL = 0.6; // 허용 오차(°) — 도달 판정 기준
        for (let attempt = 1; attempt <= 3; attempt++) {
            latestAngleRef.current = null; // 옛 위치 보고값으로 오판하지 않도록 비운다
            await sendEyeCmd({ type: "both", left: target, right: target });
            setEyeAngle(target);
            await sleep(SWEEP_SETTLE_MS);
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                return { left: target, right: target, tries: attempt, unverified: true }; // 검증 불가 → 통과
            }
            const a = latestAngleRef.current;
            if (a && Math.abs(a.left - target) <= TOL && Math.abs(a.right - target) <= TOL) {
                return { left: a.left, right: a.right, tries: attempt };
            }
            console.warn(
                `[스윕] ${target}° 미도달 ${attempt}/3 — 실제 L=${a?.left ?? "없음"} R=${a?.right ?? "없음"}`,
            );
            setSweepStatus(
                `${target}° 재시도 ${attempt}/3 (실제 L${a?.left?.toFixed(1) ?? "?"} R${a?.right?.toFixed(1) ?? "?"})`,
            );
        }
        // 3회 다 확인 못 했어도 스윕을 세우지 않는다. 모터는 실제로 도착해 있는데
        // 상태 보고가 늦어 멈추는 경우가 있었다. 미검증 표시만 남기고 계속 간다.
        console.warn(`[스윕] ${target}° 검증 실패 — 미검증으로 진행`);
        return { left: target, right: target, tries: 3, unverified: true };
    };

    // Eyectrl에 명령 전송 (both/home)
    const sendEyeCmd = async (payload) => {
        const res = await fetch(`${EYECTRL_PROXY}/cmd`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Eyectrl 응답 ${res.status}`);
        return res.json();
    };

    // 안구모형을 목표 각도로 이동 (-40~+40° 범위)
    const moveEye = async (target) => {
        const t = Math.max(-40, Math.min(40, target));
        setEyeBusy(true);
        try {
            await sendEyeCmd({ type: "both", left: t, right: t });
            setEyeAngle(t);
        } catch (e) {
            toast.error(`각도 이동 실패: ${e.message} (프록시/폰2 연결 확인)`);
        } finally {
            setEyeBusy(false);
        }
    };

    // 원점(home) 복귀
    const homeEye = async () => {
        setEyeBusy(true);
        try {
            await sendEyeCmd({ type: "home" });
            setEyeAngle(0);
        } catch (e) {
            toast.error(`home 실패: ${e.message}`);
        } finally {
            setEyeBusy(false);
        }
    };

    // ---- 자동 스윕: 4°~40°를 [이동→안착→측정→저장] 자동 반복 ----
    const [sweeping, setSweeping] = useState(false);
    const [sweepStatus, setSweepStatus] = useState("");
    const SWEEP_SETTLE_MS = 5000; // 각도 이동 후 안착 대기 (원점 경유 큰 점프도 이 값으로 충분)
    const SWEEP_ANGLES = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40];

    // 좌우 양방향으로 잰다. 1패스 0→+40, 2패스 0→-40.
    //
    // 한쪽만 재면 기준점(ref_x) 오차가 R에 흡수되어 보이지 않는다.
    // 양쪽을 재면 그 오차가 한쪽 +, 다른 쪽 - 로 나타나 비대칭으로 정체가 드러난다.
    // 덤으로 측정 범위가 40°에서 80°로 늘고, 카메라 경사에서 오는 좌우 비대칭도 보인다.
    // (히스테리시스는 앞선 2패스 실험에서 중앙값 +0.28px로 사실상 없음이 확인되어 포기)
    const SWEEP_PASSES = [
        { pass: 1, dir: "right", angles: SWEEP_ANGLES },
        { pass: 2, dir: "left", angles: SWEEP_ANGLES.map((a) => -a) },
    ];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // 50샘플 대표값은 중앙값 사용 (반사광 등 이상치 프레임에 강함)
    const median = (arr) => {
        const v = [...arr].sort((a, b) => a - b);
        const n = v.length;
        return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    };

    // 현재 위치에서 동공 50샘플 평균 좌표 수집 (실패 시 null)
    /**
     * 동공 타원 피팅이 잘못된 해에 갇히면 major_r이 정상값의 70~75%로 줄어든다.
     * (안구모형 원반이 눈구멍 테두리에 잘려 보이는 부분에만 타원이 맞는 경우)
     * 이때 프레임 간 값은 오히려 안정적이라(폭 4px 이내) 50장 중간값만으로는 걸러지지 않는다.
     *
     * 안구가 돌면 타원은 한 방향으로만 눌리므로 단축은 줄지만 **장축은 거의 안 변한다**.
     * (실측: 12°→352.8, 16°→346.7 = 1.7% 차이 / 피팅 깨진 20°→260 = 26% 감소)
     * 그래서 기준측정(0°)의 장축을 잣대로 삼아 크게 벗어난 샘플을 버린다.
     */
    const MAJOR_R_TOL = 0.12; // 기준 장축 대비 허용 편차 (±12%)

    const sampleAvg = async (expectedMajorR = null) => {
        const raw = [];
        setProgress(0);
        setProgressCount(50);
        for (let i = 0; i < 50; i++) {
            const r = await getOneFramePupilDetect(60);
            if (r && r.x != null && r.y != null) raw.push(r);
            setProgress(i + 1);
            await sleep(200);
        }
        if (raw.length < 10) return null;

        // 기준 장축이 있으면 그것과, 없으면 이번 표본 자체의 중앙값과 비교한다.
        const base = expectedMajorR > 0 ? expectedMajorR : median(raw.map((r) => r.major_r).filter((v) => v > 0));
        const good = base > 0 ? raw.filter((r) => Math.abs(r.major_r - base) <= base * MAJOR_R_TOL) : raw;
        if (good.length < 10) return null; // 대부분이 잘못된 피팅 → 이 각도는 측정 실패로 처리

        const xs = good.map((r) => r.x);
        const ys = good.map((r) => r.y);
        const tilts = good.filter((r) => r.tilt_dir != null).map((r) => r.tilt_dir);
        const ratios = good
            .filter((r) => r.major_r > 0 && r.minor_r > 0)
            .map((r) => Math.min(r.minor_r, r.major_r) / Math.max(r.minor_r, r.major_r));
        const tMed = tilts.length ? median(tilts) : null;

        return {
            avgX: median(xs),
            avgY: median(ys),
            n: good.length,
            rejected: raw.length - good.length,
            majorR: median(good.map((r) => r.major_r)),
            tiltDir: tMed,
            tiltDirSd:
                tilts.length > 1 ? Math.sqrt(tilts.reduce((s, v) => s + (v - tMed) ** 2, 0) / tilts.length) : null,
            axisRatio: ratios.length ? median(ratios) : null,
        };
    };

    const autoSweep = async () => {
        if (!refPoint) {
            toast.error("기준측정(0°)을 먼저 실행해주세요");
            return;
        }
        if (!formData.pitch) {
            toast.error("pitch이 없습니다 — 기준측정(0°)을 먼저 실행해주세요");
            return;
        }
        const scale = parseFloat(LIMBUS_MM) / parseFloat(LIMBUS_PX);
        if (!(scale > 0)) {
            toast.error("LIMBUS_MM/PX 확인 — 거리측정을 먼저 해주세요");
            return;
        }
        const pitch = formData.pitch;
        setSweeping(true);
        setLoading(true);
        // 실제 각도 검증용 WS 열기 (없으면 무검증 진행)
        latestAngleRef.current = null;
        const ws = await openStatusWs();
        if (!ws) toast("각도 확인용 연결 실패 — 검증 없이 진행합니다", { icon: "⚠️" });
        try {
            // 0°(기준)는 사용자가 직접 입력. 자동 스윕은 4°부터 측정 시작.
            let aborted = false;
            for (const { pass, dir, angles } of SWEEP_PASSES) {
                if (aborted) break;
                // 2패스 시작 전 원점 복귀 — 40°에서 곧장 재는 게 아니라 같은 절차로 접근시킨다
                if (pass > 1) {
                    setSweepStatus(`${pass}패스 준비 — 원점 복귀 중…`);
                    await homeEye();
                    await sleep(SWEEP_SETTLE_MS);
                }
                for (const angle of angles) {
                    setSweepStatus(`[${pass}/${SWEEP_PASSES.length} ${dir}] ${angle}° 이동 중…`);
                    // 안구가 목표 각도에 실제 도달했는지 확인한 뒤에만 측정
                    const reached = await moveEyeVerified(angle, ws);
                    if (!reached) {
                        const a = latestAngleRef.current;
                        toast.error(
                            `${angle}° 도달 실패 (실제 L${a?.left?.toFixed(1) ?? "?"} R${a?.right?.toFixed(1) ?? "?"}) — 스윕 중단`,
                        );
                        aborted = true;
                        break;
                    }

                    setSweepStatus(`[${pass}/${SWEEP_PASSES.length} ${dir}] ${angle}° 측정 중…`);
                    const s = await sampleAvg(refPoint.majorR);
                    if (!s) {
                        toast.error(`${angle}° 유효 샘플 부족(피팅 붕괴 의심) — 스윕 중단`);
                        aborted = true;
                        break;
                    }
                    const dx = s.avgX - refPoint.x;
                    const dy = s.avgY - refPoint.y;
                    const deltaMM = calculateCorrectedX(dx, dy) * scale;
                    saveCalibrationMeasurement(pitch, deltaMM, angle, {
                        // 몇 번째 패스에서, 어느 방향으로 접근해 잰 값인지 (재현성/히스테리시스 분리용)
                        pass,
                        approach: dir,
                        dx_px: Number(dx.toFixed(2)),
                        dy_px: Number(dy.toFixed(2)),
                        dx_mm: Number((dx * scale).toFixed(4)),
                        dy_mm: Number((dy * scale).toFixed(4)),
                        ref_x: Number(refPoint.x.toFixed(2)),
                        ref_y: Number(refPoint.y.toFixed(2)),
                        samples: s.n,
                        // 이 세트에 실제로 적용된 윤부 스케일 — 세션 간 배율 차이를 사후 검증할 때 필요
                        limbus_px: Number(parseFloat(LIMBUS_PX).toFixed(2)),
                        limbus_mm: Number(parseFloat(LIMBUS_MM).toFixed(2)),
                        // 안구모형이 실제로 도달한 각도(WS 보고값) — 명령각과 다를 수 있음
                        actual_angle: reached.unverified
                            ? null
                            : Number(((reached.left + reached.right) / 2).toFixed(2)),
                        actual_left: reached.unverified ? null : Number(reached.left.toFixed(2)),
                        actual_right: reached.unverified ? null : Number(reached.right.toFixed(2)),
                        move_tries: reached.tries,
                        // 타원 기반(스케일-프리) 방식 검증용
                        tilt_dir: s.tiltDir != null ? Number(s.tiltDir.toFixed(2)) : null,
                        tilt_dir_sd: s.tiltDirSd != null ? Number(s.tiltDirSd.toFixed(2)) : null,
                        major_r: s.majorR != null ? Number(s.majorR.toFixed(2)) : null,
                        rejected: s.rejected, // 장축 이상으로 버린 샘플 수
                        ref_major_r: refPoint.majorR != null ? Number(refPoint.majorR.toFixed(2)) : null,
                        axis_ratio: s.axisRatio != null ? Number(s.axisRatio.toFixed(4)) : null,
                        ref_tilt_dir: refPoint.tiltDir != null ? Number(refPoint.tiltDir.toFixed(2)) : null,
                        ref_axis_ratio: refPoint.axisRatio != null ? Number(refPoint.axisRatio.toFixed(4)) : null,
                    });
                    const actTxt = reached.unverified
                        ? ""
                        : ` [실제 ${((reached.left + reached.right) / 2).toFixed(1)}°${reached.tries > 1 ? `, 재시도 ${reached.tries}회` : ""}]`;
                    setSweepStatus(
                        `[${pass}/${SWEEP_PASSES.length}] ${angle}° 저장: ${deltaMM.toFixed(3)}mm (${s.n}샘플)${actTxt}`,
                    );

                    // 50/50 측정 완료 후 4초 대기 → 다음 각도로 회전 (패스의 마지막 각도면 생략)
                    if (angle !== angles[angles.length - 1]) {
                        setSweepStatus(`${angle}° 완료 — 다음 회전 전 대기…`);
                        await sleep(SWEEP_SETTLE_MS);
                    }
                }
            }

            await homeEye();
            setSweepStatus("스윕 완료");
            toast.success("자동 스윕 완료");
        } catch (e) {
            toast.error(`스윕 오류: ${e.message}`);
        } finally {
            try {
                ws?.close();
            } catch {
                /* ignore */
            }
            setSweeping(false);
            setLoading(false);
            setProgress(0);
        }
    };

    // Refs
    const canvasRef = useRef(null);
    const imageRef = useRef(new Image());

    /**
     * 보정된 X값 계산 (유클리드 거리 + 부호 유지)
     * 카메라-안구 X축 수평 정렬 오차를 보정하기 위해 Y 성분 포함
     */
    const calculateCorrectedX = (deltaX, deltaY) => {
        const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        const correctedX = deltaX < 0 ? -distance : distance;
        return parseFloat(correctedX.toFixed(2));
    };

    // 윤부 지름(px) 확정 시 공통 처리 (반자동·수동 공용)
    const onLimbusComplete = (limbusPxDiameter) => {
        setLimbusMM("12.12");
        setLimbusPX(limbusPxDiameter);
        setResultImage(null);
        setResultImage2(null);
        toast.success(`윤부 ${limbusPxDiameter.toFixed(1)}px 저장`);
    };

    const getCamToEyeDistance = async () => {
        try {
            // 현재 프레임 + 동공 중심(eyerec)을 받아 반자동 윤부 측정 모드로 전환한다.
            const { data } = await axios({
                url: `${API_URL}/api/one_frame_pupil_detect?idx=1`,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            });

            if (!data.frameBase64) {
                toast.error("프레임을 가져올 수 없습니다. START로 스트림을 먼저 켜주세요.");
                return;
            }

            // 동공 중심(절대 px) — 윤부 자동 제안 원의 앵커. 검출 실패 시 null(중앙으로 폴백)
            setPupilCenter(data.x != null && data.y != null ? { x: data.x, y: data.y } : null);
            setResultImage(`data:image/jpeg;base64,${data.frameBase64}`);
            toast("자동 제안된 윤부 원을 확인하고, 필요하면 드래그/휠로 맞춘 뒤 확인을 누르세요", { icon: "🎯" });
        } catch (error) {
            console.error("거리 측정 실패:", error);
            toast.error(error.response?.data?.error || error.message);
        }
    };

    const getOneFramePupilDetect = async (idx) => {
        if (!canvasRef.current) {
            toast.error("캔버스가 없습니다");
            return;
        }

        try {
            const url = `${API_URL}/api/one_frame_pupil_detect?idx=${idx}`;
            const { data } = await axios({
                url,
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            console.log(data);

            if (data.frameBase64) {
                setResultImage2(`data:image/jpeg;base64,${data.frameBase64}`);
            }

            return {
                // ?? 사용: 0도 유효한 값이므로 ||로 걸러내면 안 됨 (실패 시에만 null)
                pitch: data.pitch ?? null,
                x: data.x ?? null,
                y: data.y ?? null,
                // 타원 기반 각도 검증용 (스케일-프리 방식 실험)
                tilt_dir: data.tiltDir ?? null,
                major_r: data.majorR ?? null,
                minor_r: data.minorR ?? null,
            };
        } catch (error) {
            console.error("동공 검출 실패:", error);
            return null;
        }
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            connecting: { color: "text-yellow-400", text: "⏳ 연결중" },
            connected: { color: "text-green-400", text: "● LIVE" },
            retrying: { color: "text-orange-400", text: "🔄 재시도" },
            failed: { color: "text-red-400", text: "❌ 실패" },
            disconnected: { color: "text-gray-400", text: "⏹️ 중지" },
        };
        return statusConfig[status] || statusConfig.disconnected;
    };

    const save = () => {
        if (!formData.pitch) {
            toast.error("pitch를 입력해주세요");
            return;
        }

        if (!formData.delta_x) {
            toast.error("delta_x 입력해주세요");
            return;
        }

        if (!formData.eye_angle && formData.eye_angle !== 0) {
            toast.error("eye_angle을 입력해주세요");
            return;
        }

        // 수동 입력(0° 기준 등)이라 성분 데이터가 없어도 윤부 스케일은 항상 남긴다
        const limbusDetail = {
            limbus_px: parseFloat(parseFloat(LIMBUS_PX).toFixed(2)) || null,
            limbus_mm: parseFloat(parseFloat(LIMBUS_MM).toFixed(2)) || null,
        };
        saveCalibrationMeasurement(formData.pitch, formData.delta_x, formData.eye_angle, {
            ...limbusDetail,
            ...(lastDetailRef.current || {}),
        });
        lastDetailRef.current = null; // 수동 입력 저장에 이전 측정 성분이 붙지 않도록 초기화

        setFormData((prev) => ({
            ...prev,
            eye_angle: Number(prev.eye_angle) + 4,
            delta_x: "",
        }));
    };

    const handleStandardMeasure = async () => {
        const pitchResults = [];
        const xSamples = [];
        const ySamples = [];
        const tiltSamples = []; // 타원 기울기 방향(°)
        const ratioSamples = []; // 단축/장축
        const majorSamples = []; // 기준 장축 — 각도별 피팅 붕괴 판정에 쓴다
        setProgress(0); // ✅ 초기화
        setProgressCount(50);
        setLoading(true);
        for (let i = 0; i < 50; i++) {
            const result = await getOneFramePupilDetect(50);
            if (result?.pitch) {
                pitchResults.push(result.pitch);
            }
            // 동공 절대 좌표 수집 (검출 실패 시 null → 제외)
            if (result && result.x != null && result.y != null) {
                xSamples.push(result.x);
                ySamples.push(result.y);
                if (result.tilt_dir != null) tiltSamples.push(result.tilt_dir);
                if (result.major_r > 0 && result.minor_r > 0) {
                    majorSamples.push(result.major_r);
                    ratioSamples.push(
                        Math.min(result.minor_r, result.major_r) / Math.max(result.minor_r, result.major_r),
                    );
                }
            }
            setProgress(i + 1);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // 1차 평균 계산
        if (pitchResults.length > 0) {
            const firstAvg = pitchResults.reduce((acc, n) => acc + n, 0) / pitchResults.length;

            // 평균값과 4 이상 차이나는 값 제거
            const filtered = pitchResults.filter((angle) => Math.abs(angle - firstAvg) < 4);
            console.log(filtered);

            // 필터링된 값들로 최종 평균 계산
            if (filtered.length > 0) {
                const finalAvg = filtered.reduce((acc, n) => acc + n, 0) / filtered.length;
                setFormData((prev) => ({
                    ...prev,
                    pitch: finalAvg.toFixed(1),
                }));
            }
        }

        // 0° 기준점 저장 (동공 절대 좌표 평균)
        if (xSamples.length >= 10) {
            const refX = median(xSamples);
            const refY = median(ySamples);
            const refTilt = tiltSamples.length ? median(tiltSamples) : null;
            const refRatio = ratioSamples.length ? median(ratioSamples) : null;
            const refMajor = majorSamples.length ? median(majorSamples) : null;
            setRefPoint({ x: refX, y: refY, tiltDir: refTilt, axisRatio: refRatio, majorR: refMajor });
            toast.success(`기준점 설정 완료 (${xSamples.length}/50 샘플, x=${refX.toFixed(1)}px)`);
        } else {
            setRefPoint(null);
            toast.error(`기준점 샘플 부족 (${xSamples.length}/50) — 동공 검출 상태를 확인해주세요`);
        }

        setLoading(false);
        setProgress(0);
    };

    const handleMeasure = async () => {
        if (!refPoint) {
            toast.error("기준측정(0°)을 먼저 실행해주세요");
            return;
        }

        const xSamples = [];
        const ySamples = [];
        setProgress(0); // ✅ 초기화
        setProgressCount(50);
        setLoading(true);
        for (let i = 0; i < 50; i++) {
            const result = await getOneFramePupilDetect(60);
            // 동공 절대 좌표 수집 (검출 실패 시 null → 제외)
            if (result && result.x != null && result.y != null) {
                xSamples.push(result.x);
                ySamples.push(result.y);
            }
            setProgress(i + 1);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // 평균 좌표 → 기준점 대비 이동량 → mm 변환
        if (xSamples.length >= 10) {
            const avgX = median(xSamples);
            const avgY = median(ySamples);

            // 평균한 뒤에 보정 적용 (샘플별 적용 시 노이즈의 |y|가 누적되어 과대평가됨)
            const dxPx = avgX - refPoint.x;
            const dyPx = avgY - refPoint.y;
            const deltaPx = calculateCorrectedX(dxPx, dyPx);

            const scale = parseFloat(LIMBUS_MM) / parseFloat(LIMBUS_PX);
            let avgMm;
            if (scale > 0) {
                avgMm = deltaPx * scale;
            } else {
                avgMm = 0;
                toast.error("LIMBUS_MM과 LIMBUS_PX 값을 확인해주세요");
            }

            // 성분 데이터 보존 (저장 시 delta_x와 함께 기록)
            lastDetailRef.current = {
                dx_px: parseFloat(dxPx.toFixed(2)),
                dy_px: parseFloat(dyPx.toFixed(2)),
                dx_mm: parseFloat((dxPx * scale).toFixed(4)),
                dy_mm: parseFloat((dyPx * scale).toFixed(4)),
                ref_x: parseFloat(refPoint.x.toFixed(2)),
                ref_y: parseFloat(refPoint.y.toFixed(2)),
                samples: xSamples.length,
                // 이 측정에 실제로 적용된 윤부 스케일 — 세션 간 배율 차이를 사후 검증할 때 필요
                limbus_px: parseFloat(parseFloat(LIMBUS_PX).toFixed(2)),
                limbus_mm: parseFloat(parseFloat(LIMBUS_MM).toFixed(2)),
            };

            setFormData((prev) => ({
                ...prev,
                delta_x: avgMm.toFixed(3),
            }));
            toast.success(`측정 완료 (${xSamples.length}/50 샘플)`);
        } else {
            toast.error(`유효 샘플 부족 (${xSamples.length}/50) — 동공 검출 상태를 확인해주세요`);
        }
        setLoading(false);
        setProgress(0);
    };

    const startStreaming = async () => {
        if (isStreaming) {
            return;
        }

        await axios({
            url: `${API_URL}/api/live`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 5000,
        });

        const wsClient = new EyeWsClient(SOCKET_URL);
        wsClientRef.current = wsClient;
        wsClient.connect();

        liveUnsubscribeRef.current = wsClient.onLive(({ data }) => {
            const { frameBase64, eye } = data;
            if (eye === "OD") {
                drawBase64ToCanvas(frameBase64, canvasRef.current);
                setConnectionStatus("connected");
            }
        });
        setStreaming(true);
    };

    const stopStreaming = async () => {
        if (!isStreaming) {
            return;
        }

        const { data } = await axios({
            url: `${API_URL}/api/stop`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 5000,
        });
        canvasRef.current = null;
        setResultImage(null);
        setResultImage2(null);

        liveUnsubscribeRef.current?.(); // LIVE 구독 해제
        liveUnsubscribeRef.current = null;

        wsClientRef.current?.disconnect();
        wsClientRef.current = null;

        setConnectionStatus("disconnected");
        setStreaming(false);
    };

    useEffect(() => {
        // 언마운트
        return () => {
            stopStreaming();
        };
    }, []);

    return (
        <Layout>
            <div className="">
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <div className="flex flex-row gap-2">
                        <RippleButton
                            className="bg-blue-600 hover:bg-blue-400 text-white px-4 py-2"
                            onClick={() => startStreaming()}
                        >
                            START
                        </RippleButton>

                        <RippleButton
                            className="bg-red-600 hover:bg-red-400 text-white px-4 py-2"
                            onClick={async () => {
                                await stopStreaming();
                                window.location.reload();
                            }}
                        >
                            STOP
                        </RippleButton>
                    </div>

                    <div className="flex flex-row gap-2 items-center">
                        <RippleButton
                            className="bg-green-600 hover:bg-green-400 text-white px-4 py-2"
                            onClick={() => getCamToEyeDistance()}
                        >
                            거리측정
                        </RippleButton>
                        {LIMBUS_MM}mm / {LIMBUS_PX}px
                    </div>

                    <div className="flex flex-row gap-2 items-center">
                        <RippleButton
                            className="bg-white hover:bg-gray-400 border px-4 py-2"
                            onClick={() => handleStandardMeasure()}
                        >
                            기준측정(0°)
                        </RippleButton>
                        {refPoint ? (
                            <span className="text-xs text-green-600">
                                기준 ({refPoint.x.toFixed(1)}, {refPoint.y.toFixed(1)})px
                            </span>
                        ) : (
                            <span className="text-xs text-gray-400">기준 미설정</span>
                        )}
                    </div>

                    <div className="flex flex-row gap-2">
                        <RippleButton
                            className="bg-white hover:bg-gray-400 border px-4 py-2"
                            onClick={() => handleMeasure()}
                        >
                            측정
                        </RippleButton>
                    </div>
                </div>

                {/* 안구모형 각도 제어 패널 (마우스 클릭으로 4°씩 이동) */}
                <div className="mb-2 flex items-center gap-3 rounded-lg border border-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-3 py-2">
                    <span className="font-semibold text-indigo-700 dark:text-indigo-300">안구 각도</span>
                    <span className="text-2xl font-bold tabular-nums w-16 text-center">{eyeAngle}°</span>
                    <RippleButton
                        className="bg-gray-500 hover:bg-gray-400 text-white px-3 py-2 disabled:opacity-40"
                        onClick={() => homeEye()}
                        disabled={eyeBusy}
                    >
                        Home(0°)
                    </RippleButton>
                    <RippleButton
                        className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 disabled:opacity-40"
                        onClick={() => moveEye(eyeAngle - 4)}
                        disabled={eyeBusy || eyeAngle <= 0}
                    >
                        −4°
                    </RippleButton>
                    <RippleButton
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 text-lg disabled:opacity-40"
                        onClick={() => moveEye(eyeAngle + 4)}
                        disabled={eyeBusy || eyeAngle >= 40}
                    >
                        다음 +4°
                    </RippleButton>
                    {eyeBusy && !sweeping && <span className="text-xs text-gray-500">이동 중…</span>}
                    {eyeAngle >= 40 && !sweeping && <span className="text-xs text-green-600">최대 40°</span>}

                    <div className="ml-auto flex items-center gap-2">
                        {sweeping && <span className="text-xs text-purple-600">{sweepStatus}</span>}
                        <RippleButton
                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 disabled:opacity-40"
                            onClick={() => autoSweep()}
                            disabled={sweeping || eyeBusy || !refPoint}
                            title={!refPoint ? "기준측정(0°)을 먼저 실행하세요" : "0→40° 자동 측정"}
                        >
                            {sweeping ? "스윕 중…" : "자동 스윕 (±40°)"}
                        </RippleButton>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    <div className="relative bg-gray-800">
                        <div className="absolute top-0 w-full px-2 py-1 flex justify-between items-center z-10">
                            <h2 className="text-xl font-semibold text-white"></h2>
                            {isStreaming && (
                                <span className={`text-xs ${getStatusBadge(connectionStatus).color}`}>
                                    {getStatusBadge(connectionStatus).text}
                                </span>
                            )}
                        </div>
                        <canvas ref={canvasRef} className={`w-full bg-black ${aspectClass}`} />
                    </div>
                    <div>
                        <MeasurementScale limbusPx={LIMBUS_PX} limbusMM={LIMBUS_MM} />
                    </div>

                    <div className="relative" />
                    <div className="">
                        {resultImage2 && (
                            <img src={resultImage2} alt="Distance Measurement Result" className="w-full bg-black" />
                        )}
                    </div>
                </div>

                {/* 윤부 측정 팝업 — 캔버스가 원본 해상도(1280) 1:1이라 7xl로 넓힌다 */}
                {resultImage && (
                    <Popup
                        width="full"
                        height="h-fit"
                        onClose={() => {
                            setResultImage(null);
                            setResultImage2(null);
                        }}
                    >
                        <div className="flex flex-col items-center">
                            <LimbusLineMeasure
                                imageSource={resultImage}
                                pupilCenter={pupilCenter}
                                initialDiameter={parseFloat(LIMBUS_PX) > 10 ? parseFloat(LIMBUS_PX) : null}
                                onComplete={onLimbusComplete}
                            />
                        </div>
                    </Popup>
                )}

                <div className="mt-2">
                    <div className="flex flex-row items-center mb-2 gap-2">
                        <input
                            type="text"
                            className="border p-2 w-20 rounded text-center"
                            placeholder="pitch"
                            value={formData.pitch || ""}
                            onChange={(e) => setFormData({ ...formData, pitch: e.target.value })}
                        />

                        <input
                            type="text"
                            className="border p-2 w-24 rounded"
                            placeholder="delta_x (mm)"
                            value={formData.delta_x || ""}
                            onChange={(e) => setFormData({ ...formData, delta_x: e.target.value })}
                        />

                        <input
                            type="text"
                            className="border p-2 w-20 rounded"
                            placeholder="각도"
                            value={formData.eye_angle || ""}
                            onChange={(e) => setFormData({ ...formData, eye_angle: e.target.value })}
                        />

                        <RippleButton
                            className="bg-blue-600 hover:bg-blue-400 text-white px-4 py-2"
                            onClick={() => save()}
                        >
                            저장
                        </RippleButton>
                    </div>
                    <XaxisCalibrationTable />
                </div>
            </div>

            {isLoading && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50">
                    <div className="w-80 bg-gray-800 rounded-lg p-6 shadow-2xl">
                        <div className="text-white text-center mb-4 text-lg font-semibold">
                            처리 중... {progress} / {progressCount}
                        </div>

                        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                                style={{
                                    width: `${(progress / progressCount) * 100}%`,
                                }}
                            ></div>
                        </div>

                        {/* 퍼센트 표시 추가 */}
                        <div className="text-blue-400 text-center mt-2 text-sm font-medium">
                            {parseInt((progress / progressCount) * 100)}%
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
