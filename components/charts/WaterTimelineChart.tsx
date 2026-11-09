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
  const [isMounted, setIsMounted] = React.useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Filter updates for this specific flood location, sorted chronologically.
  // Memoised so unrelated parent re-renders (typing in search, toasts...) neither re-sort the
  // history nor hand Chart.js brand-new data/options objects, which would re-animate the chart.
  const filtered = React.useMemo(
    () =>
      timelineUpdates
        .filter((t) => t.flood_id_ref === floodId)
        .sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()),
    [timelineUpdates, floodId]
  );

  const data = React.useMemo(
    () => ({
      labels: filtered.map((t) => {
        const d = new Date(t.reported_at);
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} น.`;
      }),
      datasets: [
        {
          label: "ระดับน้ำ (ซม.)",
          data: filtered.map((t) => t.water_level_cm),
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.08)",
          borderWidth: 3,
          pointBackgroundColor: "#ef4444",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          fill: true,
          tension: 0.25,
        },
      ],
    }),
    [filtered]
  );

  const options = React.useMemo(
    () => ({
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
    }),
    [filtered]
  );

  if (!isMounted) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-400">
        กำลังโหลดกราฟระดับน้ำ...
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-slate-400">
        ยังไม่มีข้อมูลประวัติระดับน้ำสำหรับจุดนี้
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[170px] relative">
      <Line data={data} options={options} />
    </div>
  );
}
