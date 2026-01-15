// 특정 에러 메시지 숨기기
const originalError = console.error;
console.error = (...args) => {
    if (args[0]?.toString?.().includes("Maximum update depth exceeded")) {
        return; // 이 에러는 무시
    }
    originalError(...args);
};

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
