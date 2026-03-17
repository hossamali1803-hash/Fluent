"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Task {
  id: string; title: string; why: string; cue: string;
  skillType?: string; targetWords?: string[];
  templateName: string; xpReward: number; status: "pending" | "completed";
  stars?: number; createdAt: string;
}

const SKILL_COLORS: Record<string, { bg: string; text: string }> = {
  vocabulary: { bg: "#f3f0ff", text: "#8b5cf6" },
  grammar:    { bg: "#f0f4ff", text: "#3b82f6" },
  structure:  { bg: "#f0faf5", text: "#10b981" },
  fluency:    { bg: "#fffbf0", text: "#f59e0b" },
};

function StarRow({ count, size = 18 }: { count: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1,2,3,4,5].map((i) => (
        <span key={i} style={{ fontSize: size, filter: i <= count ? "none" : "grayscale(1) opacity(0.2)" }}>⭐</span>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [totalXP, setTotalXP] = useState(0);

  useEffect(() => {
    setTasks(JSON.parse(localStorage.getItem("tasks") ?? "[]"));
    setTotalXP(parseInt(localStorage.getItem("totalXP") ?? "340"));
  }, []);

  const pending = tasks.filter((t) => t.status === "pending");
  const completed = tasks.filter((t) => t.status === "completed");
  const taskXP = completed.reduce((sum, t) => sum + Math.round(((t.stars ?? 3) / 5) * t.xpReward), 0);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 20px 60px", background: "#f5f4ff", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#1a1a2a" }}>My Tasks</h1>
        <button onClick={() => router.push("/")} style={{ background: "transparent", border: "none", color: "#6b6b8a", cursor: "pointer", fontSize: 14 }}>← Home</button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
        {[
          { label: "XP earned", value: taskXP, color: "#f59e0b", icon: "⚡" },
          { label: "Done", value: completed.length, color: "#10b981", icon: "✅" },
          { label: "To do", value: pending.length, color: "#8b5cf6", icon: "🎯" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#ffffff", border: "1px solid #ece9ff", borderRadius: 14, padding: "14px 0", textAlign: "center" }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{s.value}</div>
            <div style={{ color: "#6b6b8a", fontSize: 11, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#1a1a2a" }}>No tasks yet</div>
          <div style={{ color: "#6b6b8a", fontSize: 14, marginBottom: 24 }}>Finish a conversation to get tasks</div>
          <button onClick={() => router.push("/")} style={{ background: "#f59e0b", color: "#0f0e17", border: "none", borderRadius: 12, padding: "12px 28px", fontWeight: 700, cursor: "pointer" }}>
            Start practicing
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <div style={{ color: "#6b6b8a", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>To do</div>
          {pending.map((task) => {
            const sc = task.skillType ? SKILL_COLORS[task.skillType] ?? SKILL_COLORS.fluency : null;
            return (
              <button key={task.id} onClick={() => router.push(`/tasks/${task.id}`)} style={{
                width: "100%", background: "#ffffff", border: "1px solid #ece9ff",
                borderRadius: 20, padding: 20, marginBottom: 12, cursor: "pointer", textAlign: "left",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                {/* Title row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2a" }}>{task.title}</div>
                    {sc && task.skillType && (
                      <span style={{ background: sc.bg, color: sc.text, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{task.skillType}</span>
                    )}
                  </div>
                  <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700 }}>+{task.xpReward} XP</span>
                </div>

                {/* Why */}
                <div style={{ color: "#6b6b8a", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>{task.why}</div>

                {/* Cue */}
                <div style={{ background: "#f5f4ff", border: "1px solid #ece9ff", borderRadius: 12, padding: "10px 14px", marginBottom: task.targetWords?.length ? 10 : 14 }}>
                  <span style={{ color: "#8b5cf6", fontSize: 12, fontWeight: 600 }}>💡 </span>
                  <span style={{ color: "#1a1a2a", fontSize: 13, lineHeight: 1.5 }}>{task.cue}</span>
                </div>

                {/* Target words */}
                {task.targetWords?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {task.targetWords.map((w) => (
                      <span key={w} style={{ background: "#8b5cf6", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 600 }}>{w}</span>
                    ))}
                  </div>
                ) : null}

                {/* CTA */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8b5cf6", fontSize: 13, fontWeight: 700 }}>
                  <span>🎤</span> Practice now →
                </div>
              </button>
            );
          })}
        </>
      )}

      {completed.length > 0 && (
        <>
          <div style={{ color: "#6b6b8a", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, marginTop: 28 }}>Completed</div>
          {completed.map((task) => {
            const earned = Math.round(((task.stars ?? 3) / 5) * task.xpReward);
            const starColor = (task.stars ?? 0) >= 4 ? "#10b981" : (task.stars ?? 0) === 3 ? "#f59e0b" : "#ef4444";
            return (
              <button key={task.id} onClick={() => router.push(`/tasks/${task.id}`)} style={{
                width: "100%", background: "#ffffff", border: "1px solid #ece9ff",
                borderRadius: 20, padding: 20, marginBottom: 12, cursor: "pointer", textAlign: "left",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2a", marginBottom: 6 }}>{task.title}</div>
                    <StarRow count={task.stars ?? 0} size={16} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: starColor, fontWeight: 800, fontSize: 16 }}>+{earned} XP</div>
                    <div style={{ color: "#6b6b8a", fontSize: 12, marginTop: 2 }}>Retry →</div>
                  </div>
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
