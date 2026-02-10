import useManualPointStore from "../stores/useManualPointStore";
import { LEFT, RIGHT, X_AXIS, Y_AXIS } from "../utils/constants";

export default function ManualPointButtons({ currentFrameRef, processedDataRef }) {
    const { src4th, dst4th, src5th, dst5th, setPoint } = useManualPointStore();

    const handleSetPoint = (type) => {
        const frame = currentFrameRef.current;
        const pd = processedDataRef.current;
        if (!pd) return;
        setPoint(type, {
            frame,
            odX: pd[RIGHT][X_AXIS][frame],
            odY: pd[RIGHT][Y_AXIS][frame],
            osX: pd[LEFT][X_AXIS][frame],
            osY: pd[LEFT][Y_AXIS][frame],
        });
    };

    const Val = ({ point, eye }) => {
        if (!point) return null;
        const x = eye === "od" ? point.odX : point.osX;
        const y = eye === "od" ? point.odY : point.osY;
        return <span>({x?.toFixed(1)}, {y?.toFixed(1)})</span>;
    };

    return (
        <>
            {/* 4th (OD Manual) 영역 */}
            <div className="absolute bottom-1 right-1/2 mr-2">
                <div className="flex">
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-l text-xs ${
                            src4th ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                        onClick={() => handleSetPoint("src4th")}
                    >
                        {src4th ? `Src (F:${src4th.frame})` : "Src"}
                    </button>
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-r text-xs ${
                            dst4th ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                        onClick={() => handleSetPoint("dst4th")}
                    >
                        {dst4th ? `Dst (F:${dst4th.frame})` : "Dst"}
                    </button>
                </div>
                {(src4th || dst4th) && (
                    <div className="text-[10px] text-white bg-black/50 rounded px-1 mt-0.5 flex gap-2">
                        {src4th && <span>Src: <Val point={src4th} eye="od" /></span>}
                        {dst4th && <span>Dst: <Val point={dst4th} eye="od" /></span>}
                    </div>
                )}
            </div>
            {/* 5th (OS Manual) 영역 */}
            <div className="absolute bottom-1 right-0 mr-1">
                <div className="flex">
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-l text-xs ${
                            src5th ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                        onClick={() => handleSetPoint("src5th")}
                    >
                        {src5th ? `Src (F:${src5th.frame})` : "Src"}
                    </button>
                    <button
                        type="button"
                        className={`px-2 py-1 rounded-r text-xs ${
                            dst5th ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                        onClick={() => handleSetPoint("dst5th")}
                    >
                        {dst5th ? `Dst (F:${dst5th.frame})` : "Dst"}
                    </button>
                </div>
                {(src5th || dst5th) && (
                    <div className="text-[10px] text-white bg-black/50 rounded px-1 mt-0.5 flex gap-2">
                        {src5th && <span>Src: <Val point={src5th} eye="os" /></span>}
                        {dst5th && <span>Dst: <Val point={dst5th} eye="os" /></span>}
                    </div>
                )}
            </div>
        </>
    );
}
