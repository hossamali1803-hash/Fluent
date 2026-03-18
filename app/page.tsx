"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LANGUAGES = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "German" },
];

const MODES = [
  {
    key: "conversation",
    emoji: "💬",
    title: "Conversation",
    desc: "Practice a real-life dialogue — any situation, any person",
    examples: "Salary negotiation · Doctor visit · Client call",
    href: "/create/conversation",
    accent: "#8b5cf6",
    bg: "#f5f4ff",
    border: "#d4c9ff",
  },
  {
    key: "presentation",
    emoji: "🎤",
    title: "Presentation",
    desc: "Deliver a timed talk with optional Q&A after",
    examples: "Set your target time · Add follow-up questions",
    href: "/create/presentation",
    accent: "#f59e0b",
    bg: "#fffbf0",
    border: "#fde68a",
  },
  {
    key: "interview",
    emoji: "🎯",
    title: "Interview",
    desc: "Practice interview questions one by one at your own pace",
    examples: "Generate questions · Or write your own",
    href: "/create/interview",
    accent: "#10b981",
    bg: "#f0fdf9",
    border: "#a7f3d0",
  },
];

export default function Home() {
  const router = useRouter();
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    if (!localStorage.getItem("onboardingDone")) {
      router.push("/onboarding");
      return;
    }
    setLanguage(localStorage.getItem("practiceLanguage") ?? "en");
  }, [router]);

  function selectLanguage(code: string) {
    setLanguage(code);
    localStorage.setItem("practiceLanguage", code);
  }

  function reset() {
    if (confirm("Clear all data and restart onboarding?")) {
      localStorage.clear();
      router.push("/onboarding");
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#1a1a2a", marginBottom: 6 }}>Fluent</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2a", marginBottom: 4 }}>What are you practising?</div>
          <div style={{ color: "#6b6b8a", fontSize: 14 }}>Choose a format to get started</div>
        </div>
        <button onClick={reset} title="Reset / restart onboarding" style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#d4c9ff", padding: 4 }}>⚙️</button>
      </div>

      {/* Language picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <span style={{ color: "#6b6b8a", fontSize: 13, fontWeight: 600 }}>Practising:</span>
        <div style={{ display: "flex", background: "#f0eeff", borderRadius: 20, padding: 3, gap: 2 }}>
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={() => selectLanguage(l.code)} style={{ background: language === l.code ? "#ffffff" : "transparent", border: language === l.code ? "1px solid #d4c9ff" : "1px solid transparent", borderRadius: 16, padding: "5px 14px", cursor: "pointer", fontSize: 13, fontWeight: language === l.code ? 700 : 500, color: language === l.code ? "#1a1a2a" : "#6b6b8a", display: "flex", alignItems: "center", gap: 5, boxShadow: language === l.code ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              <span>{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => router.push(m.href)}
            style={{
              width: "100%", background: m.bg, border: `1.5px solid ${m.border}`,
              borderRadius: 20, padding: "22px 20px", cursor: "pointer",
              display: "flex", alignItems: "flex-start", gap: 18, textAlign: "left",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "#ffffff", border: `1.5px solid ${m.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
              {m.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#1a1a2a", marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: 14, color: "#6b6b8a", lineHeight: 1.4, marginBottom: 8 }}>{m.desc}</div>
              <div style={{ fontSize: 12, color: m.accent, fontWeight: 600 }}>{m.examples}</div>
            </div>
            <span style={{ color: m.accent, fontSize: 20, paddingTop: 2, flexShrink: 0 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
