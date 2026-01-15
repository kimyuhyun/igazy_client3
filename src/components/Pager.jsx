import useVariableStore from "../stores/useVariableStore";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export default function Pager({ pageHelper }) {
    const { params, setParams } = useVariableStore();

    if (!pageHelper || !pageHelper.pnTotal) {
        return null;
    }

    const pageLength = pageHelper.pnEnd - pageHelper.pnStart + 1;

    if (pageLength < 1) {
        return null;
    }

    const currentPage = pageHelper.pageNum;
    const totalPages = pageHelper.pnTotal;

    const handlePageChange = (page) => {
        setParams({
            page,
            refresh: Date.now(),
        });
    };

    return (
        <div className="flex items-center justify-center mt-8">
            <div className="flex items-center gap-1">
                {/* First Page */}
                <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    className={`
                        inline-flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                        ${
                            currentPage === 1
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                        }
                    `}
                >
                    <ChevronsLeft className="w-4 h-4" />
                </button>

                {/* Previous Page */}
                <button
                    onClick={() => handlePageChange(pageHelper.pnPrev)}
                    disabled={pageHelper.pnPrev === 0}
                    className={`
                        inline-flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                        ${
                            pageHelper.pnPrev === 0
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                        }
                    `}
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 mx-2">
                    {Array(pageLength)
                        .fill()
                        .map((_, i) => {
                            const pageNum = pageHelper.pnStart + i;
                            const isActive = currentPage === pageNum;
                            
                            return (
                                <button
                                    key={i}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={`
                                        inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200
                                        ${
                                            isActive
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                        }
                                    `}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                </div>

                {/* Next Page */}
                <button
                    onClick={() => handlePageChange(pageHelper.pnNext)}
                    disabled={pageHelper.pnNext === 0}
                    className={`
                        inline-flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                        ${
                            pageHelper.pnNext === 0
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                        }
                    `}
                >
                    <ChevronRight className="w-4 h-4" />
                </button>

                {/* Last Page */}
                <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`
                        inline-flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200
                        ${
                            currentPage === totalPages
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                        }
                    `}
                >
                    <ChevronsRight className="w-4 h-4" />
                </button>
            </div>

            {/* Page Info */}
            <div className="ml-4 text-sm text-gray-500 dark:text-gray-400">
                {currentPage} / {totalPages}
            </div>
        </div>
    );
}
