import React from "react";

const ManualToggleSwitch = ({ checked, onChange }) => {
    return (
        <div className={`flex justify-center items-center gap-3 bg-gray-800 rounded px-3 py-2`}>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>

            <span className={`text-xs font-medium transition-colors ${checked ? "text-white" : "text-gray-500"}`}>
                수동
            </span>
        </div>
    );
};

export default ManualToggleSwitch;
