"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "generate" | "custom";

export default function CreateInterviewPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("generate");

  // Generate tab
  const [description, setDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<string[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());

  // Custom tab
  const [customText, setCustomText] = useState("");

  const [error, setError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

  async function toggleRecording() {
    if (isRecording) stopRecording(); else await startRecording();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch { setError("Microphone access denied."); }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    setIsRecording(false);
    setIsTranscribing(true);
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type ?? "audio/webm" });
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      audioChunksRef.current = [];
      const form = new FormData();
      form.append("audio", blob);
      form.append("language", "en");
      try {
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const { text } = await res.json();
        if (text?.trim()) setDescription((prev) => prev ? `${prev} ${text.trim()}` : text.trim());
      } catch {}
      setIsTranscribing(false);
    };
    mr.stop();
  }

  async function generateQuestions() {
    if (!description.trim()) { setError("Describe the interview first."); return; }
    setError("");
    setIsGenerating(true);
    setGeneratedQuestions([]);
    setSelectedQuestions(new Set());
    try {
      const language = localStorage.getItem("practiceLanguage") ?? "en";
      const res = await fetch("/api/generate-interview-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), language }),
      });
      if (!res.ok) throw new Error();
      const { questions } = await res.json();
      setGeneratedQuestions(questions);
      setSelectedQuestions(new Set(questions.map((_: string, i: number) => i)));
    } catch { setError("Couldn't generate questions. Try again."); }
    setIsGenerating(false);
  }

  function toggleQuestion(i: number) {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function startPractice() {
    let questions: string[] = [];
    if (tab === "generate") {
      questions = generatedQuestions.filter((_, i) => selectedQuestions.has(i));
    } else {
      questions = customText.split("\n").map((l) => l.trim()).filter(Boolean);
    }
    if (questions.length === 0) { setError("Add at least one question."); return; }

    const id = `interview-${Date.now()}`;
    const config = {
      id,
      title: description.trim() || "Interview Practice",
      questions,
      language: localStorage.getItem("practiceLanguage") ?? "en",
    };
    localStorage.setItem(`interview-${id}`, JSON.stringify(config));
    router.push(`/session-interview/${id}`);
  }

  const canStart = tab === "generate"
    ? selectedQuestions.size > 0
    : customText.split("\n").some((l) => l.trim());

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push("/")} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a", padding: "0 4px 0 0" }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2a" }}>🎯 Interview</div>
          <div style={{ color: "#6b6b8a", fontSize: 13 }}>Practice questions one by one</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#f0eeff", borderRadius: 14, padding: 4, marginBottom: 24, gap: 4 }}>
        {(["generate", "custom"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(""); }}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: tab === t ? "#ffffff" : "transparent", color: tab === t ? "#1a1a2a" : "#6b6b8a", fontWeight: tab === t ? 700 : 500, fontSize: 14, cursor: "pointer", boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
          >{t === "generate" ? "✨ Generate questions" : "✏️ Write my own"}</button>
        ))}
      </div>

      {tab === "generate" ? (
        <>
          {/* Description */}
          <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", overflow: "hidden", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Senior software engineer interview at a fintech startup, or Product manager role at an e-commerce company"
              disabled={isRecording || isTranscribing}
              style={{ width: "100%", minHeight: 100, padding: "16px", border: "none", outline: "none", resize: "none", fontSize: 15, lineHeight: 1.5, color: "#1a1a2a", background: "transparent", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 14px" }}>
              <span style={{ color: isRecording ? "#ef4444" : isTranscribing ? "#f59e0b" : "#6b6b8a", fontSize: 13 }}>
                {isRecording ? "● Recording..." : isTranscribing ? "Transcribing..." : "or describe by voice"}
              </span>
              <button
                onClick={toggleRecording}
                disabled={isTranscribing}
                style={{ width: 38, height: 38, borderRadius: "50%", background: isRecording ? "#ef4444" : "#f0eeff", border: isRecording ? "none" : "1px solid #d4c9ff", cursor: isTranscribing ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: isTranscribing ? 0.5 : 1 }}
              >{isRecording ? "⏹" : "🎙️"}</button>
            </div>
          </div>

          {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <button
            onClick={generateQuestions}
            disabled={isGenerating || isRecording || isTranscribing}
            style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: isGenerating ? "#f0eeff" : "#10b981", color: isGenerating ? "#6b6b8a" : "#ffffff", fontSize: 15, fontWeight: 700, cursor: isGenerating ? "default" : "pointer", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {isGenerating ? (<><Spinner color="#6b6b8a" /> Generating 10 questions...</>) : "Generate questions"}
          </button>

          {generatedQuestions.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ color: "#1a1a2a", fontWeight: 700, fontSize: 15 }}>Select questions to practice</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setSelectedQuestions(new Set(generatedQuestions.map((_, i) => i)))} style={{ background: "transparent", border: "none", color: "#10b981", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>All</button>
                  <button onClick={() => setSelectedQuestions(new Set())} style={{ background: "transparent", border: "none", color: "#6b6b8a", fontSize: 12, cursor: "pointer" }}>None</button>
                </div>
              </div>
              {generatedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => toggleQuestion(i)}
                  style={{ width: "100%", background: selectedQuestions.has(i) ? "#f0fdf9" : "#ffffff", border: `1.5px solid ${selectedQuestions.has(i) ? "#10b981" : "#ece9ff"}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8, textAlign: "left" }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: selectedQuestions.has(i) ? "#10b981" : "#f0eeff", border: `1.5px solid ${selectedQuestions.has(i) ? "#10b981" : "#d4c9ff"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {selectedQuestions.has(i) && <span style={{ color: "#ffffff", fontSize: 12, fontWeight: 800 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ color: "#6b6b8a", fontSize: 11, fontWeight: 600, marginBottom: 3 }}>Q{i + 1}</div>
                    <div style={{ color: "#1a1a2a", fontSize: 14, lineHeight: 1.4 }}>{q}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <div style={{ color: "#6b6b8a", fontSize: 13, marginBottom: 10 }}>One question per line</div>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={"Tell me about yourself.\nWhat's your greatest strength?\nWhere do you see yourself in 5 years?"}
            style={{ width: "100%", minHeight: 240, padding: "16px", border: "1px solid #ece9ff", borderRadius: 16, outline: "none", resize: "vertical", fontSize: 15, lineHeight: 1.8, color: "#1a1a2a", background: "#ffffff", boxSizing: "border-box", fontFamily: "inherit", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          />
          {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      )}

      {canStart && (
        <button
          onClick={startPractice}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "#10b981", color: "#ffffff", fontSize: 17, fontWeight: 800, cursor: "pointer", marginTop: 24 }}
        >
          Start interview ({tab === "generate" ? selectedQuestions.size : customText.split("\n").filter((l) => l.trim()).length} questions)
        </button>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function Spinner({ color = "#ffffff" }: { color?: string }) {
  return <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}
