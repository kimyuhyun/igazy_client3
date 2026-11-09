import { useDialog } from "../utils/dialog";
import { useState } from "react";
import Popup from "./Popup";
import RippleButton from "./RippleButton";
import LimbusLineMeasure from "./LimbusLineMeasure";
import toast from "react-hot-toast";
import axios from "axios";
import useLoadingStore from "../stores/useLoadingStore";
import { deleteZipFromDB, updateZipMetaInDB, isZipInDB, LOCAL_PREFIX } from "../utils/indexedDB";
import { validatePatientNum, validatePatientName } from "../utils/patientNameRules";
import { EMPTY_EYE, eyeMetaToJson, posNum } from "../utils/eyeMeta";

const EYE_TAB_FIELDS = ["limbusPx", "limbusMm", "al", "acd"];

/**
 * 환자 정보·눈별 생체값 수정 (연구실 흐름, 2026-10-23)
 *
 * 현장에서는 윤부를 재지 않고 저장만 하므로, 여기서 눈별로 넣는다.
 *   - 윤부 px: 팝업에 열린 파일이면(frames 전달) 현재 프레임에서 OD/OS 각각 선을 맞춰 잰다. 카메라가 두 대라 배율이 다르다.
 *   - 윤부 mm(WTW)·AL·ACD: ARGOS 검사지의 OD/OS 값.
 * 서버(/api/zip/update-patient)에는 눈별 키와 호환용 단일 키(OD 값)를 함께 보낸다.
 *
 * @param frames {index, od: base64|null, os: base64|null, coordWidth} — 팝업에 열린 같은 파일일 때. 없으면 서버 /api/zip/frame 으로
 *   프레임 한 장을 받아 잰다 (ZIP 전체를 내려받지 않음, 2026-10-28). 잰 px 는 좌표 기준(frame_width, 보통 1280)으로 환산해 저장한다 —
 *   이미지는 640×360 이라 그대로 넣으면 절반이 된다.
 */
export default function PatientInfoEditModal({
    editingFile,
    cachedFiles,
    apiUrl,
    frames = null,
    // 기기 목록에 없는 결과(직접 넣은 ZIP, 뷰어 2026-11-09). 원본이 브라우저 저장분이라 기기를 부르지 않고 그 저장분만 고친다
    localOnly = false,
    onClose,
    onUpdated,
    onResult,
}) {
    const dialog = useDialog();
    const { setLoading } = useLoadingStore();
    const [editPatientNum, setEditPatientNum] = useState(editingFile.num || "");
    const [editPatientName, setEditPatientName] = useState(editingFile.name1 || "");
    const [eyes, setEyes] = useState({
        od: { ...EMPTY_EYE, ...(editingFile.eyes?.od || {}) },
        os: { ...EMPTY_EYE, ...(editingFile.eyes?.os || {}) },
    });
    // 프레임에서 윤부를 재는 중인 눈 ("od" | "os" | null)
    const [measuringEye, setMeasuringEye] = useState(null);
    // 서버에서 받아 온 프레임 { od|os: { index, total, image, coordWidth } }. 영상이 열려 있지 않을 때 쓴다
    const [fetched, setFetched] = useState({});
    const [frameInput, setFrameInput] = useState(""); // 비우면 가운데 프레임
    const [fetching, setFetching] = useState(null);

    const fetchFrame = async (eye) => {
        if (localOnly) {
            // 프레임은 기기에서 한 장씩 받아 오는 기능이다. 직접 넣은 결과는 영상을 열어 둔 상태에서 그 프레임으로 잰다
            dialog.alert({
                title: "영상을 먼저 여세요",
                message:
                    "직접 넣은 결과는 영상을 연 뒤, 재생 창의 '환자정보·윤부 수정'에서 지금 보이는 프레임으로 윤부를 잽니다.",
            });
            return;
        }
        setFetching(eye);
        try {
            const params = { zipPath: editingFile.filePath, eye };
            const n = parseInt(frameInput, 10);
            if (Number.isInteger(n) && n >= 0) params.index = n;
            const { data } = await axios.get(`${apiUrl}/api/zip/frame`, { params, timeout: 30000 });
            if (data?.error || !data?.frameBase64) throw new Error(data?.error || "프레임을 받지 못했습니다");
            setFetched((prev) => ({
                ...prev,
                [eye]: {
                    index: data.index,
                    total: data.total,
                    image: data.frameBase64,
                    coordWidth: data.frameWidth || 1280,
                },
            }));
            setMeasuringEye(eye);
        } catch (e) {
            setFetching(null);
            dialog.alert({
                title: "프레임 조회 실패",
                message: `${eye.toUpperCase()} 프레임을 가져오지 못했습니다: ${e.response?.data?.error || e.message}\n연결과 파일을 확인하고 다시 시도하세요.`,
            });
        } finally {
            setFetching(null);
        }
    };
    // 지금 측정에 쓸 영상: 열린 영상의 프레임이 있으면 그것, 아니면 서버에서 받은 것
    const shot = (eye) =>
        frames?.[eye]
            ? { image: frames[eye], index: frames.index, coordWidth: frames.coordWidth || 1280 }
            : fetched[eye] || null;

    // 파일명 규칙에 어긋나는 번호·이름은 입력창 아래에 바로 보여 주고 수정도 막는다 (patientNameRules.js)
    const patientNumError = validatePatientNum(editPatientNum);
    const patientNameError = validatePatientName(editPatientName);

    // Tab 은 칸의 행을 따라 OD → OS(좌안) → 다음 줄 OD 로 간다(2026-11-09). 양 끝(첫 칸 Shift+Tab, 끝 칸 Tab)은 브라우저 기본 순서
    const eyeTabProps = (eye, field) => {
        const index = EYE_TAB_FIELDS.indexOf(field) * 2 + (eye === "os" ? 1 : 0);
        return {
            "data-eye-tab": index,
            onKeyDown: (e) => {
                if (e.key !== "Tab") return;
                const next = document.querySelector(`[data-eye-tab="${index + (e.shiftKey ? -1 : 1)}"]`);
                if (!next) return;
                e.preventDefault();
                next.focus();
                next.select();
            },
        };
    };

    const setEyeField = (eye, field, value) =>
        setEyes((prev) => ({ ...prev, [eye]: { ...prev[eye], [field]: value } }));

    const handleUpdate = async () => {
        if (!editPatientNum.trim() || !editPatientName.trim()) {
            toast.error("환자번호와 이름을 모두 입력해주세요");
            return;
        }
        if (patientNumError || patientNameError) {
            toast.error(patientNumError || patientNameError);
            return;
        }
        // 숫자 칸은 비었거나 유한한 양수여야 한다 (Infinity, 0, 음수, "12abc" 모두 거부)
        for (const eye of ["od", "os"]) {
            for (const f of ["limbusMm", "limbusPx", "al", "acd"]) {
                const v = String(eyes[eye][f] ?? "").trim();
                if (v !== "" && (!/^\d+(\.\d+)?$/.test(v) || posNum(v) === null)) {
                    toast.error(`${eye.toUpperCase()} ${f} 값이 올바른 양수가 아닙니다: ${v}`);
                    return;
                }
            }
        }

        const trimmed = {
            od: Object.fromEntries(Object.entries(eyes.od).map(([k, v]) => [k, String(v ?? "").trim()])),
            os: Object.fromEntries(Object.entries(eyes.os).map(([k, v]) => [k, String(v ?? "").trim()])),
        };
        const json = eyeMetaToJson(trimmed);
        const enc = (v) => encodeURIComponent(v);

        const failures = [];
        let saved = false;
        try {
            setLoading(true);

            // 직접 넣은 결과: 브라우저 저장분의 메타만 고친다. 번호·이름이 바뀌면 파일명 규칙({번호}_{이름}_{날짜}.zip)대로 이름도 바꾼다.
            // 맥에 있는 원본 ZIP 파일은 바뀌지 않는다.
            const data = localOnly
                ? await (async () => {
                      const m = editingFile.fileName.match(/_(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.zip$/i);
                      const newFileName = m
                          ? `${editPatientNum.trim()}_${editPatientName.trim()}_${m[1]}.zip`
                          : editingFile.fileName;
                      const newFilePath =
                          newFileName === editingFile.fileName ? editingFile.filePath : `${LOCAL_PREFIX}${newFileName}`;
                      // 바꾼 이름의 결과가 이미 있으면 덮어쓰지 않는다 — 그 결과와 영상이 통째로 바뀐다 (Codex VIEWER R1/T15)
                      if (newFilePath !== editingFile.filePath && (await isZipInDB(newFilePath)))
                          return {
                              status: "error",
                              error: "같은 번호·이름·측정 시각의 결과가 이미 브라우저에 있습니다. 번호나 이름을 다르게 입력해 주세요.",
                          };
                      const dup = {
                          status: "error",
                          error: "같은 번호·이름·측정 시각의 결과가 이미 브라우저에 있습니다. 번호나 이름을 다르게 입력해 주세요.",
                      };
                      let ok;
                      try {
                          ok = await updateZipMetaInDB(
                              editingFile.filePath,
                              newFilePath,
                              newFileName,
                              { patient_num: editPatientNum.trim(), patient_name: editPatientName.trim(), ...json },
                              { noOverwrite: true },
                          );
                      } catch (error) {
                          if (error?.code === "DEST_EXISTS") return dup;
                          throw error;
                      }
                      return ok
                          ? { status: "success", newFilePath, newFileName, local: true }
                          : {
                                status: "error",
                                error: "브라우저에 저장된 결과를 찾지 못했습니다. 방금 넣은 결과라면 저장이 끝난 뒤 다시 시도하고, 아니면 ZIP 파일을 다시 넣어 주세요.",
                            };
                  })()
                : (
                      await axios({
                          url: `${apiUrl}/api/zip/update-patient`,
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          data: {
                              zipPath: enc(editingFile.filePath),
                              patientNum: enc(editPatientNum.trim()),
                              patientName: enc(editPatientName.trim()),
                              // 호환용 단일 키 = OD 값. 빈 문자열도 보낸다 — 값을 지운 것을 서버가 구분할 수 있어야 한다
                              limbusMM: enc(json.limbus_mm),
                              limbusPX: enc(json.limbus_px),
                              axialLength: enc(json.axial_length),
                              acd: enc(json.acd),
                              // 눈별 키
                              limbusMmOd: enc(json.limbus_mm_od),
                              limbusMmOs: enc(json.limbus_mm_os),
                              limbusPxOd: enc(json.limbus_px_od),
                              limbusPxOs: enc(json.limbus_px_os),
                              alOd: enc(json.al_od),
                              alOs: enc(json.al_os),
                              acdOd: enc(json.acd_od),
                              acdOs: enc(json.acd_os),
                          },
                      })
                  ).data;

            if (data.status === "success") {
                saved = true;

                // 이미지는 안 바뀌었으니 캐시를 버리지 않고 메타만 갈아끼운다.
                if (!data.local && cachedFiles.has(editingFile.filePath)) {
                    const newFilePath = data.newFilePath || editingFile.filePath;
                    try {
                        await updateZipMetaInDB(editingFile.filePath, newFilePath, data.newFileName, {
                            patient_num: editPatientNum.trim(),
                            patient_name: editPatientName.trim(),
                            ...json,
                        });
                    } catch (error) {
                        // 캐시 갱신이 실패하면 낡은 값이 남는 게 더 위험하니 버린다
                        console.error("Failed to patch cache:", error);
                        try {
                            await deleteZipFromDB(editingFile.filePath);
                            failures.push("캐시를 갱신하지 못해 삭제했습니다. 다시 불러와주세요.");
                        } catch (cacheError) {
                            console.error("캐시 삭제 실패:", cacheError);
                            failures.push("캐시가 갱신되지 않았습니다. 캐시를 삭제한 뒤 다시 불러와주세요.");
                        }
                    }
                }

                // 서버 수정은 이미 끝났다. 뒤따르는 목록·캐시 갱신이 실패해도 모달을 옛 경로로 남겨 재시도하게 두면 안 된다
                // (이름이 바뀌었으면 옛 파일은 이미 없다). 실패는 알리기만 하고 닫는다 (Codex review-Q Q8).
                try {
                    await onUpdated({
                        eyes: trimmed,
                        newFilePath: data.newFilePath || editingFile.filePath,
                        newFileName: data.newFileName || editingFile.fileName,
                        patientNum: editPatientNum.trim(),
                        patientName: editPatientName.trim(),
                    });
                } catch (error) {
                    console.error("수정 후 화면 갱신 실패:", error);
                    failures.push("화면 갱신에 실패했습니다. 목록을 새로고침해 주세요.");
                }
            } else {
                failures.push(data.error || "환자 정보 수정에 실패했습니다");
            }
        } catch (error) {
            console.error("Failed to update patient info:", error);
            failures.push(
                localOnly
                    ? "브라우저 저장분을 고치지 못했습니다. 다시 시도해 주세요."
                    : "환자 정보 수정에 실패했습니다. 연결을 확인하고 다시 저장하세요.",
            );
        } finally {
            setLoading(false);
            if (saved) {
                onClose();
                if (failures.length) onResult?.({ title: "서버 저장 완료 / 갱신 실패", message: failures.join("\n") });
                else toast.success("환자 정보가 수정되었습니다", { id: "success" });
            } else if (failures.length) dialog.alert({ title: "환자 정보 저장 실패", message: failures.join("\n") });
        }
    };

    const inputCls =
        "px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white dark:border-gray-600";

    const eyeColumn = (eye, label) => {
        const frame = frames?.[eye] || null;
        return (
            <div className="flex flex-col gap-2 rounded border border-gray-200 dark:border-stone-700 p-3">
                <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-800 dark:text-gray-100">{label}</span>
                    {frame ? (
                        <button
                            type="button"
                            onClick={() => setMeasuringEye(eye)}
                            className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                            title={`현재 프레임(${frames.index})의 ${label} 영상에서 윤부 양끝을 맞춰 px 를 잰다`}
                        >
                            프레임 {frames.index}에서 윤부 측정
                        </button>
                    ) : (
                        <div className="flex items-center gap-1">
                            <input
                                type="number"
                                min="0"
                                value={frameInput}
                                onChange={(e) => setFrameInput(e.target.value)}
                                placeholder="프레임(비우면 가운데)"
                                className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
                                title="잴 프레임 번호. 비우면 가운데 프레임"
                            />
                            <button
                                type="button"
                                disabled={fetching === eye}
                                onClick={() => fetchFrame(eye)}
                                className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-gray-300"
                                title={`서버에서 ${label} 프레임 한 장을 받아 윤부 양끝을 맞춰 px 를 잰다`}
                            >
                                {fetching === eye ? "받는 중…" : "프레임에서 윤부 측정"}
                            </button>
                        </div>
                    )}
                </div>
                <label className="text-xs text-gray-600 dark:text-gray-300">윤부 지름 px (카메라 프레임)</label>
                <input
                    type="number"
                    step="0.1"
                    {...eyeTabProps(eye, "limbusPx")}
                    value={eyes[eye].limbusPx}
                    onChange={(e) => setEyeField(eye, "limbusPx", e.target.value)}
                    className={inputCls}
                    placeholder="예: 638.0"
                />
                <label className="text-xs text-gray-600 dark:text-gray-300">윤부 지름 mm (ARGOS CD / WTW)</label>
                <input
                    type="number"
                    step="0.01"
                    {...eyeTabProps(eye, "limbusMm")}
                    value={eyes[eye].limbusMm}
                    onChange={(e) => setEyeField(eye, "limbusMm", e.target.value)}
                    className={inputCls}
                    placeholder="예: 13.83"
                />
                <label className="text-xs text-gray-600 dark:text-gray-300">안축장 AL mm</label>
                <input
                    type="number"
                    step="0.01"
                    {...eyeTabProps(eye, "al")}
                    value={eyes[eye].al}
                    onChange={(e) => setEyeField(eye, "al", e.target.value)}
                    className={inputCls}
                    placeholder="예: 24.80 (비우면 표준값)"
                />
                <label className="text-xs text-gray-600 dark:text-gray-300">전방깊이 ACD mm</label>
                <input
                    type="number"
                    step="0.01"
                    {...eyeTabProps(eye, "acd")}
                    value={eyes[eye].acd}
                    onChange={(e) => setEyeField(eye, "acd", e.target.value)}
                    className={inputCls}
                    placeholder="예: 3.74 (비우면 표준값)"
                />
            </div>
        );
    };

    return (
        <>
            <Popup width="3xl" height="auto" onClose={onClose}>
                <div className="flex flex-col">
                    <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">파일명</label>
                    <input
                        type="text"
                        value={editingFile.fileName}
                        disabled
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="flex flex-col">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                            환자번호 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={editPatientNum}
                            onChange={(e) => setEditPatientNum(e.target.value)}
                            className={inputCls}
                            placeholder="환자번호를 입력하세요"
                        />
                        {patientNumError && <p className="mt-1 text-sm text-red-500">{patientNumError}</p>}
                    </div>
                    <div className="flex flex-col">
                        <label className="mb-1 font-semibold text-gray-700 dark:text-gray-200">
                            환자명 <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={editPatientName}
                            onChange={(e) => setEditPatientName(e.target.value)}
                            className={inputCls}
                            placeholder="환자명을 입력하세요"
                        />
                        {patientNameError && <p className="mt-1 text-sm text-red-500">{patientNameError}</p>}
                    </div>
                </div>

                {/* 눈별 생체값. 윤부 px 는 각 눈 카메라 프레임에서, mm·AL·ACD 는 ARGOS 검사지에서. */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                    {eyeColumn("od", "OD (우안)")}
                    {eyeColumn("os", "OS (좌안)")}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                    윤부 px 와 mm 가 양안 모두 있어야 결과보기가 열립니다. AL·ACD 는 비우면 표준 눈(24.0 / 3.6)으로
                    계산됩니다.
                </p>

                <RippleButton
                    className="bg-blue-600 hover:bg-blue-400 text-white w-full py-2 mt-6"
                    onClick={handleUpdate}
                >
                    수정
                </RippleButton>
            </Popup>

            {/* 프레임에서 윤부 px 측정. 캔버스는 원본 1:1 이라 폭을 내용에 맞춘다. 확인하면 해당 눈의 px 칸에 들어간다. */}
            {measuringEye && shot(measuringEye) && (
                <Popup
                    width="fit"
                    height="auto"
                    title={`${measuringEye.toUpperCase()} 윤부 측정 · 프레임 ${shot(measuringEye).index}`}
                    noPadding
                    onClose={() => setMeasuringEye(null)}
                >
                    <LimbusLineMeasure
                        imageSource={`data:image/jpeg;base64,${shot(measuringEye).image}`}
                        pupilCenter={null}
                        // 저장된 limbusPx 와 결과 px 는 좌표 기준(frame_width) — 이미지(640)와 다르면 LimbusLineMeasure 가 환산한다
                        coordWidth={shot(measuringEye).coordWidth}
                        initialDiameter={
                            parseFloat(eyes[measuringEye].limbusPx) > 10
                                ? parseFloat(eyes[measuringEye].limbusPx)
                                : null
                        }
                        onComplete={(px) => {
                            setEyeField(measuringEye, "limbusPx", px.toFixed(1));
                            setMeasuringEye(null);
                            toast.success(`${measuringEye.toUpperCase()} 윤부 ${px.toFixed(1)}px (좌표 기준)`);
                        }}
                    />
                </Popup>
            )}
        </>
    );
}
