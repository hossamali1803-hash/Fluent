"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setPresentationFile } from "@/lib/presentationFile";

export default function CreatePresentationPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(5);
  const [hasQA, setHasQA] = useState(true);
  const [qaCount, setQaCount] = useState(3);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (!file.type.includes("pdf")) { setFileError("Please upload a PDF file."); return; }
    if (file.size > 50_000_000) { setFileError("File too large (max 50 MB)."); return; }
    setLoadingPdf(true);
    setPdfFile(file);
    setPresentationFile(file);
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));
    // Count pages
    try {
      const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.5.207/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      setSlideCount(pdf.numPages);
    } catch { setSlideCount(null); }
    setLoadingPdf(false);
  }

  function removePdf() {
    setPdfFile(null);
    setSlideCount(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function start() {
    if (!title.trim()) return;
    const id = `presentation-${Date.now()}`;
    const config = {
      id, title: title.trim(), targetMinutes, hasQA, qaCount,
      hasPdf: !!pdfFile,
      slideCount: slideCount ?? undefined,
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

      {/* PDF upload — primary CTA */}
      <div style={{ background: "#ffffff", borderRadius: 18, border: "1.5px solid #ece9ff", padding: "22px", marginBottom: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15, marginBottom: 4 }}>Upload your presentation</div>
        <div style={{ color: "#6b6b8a", fontSize: 13, marginBottom: 16 }}>We'll show your slides full-screen so you can present just like in a real meeting</div>

        {pdfFile ? (
          <div style={{ background: "#f0fdf9", border: "1.5px solid #a7f3d0", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>📊</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#1a1a2a", fontWeight: 700, fontSize: 14 }}>{pdfFile.name}</div>
              <div style={{ color: "#6b6b8a", fontSize: 12, marginTop: 2 }}>
                {loadingPdf ? "Counting slides..." : slideCount ? `${slideCount} slides · ${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB`}
              </div>
            </div>
            <button onClick={removePdf} style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer" }}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            style={{ width: "100%", background: "#f5f4ff", border: "2px dashed #d4c9ff", borderRadius: 14, padding: "22px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
          >
            <span style={{ fontSize: 32 }}>📂</span>
            <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15 }}>Upload PDF</span>
            <span style={{ color: "#6b6b8a", fontSize: 12 }}>Max 50 MB</span>
          </button>
        )}
        {fileError && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{fileError}</div>}
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={handlePdfUpload} />
      </div>

      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Presentation title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 Sales Review, Research Findings" style={inputStyle} />
      </div>

      {/* Target time */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", padding: "18px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <label style={labelStyle}>Target time</label>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
          <input type="range" min={1} max={30} value={targetMinutes} onChange={(e) => setTargetMinutes(Number(e.target.value))} style={{ flex: 1, accentColor: "#f59e0b" }} />
          <div style={{ background: "#fffbf0", border: "1px solid #fde68a", borderRadius: 10, padding: "6px 14px", minWidth: 60, textAlign: "center" }}>
            <span style={{ color: "#f59e0b", fontWeight: 800, fontSize: 18 }}>{targetMinutes}</span>
            <span style={{ color: "#6b6b8a", fontSize: 13 }}> min</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ color: "#6b6b8a", fontSize: 11 }}>1 min</span>
          <span style={{ color: "#6b6b8a", fontSize: 11 }}>30 min</span>
        </div>
      </div>

      {/* Q&A toggle */}
      <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #ece9ff", padding: "18px", marginBottom: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasQA ? 16 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15 }}>Q&A after presentation</div>
            <div style={{ color: "#6b6b8a", fontSize: 13 }}>AI asks follow-up questions based on what you said</div>
          </div>
          <button
            onClick={() => setHasQA(!hasQA)}
            style={{ width: 48, height: 28, borderRadius: 99, background: hasQA ? "#f59e0b" : "#e5e7eb", border: "none", cursor: "pointer", position: "relative", flexShrink: 0 }}
          >
            <span style={{ position: "absolute", top: 3, left: hasQA ? 22 : 3, width: 22, height: 22, borderRadius: "50%", background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "block", transition: "left 0.2s" }} />
          </button>
        </div>
        {hasQA && (
          <div>
            <label style={{ ...labelStyle, marginBottom: 8 }}>Number of questions</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[3, 4, 5].map((n) => (
                <button key={n} onClick={() => setQaCount(n)} style={{ flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${qaCount === n ? "#f59e0b" : "#ece9ff"}`, background: qaCount === n ? "#fffbf0" : "#ffffff", color: qaCount === n ? "#f59e0b" : "#6b6b8a", fontWeight: qaCount === n ? 800 : 500, fontSize: 15, cursor: "pointer" }}>{n}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={start}
        disabled={!title.trim() || loadingPdf}
        style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: title.trim() && !loadingPdf ? "#f59e0b" : "#f0eeff", color: title.trim() && !loadingPdf ? "#0f0e17" : "#6b6b8a", fontSize: 17, fontWeight: 800, cursor: title.trim() && !loadingPdf ? "pointer" : "default" }}
      >{pdfFile ? "Start with slides" : "Start presentation"}</button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { color: "#1a1a2a", fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid #ece9ff", fontSize: 15, color: "#1a1a2a", background: "#ffffff", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
