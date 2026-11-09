// DevicePoseFallback.jsx
// DevicePose3D 를 쓸 수 없을 때(청크 로드 실패 · WebGL 미지원 · 렌더 예외) 그 자리에 대신 보여주는 카드.
// lazy() 의 catch 에서 default 로도 쓰이므로 DevicePose3D 와 같은 props 를 받아도 무시한다.
import React from "react";
import { Box } from "lucide-react";

export default function DevicePoseFallback() {
    return (
        <div className="h-full min-h-[7rem] flex flex-col items-center justify-center gap-1 bg-white rounded-lg border border-gray-200 text-gray-500">
            <Box className="size-5" />
            <span className="text-sm">3D 기기 자세 뷰를 표시할 수 없습니다</span>
            <span className="text-xs text-gray-400">측정 기능에는 영향이 없습니다</span>
        </div>
    );
}
