export default function Popup({ children, width = "6xl", height = "95%", onClose }) {
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
    };

    const heightClass = height.includes("%") ? `h-[${height}]` : height;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center dark:text-white backdrop-blur-sm">
            {/* 오버레이 배경 */}
            <div className="fixed inset-0 bg-black/50 transition-opacity" />
            {/* 팝업 내용 */}
            <div
                className={`
                    relative w-full ${widthClassMap[width] || "max-w-xl"}
                    m-4 ${heightClass} 
                    dark:bg-stone-800 bg-white 
                    rounded-lg shadow-xl 
                    transform transition-all overflow-hidden
                `}
            >
                {/* 헤더 */}
                <div className="flex justify-end items-center p-0 pl-4 border-b dark:border-stone-700 border-gray-200">
                    {/* <h2 className="font-semibold">{folder}</h2> */}
                    <button
                        onClick={() => onClose()}
                        className="size-12 dark:text-gray-400 text-gray-600 dark:hover:bg-stone-700 hover:bg-gray-100 rounded-full flex items-center justify-center transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* 본문 */}
                <div className={`p-4 h-[95%] overflow-y-auto scrollbar-thin bg-gray-50`}>{children}</div>
            </div>
        </div>
    );
}
