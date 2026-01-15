import toast from "react-hot-toast";
import { Search, X, ChevronDown } from "lucide-react";
import useVariableStore from "../stores/useVariableStore";
import RippleButton from "./RippleButton";

export default function SearchForm() {
    const { params, setParams } = useVariableStore();

    const handleSubmit = (e) => {
        e.preventDefault();

        if (e.target.query.value == "") {
            toast.error("검색어를 입력 해 주세요.", { duration: 2000 });
            return;
        }

        setParams({
            page: 1,
            query: e.target.query.value,
            refresh: Date.now(),
        });
    };

    const handleReset = () => {
        setParams({
            page: 1,
            query: "",
            refresh: Date.now(),
        });
        document.querySelector("input[name='query']").value = "";
    };

    return (
        <div className="mb-6 lg:max-w-lg">
            <form onSubmit={handleSubmit}>
                <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden dark:bg-gray-800">
                    {/* 입력창 */}
                    <div className="relative flex-grow">
                        <input
                            type="text"
                            name="query"
                            placeholder="검색어를 입력하세요..."
                            defaultValue={params.query}
                            className="w-full px-4 py-3 text-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
                        />

                        {/* 리셋 버튼 */}
                        {params.query != "" && (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="absolute top-1/2 -translate-y-1/2 right-2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    {/* 검색 버튼 */}
                    <RippleButton
                        type="submit"
                        className="flex items-center justify-center py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-l-none"
                    >
                        <Search className="size-6" />
                    </RippleButton>
                </div>
            </form>
        </div>
    );
}
