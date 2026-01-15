import React from "react";

const Table = ({ children, className = "", minWidth = "800px" }) => {
    return (
        <div
            className={`overflow-x-auto scrollbar-thin rounded-lg border border-gray-300 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
        >
            <table className="w-full" style={{ minWidth }}>
                {children}
            </table>
        </div>
    );
};

const TableHeader = ({ children }) => {
    return (
        <thead className="bg-gray-100 dark:bg-gray-800 text-center">
            <tr className="border-b border-gray-100 dark:border-gray-800 text-xs">{children}</tr>
        </thead>
    );
};

const TableHead = ({ children, className = "" }) => {
    return (
        <th className={`h-[30px] font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap ${className}`}>
            {children}
        </th>
    );
};

const TableBody = ({ children }) => {
    return <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">{children}</tbody>;
};

const TableRow = ({ children, index, striped = true }) => {
    return (
        <tr
            className={`
                hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 
                dark:hover:from-gray-800 dark:hover:to-gray-750 
                transition-all duration-200 ease-in-out
                ${striped && index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-100 dark:bg-gray-800/30"}
            `}
        >
            {children}
        </tr>
    );
};

const TableCell = ({ children, className = "" }) => {
    return (
        <td
            className={`h-[50px] text-center font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap ${className}`}
        >
            {children}
        </td>
    );
};

// 컴포넌트들을 Table의 속성으로 추가
Table.Header = TableHeader;
Table.Head = TableHead;
Table.Body = TableBody;
Table.Row = TableRow;
Table.Cell = TableCell;

export default Table;
