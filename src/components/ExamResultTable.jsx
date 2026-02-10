export default function ExamResultTable({ title, hoverColor = "blue", data, suffix }) {
    return (
        <table className="w-full border-collapse border border-gray-300 shadow-sm">
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
