import toast from "react-hot-toast";
import useManualPointStore from "../stores/useManualPointStore";
import useVariableStore from "../stores/useVariableStore";
import { normalizeColors, textOn } from "../utils/colors";

/**
 * 수동 포인트(4차 = OD, 5차 = OS). 리포트는 Src − Dst 를 Δx 로 쓴다.
 * 값은 그 프레임의 **원본 검출값**(x·y, 기준점 대비 px)에 그래프와 같은 배율·부호(−x·scale)를 적용한 mm 다.
 * 분석용 데이터(median 필터)를 쓰지 않는 이유: 검출 없는 프레임은 직전값 유지 규칙의 초기값 0 으로 채워져 있어 첫 유효 검출
 * 근처에서는 필터 창에 그 0 이 섞여 엉뚱한 값이 포인트가 된다 (Codex MANUAL M1). 원본 x·y 가 둘 다 있는 프레임만 받는다.
 * 그 시험의 눈(4차 OD, 5차 OS)은 필수. 반대쪽 눈은 검출이 없으면 null 로 두어 리포트에서 빈칸이 되게 한다.
 * 포인트에는 파일·프레임을 함께 적어 리포트가 다른 영상의 포인트와 섞이지 않게 한다.
 */
const Val = ({ point, eye }) => {
    if (!point) return null;
    const x = eye === "od" ? point.odX : point.osX;
    const y = eye === "od" ? point.odY : point.osY;
    if (x == null || y == null) return <span>(검출 없음)</span>;
    return (
        <span>
            ({x.toFixed(1)}, {y.toFixed(1)})
        </span>
    );
};

// 원본 검출값 → mm. x·y 중 하나라도 없으면 null (useProcessedEyeData 와 같은 부호·배율)
const toMm = (raw, scale) => {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || !Number.isFinite(scale)) return null;
    return { x: -raw.x * scale, y: -raw.y * scale };
};

export default function ManualPointButtons({
    currentFrameRef,
    processedDataRef,
    odResults,
    osResults,
    fileKey = null,
}) {
    // Src/Dst 버튼 색은 설정(COLORS)에서 (2026-11-02). 눈(4차/5차)에 관계없이 Src 는 src 색, Dst 는 dst 색
    const colors = normalizeColors(useVariableStore((s) => s.COLORS));
    const onStyle = (key) => ({ backgroundColor: colors[key], color: textOn(colors[key]) });
    const { src4th, dst4th, src5th, dst5th, setPoint } = useManualPointStore();

    const handleSetPoint = (type) => {
        const frame = currentFrameRef.current;
        const scale = processedDataRef.current?.scale;
        if (!scale) return;
        const od = toMm(odResults?.[frame], scale.od);
        const os = toMm(osResults?.[frame], scale.os);
        const needOd = type.endsWith("4th");
        if (needOd ? !od : !os) {
            toast.error(`프레임 ${frame}에 ${needOd ? "OD" : "OS"} 동공 검출이 없습니다. 다른 프레임을 고르세요.`);
            return;
        }
        setPoint(type, {
            frame,
            file: fileKey,
            odX: od?.x ?? null,
            odY: od?.y ?? null,
            osX: os?.x ?? null,
            osY: os?.y ?? null,
        });
    };

    return (
        <>
            {/* 4th (OD Manual) 영역 */}
            <div className="absolute bottom-1 right-1/2 mr-2">
                <div className="flex">
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-l text-xs ${src4th ? "" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        style={src4th ? onStyle("src") : undefined}
                        onClick={() => handleSetPoint("src4th")}
                    >
                        {src4th ? `Src (F:${src4th.frame})` : "Src"}
                    </button>
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-r text-xs ${dst4th ? "" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        style={dst4th ? onStyle("dst") : undefined}
                        onClick={() => handleSetPoint("dst4th")}
                    >
                        {dst4th ? `Dst (F:${dst4th.frame})` : "Dst"}
                    </button>
                </div>
                {/* {(src4th || dst4th) && (
                    <div className="text-[10px] text-white bg-black/50 rounded px-1 mt-0.5 flex gap-2">
                        {src4th && (
                            <span>
                                Src: <Val point={src4th} eye="od" />
                            </span>
                        )}
                        {dst4th && (
                            <span>
                                Dst: <Val point={dst4th} eye="od" />
                            </span>
                        )}
                    </div>
                )} */}
            </div>
            {/* 5th (OS Manual) 영역 */}
            <div className="absolute bottom-1 right-0 mr-1">
                <div className="flex">
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-l text-xs ${src5th ? "" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        style={src5th ? onStyle("src") : undefined}
                        onClick={() => handleSetPoint("src5th")}
                    >
                        {src5th ? `Src (F:${src5th.frame})` : "Src"}
                    </button>
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-r text-xs ${dst5th ? "" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        style={dst5th ? onStyle("dst") : undefined}
                        onClick={() => handleSetPoint("dst5th")}
                    >
                        {dst5th ? `Dst (F:${dst5th.frame})` : "Dst"}
                    </button>
                </div>
                {/* {(src5th || dst5th) && (
                    <div className="text-[10px] text-white bg-black/50 rounded px-1 mt-0.5 flex gap-2">
                        {src5th && (
                            <span>
                                Src: <Val point={src5th} eye="os" />
                            </span>
                        )}
                        {dst5th && (
                            <span>
                                Dst: <Val point={dst5th} eye="os" />
                            </span>
                        )}
                    </div>
                )} */}
            </div>
        </>
    );
}
