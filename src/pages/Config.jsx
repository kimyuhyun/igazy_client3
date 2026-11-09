import useSyncShutterMaxFrame from "../hooks/useSyncShutterMaxFrame";
import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import RippleButton from "../components/RippleButton";
import toast from "react-hot-toast";
import ShutterSequenceEditor, { MiniTimeline } from "../components/ShutterSequenceEditor";
import { DEFAULT_PRESET_ID, normalizePresets } from "../utils/shutterProtocol";
import { COLOR_ROLES, DEFAULT_COLORS, isHex, normalizeColors } from "../utils/colors";
import axios from "axios";
import useVariableStore from "../stores/useVariableStore";
import { CAMERA_FPS } from "../utils/cameraFps";

const sectionClass =
    "grid min-[1100px]:grid-cols-[160px_minmax(0,1fr)] gap-x-6 gap-y-4 py-5 border-b border-[var(--cfg-line)]";
const sectionHeadClass = "text-[14px] font-semibold leading-8";
const buttonClass =
    "min-h-8 max-[640px]:min-h-11 rounded px-3 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";

export default function Config() {
    useSyncShutterMaxFrame();
    const { IP, setIp, MAX_FRAME, setMaxFrame, SHUTTER_PRESETS, SHUTTER_ACTIVE_ID, COLORS, setColors } =
        useVariableStore();
    // 역할별 색 (설정 즉시 저장). 입력 중인 hex 는 유효할 때만 반영한다
    const colors = normalizeColors(COLORS);
    const setColor = (key, value) => {
        if (isHex(value)) setColors({ ...colors, [key]: value.trim().toLowerCase() });
    };
    // 적용 중인 셔터 프리셋 요약 (카드에 표시)
    const shutterPresets = normalizePresets(SHUTTER_PRESETS);
    const activeShutter =
        shutterPresets.find((p) => p.id === SHUTTER_ACTIVE_ID) ??
        shutterPresets.find((p) => p.id === DEFAULT_PRESET_ID);
    const API_URL = `http://${IP}:8080`;

    const [igazyIP, setIgazyIP] = useState("");
    // 보드 주소 조회 상태: loading | ok | fail — "—" 만으로는 조회 중인지 실패인지 알 수 없다 (Codex 설정 리뷰 C1)
    const [igazyStatus, setIgazyStatus] = useState("loading");
    // 셔터 시퀀스 편집 팝업 (2026-11-02)
    const [shutterEditor, setShutterEditor] = useState(false);

    const [formData, setFormData] = useState({
        max_frame: "",
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
                ip1: tmp[0] || "",
                ip2: tmp[1] || "",
                ip3: tmp[2] || "",
                ip4: tmp[3] || "",
            }));
        }

        getIGazyIp();
    }, [IP, MAX_FRAME]);

    const getIGazyIp = async () => {
        // 대상 서버(IP)를 바꾼 뒤 조회에 실패하면 예전 주소가 남지 않게 먼저 비운다
        setIgazyStatus("loading");
        setIgazyIP("");
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
            toast.success("IGazy IP 주소를 불러왔습니다.");
            setIgazyStatus("ok");
        } catch {
            setIgazyStatus("fail");
        }
    };

    const handleCalibrate = async () => {
        const { data } = await axios({
            url: `${API_URL}/api/calibrate`,
            method: "GET",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
            },
        });

        console.log(data);
        toast.success(data.message);
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

        const ip = parts.join(".");
        setIp(ip);
        setMaxFrame(max);

        toast.success("저장되었습니다.");
    };

    const inputClass =
        "h-8 max-[640px]:h-11 min-w-0 rounded border border-[var(--cfg-control)] bg-white text-[var(--cfg-text)] px-2 text-[14px] tabular-nums placeholder:text-[var(--cfg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";
    const labelClass = "text-[13px] text-[var(--cfg-muted)] self-center";
    const linkClass =
        "text-[var(--cfg-text)] underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-700 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
    const boardReady = igazyStatus === "ok" && !!igazyIP;
    const ipParts = ["ip1", "ip2", "ip3", "ip4"];
    const ipNames = ["첫 번째", "두 번째", "세 번째", "네 번째"];

    return (
        <Layout>
            <div
                data-ui="config"
                style={{
                    "--cfg-line": "#e6e6e6",
                    "--cfg-control": "#d1d1d1",
                    "--cfg-text": "#171717",
                    "--cfg-muted": "#626262",
                    fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif',
                }}
                className="max-w-[1168px] bg-white px-4 min-[1100px]:px-6 text-[13px] leading-5 text-[var(--cfg-text)]"
            >
                {/* 최대 1120px = 제목 160px + 간격 24px + 필드 936px. 세 단락이 같은 좌우 경계를 쓴다. */}
                <div className="max-w-[1120px]">
                    <section className={sectionClass} aria-labelledby="cfg-connection-title">
                        <h2 id="cfg-connection-title" className={sectionHeadClass}>
                            연결 · 프레임
                        </h2>
                        <div className="grid grid-cols-[100px_minmax(0,1fr)] max-[480px]:grid-cols-1 gap-x-4 gap-y-3 items-start">
                            <label htmlFor="cfg-max-frame" className={labelClass}>
                                MAX_FRAME
                            </label>
                            <div className="flex items-center gap-3 flex-wrap">
                                <input
                                    id="cfg-max-frame"
                                    type="text"
                                    inputMode="numeric"
                                    value={formData.max_frame || "0"}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (v === "" || /^\d+$/.test(v)) {
                                            setFormData((prev) => ({ ...prev, max_frame: v }));
                                        }
                                    }}
                                    className={`${inputClass} w-28 text-right`}
                                />
                                <span className="text-[12px] tabular-nums whitespace-nowrap text-[var(--cfg-muted)]">
                                    약 {(Number(formData.max_frame || 0) / CAMERA_FPS).toFixed(1)}초 · {CAMERA_FPS}fps
                                </span>
                            </div>

                            <span className={labelClass} id="cfg-ip-label">
                                IP
                            </span>
                            <div className="flex items-center" role="group" aria-labelledby="cfg-ip-label">
                                {ipParts.map((key, i) => (
                                    <React.Fragment key={key}>
                                        {i > 0 && <span className="mx-1 text-[var(--cfg-muted)]">.</span>}
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={formData[key] || ""}
                                            onChange={(e) =>
                                                setFormData((prev) => ({ ...prev, [key]: e.target.value }))
                                            }
                                            maxLength={3}
                                            aria-label={`IP 주소 ${ipNames[i]} 부분`}
                                            className={`${inputClass} w-12 shrink-0 text-center`}
                                        />
                                    </React.Fragment>
                                ))}
                            </div>

                            <span className={`${labelClass} self-start pt-1.5`}>IGazy IP</span>
                            <div className="min-w-0">
                                <output
                                    aria-live="polite"
                                    className="flex min-h-8 items-center text-[14px] tabular-nums"
                                >
                                    {igazyStatus === "loading" && (
                                        <span className="text-[var(--cfg-muted)]">조회 중…</span>
                                    )}
                                    {igazyStatus === "fail" && (
                                        <span>
                                            주소 확인 실패{" "}
                                            <button
                                                type="button"
                                                className={`${linkClass} ml-2 text-[13px] max-[640px]:min-h-11`}
                                                onClick={getIGazyIp}
                                            >
                                                다시 조회
                                            </button>
                                        </span>
                                    )}
                                    {igazyStatus === "ok" &&
                                        (igazyIP || <span className="text-[var(--cfg-muted)]">주소 미확인</span>)}
                                </output>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[13px]">
                                    {[
                                        { label: "OD·OS 같이 보기", href: `http://${igazyIP}:8088/cam_on` },
                                        { label: "OD", href: `http://${igazyIP}:8081/1/stream` },
                                        { label: "OS", href: `http://${igazyIP}:8081/2/stream` },
                                    ].map((l) =>
                                        boardReady ? (
                                            <a
                                                key={l.label}
                                                href={l.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={`${linkClass} max-[640px]:min-h-11 inline-flex items-center`}
                                                aria-label={`${l.label} (새 창)`}
                                            >
                                                {l.label}
                                            </a>
                                        ) : (
                                            <span
                                                key={l.label}
                                                className="text-[var(--cfg-muted)]"
                                                aria-disabled="true"
                                            >
                                                {l.label}
                                            </span>
                                        ),
                                    )}
                                </div>
                            </div>

                            <div className="col-start-2 max-[480px]:col-start-1 flex pt-1">
                                <RippleButton
                                    className={`${buttonClass} bg-[var(--cfg-text)] text-white hover:bg-neutral-700`}
                                    onClick={() => handleSave()}
                                >
                                    IP·프레임 설정 저장
                                </RippleButton>
                            </div>
                        </div>
                    </section>

                    {/* 전체 행을 하나의 버튼으로 열되, 기존 편집기와 저장·적용 동작은 그대로 둔다. */}
                    <section className={`${sectionClass} relative group`} aria-labelledby="cfg-shutter-title">
                        <h2 id="cfg-shutter-title" className={sectionHeadClass}>
                            셔터 시퀀스
                        </h2>
                        <div className="flex items-center gap-4 min-w-0 py-1">
                            <span className="shrink-0 text-[var(--cfg-muted)]">적용 중</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium break-words [overflow-wrap:anywhere]">
                                    {activeShutter?.name ?? "기본 프리셋"}
                                </div>
                                {activeShutter && (
                                    <div className="max-w-xs w-full pt-1">
                                        <MiniTimeline steps={activeShutter.steps} />
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                aria-label="셔터 시퀀스 설정"
                                onClick={() => setShutterEditor(true)}
                                className={`${buttonClass} border border-[var(--cfg-control)] bg-white hover:bg-neutral-50`}
                            >
                                편집
                            </button>
                        </div>
                    </section>

                    <section className={`${sectionClass} !border-b-0`} aria-labelledby="cfg-colors-title">
                        <div>
                            <h2 id="cfg-colors-title" className={sectionHeadClass}>
                                색상
                            </h2>
                            <p className="text-[12px] text-[var(--cfg-muted)]">즉시 저장</p>
                        </div>
                        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 items-center">
                            {COLOR_ROLES.map((role) => (
                                <React.Fragment key={role.key}>
                                    <label htmlFor={`cfg-color-${role.key}`} className={labelClass} title={role.desc}>
                                        {role.label}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id={`cfg-color-${role.key}`}
                                            type="color"
                                            value={colors[role.key]}
                                            onChange={(e) => setColor(role.key, e.target.value)}
                                            className="h-8 w-8 max-[640px]:h-11 max-[640px]:w-11 shrink-0 rounded border border-[var(--cfg-control)] bg-white p-0.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700"
                                            aria-label={`${role.label} 색 고르기`}
                                        />
                                        <input
                                            type="text"
                                            defaultValue={colors[role.key]}
                                            key={colors[role.key]}
                                            onBlur={(e) => setColor(role.key, e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") setColor(role.key, e.currentTarget.value);
                                            }}
                                            className={`${inputClass} w-28`}
                                            aria-label={`${role.label} 색상 코드`}
                                            placeholder="#rrggbb"
                                        />
                                    </div>
                                </React.Fragment>
                            ))}
                            <div className="col-start-2 flex pt-1">
                                <button
                                    type="button"
                                    className={`${buttonClass} border border-[var(--cfg-control)] bg-white hover:bg-neutral-50`}
                                    onClick={() => setColors({ ...DEFAULT_COLORS })}
                                >
                                    기본 색으로
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {shutterEditor && <ShutterSequenceEditor onClose={() => setShutterEditor(false)} />}
        </Layout>
    );
}
