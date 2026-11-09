import { ToastBar, Toaster } from "react-hot-toast";

export default function OwToaster() {
    return (
        <Toaster
            position="bottom-center"
            containerClassName="ow-toaster"
            containerStyle={{ top: "auto", left: 0, right: 0, bottom: 24, zIndex: 10000 }}
            toastOptions={{ duration: 4000 }}
        >
            {(t) => (
                <div className={`ow-toast ${t.visible ? "ow-toast--enter" : "ow-toast--exit"}`}>
                    <ToastBar toast={{ ...t, className: "ow-toast__panel" }}>
                        {({ message }) => <div className="ow-toast__message">{message}</div>}
                    </ToastBar>
                </div>
            )}
        </Toaster>
    );
}
