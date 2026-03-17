"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES, THEMES } from "@/lib/templates";

interface GeneratedTemplate {
  id: string; name: string; category: string;
  persona: string; personaRole: string;
  openers: string[]; systemPrompt: string;
}

const LANGUAGES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "German" },
];

export default function Home() {
  const router = useRouter();
  const [pendingTasks, setPendingTasks] = useState(0);
  const [totalXP, setTotalXP] = useState(340);
  const [generated, setGenerated] = useState<GeneratedTemplate[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [userName, setUserName] = useState("");
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  useEffect(() => {
    if (!localStorage.getItem("onboardingDone")) {
      router.push("/onboarding");
      return;
    }
    const tasks = JSON.parse(localStorage.getItem("tasks") ?? "[]");
    setPendingTasks(tasks.filter((t: any) => t.status === "pending").length);
    setTotalXP(parseInt(localStorage.getItem("totalXP") ?? "340"));
    setGenerated(JSON.parse(localStorage.getItem("generatedScenarios") ?? "[]"));
    setHidden(JSON.parse(localStorage.getItem("hiddenScenarios") ?? "[]"));
    setLanguage(localStorage.getItem("practiceLanguage") ?? "en");
    setUserName(localStorage.getItem("userName") ?? "");
    const storedThemes = localStorage.getItem("selectedThemes");
    setSelectedThemes(storedThemes ? JSON.parse(storedThemes) : []);
  }, []);

  function selectLanguage(code: string) {
    setLanguage(code);
    localStorage.setItem("practiceLanguage", code);
  }

  function deleteScenario(id: string) {
    const updatedGenerated = generated.filter((g) => g.id !== id);
    setGenerated(updatedGenerated);
    localStorage.setItem("generatedScenarios", JSON.stringify(updatedGenerated));
    // For built-in ones, track as hidden
    const updatedHidden = [...hidden, id];
    setHidden(updatedHidden);
    localStorage.setItem("hiddenScenarios", JSON.stringify(updatedHidden));
  }

  async function generateMore(category: string) {
    setGenerating(category);
    const allInCategory = [
      ...TEMPLATES.filter((t) => t.category === category),
      ...generated.filter((t) => t.category === category),
    ];
    try {
      const res = await fetch("/api/generate-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, existingNames: allInCategory.map((t) => t.name), language }),
      });
      const data = await res.json();
      if (data.id) {
        const updated = [...generated, data];
        setGenerated(updated);
        localStorage.setItem("generatedScenarios", JSON.stringify(updated));
      } else if (res.status === 422) {
        // Off-topic generation — silently retry once
        setGenerating(null);
        generateMore(category);
        return;
      }
    } catch {}
    setGenerating(null);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "28px 20px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2a" }}>Fluent</div>
          {userName ? (
            <div style={{ color: "#1a1a2a", fontSize: 14, fontWeight: 600 }}>Hi, {userName} 👋</div>
          ) : (
            <div style={{ color: "#6b6b8a", fontSize: 14 }}>Pick a scenario and start talking</div>
          )}
        </div>
        <button onClick={() => router.push("/tasks")} style={{
          background: "#ffffff", border: `1px solid ${pendingTasks > 0 ? "#8b5cf6" : "#ece9ff"}`,
          borderRadius: 14, padding: "10px 16px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ color: "#1a1a2a", fontSize: 14, fontWeight: 600 }}>Tasks</span>
          {pendingTasks > 0 && (
            <span style={{ background: "#8b5cf6", color: "white", borderRadius: 10, padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>{pendingTasks}</span>
          )}
        </button>
      </div>

      {/* XP bar */}
      <div style={{ background: "#ffffff", borderRadius: 16, padding: "16px 20px", marginBottom: 28, border: "1px solid #ece9ff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#6b6b8a", fontSize: 13 }}>Level 2</span>
          <span style={{ color: "#f59e0b", fontWeight: 700 }}>{totalXP} / 500 XP</span>
        </div>
        <div style={{ background: "#f0eeff", borderRadius: 99, height: 8 }}>
          <div style={{ background: "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: 99, height: 8, width: `${Math.min((totalXP / 500) * 100, 100)}%`, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* Language picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        <span style={{ color: "#6b6b8a", fontSize: 13, fontWeight: 600 }}>Practice language:</span>
        <div style={{ display: "flex", background: "#f0eeff", borderRadius: 20, padding: 3, gap: 2 }}>
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => selectLanguage(l.code)} style={{
              background: language === l.code ? "#ffffff" : "transparent",
              border: language === l.code ? "1px solid #d4c9ff" : "1px solid transparent",
              borderRadius: 16, padding: "5px 14px", cursor: "pointer",
              fontSize: 13, fontWeight: language === l.code ? 700 : 500,
              color: language === l.code ? "#1a1a2a" : "#6b6b8a",
              display: "flex", alignItems: "center", gap: 5,
              boxShadow: language === l.code ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}>
              <span>{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Themes */}
      {Object.entries(THEMES).filter(([category]) => selectedThemes.length === 0 || selectedThemes.includes(category)).map(([category, theme]) => {
        const staticItems = TEMPLATES.filter((t) => t.category === category && !hidden.includes(t.id));
        const generatedItems = generated.filter((t) => t.category === category);
        const allItems = [...staticItems, ...generatedItems];
        return (
          <div key={category} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{theme.emoji}</span>
                <span style={{ color: "#1a1a2a", fontSize: 15, fontWeight: 700 }}>{theme.label}</span>
              </div>
              <button
                onClick={() => generateMore(category)}
                disabled={generating === category}
                style={{
                  background: generating === category ? "#f0eeff" : "#ffffff",
                  border: `1px solid ${theme.border}`,
                  borderRadius: 20, padding: "5px 14px", cursor: "pointer",
                  color: theme.accent, fontSize: 13, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: generating === category ? 0.7 : 1,
                }}
              >
                {generating === category ? (
                  <><span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${theme.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Creating...</>
                ) : (
                  <>＋ Generate more</>
                )}
              </button>
            </div>

            {allItems.length === 0 && (
              <div style={{ color: "#6b6b8a", fontSize: 14, padding: "16px 0", textAlign: "center" }}>
                No scenarios yet — tap Generate to create one
              </div>
            )}

            {allItems.map((t) => (
              <div key={t.id} style={{ position: "relative", marginBottom: 10 }}>
                <button onClick={() => router.push(`/session/${t.id}`)} style={{
                  width: "100%", background: "#ffffff",
                  border: "1px solid #ece9ff",
                  borderLeft: `4px solid ${theme.accent}`,
                  borderRadius: 16, padding: "18px 20px", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                  <div>
                    <div style={{ color: "#1a1a2a", fontSize: 16, fontWeight: 700, marginBottom: 3 }}>{t.name}</div>
                    <div style={{ color: "#6b6b8a", fontSize: 13 }}>with {t.persona} · {t.personaRole}</div>
                  </div>
                  <div style={{ color: theme.accent, fontSize: 22, paddingRight: 28 }}>→</div>
                </button>
                <button
                  onClick={() => deleteScenario(t.id)}
                  style={{
                    position: "absolute", top: 10, right: 10,
                    background: "transparent", border: "none",
                    color: "#ef4444", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1,
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        );
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
