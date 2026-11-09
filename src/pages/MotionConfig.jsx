import { useDialog } from "../utils/dialog";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import Layout from "../components/Layout";
import RippleButton from "../components/RippleButton";
import useVariableStore from "../stores/useVariableStore";

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 disabled:opacity-50";
const buttonClass = "bg-blue-600 text-white px-4 py-2 disabled:opacity-50";
const cardClass = "rounded-lg border border-gray-200 bg-white p-4 space-y-4";
const flipLabels = { none: "없음", v: "좌우(v)", h: "상하(h)" };
// 보드 ShutterGlasses 신호. 플래그 기준(보드가 OD 명령일 때 OD 카메라 플래그 1 = 열림): OD = OD 보임(OS 가림), OS = OS 보임(OD 가림).
// OU/NO 는 2026-10-28 실기: OU = 양쪽 가림, NO = 양쪽 열림. 단안 명령의 물리 방향은 실기로 한 번 더 확인할 것 (2026-11-02).
const shutterSides = [
    { side: "OD", label: "OD 보임 (OS 가림)" },
    { side: "OS", label: "OS 보임 (OD 가림)" },
    { side: "OU", label: "양쪽 가림" },
    { side: "NO", label: "양쪽 열림" },
];
const validIp = (value) =>
    /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split(".").every((part) => Number(part) <= 255);
const errorMessage = (error) => error.response?.data?.message || error.message || "보드 요청에 실패했습니다.";

// A control's key includes the response revision, so errors also restore the board value.
function Control({ name, spec, value, disabled, onCommit }) {
    const [draft, setDraft] = useState(String(value ?? ""));
    const lastSent = useRef(String(value ?? ""));
    const commit = (next) => {
        if (disabled || spec.inactive || String(next) === lastSent.current) return;
        if (spec.type === "int") {
            const number = Number(next);
            const step = spec.step || 1;
            if (
                next === "" ||
                !Number.isInteger(number) ||
                number < spec.min ||
                number > spec.max ||
                (number - (spec.min ?? 0)) % step !== 0
            ) {
                toast.error(`${name}: ${spec.min}~${spec.max}, 간격 ${step}의 정수를 입력해 주세요.`);
                setDraft(lastSent.current);
                return;
            }
        }
        // 화면이 잠겨(전송 중) 보내지 못했으면 lastSent 를 바꾸지 않아 같은 값으로 다시 시도할 수 있게 한다
        if (onCommit(next) !== false) lastSent.current = String(next);
    };
    const blocked = disabled || spec.inactive;
    return (
        <div className="space-y-2">
            <div className="flex justify-between gap-2 text-sm font-medium">
                <span>{name}</span>
                {spec.inactive && <span className="text-gray-500">비활성</span>}
            </div>
            {spec.type === "select" || spec.type === "menu" ? (
                <select
                    aria-label={name}
                    className={inputClass}
                    value={draft}
                    disabled={blocked}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        commit(event.target.value);
                    }}
                >
                    {(spec.type === "menu"
                        ? spec.menu
                        : spec.options.map((option) => ({
                              value: option,
                              label: name === "flip_axis" ? flipLabels[option] || option : option,
                          }))
                    ).map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : spec.type === "bool" ? (
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        role="switch"
                        aria-label={name}
                        checked={Number(draft) !== 0}
                        disabled={blocked}
                        onChange={(event) => {
                            const next = event.target.checked ? "1" : "0";
                            setDraft(next);
                            commit(next);
                        }}
                    />
                    {Number(draft) ? "켜짐" : "꺼짐"}
                </label>
            ) : spec.type === "int" ? (
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        aria-label={`${name} 슬라이더`}
                        className="min-w-0 flex-1"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step || 1}
                        value={draft === "" ? spec.min : draft}
                        disabled={blocked}
                        onChange={(event) => setDraft(event.target.value)}
                        onPointerUp={(event) => commit(event.currentTarget.value)}
                        onKeyUp={(event) => commit(event.currentTarget.value)}
                        onBlur={() => commit(draft)}
                    />
                    <input
                        type="number"
                        aria-label={`${name} 숫자`}
                        className={`${inputClass} !w-28`}
                        min={spec.min}
                        max={spec.max}
                        step={spec.step || 1}
                        value={draft}
                        disabled={blocked}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => commit(draft)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                        }}
                    />
                </div>
            ) : (
                <span className="text-gray-500">지원하지 않는 컨트롤</span>
            )}
        </div>
    );
}

function BoardSettings({ ip }) {
    const dialog = useDialog();
    const [data, setData] = useState(null);
    const currentData = useRef(null);
    useEffect(() => {
        currentData.current = data;
    }, [data]);
    const [busy, setBusy] = useState("조회 중");
    const [revision, setRevision] = useState(0);
    const [streamVersion, setStreamVersion] = useState(0);
    const session = useRef(null);
    const locked = useRef(false);
    const base = `http://${ip}:8088`;

    useEffect(() => {
        const controller = new AbortController();
        session.current = controller;
        axios
            .get(`${base}/motion_cfg/get`, { signal: controller.signal, timeout: 15000 })
            .then(({ data: result }) => {
                if (result.status !== "ok") throw new Error(result.message || "설정을 불러오지 못했습니다.");
                setData(result);
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setBusy("");
                    dialog.alert({
                        title: "보드 설정 조회 실패",
                        message: `${errorMessage(error)}\n보드 IP와 연결을 확인하고 새로고침하세요.`,
                        dedupeKey: `board-read:${base}`,
                    });
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy("");
            });
        return () => controller.abort();
    }, [base, dialog]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (locked.current || session.current?.signal.aborted) return;
            axios
                .get(`${base}/motion_cfg/get`, { signal: session.current.signal, timeout: 15000 })
                .then(({ data: result }) => {
                    if (result.status !== "ok" || locked.current) return;
                    setData((current) => {
                        // 켜짐/꺼짐이 바뀌었으면 영상 다시 연결
                        if (current && current.motion_running !== result.motion_running) setStreamVersion(Date.now());
                        return result;
                    });
                })
                .catch(() => {});
        }, 30000);
        return () => clearInterval(timer);
    }, [base]);

    const request = async (path, params) => {
        const response = await axios.get(`${base}${path}`, { params, signal: session.current.signal, timeout: 30000 });
        if (response.data?.status === "error") throw new Error(response.data.message || "설정 요청에 실패했습니다.");
        return response.data;
    };
    const refresh = async () => {
        const result = await request("/motion_cfg/get");
        if (result.status !== "ok") throw new Error("설정을 불러오지 못했습니다.");
        setData(result);
    };
    const perform = (label, action) => {
        if (locked.current || busy) return false;
        run(label, action);
        return true;
    };
    const run = async (label, action) => {
        let failure = null;
        locked.current = true;
        setBusy(label);
        try {
            await action();
        } catch (error) {
            if (!session.current.signal.aborted) {
                failure = `${errorMessage(error)}\n요청이 이미 반영됐을 수 있습니다. 재조회한 설정을 확인하고 다시 시도하세요.`;
                // A failed restart or timed-out write may still have saved the config.
                try {
                    await refresh();
                } catch {
                    setData(null);
                }
            }
        } finally {
            locked.current = false;
            if (!session.current.signal.aborted) {
                setRevision((current) => current + 1);
                setBusy("");
                if (failure) dialog.alert({ title: "보드 요청 실패", message: failure });
            }
        }
    };
    const setMotion = (scope, cam, key, value) =>
        perform("적용 중(모션 재시작)", async () => {
            await request("/motion_cfg/set_motion", { scope, ...(cam ? { cam } : {}), key, value });
            setStreamVersion(Date.now());
            await refresh();
        });
    const setV4l2 = (cam, path, params = {}) =>
        perform("카메라 설정 적용 중", async () => {
            const result = await request(`/motion_cfg/${path}`, { cam, ...params });
            if (!result.v4l2) throw new Error("카메라 컨트롤 응답이 없습니다.");
            if (result.error) throw new Error(result.error);
            setData((current) => ({
                ...current,
                cams: { ...current.cams, [cam]: { ...current.cams[cam], v4l2: result.v4l2 } },
            }));
        });
    const setShutter = (side) =>
        perform("셔터 전환 중", async () => {
            const result = await request("/motion_cfg/shutter", { side });
            setData((current) => ({ ...current, shutter: result.shutter }));
        });
    const cameraPower = (on) =>
        perform(on ? "카메라 켜는 중" : "카메라 끄는 중", async () => {
            const latest = await request("/motion_cfg/get");
            setData(latest);
            if (latest.measuring) throw new Error("측정 중이라 카메라를 켜고 끌 수 없습니다.");
            if (latest.motion_running === on) return;
            await request(on ? "/cam_on" : "/cam_off");
            setStreamVersion(Date.now());
            await refresh();
        });

    return (
        <>
            <section className={cardClass}>
                <div role="status" className="flex flex-wrap gap-4">
                    <span>motion: {data ? (data.motion_running ? "켜짐" : "꺼짐") : "확인 필요"}</span>
                    <span>측정: {data ? (data.measuring ? "측정 중" : "대기") : "확인 필요"}</span>
                    <span className="text-blue-600">{busy}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    <RippleButton
                        className={buttonClass}
                        disabled={!!busy || !data || data.measuring || data.motion_running}
                        onClick={() => cameraPower(true)}
                    >
                        카메라 켜기
                    </RippleButton>
                    <RippleButton
                        className={buttonClass}
                        disabled={!!busy || !data || data.measuring || !data.motion_running}
                        onClick={() => cameraPower(false)}
                    >
                        끄기
                    </RippleButton>
                    <RippleButton
                        className={buttonClass}
                        disabled={!!busy}
                        onClick={() =>
                            perform("조회 중", async () => {
                                await refresh();
                                setStreamVersion(Date.now());
                            })
                        }
                    >
                        새로고침
                    </RippleButton>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                    <span className="font-semibold">셔터글라스 테스트</span>
                    {shutterSides.map(({ side, label }) => (
                        <RippleButton
                            key={side}
                            aria-pressed={data?.shutter === side}
                            className={`px-4 py-2 disabled:opacity-50 ${data?.shutter === side ? "bg-blue-800 text-white" : "bg-gray-200 text-gray-800"}`}
                            disabled={!!busy || !data || data.measuring}
                            onClick={() => setShutter(side)}
                        >
                            {label}
                        </RippleButton>
                    ))}
                    <span className="text-sm text-gray-500">현재: {data?.shutter ?? "확인 필요"}</span>
                </div>
                {data?.measuring && (
                    <p className="text-amber-700">
                        측정 중에는 설정 변경, 셔터 테스트, 카메라 켜기/끄기를 사용할 수 없습니다.
                    </p>
                )}
            </section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {["1", "2"].map((cam) => (
                    <section key={cam} className={cardClass}>
                        <h2 className="font-semibold">{cam === "1" ? "OD" : "OS"} 라이브</h2>
                        {data?.motion_running && busy !== "적용 중(모션 재시작)" ? (
                            // motion 스트림 서버는 쿼리스트링(?t=…)이 붙으면 영상 대신 오류 응답을 준다. 재연결은 key 로 img 를 다시 마운트해서 한다.
                            <img
                                key={`${cam}-${streamVersion}`}
                                src={`http://${ip}:8081/${cam}/stream`}
                                alt={`${cam === "1" ? "OD" : "OS"} 라이브 스트림`}
                                className="w-full bg-black rounded"
                            />
                        ) : (
                            <p className="text-sm text-gray-500">
                                {busy === "적용 중(모션 재시작)"
                                    ? "모션 재시작 후 다시 연결합니다."
                                    : "카메라를 켜면 영상이 표시됩니다."}
                            </p>
                        )}
                    </section>
                ))}
            </div>
            {data && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {Object.entries(data.cams).map(([cam, camera]) => (
                            <section key={cam} className={cardClass}>
                                <h2 className="text-lg font-semibold">{camera.name} 카메라</h2>
                                {camera.error && (
                                    <p role="alert" className="text-sm text-red-600">
                                        {camera.error}
                                    </p>
                                )}
                                {Object.entries(data.schema.camera).map(([key, spec]) => (
                                    <Control
                                        key={`motion-${key}-${revision}`}
                                        name={key}
                                        spec={spec}
                                        value={camera.motion[key]}
                                        disabled={!!busy || data.measuring}
                                        onCommit={(value) => setMotion("cam", cam, key, value)}
                                    />
                                ))}
                                <h3 className="border-t pt-4 font-semibold">v4l2 컨트롤</h3>
                                {Object.entries(camera.v4l2).map(([name, spec]) => (
                                    <Control
                                        key={`${name}-${revision}`}
                                        name={name}
                                        spec={spec}
                                        value={spec.value}
                                        disabled={!!busy || data.measuring}
                                        onCommit={(value) => setV4l2(cam, "set_v4l2", { name, value: Number(value) })}
                                    />
                                ))}
                                <RippleButton
                                    className={buttonClass}
                                    disabled={!!busy || data.measuring}
                                    onClick={async () => {
                                        if (
                                            await dialog.confirm({
                                                title: "카메라 공장값 복원",
                                                message: `${camera.name} 카메라 컨트롤을 공장값으로 복원할까요?`,
                                                danger: true,
                                            })
                                        ) {
                                            if (session.current.signal.aborted) return;
                                            const current = currentData.current;
                                            if (
                                                current?.measuring ||
                                                !current?.cams?.[cam] ||
                                                session.current.signal.aborted
                                            )
                                                return;
                                            setV4l2(cam, "reset_v4l2");
                                        }
                                    }}
                                >
                                    공장값
                                </RippleButton>
                            </section>
                        ))}
                    </div>
                    <section className={cardClass}>
                        <h2 className="text-lg font-semibold">공통 설정</h2>
                        <p className="text-sm text-gray-500">
                            motion 설정은 저장 후 카메라가 켜져 있으면 재시작합니다(약 3~4초).
                        </p>
                        {Object.entries(data.schema.global).map(([key, spec]) => (
                            <Control
                                key={`${key}-${revision}`}
                                name={key}
                                spec={spec}
                                value={data.global[key]}
                                disabled={!!busy || data.measuring}
                                onCommit={(value) => setMotion("global", null, key, value)}
                            />
                        ))}
                        <p>
                            해상도·프레임 (읽기 전용): {data.readonly.width} × {data.readonly.height} ·{" "}
                            {data.readonly.framerate}fps (스트림 상한 {data.readonly.stream_maxrate})
                        </p>
                        <p className="text-xs text-gray-500">
                            fps 는 안드로이드·React 와 함께 맞춰야 해서 여기서 바꿀 수 없습니다.
                        </p>
                    </section>
                </>
            )}
        </>
    );
}

export default function MotionConfig() {
    const { IP, IGAZY_IP, setIgazyIp } = useVariableStore();
    const [draftIp, setDraftIp] = useState(IGAZY_IP || "");
    const manuallyEdited = useRef(false);
    // 안드로이드에서 보드 주소를 다시 받아 오기 전에는 예전에 저장된 주소로 설정 화면을 열지 않는다(다른 보드에 적용 방지)
    const [lookedUpFor, setLookedUpFor] = useState(null);
    const lookupDone = !IP || lookedUpFor === IP;
    useEffect(() => {
        if (!IP) return;
        const controller = new AbortController();
        axios
            .get(`http://${IP}:8080/api/igazy_address`, { signal: controller.signal, timeout: 10000 })
            .then(({ data }) => {
                if (data.status !== "success" || !validIp(data.ip || "")) throw new Error("IGazy IP 주소 조회 실패");
                if (!manuallyEdited.current) {
                    setDraftIp(data.ip);
                    setIgazyIp(data.ip);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    toast.error(`${errorMessage(error)} 보드 IP를 직접 입력할 수 있습니다.`);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLookedUpFor(IP);
            });
        return () => controller.abort();
    }, [IP, setIgazyIp]);
    return (
        <Layout>
            <div className="max-w-6xl mx-auto space-y-4">
                <h1 className="text-xl font-semibold">모션 설정</h1>
                <form
                    className={`${cardClass} flex flex-wrap items-end gap-3`}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const next = draftIp.trim();
                        if (!validIp(next)) {
                            toast.error("올바른 보드 IPv4 주소를 입력해 주세요.");
                            return;
                        }
                        setIgazyIp(next);
                        setLookedUpFor(IP);
                    }}
                >
                    <label className="flex-1 min-w-48 space-y-2">
                        보드 IP
                        <input
                            className={inputClass}
                            value={draftIp}
                            placeholder="172.31.98.77"
                            onChange={(event) => {
                                manuallyEdited.current = true;
                                setDraftIp(event.target.value);
                            }}
                        />
                    </label>
                    <RippleButton type="submit" className={buttonClass}>
                        IP 저장·연결
                    </RippleButton>
                    <p className="w-full text-sm text-gray-500">
                        연결 주소: {IGAZY_IP || "미설정"} · 상태는 30초마다 자동으로 다시 확인합니다.
                    </p>
                </form>
                {!lookupDone ? (
                    <p className="text-gray-500">안드로이드에서 보드 주소를 확인하는 중…</p>
                ) : validIp(IGAZY_IP || "") ? (
                    <BoardSettings key={IGAZY_IP} ip={IGAZY_IP} />
                ) : (
                    <p>보드 IP를 입력하고 연결해 주세요.</p>
                )}
            </div>
        </Layout>
    );
}
