import React, { useEffect, useState } from "react";
import axios from "axios";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Measure from "./pages/Measure";
import Video from "./pages/Video";
import Config from "./pages/Config";
import LoadingSpinner from "./components/LoadingSpinner";
import PDReport from "./pages/PDReport";
import XaxisCali from "./pages/XaxisCali";

function App() {
    return (
        <>
            <BrowserRouter basename="/">
                <Routes>
                    <Route path="/" element={<Measure />} />
                    <Route path="/measure" element={<Measure />} />
                    <Route path="/video" element={<Video />} />
                    <Route path="/config" element={<Config />} />
                    <Route path="/pd_report" element={<PDReport />} />

                    <Route path="/x_axis_cali" element={<XaxisCali />} />
                </Routes>
            </BrowserRouter>
            <Toaster
                position="bottom-center"
                toastOptions={{
                    duration: 4000,
                    style: {
                        background: "#363636",
                        color: "#fff",
                    },
                }}
            />
            <LoadingSpinner />
        </>
    );
}

export default App;
