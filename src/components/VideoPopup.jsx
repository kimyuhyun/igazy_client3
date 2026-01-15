import { PlusIcon, MinusIcon, XIcon } from "lucide-react";

import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";

export default function VideoPopup({ children, onClose }) {
    const { POPUP_WIDTH_INDEX, setPopupWidthIndex } = useVariableStore();

    const widthClassArr = [
        "max-w-2xl",
        "max-w-3xl",
        "max-w-4xl",
        "max-w-5xl",
        "max-w-6xl",
        "max-w-7xl",
        "max-w-screen-2xl",
    ];

    function handlePopupSize(isPlus) {
        var newIndex = 0;
        if (isPlus) {
            newIndex = POPUP_WIDTH_INDEX + 1;
            if (newIndex > widthClassArr.length - 1) {
                newIndex = widthClassArr.length - 1;
            }
        } else {
            newIndex = POPUP_WIDTH_INDEX - 1;
            if (newIndex < 0) {
                newIndex = 0;
            }
        }
        setPopupWidthIndex(newIndex);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center dark:text-white backdrop-blur-sm">
            {/* 오버레이 배경 */}
            <div className="fixed inset-0 bg-black/50 transition-opacity" />

            {/* 팝업 컨테이너 */}
            <div className={`relative w-full ${widthClassArr[POPUP_WIDTH_INDEX]} mx-4`}>
                {/* 창 사이즈조절 */}
                <div className="flex flex-col h-full justify-center absolute -top-1 -left-16 z-15 ">
                    <RippleButton
                        className="text-white hover:bg-gray-600 p-2 transition-colors rounded-full font-thin"
                        onClick={() => handlePopupSize(true)}
                    >
                        <PlusIcon className="size-12" />
                    </RippleButton>

                    <RippleButton
                        className="text-white hover:bg-gray-600 p-2 transition-colors rounded-full font-thin"
                        onClick={() => handlePopupSize(false)}
                    >
                        <MinusIcon className="size-12" />
                    </RippleButton>
                </div>

                {/* 버튼 */}
                <div className="absolute top-0 right-0 z-10">
                    <button
                        onClick={onClose}
                        className="text-black hover:text-gray-200 p-2 transition-colors rounded bg-white"
                    >
                        <XIcon className="size-4" />
                    </button>
                </div>

                {/* 팝업 내용 */}
                <div className="h-[99vh] w-full bg-white dark:bg-stone-800 rounded transform transition-all overflow-hidden">
                    <div className="p-2 h-full overflow-y-auto scrollbar-ultra-thin">{children}</div>
                </div>
            </div>
        </div>
    );
}
