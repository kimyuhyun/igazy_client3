import { useEffect, useRef } from "react";
import { drawBase64ToCanvas } from "../utils/canvasUtils";
// overlayFromDetect 는 utils/canvasUtils.js 에 있다 (컴포넌트 파일에 함수를 같이 내보내면 Fast Refresh 가 깨진다)

/**
 * 일회성 검출 샷(미리보기 "측정" 확인 샷, 윤부 캘리 결과 샷) 표시용 캔버스.
 * 2026-10-27 부터 안드로이드가 이미지에 동공을 그리지 않으므로, 응답의 절대 중심(x, y)·축 길이(majorR, minorR)·
 * 좌표 기준 폭(frameWidth)으로 React 가 원을 그린다. 실시간·재생 화면과 같은 drawBase64ToCanvas 를 쓴다.
 * base64 = JPEG(data: 접두어 없음), overlay = { x, y, majorR, minorR, coordWidth } | null
 */
export default function PupilShot({ base64, overlay = null, className = "" }) {
    const canvasRef = useRef(null);
    useEffect(() => {
        drawBase64ToCanvas(base64, canvasRef.current, overlay);
    }, [base64, overlay]);
    return <canvas ref={canvasRef} className={className} />;
}

