import React, { useState } from "react";

export default function RippleButton({ children, onClick, className = "", ...props }) {
    const [ripples, setRipples] = useState([]);

    const handleClick = (e) => {
        const button = e.currentTarget;
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newRipple = {
            id: Date.now(),
            x,
            y,
        };

        setRipples((prev) => [...prev, newRipple]);

        // 리플 제거
        setTimeout(() => {
            setRipples((prev) => prev.filter((ripple) => ripple.id !== newRipple.id));
        }, 600);

        // 외부 onClick 실행
        if (onClick) onClick(e);
    };

    return (
        <button
            className={`
            relative overflow-hidden font-medium rounded transition-colors duration-200
            flex items-center justify-center gap-1
            ${className}
        `}
            onClick={handleClick}
            {...props}
        >
            {/* 콘텐츠 */}
            <span className="relative z-10 flex items-center gap-2">{children}</span>

            {/* 리플 효과 */}
            {ripples.map((ripple) => (
                <span
                    key={ripple.id}
                    className="absolute bg-white rounded-full pointer-events-none animate-ping opacity-30"
                    style={{
                        left: ripple.x - 10,
                        top: ripple.y - 10,
                        width: 70,
                        height: 70,
                        animationDuration: "0.6s",
                    }}
                />
            ))}
        </button>
    );
}
