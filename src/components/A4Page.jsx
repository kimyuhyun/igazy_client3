// A4Page 컴포넌트
export default function A4Page({ children, className = "" }) {
    return (
        <div
            className={`
                a4-page
                bg-white 
                w-full max-w-[210mm] 
                min-h-[297mm]
                print:min-h-0
                mx-auto 
                p-8
                shadow-lg
                print:shadow-none
                print:break-after-page
                print:w-full
                print:max-w-none
                print:m-0
                print:p-0
                ${className}
            `}
        >
            {children}
        </div>
    );
}
