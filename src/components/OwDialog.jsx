import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useDialogStore, { cancelDialogs, settleDialog } from "../stores/useDialogStore";

export default function OwDialogHost() {
    const active = useDialogStore((state) => state.active);
    const panel = useRef(null);
    const open = !!active;

    useEffect(() => () => cancelDialogs(), []);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        const root = document.getElementById("root");
        const wasInert = root?.inert;
        if (root) root.inert = true;
        return () => {
            if (root) root.inert = wasInert;
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);

    useEffect(() => {
        if (!active) return;
        const element = panel.current;
        const buttons = [...element.querySelectorAll("button")];
        const initial = active.kind === "confirm" && active.danger ? buttons[0] : buttons.at(-1);
        initial.focus();
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            element.animate(
                [
                    { opacity: 0, transform: "scaleY(.6)" },
                    { opacity: 1, transform: "scaleY(1)" },
                ],
                {
                    duration: 200,
                    easing: "ease-out",
                },
            );
        }
        const onKey = (event) => {
            if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                settleDialog(active.id, false);
            } else if (event.key === "Tab") {
                event.preventDefault();
                event.stopImmediatePropagation();
                const index = buttons.indexOf(document.activeElement);
                buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
            } else {
                // Preserve the focused button's default Enter/Space behavior, but not background shortcuts.
                event.stopImmediatePropagation();
            }
        };
        const onFocus = (event) => {
            if (!element.contains(event.target)) initial.focus();
        };
        window.addEventListener("keydown", onKey, true);
        document.addEventListener("focusin", onFocus);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            document.removeEventListener("focusin", onFocus);
        };
    }, [active]);

    if (!active) return null;
    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            style={{ zIndex: 11000 }}
        >
            <section
                ref={panel}
                role={active.danger ? "alertdialog" : "dialog"}
                aria-modal="true"
                aria-labelledby={`ow-dialog-title-${active.id}`}
                aria-describedby={`ow-dialog-message-${active.id}`}
                className="flex w-full max-h-[100dvh] flex-col text-white"
                style={{ background: "rgba(20,26,42,.96)" }}
            >
                <h2
                    id={`ow-dialog-title-${active.id}`}
                    className="mx-auto w-[calc(100%-48px)] max-w-[960px] shrink-0 py-5 text-center text-xl font-bold"
                >
                    {active.title}
                </h2>
                <div
                    id={`ow-dialog-message-${active.id}`}
                    className="mx-auto w-[calc(100%-48px)] max-w-[960px] min-h-0 overflow-y-auto whitespace-pre-wrap break-words pb-6 text-center text-[15px] leading-6"
                >
                    {active.message}
                </div>
                <div
                    className="flex shrink-0 justify-center gap-3 px-6 py-4"
                    style={{ background: "rgba(12,16,28,.96)" }}
                >
                    {active.kind === "confirm" && (
                        <button
                            type="button"
                            className="h-10 border border-gray-400 px-8 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                            onClick={() => settleDialog(active.id, false)}
                        >
                            {active.cancelText}
                        </button>
                    )}
                    <button
                        type="button"
                        className="h-10 bg-[#f26522] px-8 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                        onClick={() => settleDialog(active.id, true)}
                    >
                        {active.okText}
                    </button>
                </div>
            </section>
        </div>,
        document.body,
    );
}
