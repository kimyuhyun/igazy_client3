// tailwind.config.js
export default {
    darkMode: "class", // 'media'나 'class' 중 선택
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            keyframes: {
                "pulse-slow": {
                    "0%, 100%": { opacity: 1 },
                    "50%": { opacity: 0.5 },
                },
                slideUp: {
                    "0%": { transform: "translateY(100%)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
            },
            animation: {
                "pulse-slow": "pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "slide-up": "slideUp 0.3s ease-out",
                "fade-in": "fadeIn 0.3s ease-out",
            },
        },
    },
    variants: {},
    plugins: [],
};
