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


            <div className={`w-full ${widthClassArr[POPUP_WIDTH_INDEX]}`}>
                <div className="h-[98dvh] max-h-[98vh] w-full bg-white dark:bg-stone-800 rounded transform transition-all overflow-hidden flex flex-col">
                    {/* 상단 툴바 */}
                    <div className="flex flex-row bg-white border-b shrink-0">

                        <RippleButton
                            className="text-black hover:text-gray-200 p-2 transition-colors bg-white"
                            onClick={() => handlePopupSize(false)}
                        >
                            <MinusIcon className="size-4" />
                        </RippleButton>

                        <RippleButton
                            className="text-black hover:text-gray-200 p-2 transition-colors bg-white"
                            onClick={() => handlePopupSize(true)}
                        >
                            <PlusIcon className="size-4" />
                        </RippleButton>




                        <div className="flex-1" />

                        {/* 닫기 버튼 */}
                        <RippleButton
                            onClick={onClose}
                            className="text-black hover:text-gray-200 p-2 transition-colors bg-white"
                        >
                            <XIcon className="size-4" />
                        </RippleButton>


                    </div>


                    {/* 팝업 내용 */}
                    <div className="p-1 flex-1 overflow-y-auto scrollbar-ultra-thin bg-white">{children}</div>
                </div>
            </div>
        </div>
    );
}
