"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Action { title: string; why: string; cue: string; skillType?: string; targetWords?: string[]; }
interface Task {
  id: string; title: string; why: string; cue: string;
  skillType?: string; targetWords?: string[];
  templateName: string; xpReward: number; status: "pending" | "completed"; createdAt: string;
}
interface Debrief {
  scores: { clarity: number; vocabulary: number; confidence: number; fluency: number; engagement: number };
  momentGood: { quote: string; reason: string };
  momentBad: { quote: string; reason: string };
  actions: Action[];
  xpEarned: number;
  summary: string;
  templateName: string;
  durationSeconds: number;
}

const SCORE_COLOR = (v: number) => v >= 75 ? "#10b981" : v >= 55 ? "#f59e0b" : "#ef4444";

export default function DebriefPage() {
  const router = useRouter();
  const [d, setD] = useState<Debrief | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const pending = localStorage.getItem("debriefPending");
    if (!pending) { router.push("/"); return; }
    const { history, templateId, templateName, durationSeconds } = JSON.parse(pending);
    const language = localStorage.getItem("practiceLanguage") ?? "en";

    fetch("/api/conversation/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, templateId, durationSeconds, language }),
    })
      .then((r) => r.json())
      .then((data) => {
        localStorage.removeItem("debriefPending");
        if (data.actions?.length) {
          const existing: Task[] = JSON.parse(localStorage.getItem("tasks") ?? "[]");
          const newTasks: Task[] = data.actions.map((a: Action) => ({
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: a.title, why: a.why, cue: a.cue,
            skillType: a.skillType, targetWords: a.targetWords,
            templateName,
            xpReward: Math.round((data.xpEarned ?? 100) / 3),
            status: "pending" as const, createdAt: new Date().toISOString(),
          }));
          localStorage.setItem("tasks", JSON.stringify([...newTasks, ...existing]));
        }
        setD({ ...data, templateName, durationSeconds });
      })
      .catch(() => setError("Something went wrong."));
  }, []);

  if (error) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <p style={{ color: "#ef4444" }}>{error}</p>
      <button onClick={() => router.push("/")} style={btnStyle("#f59e0b")}>Go home</button>
    </div>
  );

  if (!d) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 20, background: "#f5f4ff" }}>
      <div style={{ width: 48, height: 48, border: "3px solid #ece9ff", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: "#6b6b8a" }}>Analysing your session...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  const avg = Math.round(Object.values(d.scores).reduce((a, b) => a + b, 0) / 5);
  const avgColor = SCORE_COLOR(avg);
  const fmt = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px", background: "#f5f4ff", minHeight: "100vh" }}>
      {/* Back button */}
      <button
        onClick={() => router.push("/")}
        style={{ background: "transparent", border: "none", color: "#6b6b8a", cursor: "pointer", fontSize: 14, padding: "0 0 16px" }}
      >
        ← Home
      </button>

      {/* Score hero */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ color: "#6b6b8a", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{d.templateName}</div>
        <div style={{ fontSize: 80, fontWeight: 900, color: avgColor, lineHeight: 1 }}>{avg}</div>
        <div style={{ color: "#6b6b8a", fontSize: 14, marginTop: 6 }}>{fmt(d.durationSeconds)} · <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{d.xpEarned} XP</span></div>
        {d.summary && <div style={{ color: "#1a1a2a", fontSize: 16, fontWeight: 600, marginTop: 14, padding: "0 20px" }}>{d.summary}</div>}
      </div>

      {/* Score bars */}
      <div style={{ background: "#ffffff", border: "1px solid #ece9ff", borderRadius: 20, padding: "20px 24px", marginBottom: 20 }}>
        {Object.entries(d.scores).map(([key, val]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ color: "#6b6b8a", fontSize: 13, width: 90, textTransform: "capitalize" }}>{key}</div>
            <div style={{ flex: 1, background: "#f0eeff", borderRadius: 99, height: 8 }}>
              <div style={{ background: SCORE_COLOR(val), borderRadius: 99, height: 8, width: `${val}%` }} />
            </div>
            <div style={{ color: SCORE_COLOR(val), fontWeight: 700, fontSize: 14, width: 32, textAlign: "right" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Moments */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {d.momentGood?.quote && (
          <div style={{ background: "#f0faf5", border: "1px solid #a7f3d0", borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
            <div style={{ color: "#6b6b8a", fontSize: 11, marginBottom: 4 }}>BEST BIT</div>
            <div style={{ color: "#10b981", fontSize: 13, fontStyle: "italic", marginBottom: 4 }}>"{d.momentGood.quote}"</div>
            <div style={{ color: "#6b6b8a", fontSize: 12 }}>{d.momentGood.reason}</div>
          </div>
        )}
        {d.momentBad?.quote && (
          <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>📌</div>
            <div style={{ color: "#6b6b8a", fontSize: 11, marginBottom: 4 }}>WORK ON</div>
            <div style={{ color: "#ef4444", fontSize: 13, fontStyle: "italic", marginBottom: 4 }}>"{d.momentBad.quote}"</div>
            <div style={{ color: "#6b6b8a", fontSize: 12 }}>{d.momentBad.reason}</div>
          </div>
        )}
      </div>

      {/* Tasks */}
      {d.actions?.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ color: "#6b6b8a", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Your tasks 🎯</div>
          {d.actions.map((a, i) => {
            const colors = [
              { bg: "#f3f0ff", border: "#d4c9ff", accent: "#8b5cf6" },
              { bg: "#f0f4ff", border: "#bfdbfe", accent: "#3b82f6" },
              { bg: "#f0faf5", border: "#a7f3d0", accent: "#10b981" },
            ];
            const { bg, border, accent } = colors[i % 3];
            return (
              <div key={i} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 20px", marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0, color: "white" }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <div style={{ color: "#1a1a2a", fontWeight: 700, fontSize: 15 }}>{a.title}</div>
                    {a.skillType && <span style={{ background: accent, color: "white", borderRadius: 99, padding: "1px 8px", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{a.skillType}</span>}
                  </div>
                  <div style={{ color: "#6b6b8a", fontSize: 13, marginBottom: a.targetWords?.length ? 8 : 0 }}>{a.why}</div>
                  {a.targetWords?.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {a.targetWords.map((w) => (
                        <span key={w} style={{ background: "#ffffff", border: `1px solid ${border}`, borderRadius: 20, padding: "2px 10px", fontSize: 12, color: accent, fontWeight: 600 }}>{w}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => router.push("/tasks")} style={btnStyle("#8b5cf6")}>Go to my tasks →</button>
      <div style={{ height: 12 }} />
      <button onClick={() => router.push("/")} style={btnStyle("#ffffff", "#ece9ff", "#1a1a2a")}>Practice again</button>
    </div>
  );
}

function btnStyle(bg: string, border?: string, textColor?: string) {
  return {
    width: "100%", background: bg,
    color: textColor ?? (bg === "#ffffff" ? "#1a1a2a" : "white"),
    border: `1px solid ${border ?? bg}`, borderRadius: 14, padding: "16px", fontSize: 16,
    fontWeight: 700, cursor: "pointer", display: "block",
  } as React.CSSProperties;
}
