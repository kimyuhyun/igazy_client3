import OwDialogHost from "./components/OwDialog";
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useDialog } from "./utils/dialog";
import OwToaster from "./components/OwToast";
import Measure from "./pages/Measure";
import Video from "./pages/Video";
import Viewer from "./pages/Viewer";
import Config from "./pages/Config";
import MotionConfig from "./pages/MotionConfig";
import LoadingSpinner from "./components/LoadingSpinner";
import PDReport from "./pages/PDReport";
import PDReportWithTable from "./pages/PDReportWithTable";
import XaxisCali from "./pages/XaxisCali";
import LimbusTest from "./pages/LimbusTest";

function App() {
    const dialog = useDialog();
    // lazy 청크 로드 실패 시 Vite 가 올리는 이벤트. 대표적 원인은 새 버전 배포 뒤 열려 있던 탭(해시 파일명 404)이지만
    // 오프라인·모듈 평가 예외도 같은 이벤트라 원인을 단정하지 않고 새로고침만 안내한다.
    // (기본 throw 는 막지 않는다 — 해당 import 의 .catch 폴백이 그대로 동작하도록)
    useEffect(() => {
        const onPreloadError = async () => {
            if (
                await dialog.confirm({
                    title: "화면을 불러오지 못했습니다",
                    message: "연결 상태를 확인한 뒤 새로고침하세요.\n저장하지 않은 내용은 사라질 수 있습니다.",
                    okText: "새로고침",
                    cancelText: "닫기",
                    danger: true,
                })
            )
                window.location.reload();
        };
        window.addEventListener("vite:preloadError", onPreloadError);
        return () => window.removeEventListener("vite:preloadError", onPreloadError);
    }, [dialog]);

    return (
        <>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
                <Routes>
                    <Route path="/" element={<Viewer />} />
                    <Route path="/measure" element={<Measure />} />
                    <Route path="/video" element={<Video />} />
                    <Route path="/viewer" element={<Viewer />} />
                    <Route path="/config" element={<Config />} />
                    <Route path="/motion_config" element={<MotionConfig />} />
                    <Route path="/pd_report" element={<PDReport />} />
                    {/* 표 방식(pitch + 룩업테이블) 리포트. R 방식(/pd_report)과 비교용 */}
                    <Route path="/pd_report_table" element={<PDReportWithTable />} />

                    <Route path="/x_axis_cali" element={<XaxisCali />} />
                    <Route path="/limbus_test" element={<LimbusTest />} />
                </Routes>
            </BrowserRouter>
            <OwToaster />
            <OwDialogHost />
            <LoadingSpinner />
        </>
    );
}

export default App;
