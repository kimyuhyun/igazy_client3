// FloatingPanel.jsx
// 화면 위에 떠 있는 패널. 핸들(보통 헤더)을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿀 수 있다.
// 위치·크기 저장은 부모가 맡는다 (onPosChange / onSizeChange).
import React, { useRef, useLayoutEffect, useCallback } from "react";

const MARGIN = 8; // 화면 가장자리에서 최소 여백(px)

// 패널이 화면 밖으로 나가지 않게 위치를 자른다
function clampToViewport(pos, el) {
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    return {
        x: Math.round(Math.min(Math.max(pos.x, MARGIN), Math.max(MARGIN, window.innerWidth - w - MARGIN))),
        y: Math.round(Math.min(Math.max(pos.y, MARGIN), Math.max(MARGIN, window.innerHeight - h - MARGIN))),
    };
}

// 크기를 최소 크기와 화면 안쪽으로 자른다 (왼쪽 위 모서리는 고정이므로 오른쪽·아래 여유만 본다)
function clampSize(size, left, top, minSize) {
    return {
        w: Math.round(Math.max(minSize.w, Math.min(size.w, window.innerWidth - left - MARGIN))),
        h: Math.round(Math.max(minSize.h, Math.min(size.h, window.innerHeight - top - MARGIN))),
    };
}

/**
 * @param {{x:number,y:number}|null} props.pos 저장된 위치(화면 왼쪽 위 기준 px). null 이면 오른쪽 아래 기본 위치
 * @param {(pos:{x:number,y:number}) => void} props.onPosChange 드래그가 끝났을 때 새 위치
 * @param {{w:number,h:number}|null} [props.size] 패널 크기. null 이면 내용 크기대로 두고 리사이즈 핸들도 숨긴다
 * @param {(size:{w:number,h:number}) => void} [props.onSizeChange] 리사이즈가 끝났을 때 새 크기
 * @param {{w:number,h:number}} [props.minSize] 최소 크기
 * @param {boolean} [props.resizable] false 면 크기는 유지하되 리사이즈 핸들을 숨긴다 (최소화 상태 등)
 * @param {React.ReactNode} props.children 내용. 끌 부분에는 FloatingPanel.handleProps 를 펼쳐 둔다
 */
// 저장소에서 온 위치·크기가 깨져 있으면(NaN, 누락) 기본값으로 취급한다
const validPos = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null);
const validSize = (s) => (s && Number.isFinite(s.w) && Number.isFinite(s.h) && s.w > 0 && s.h > 0 ? s : null);

export default function FloatingPanel({
    pos: posProp,
    onPosChange,
    size: sizeProp = null,
    onSizeChange,
    minSize = { w: 160, h: 120 },
    resizable = true,
    className = "",
    children,
}) {
    const pos = validPos(posProp);
    const size = validSize(sizeProp);
    const elRef = useRef(null);
    const dragRef = useRef(null); // 이동 중이면 { dx, dy } = 포인터와 패널 왼쪽 위 모서리 사이 거리
    const resizeRef = useRef(null); // 크기 조절 중이면 { x0, y0, w0, h0, left, top, hadPos }

    // 창(뷰포트)이 저장된 위치·크기보다 작으면 화면 안으로 당겨서 "보여주기만" 한다.
    // 저장값은 건드리지 않는다 — 태블릿 회전이나 브라우저 줌으로 잠깐 작아졌다가 돌아오면 원래 자리로 복귀해야 하므로.
    // (저장은 사용자가 직접 끌거나 크기를 바꿔 놓았을 때만 한다)
    useLayoutEffect(() => {
        const el = elRef.current;
        if (!el) return;
        const apply = () => {
            if (size) {
                // 오른쪽 아래 고정(pos 없음)일 때는 왼쪽 위 여백 기준으로 최대 크기를 잡는다
                const r = el.getBoundingClientRect();
                const c = clampSize(size, pos ? r.left : MARGIN, pos ? r.top : MARGIN, minSize);
                el.style.width = `${c.w}px`;
                el.style.height = `${c.h}px`;
            }
            if (pos) {
                const c = clampToViewport(pos, el);
                el.style.left = `${c.x}px`;
                el.style.top = `${c.y}px`;
            }
        };
        apply();
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, [pos, size, minSize]);

    const posFromEvent = useCallback(
        (e) => clampToViewport({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }, elRef.current),
        [],
    );
    const sizeFromEvent = useCallback(
        (e) => {
            const r = resizeRef.current;
            return clampSize({ w: r.w0 + (e.clientX - r.x0), h: r.h0 + (e.clientY - r.y0) }, r.left, r.top, minSize);
        },
        [minSize],
    );

    const onPointerDown = useCallback(
        (e) => {
            if (e.button !== 0) return;
            const el = elRef.current;
            const rect = el.getBoundingClientRect();

            if (size && resizable && e.target.closest("[data-resize-handle]")) {
                // 크기 조절. 기본(오른쪽 아래 고정) 위치였다면 왼쪽 위 기준으로 바꿔 놓아야 오른쪽 아래 모서리가 따라온다
                resizeRef.current = {
                    x0: e.clientX,
                    y0: e.clientY,
                    w0: rect.width,
                    h0: rect.height,
                    left: rect.left,
                    top: rect.top,
                    hadPos: !!pos,
                };
                el.style.left = `${rect.left}px`;
                el.style.top = `${rect.top}px`;
                el.style.right = "auto";
                el.style.bottom = "auto";
            } else if (e.target.closest("[data-drag-handle]") && !e.target.closest("button")) {
                // 이동. 핸들 표식이 있는 곳에서 시작한 드래그만 받고, 헤더 안의 버튼은 그대로 눌리게 둔다
                dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
            } else {
                return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
        },
        [pos, size, resizable],
    );

    // 끄는 동안에는 state 를 거치지 않고 스타일만 바꾼다 (안의 3D 뷰가 매번 리렌더되지 않게)
    const onPointerMove = useCallback(
        (e) => {
            const el = elRef.current;
            if (resizeRef.current) {
                const s = sizeFromEvent(e);
                el.style.width = `${s.w}px`;
                el.style.height = `${s.h}px`;
            } else if (dragRef.current) {
                const p = posFromEvent(e);
                el.style.left = `${p.x}px`;
                el.style.top = `${p.y}px`;
                el.style.right = "auto";
                el.style.bottom = "auto";
            }
        },
        [posFromEvent, sizeFromEvent],
    );

    const onPointerUp = useCallback(
        (e) => {
            if (resizeRef.current) {
                const r = resizeRef.current;
                const s = sizeFromEvent(e);
                resizeRef.current = null;
                e.currentTarget.releasePointerCapture(e.pointerId);
                if (!r.hadPos) onPosChange({ x: Math.round(r.left), y: Math.round(r.top) });
                onSizeChange?.(s);
            } else if (dragRef.current) {
                const p = posFromEvent(e);
                dragRef.current = null;
                e.currentTarget.releasePointerCapture(e.pointerId);
                onPosChange(p);
            }
        },
        [onPosChange, onSizeChange, posFromEvent, sizeFromEvent],
    );

    const style = {
        ...(pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 16 }),
        ...(size ? { width: size.w, height: size.h } : {}),
    };

    return (
        <div
            ref={elRef}
            className={`fixed ${className}`}
            style={style}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            {children}

            {/* 오른쪽 아래 리사이즈 핸들 */}
            {size && resizable && (
                <div
                    data-resize-handle=""
                    role="button"
                    aria-label="크기 조절"
                    className="absolute right-0 bottom-0 w-4 h-4 z-10 flex items-end justify-end p-0.5"
                    style={{ cursor: "nwse-resize", touchAction: "none" }}
                    title="크기 조절"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-gray-400">
                        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </div>
            )}
        </div>
    );
}

// 끌 수 있는 부분(보통 헤더)에 펼쳐 주는 props. 패널은 이 표식이 있는 요소에서 시작된 드래그만 받는다.
// (별도 export 로 두면 react-refresh 린트에 걸려 컴포넌트의 정적 속성으로 둔다)
FloatingPanel.handleProps = { "data-drag-handle": "", style: { cursor: "move", touchAction: "none" } };
// 부모가 저장값을 미리 검증해 기본값으로 대체할 때 쓴다 (여기서 null 로 바뀌면 크기 없는 박스가 되므로 부모가 먼저 거르는 편이 안전)
FloatingPanel.validSize = validSize;
FloatingPanel.validPos = validPos;
