import useDialogStore from "../stores/useDialogStore";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// 열려 있는 팝업 스택. Esc 는 가장 위(마지막에 연) 팝업만 닫는다 (Codex review-P P9).
// 같은 window 에 등록한 keydown 리스너는 "먼저 등록한 것부터" 불리므로 등록 순서로는 최상단을 가릴 수 없다.
const popupStack = [];

/**
 * @param width  max-w 키. "fit" 이면 내용 폭에 맞춘다(윤부 캔버스 1280px 처럼 크기가 정해진 내용용).
 * @param height "95" 같은 vh 숫자. "auto" 면 내용 높이에 맞추고 98vh 를 넘지 않는다.
 * @param title  헤더 왼쪽 제목(선택).
 * @param noPadding 본문 패딩 제거(선택). 현장에서 공간이 곧 시간인 화면용.
 */
export default function Popup({
    children,
    width = "6xl",
    height = "95",
    onClose,
    title = null,
    noPadding = false,
    appearance = null,
}) {
    const sheet = appearance === "sheet";
    const panelRef = useRef(null);
    const titleId = useId();
    const idRef = useRef(Symbol("popup"));
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const id = idRef.current;
        popupStack.push(id);
        const previousFocus = document.activeElement;
        if (sheet) panelRef.current?.querySelector("button")?.focus({ preventScroll: true });
        const focusable = () =>
            [
                ...(panelRef.current?.querySelectorAll(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
                ) ?? []),
            ].filter((element) => element.getClientRects().length && !element.closest("[inert]"));
        const onFocus = (event) => {
            if (!sheet || useDialogStore.getState().active || popupStack.at(-1) !== id) return;
            if (!panelRef.current?.contains(event.target)) {
                (focusable()[0] ?? panelRef.current)?.focus({ preventScroll: true });
            }
        };
        // capture 단계에서 받는다: 팝업 안 입력칸에서 누른 방향키가 뒤의 슬라이더(window 리스너)까지 가지 않게 막고,
        // Esc 는 최상단 팝업만 처리한다.
        const onKey = (e) => {
            if (useDialogStore.getState().active) return;
            if (popupStack[popupStack.length - 1] !== id) return;
            if (sheet && e.key === "Tab") {
                const elements = focusable();
                const first = elements[0] ?? panelRef.current;
                const last = elements.at(-1) ?? first;
                if (
                    !panelRef.current?.contains(document.activeElement) ||
                    (e.shiftKey ? document.activeElement === first : document.activeElement === last)
                ) {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.shiftKey ? last : first)?.focus();
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCloseRef.current?.();
            } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") {
                // 팝업이 떠 있는 동안 배경 플레이어 단축키는 무시
                e.stopPropagation();
            }
        };
        window.addEventListener("keydown", onKey, true);
        if (sheet) document.addEventListener("focusin", onFocus);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            document.removeEventListener("focusin", onFocus);
            const i = popupStack.indexOf(id);
            if (i >= 0) popupStack.splice(i, 1);
            if (sheet && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, [sheet]);

    const widthClassMap = {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        "3xl": "max-w-3xl",
        "4xl": "max-w-4xl",
        "5xl": "max-w-5xl",
        "6xl": "max-w-6xl",
        // 윤부 측정 캔버스가 원본 해상도(1280) 1:1이라 그만한 폭이 필요하다
        "7xl": "max-w-7xl",
        // 셔터 시퀀스 편집기: 한 줄 타임라인에 블록을 더 넣기 위해 (2026-11-02)
        "8xl": "max-w-[1600px]",
        full: "max-w-full",
    };

    // dvh 사용 (모바일 브라우저 UI 고려), vh fallback. "auto" 는 내용 높이.
    const heightNum = String(height).replace("%", "");
    const heightClass =
        height === "auto" || !/^\d+$/.test(heightNum) ? "max-h-[98vh]" : `h-[${heightNum}dvh] max-h-[${heightNum}vh]`;
    const widthClass = width === "fit" ? "w-fit max-w-full" : `w-full ${widthClassMap[width] || "max-w-xl"}`;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center ${sheet ? "text-black" : "dark:text-white backdrop-blur-sm"}`}
        >
            {/* 오버레이 배경 */}
            <div className="fixed inset-0 bg-black/50 transition-opacity" />
            {/* 팝업 내용 */}
            <div
                ref={panelRef}
                role={sheet ? "dialog" : undefined}
                aria-modal={sheet ? true : undefined}
                aria-labelledby={sheet && title ? titleId : undefined}
                aria-label={sheet && !title ? "팝업" : undefined}
                tabIndex={sheet ? -1 : undefined}
                className={`
                    relative ${widthClass}
                    ${width === "full" ? "h-dvh" : `m-4 ${sheet && height === "auto" ? "max-h-[82dvh]" : heightClass}`}
                    ${sheet ? "rounded bg-white border border-[#e6e6e6]" : `${width === "full" ? "" : "rounded-lg"} dark:bg-stone-800 bg-white shadow-xl`}
                    transform ${sheet ? "transition-[opacity,transform]" : "transition-all"} overflow-hidden flex flex-col
                `}
                style={
                    sheet ? { fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif' } : undefined
                }
            >
                {/* 헤더 */}
                <div
                    className={
                        sheet
                            ? "flex justify-between items-center pl-4 h-11 bg-white border-b border-[#e6e6e6] shrink-0"
                            : `flex ${title ? "justify-between" : "justify-end"} items-center p-0 pl-4 border-b dark:border-stone-700 border-gray-200 shrink-0`
                    }
                >
                    {title && (
                        <h2
                            id={sheet ? titleId : undefined}
                            className={sheet ? "text-[14px] font-semibold" : "font-semibold"}
                        >
                            {title}
                        </h2>
                    )}
                    <button
                        onClick={() => onClose()}
                        aria-label={sheet ? `${title || "팝업"} 닫기` : undefined}
                        className={
                            sheet
                                ? "size-11 rounded flex items-center justify-center text-[#626262] [@media(hover:hover)]:hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-neutral-700"
                                : "size-12 dark:text-gray-400 text-gray-600 dark:hover:bg-stone-700 hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors"
                        }
                    >
                        {sheet ? <X className="size-4" /> : "\u2715"}
                    </button>
                </div>

                {/* 본문 */}
                <div
                    className={`${noPadding ? "p-0" : "p-4"} flex-1 overflow-y-auto scrollbar-thin ${sheet ? "bg-white min-h-0" : "bg-gray-50"}`}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
