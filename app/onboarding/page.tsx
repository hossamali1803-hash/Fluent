"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/templates";

const ALL_THEMES = [
  { key: "daily",         emoji: "🌅", label: "Daily Life" },
  { key: "professional",  emoji: "💼", label: "Work" },
  { key: "social",        emoji: "🍽️", label: "Social" },
  { key: "travel",        emoji: "✈️", label: "Travel" },
  { key: "services",      emoji: "🛒", label: "Shopping & Services" },
  { key: "fitness",       emoji: "💪", label: "Health & Fitness" },
  { key: "food",          emoji: "🍔", label: "Food & Dining" },
  { key: "education",     emoji: "📚", label: "Education" },
  { key: "entertainment", emoji: "🎬", label: "Entertainment" },
];

const LANGUAGES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "German" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [themes, setThemes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function finish() {
    if (name.trim()) localStorage.setItem("userName", name.trim());
    localStorage.setItem("practiceLanguage", language);
    if (themes.length > 0) localStorage.setItem("selectedThemes", JSON.stringify(themes));
    localStorage.setItem("onboardingDone", "true");

    if (themes.length > 0) {
      setLoading(true);
      const existing: any[] = JSON.parse(localStorage.getItem("generatedScenarios") ?? "[]");
      const results = await Promise.allSettled(
        themes.map(async (category) => {
          const allInCategory = TEMPLATES.filter((t) => t.category === category);
          const res = await fetch("/api/generate-scenario", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category, existingNames: allInCategory.map((t) => t.name), language }),
          });
          if (res.ok) return res.json();
        })
      );
      const newScenarios = results
        .filter((r) => r.status === "fulfilled" && r.value?.id)
        .map((r) => (r as PromiseFulfilledResult<any>).value);
      if (newScenarios.length > 0) {
        localStorage.setItem("generatedScenarios", JSON.stringify([...existing, ...newScenarios]));
      }
    }

    router.push("/");
  }

  function toggleTheme(key: string) {
    setThemes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  const dots = (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 36 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: i === step ? 20 : 8,
            height: 8,
            borderRadius: 99,
            background: i === step ? "#8b5cf6" : "#ece9ff",
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#f5f4ff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          borderRadius: 24,
          border: "1px solid #ece9ff",
          boxShadow: "0 4px 24px rgba(139,92,246,0.08)",
          padding: "40px 32px 32px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 48, height: 48, border: "3px solid #ece9ff", borderTopColor: "#8b5cf6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a2a", marginBottom: 8 }}>Setting up your topics...</div>
            <div style={{ color: "#6b6b8a", fontSize: 14 }}>Creating personalised scenarios for you</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Step 0 — Name */}
        {!loading && step === 0 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2a", margin: "0 0 8px" }}>
                Welcome to Fluent
              </h1>
              <p style={{ color: "#6b6b8a", fontSize: 15, margin: "0 0 16px" }}>
                Practice real conversations with an AI that plays the other person — your trainer, your barista, your interviewer.
              </p>
              <div style={{ background: "#f0eeff", borderRadius: 12, padding: "10px 16px", display: "inline-block" }}>
                <span style={{ color: "#8b5cf6", fontSize: 13, fontWeight: 600 }}>No scripts. Just talk.</span>
              </div>
            </div>

            <label style={{ color: "#1a1a2a", fontSize: 14, fontWeight: 600, marginBottom: 8, display: "block" }}>
              What&apos;s your name?
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              onKeyDown={(e) => { if (e.key === "Enter") setStep(1); }}
              style={{
                width: "100%",
                border: "1px solid #ece9ff",
                borderRadius: 14,
                padding: "14px 16px",
                fontSize: 16,
                color: "#1a1a2a",
                background: "#f5f4ff",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 32,
              }}
            />

            {dots}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={finish}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #ece9ff",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  color: "#6b6b8a",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Skip
              </button>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 2,
                  background: "#f59e0b",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#0f0e17",
                  cursor: "pointer",
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* Step 1 — Language */}
        {!loading && step === 1 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🌍</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2a", margin: "0 0 8px" }}>
                What are you practising?
              </h1>
              <p style={{ color: "#6b6b8a", fontSize: 14, margin: 0 }}>
                The AI will speak in your target language the whole time — you practice by replying naturally.
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
              {LANGUAGES.map((l) => {
                const selected = language === l.code;
                return (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    style={{
                      flex: 1,
                      padding: "24px 16px",
                      borderRadius: 18,
                      border: selected ? "2px solid #8b5cf6" : "2px solid #ece9ff",
                      background: selected ? "#f0eeff" : "#f5f4ff",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 36 }}>{l.flag}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: selected ? "#8b5cf6" : "#1a1a2a" }}>
                      {l.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {dots}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep(0)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #ece9ff",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  color: "#6b6b8a",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ← Back
              </button>
              <button
                onClick={finish}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #ece9ff",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  color: "#6b6b8a",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Skip
              </button>
              <button
                onClick={() => setStep(2)}
                style={{
                  flex: 2,
                  background: "#f59e0b",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#0f0e17",
                  cursor: "pointer",
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Themes */}
        {!loading && step === 2 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2a", margin: "0 0 8px" }}>
                What topics interest you?
              </h1>
              <p style={{ color: "#6b6b8a", fontSize: 14, margin: 0 }}>
                After a conversation, you get feedback and tasks tailored to these topics.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                margin: "24px 0 32px",
              }}
            >
              {ALL_THEMES.map((t) => {
                const selected = themes.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTheme(t.key)}
                    style={{
                      padding: "16px 8px",
                      borderRadius: 16,
                      border: selected ? "2px solid #8b5cf6" : "2px solid #ece9ff",
                      background: selected ? "#f0eeff" : "#f5f4ff",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{t.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: selected ? "#8b5cf6" : "#6b6b8a", textAlign: "center", lineHeight: 1.2 }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {dots}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #ece9ff",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  color: "#6b6b8a",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ← Back
              </button>
              <button
                onClick={finish}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #ece9ff",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  color: "#6b6b8a",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Skip
              </button>
              <button
                onClick={finish}
                style={{
                  flex: 2,
                  background: "#f59e0b",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px 0",
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#0f0e17",
                  cursor: "pointer",
                }}
              >
                {themes.length > 0 ? "Let's go!" : "Let's go! →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
