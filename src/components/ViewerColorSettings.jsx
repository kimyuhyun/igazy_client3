import React from "react";
import Popup from "./Popup";
import useVariableStore from "../stores/useVariableStore";
import { COLOR_ROLES, DEFAULT_COLORS, isHex, normalizeColors } from "../utils/colors";

const inputClass =
    "h-8 max-[640px]:h-11 w-28 min-w-0 rounded border border-neutral-300 bg-white px-2 text-[14px] tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700";

/** /viewer 의 [설정] — 색상만. 설정 페이지 "색상" 카드와 같은 값(COLORS)을 고치고 바로 저장된다 */
export default function ViewerColorSettings({ onClose }) {
    const COLORS = useVariableStore((s) => s.COLORS);
    const setColors = useVariableStore((s) => s.setColors);
    const colors = normalizeColors(COLORS);
    // 입력 중인 hex 는 유효할 때만 반영한다
    const setColor = (key, value) => {
        if (isHex(value)) setColors({ ...colors, [key]: value.trim().toLowerCase() });
    };

    return (
        <Popup width="md" height="auto" title="색상 설정" onClose={onClose}>
            <div className="grid grid-cols-[100px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-[13px]">
                {COLOR_ROLES.map((role) => (
                    <React.Fragment key={role.key}>
                        <label htmlFor={`viewer-color-${role.key}`} className="text-neutral-600" title={role.desc}>
                            {role.label}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                id={`viewer-color-${role.key}`}
                                type="color"
                                value={colors[role.key]}
                                onChange={(e) => setColor(role.key, e.target.value)}
                                className="h-8 w-8 max-[640px]:h-11 max-[640px]:w-11 shrink-0 cursor-pointer rounded border border-neutral-300"
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
                                className={inputClass}
                                aria-label={`${role.label} 색상 코드`}
                                placeholder="#rrggbb"
                            />
                        </div>
                    </React.Fragment>
                ))}
                <div className="col-start-2 flex pt-1">
                    <button
                        type="button"
                        className="min-h-8 max-[640px]:min-h-11 rounded border border-neutral-300 bg-white px-3 font-medium hover:bg-neutral-50"
                        onClick={() => setColors({ ...DEFAULT_COLORS })}
                    >
                        기본 색으로
                    </button>
                </div>
            </div>
        </Popup>
    );
}
