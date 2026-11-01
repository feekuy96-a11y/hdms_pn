"use client";

import React, { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { TimelineUpdate } from "@/db/default-data";
import { formatThaiBuddhistDate } from "@/lib/gis-utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface WaterTimelineChartProps {
  timelineUpdates: TimelineUpdate[];
  floodId: string;
}

export function WaterTimelineChart({ timelineUpdates, floodId }: WaterTimelineChartProps) {
  // Filter updates for this specific flood location, sorted chronologically
  const filtered = timelineUpdates
    .filter((t) => t.flood_id_ref === floodId)
    .sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime());

  if (filtered.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-400">
        ยังไม่มีข้อมูลประวัติระดับน้ำสำหรับจุดนี้
      </div>
    );
  }

  const labels = filtered.map((t) => {
    const d = new Date(t.reported_at);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} น.`;
  });

  const dataValues = filtered.map((t) => t.water_level_cm);

  const data = {
    labels,
    datasets: [
      {
        label: "ระดับน้ำ (ซม.)",
        data: dataValues,
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.15)",
        borderWidth: 2.5,
        pointBackgroundColor: filtered.map((t) => (t.traffic_status === "CLOSED" ? "#ef4444" : "#f59e0b")),
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.35,
      },
      {
        label: "เกณฑ์วิกฤตปิดจราจร (40 ซม.)",
        data: labels.map(() => 40),
        borderColor: "rgba(239, 68, 68, 0.6)",
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        labels: {
          color: "#cbd5e1",
          font: { size: 10, family: "Prompt" },
          boxWidth: 12,
        },
      },
      tooltip: {
        backgroundColor: "#0f172a",
        titleColor: "#fbbf24",
        bodyColor: "#f8fafc",
        borderColor: "#334155",
        borderWidth: 1,
        callbacks: {
          title: (items: any[]) => {
            const index = items[0]?.dataIndex;
            return filtered[index] ? formatThaiBuddhistDate(filtered[index].reported_at) : "";
          },
          label: (context: any) => `ระดับน้ำ: ${context.parsed.y} ซม.`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(51, 65, 85, 0.4)" },
        ticks: { color: "#94a3b8", font: { size: 10 } },
        suggestedMax: 60,
      },
      x: {
        grid: { color: "rgba(51, 65, 85, 0.2)" },
        ticks: { color: "#94a3b8", font: { size: 10 } },
      },
    },
  };

  return (
    <div className="w-full h-full min-h-[170px] relative">
      <Line data={data} options={options} />
    </div>
  );
}
