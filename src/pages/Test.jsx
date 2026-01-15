import React, { useState, useEffect } from "react";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function Test() {
    const [data, setData] = useState([]);

    useEffect(() => {
        const interval = setInterval(() => {
            setData((prev) => {
                // 기존 데이터를 왼쪽으로 이동하고 새 랜덤 값 추가
                const newData = [...prev, Math.random() * 1 - 0.5];
                console.log(newData);
                return newData;
            });
        }, 100); // 0.1초마다 업데이트

        return () => clearInterval(interval);
    }, []);

    const chartData = {
        labels: Array.from({ length: data.length }, (_, i) => i),
        datasets: [
            {
                label: "OD tan_x",
                data,
                borderColor: "red",
                backgroundColor: "rgba(255,0,0,0.1)",
                borderWidth: 2,
                pointRadius: 0,
            },
            {
                label: "OS tan_x",
                data,
                borderColor: "blue",
                backgroundColor: "rgba(0,0,255,0.1)",
                borderWidth: 2,
                pointRadius: 0,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false, // 높이 유지
        animation: {
            duration: 0,
        },
        plugins: {
            legend: {
                display: true,
                position: "top",
            },
            title: {
                display: false,
            },
        },
        scales: {
            x: {
                type: "linear",
                min: 0,
                max: 360,
                grid: {
                    color: "rgba(0,0,0,0.1)",
                },
                ticks: {
                    stepSize: 1,
                },
            },
            y: {
                min: -1.0,
                max: 1.0,
                grid: {
                    color: "rgba(0,0,0,0.1)",
                },
                ticks: {
                    stepSize: 0.1,
                },
            },
        },
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md h-[400px] mt-4">
            <Line data={chartData} options={chartOptions} />
        </div>
    );
}
