// components/LoadingSpinner.jsx
import { useEffect, useRef } from "react";
import useLoadingStore from "../stores/useLoadingStore";

export default function LoadingSpinner() {
    const { setLoading, isLoading } = useLoadingStore();
    const panel = useRef(null);

    useEffect(() => {
        if (!isLoading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const animation = panel.current?.animate(
            [
                { opacity: 0, transform: "scaleY(.6)" },
                { opacity: 1, transform: "scaleY(1)" },
            ],
            { duration: 200, easing: "ease-out" },
        );
        return () => animation?.cancel();
    }, [isLoading]);

    if (!isLoading) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            data-loading-overlay
        >
            <div
                ref={panel}
                className="flex w-full max-h-[100dvh] flex-col text-white"
                style={{ background: "rgba(20,26,42,.96)" }}
            >
                <div role="status" aria-live="polite">
                    <h2 className="mx-auto w-[calc(100%-48px)] max-w-[960px] py-5 text-center text-xl font-bold">
                        로딩 중…
                    </h2>
                    <div className="flex justify-center pb-6">
                        <span
                            className="size-6 rounded-full border-2 border-white/20 border-t-[#f26522] animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                        />
                    </div>
                </div>
                <div className="flex shrink-0 justify-center px-6 py-4" style={{ background: "rgba(12,16,28,.96)" }}>
                    <button
                        type="button"
                        className="h-10 bg-[#f26522] px-8 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                        onClick={() => setLoading(false)}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
