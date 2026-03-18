"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface GeneratedTemplate {
  id: string; name: string; category: string;
  persona: string; personaRole: string;
  openers: string[]; systemPrompt: string; tier?: string;
}

const EXAMPLES = [
  "Negotiating a salary raise with my manager",
  "Asking my landlord to fix a broken heater",
  "Explaining a project delay to a client on a call",
  "Job interview for a marketing position",
  "Returning a faulty product at a store",
  "Describing symptoms to a doctor",
];

export default function CreateConversationPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenario, setScenario] = useState<GeneratedTemplate | null>(null);
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

  async function generate() {
    if (!description.trim()) { setError("Describe your scenario first."); return; }
    setError("");
    setIsGenerating(true);
    setScenario(null);
    try {
      const language = localStorage.getItem("practiceLanguage") ?? "en";
      const res = await fetch("/api/generate-scenario/from-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), language }),
      });
      if (!res.ok) throw new Error();
      setScenario(await res.json());
    } catch { setError("Couldn't generate. Try rephrasing."); }
    setIsGenerating(false);
  }

  function startPractice() {
    if (!scenario) return;
    const existing: GeneratedTemplate[] = JSON.parse(localStorage.getItem("generatedScenarios") ?? "[]");
    localStorage.setItem("generatedScenarios", JSON.stringify([...existing, scenario]));
    router.push(`/session/${scenario.id}`);
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push("/")} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a", padding: "0 4px 0 0" }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2a" }}>💬 Conversation</div>
          <div style={{ color: "#6b6b8a", fontSize: 13 }}>Describe the situation — we'll build it</div>
        </div>
      </div>

      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", overflow: "hidden", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. I need to negotiate a salary raise with my manager, or I'm at a doctor's appointment explaining my symptoms"
          disabled={isRecording || isTranscribing}
          style={{ width: "100%", minHeight: 110, padding: "16px", border: "none", outline: "none", resize: "none", fontSize: 15, lineHeight: 1.5, color: "#1a1a2a", background: "transparent", boxSizing: "border-box", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px 14px" }}>
          <span style={{ color: isRecording ? "#ef4444" : isTranscribing ? "#f59e0b" : "#6b6b8a", fontSize: 13 }}>
            {isRecording ? "● Recording..." : isTranscribing ? "Transcribing..." : "or speak your scenario"}
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
        onClick={generate}
        disabled={isGenerating || isRecording || isTranscribing}
        style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: isGenerating ? "#f0eeff" : "#8b5cf6", color: isGenerating ? "#6b6b8a" : "#ffffff", fontSize: 16, fontWeight: 800, cursor: isGenerating ? "default" : "pointer", marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (isRecording || isTranscribing) ? 0.5 : 1 }}
      >
        {isGenerating ? (<><Spinner color="#6b6b8a" /> Building your scenario...</>) : "✨ Generate scenario"}
      </button>

      {scenario && (
        <div style={{ background: "#ffffff", borderRadius: 20, border: "1px solid #d4c9ff", padding: 22, marginBottom: 28, boxShadow: "0 2px 8px rgba(139,92,246,0.08)" }}>
          <div style={{ color: "#8b5cf6", fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 14 }}>Your scenario</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{scenario.persona[0]}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a2a" }}>{scenario.name}</div>
              <div style={{ color: "#6b6b8a", fontSize: 13 }}>with {scenario.persona} · {scenario.personaRole}</div>
            </div>
          </div>
          <div style={{ background: "#f5f4ff", borderRadius: 12, padding: "12px 14px", marginBottom: 20, borderLeft: "3px solid #8b5cf6" }}>
            <div style={{ color: "#6b6b8a", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Opening line</div>
            <div style={{ color: "#1a1a2a", fontSize: 14, lineHeight: 1.5, fontStyle: "italic" }}>"{scenario.openers[0]}"</div>
          </div>
          <button onClick={startPractice} style={{ width: "100%", background: "#8b5cf6", color: "#ffffff", border: "none", borderRadius: 14, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 8 }}>Start practice</button>
          <button onClick={generate} style={{ width: "100%", background: "transparent", color: "#6b6b8a", border: "none", borderRadius: 14, padding: "10px", fontSize: 14, cursor: "pointer" }}>Regenerate</button>
        </div>
      )}

      {!scenario && (
        <div>
          <div style={{ color: "#6b6b8a", fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Examples</div>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setDescription(ex)} style={{ width: "100%", background: "#ffffff", border: "1px solid #ece9ff", borderRadius: 12, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 8, textAlign: "left", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span style={{ color: "#6b6b8a", fontSize: 14 }}>{ex}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner({ color = "#ffffff" }: { color?: string }) {
  return <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${color}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}
