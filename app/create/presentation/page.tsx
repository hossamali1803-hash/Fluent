"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatePresentationPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [hasQA, setHasQA] = useState(true);
  const [qaCount, setQaCount] = useState(3);
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (file.size > 500_000) { setFileError("File too large (max 500 KB plain text)."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setFileContent(text);
      setFileName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    };
    reader.onerror = () => setFileError("Couldn't read file.");
    reader.readAsText(file);
  }

  function start() {
    if (!title.trim()) return;
    const id = `presentation-${Date.now()}`;
    const config = {
      id, title: title.trim(), targetMinutes, hasQA, qaCount,
      fileContent: fileContent || undefined,
      language: localStorage.getItem("practiceLanguage") ?? "en",
    };
    localStorage.setItem(`presentation-${id}`, JSON.stringify(config));
    router.push(`/session-presentation/${id}`);
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push("/create")} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a", padding: "0 4px 0 0" }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2a" }}>🎤 Presentation</div>
          <div style={{ color: "#6b6b8a", fontSize: 13 }}>Set up your timed presentation</div>
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Presentation title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Q3 Sales Review, My Research Project"
          style={inputStyle}
        />
      </div>

      {/* Target time */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", padding: "20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <label style={labelStyle}>Target time</label>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
          <input
            type="range" min={1} max={30} value={targetMinutes}
            onChange={(e) => setTargetMinutes(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#f59e0b" }}
          />
          <div style={{ background: "#fffbf0", border: "1px solid #fde68a", borderRadius: 10, padding: "6px 14px", minWidth: 60, textAlign: "center" }}>
            <span style={{ color: "#f59e0b", fontWeight: 800, fontSize: 18 }}>{targetMinutes}</span>
            <span style={{ color: "#6b6b8a", fontSize: 13 }}> min</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: "#6b6b8a", fontSize: 11 }}>1 min</span>
          <span style={{ color: "#6b6b8a", fontSize: 11 }}>30 min</span>
        </div>
      </div>

      {/* Q&A toggle */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", padding: "20px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasQA ? 16 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15 }}>Q&A after presentation</div>
            <div style={{ color: "#6b6b8a", fontSize: 13 }}>AI asks follow-up questions based on what you said</div>
          </div>
          <button
            onClick={() => setHasQA(!hasQA)}
            style={{ width: 48, height: 28, borderRadius: 99, background: hasQA ? "#f59e0b" : "#e5e7eb", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: 3, left: hasQA ? 22 : 3, width: 22, height: 22, borderRadius: "50%", background: "#ffffff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "block" }} />
          </button>
        </div>
        {hasQA && (
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>Number of questions</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setQaCount(n)}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${qaCount === n ? "#f59e0b" : "#ece9ff"}`, background: qaCount === n ? "#fffbf0" : "#ffffff", color: qaCount === n ? "#f59e0b" : "#6b6b8a", fontWeight: qaCount === n ? 800 : 500, fontSize: 15, cursor: "pointer" }}
                >{n}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* File upload (optional) */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", padding: "20px", marginBottom: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15, marginBottom: 4 }}>Upload notes <span style={{ color: "#6b6b8a", fontWeight: 500, fontSize: 13 }}>(optional)</span></div>
        <div style={{ color: "#6b6b8a", fontSize: 13, marginBottom: 14 }}>A plain text file with your notes — helps the AI ask better questions</div>
        {fileName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf9", border: "1px solid #a7f3d0", borderRadius: 12, padding: "12px 14px" }}>
            <span style={{ fontSize: 18 }}>📄</span>
            <span style={{ color: "#1a1a2a", fontSize: 14, fontWeight: 600, flex: 1 }}>{fileName}</span>
            <button onClick={() => { setFileName(""); setFileContent(""); }} style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: 16, cursor: "pointer" }}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: "100%", background: "#f5f4ff", border: "1.5px dashed #d4c9ff", borderRadius: 12, padding: "14px", cursor: "pointer", color: "#8b5cf6", fontSize: 14, fontWeight: 600 }}
          >＋ Upload .txt file</button>
        )}
        {fileError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{fileError}</div>}
        <input ref={fileRef} type="file" accept=".txt,.md" style={{ display: "none" }} onChange={handleFileUpload} />
      </div>

      <button
        onClick={start}
        disabled={!title.trim()}
        style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: title.trim() ? "#f59e0b" : "#f0eeff", color: title.trim() ? "#0f0e17" : "#6b6b8a", fontSize: 17, fontWeight: 800, cursor: title.trim() ? "pointer" : "default" }}
      >Start presentation</button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { color: "#1a1a2a", fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid #ece9ff", fontSize: 15, color: "#1a1a2a", background: "#ffffff", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
