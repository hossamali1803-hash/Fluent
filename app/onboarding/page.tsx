"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const LANGUAGES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "German" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");

  function finish() {
    if (name.trim()) localStorage.setItem("userName", name.trim());
    localStorage.setItem("practiceLanguage", language);
    localStorage.setItem("onboardingDone", "true");
    router.push("/");
  }

  const dots = (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 36 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 99, background: i === step ? "#8b5cf6" : "#ece9ff", transition: "all 0.3s" }} />
      ))}
    </div>
  );

  return (
    <div style={{ minHeight: "100dvh", background: "#f5f4ff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#ffffff", borderRadius: 24, border: "1px solid #ece9ff", boxShadow: "0 4px 24px rgba(139,92,246,0.08)", padding: "40px 32px 32px", display: "flex", flexDirection: "column" }}>

        {/* Step 0 — Name */}
        {step === 0 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎙️</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2a", margin: "0 0 8px" }}>Welcome to Fluent</h1>
              <p style={{ color: "#6b6b8a", fontSize: 15, margin: "0 0 16px" }}>
                Practice real conversations with an AI that plays the other person — your trainer, your barista, your interviewer.
              </p>
              <div style={{ background: "#f0eeff", borderRadius: 12, padding: "10px 16px", display: "inline-block" }}>
                <span style={{ color: "#8b5cf6", fontSize: 13, fontWeight: 600 }}>No scripts. Just talk.</span>
              </div>
            </div>

            <label style={{ color: "#1a1a2a", fontSize: 14, fontWeight: 600, marginBottom: 8, display: "block" }}>What&apos;s your name?</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              onKeyDown={(e) => { if (e.key === "Enter") setStep(1); }}
              style={{ width: "100%", border: "1px solid #ece9ff", borderRadius: 14, padding: "14px 16px", fontSize: 16, color: "#1a1a2a", background: "#f5f4ff", outline: "none", boxSizing: "border-box", marginBottom: 32 }}
            />

            {dots}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={finish} style={{ flex: 1, background: "transparent", border: "1px solid #ece9ff", borderRadius: 14, padding: "14px 0", fontSize: 15, color: "#6b6b8a", cursor: "pointer", fontWeight: 600 }}>Skip</button>
              <button onClick={() => setStep(1)} style={{ flex: 2, background: "#f59e0b", border: "none", borderRadius: 14, padding: "14px 0", fontSize: 15, fontWeight: 800, color: "#0f0e17", cursor: "pointer" }}>Next →</button>
            </div>
          </>
        )}

        {/* Step 1 — Language */}
        {step === 1 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🌍</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2a", margin: "0 0 8px" }}>What language are you practising?</h1>
              <p style={{ color: "#6b6b8a", fontSize: 14, margin: 0 }}>The AI will speak in your target language the whole time.</p>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
              {LANGUAGES.map((l) => {
                const selected = language === l.code;
                return (
                  <button key={l.code} onClick={() => setLanguage(l.code)} style={{ flex: 1, padding: "24px 16px", borderRadius: 18, border: selected ? "2px solid #8b5cf6" : "2px solid #ece9ff", background: selected ? "#f0eeff" : "#f5f4ff", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 36 }}>{l.flag}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: selected ? "#8b5cf6" : "#1a1a2a" }}>{l.label}</span>
                  </button>
                );
              })}
            </div>

            {dots}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(0)} style={{ flex: 1, background: "transparent", border: "1px solid #ece9ff", borderRadius: 14, padding: "14px 0", fontSize: 15, color: "#6b6b8a", cursor: "pointer", fontWeight: 600 }}>← Back</button>
              <button onClick={finish} style={{ flex: 2, background: "#f59e0b", border: "none", borderRadius: 14, padding: "14px 0", fontSize: 15, fontWeight: 800, color: "#0f0e17", cursor: "pointer" }}>Let&apos;s go! →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
