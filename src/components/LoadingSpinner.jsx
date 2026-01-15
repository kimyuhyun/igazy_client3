// components/LoadingSpinner.jsx
import useLoadingStore from "../stores/useLoadingStore";

export default function LoadingSpinner() {
    const { isLoading } = useLoadingStore();

    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="w-16 h-16 border-4 border-t-4 border-blue-500 border-t-blue-700 rounded-full animate-spin"></div>
            <div className="text-white mt-2 text-lg">로딩 중...</div>
        </div>
    );
}
