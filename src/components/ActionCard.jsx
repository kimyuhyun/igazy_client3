export default function ActionCard({ icon, title, description, onClick }) {
    return (
        <button
            onClick={onClick}
            className="group relative bg-slate-50 dark:bg-slate-900 rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-[12px_12px_24px_#d1d5db,-12px_-12px_24px_#ffffff] dark:shadow-[12px_12px_24px_#0f172a,-12px_-12px_24px_#1e293b] hover:shadow-[6px_6px_12px_#d1d5db,-6px_-6px_12px_#ffffff] dark:hover:shadow-[6px_6px_12px_#0f172a,-6px_-6px_12px_#1e293b] active:shadow-[inset_6px_6px_12px_#d1d5db,inset_-6px_-6px_12px_#ffffff] dark:active:shadow-[inset_6px_6px_12px_#0f172a,inset_-6px_-6px_12px_#1e293b]"
        >
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all duration-300 shadow-[inset_8px_8px_16px_#d1d5db,inset_-8px_-8px_16px_#ffffff] dark:shadow-[inset_8px_8px_16px_#0f172a,inset_-8px_-8px_16px_#1e293b]">
                {icon}
            </div>
            <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-3">{title}</h3>
            <p className="text-slate-600 dark:text-slate-400">{description}</p>
        </button>
    );
}
