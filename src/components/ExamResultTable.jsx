// selected/onSelect를 주면 클릭으로 고를 수 있고, 고른 표에 노란 보더가 붙는다.
// 1페이지의 계산식(AngleTwoTrack)이 어느 시험의 값으로 계산된 것인지 보이게 하는 용도.
export default function ExamResultTable({ title, hoverColor = "blue", data, suffix, selected = false, onSelect }) {
    const clickable = typeof onSelect === "function";
    return (
        <table
            onClick={clickable ? onSelect : undefined}
            // 선택 표시는 outline으로 준다. border-collapse 테이블에서 border는 셀 보더와
            // 충돌해 가려질 수 있고, outline은 레이아웃을 밀지 않는다.
            className={`w-full border-collapse border border-gray-300 shadow-sm ${
                clickable ? "cursor-pointer print:cursor-auto" : ""
            } ${selected ? "outline outline-4 outline-yellow-400 outline-offset-2" : ""}`}
        >
            <tbody>
                <tr className="bg-gray-300">
                    <td
                        colSpan={3}
                        className="text-center text-xl font-bold border border-gray-300 py-2 text-white"
                    >
                        {title}
                    </td>
                </tr>
                <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                    <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700 w-24"></th>
                    <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">X-axis</th>
                    <th className="border border-gray-300 py-2 px-4 font-semibold text-gray-700">Y-axis</th>
                </tr>
                <tr className={`text-center hover:bg-${hoverColor}-50 transition-colors`}>
                    <td className="border border-gray-300 py-2 px-4 font-medium bg-gray-50 text-gray-700">
                        OD
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-gray-800">
                        {data[`xaxis_od_${suffix}`]}
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-gray-800">
                        {data[`yaxis_od_${suffix}`]}
                    </td>
                </tr>
                <tr className={`text-center hover:bg-${hoverColor}-50 transition-colors`}>
                    <td className="border border-gray-300 py-2 px-4 font-medium bg-gray-50 text-gray-700">
                        OS
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-gray-800">
                        {data[`xaxis_os_${suffix}`]}
                    </td>
                    <td className="border border-gray-300 py-2 px-4 text-gray-800">
                        {data[`yaxis_os_${suffix}`]}
                    </td>
                </tr>
            </tbody>
        </table>
    );
}
