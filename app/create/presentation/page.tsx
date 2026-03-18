"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSlideImages, clearSlides } from "@/lib/presentationFile";

export default function CreatePresentationPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(3);
  const [hasQA, setHasQA] = useState(true);
  const [qaCount, setQaCount] = useState(3);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [fileError, setFileError] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (!file.type.includes("pdf")) { setFileError("Please upload a PDF file."); return; }
    if (file.size > 50_000_000) { setFileError("File too large (max 50 MB)."); return; }
    setLoadingPdf(true);
    setRenderProgress(0);
    setPdfFile(file);
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));

    try {
      const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");

      // Use static worker file committed to /public — guarantees exact version
      // match with the bundled library, and avoids cross-origin restrictions.
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const total = pdf.numPages;
      setSlideCount(total);

      const blobs: Blob[] = [];
      const pageTexts: string[] = [];
      const offscreen = document.createElement("canvas");

      for (let p = 1; p <= total; p++) {
        setRenderProgress(p);
        const page = await pdf.getPage(p);

        // Extract text content for Q&A context
        try {
          const textContent = await page.getTextContent();
          const pageText = (textContent.items as any[]).map((item) => item.str ?? "").join(" ").trim();
          if (pageText) pageTexts.push(`[Slide ${p}] ${pageText}`);
        } catch {}

        const vp0 = page.getViewport({ scale: 1 });
        const scale = Math.min(1280 / vp0.width, 720 / vp0.height);
        const vp = page.getViewport({ scale });
        offscreen.width = Math.round(vp.width);
        offscreen.height = Math.round(vp.height);
        const ctx = offscreen.getContext("2d")!;
        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        await (page.render({ canvasContext: ctx, viewport: vp }) as any).promise;
        const blob = await new Promise<Blob>((res, rej) =>
          offscreen.toBlob((b) => b ? res(b) : rej(new Error("toBlob")), "image/jpeg", 0.85)
        );
        blobs.push(blob);
      }

      await saveSlideImages(blobs);
      // Store slide text so Q&A can reference PDF content
      if (pageTexts.length > 0) {
        localStorage.setItem("presentationSlideText", pageTexts.join("\n"));
      }
    } catch (err) {
      console.error("[PDF]", err);
      const msg = err instanceof Error ? err.message : String(err);
      setFileError(`PDF error: ${msg}`);
      setPdfFile(null);
      setSlideCount(null);
    }

    setLoadingPdf(false);
    setRenderProgress(0);
  }

  function removePdf() {
    setPdfFile(null);
    setSlideCount(null);
    if (fileRef.current) fileRef.current.value = "";
    clearSlides();
    localStorage.removeItem("presentationSlideText");
  }

  function start() {
    if (!title.trim()) return;
    const id = `presentation-${Date.now()}`;
    const config = {
      id, title: title.trim(), targetMinutes, hasQA, qaCount,
      hasPdf: !!pdfFile && !!slideCount,
      slideCount: slideCount ?? undefined,
      language: localStorage.getItem("practiceLanguage") ?? "en",
    };
    localStorage.setItem(`presentation-${id}`, JSON.stringify(config));
    router.push(`/session-presentation/${id}`);
  }

  const loadingLabel = loadingPdf
    ? (slideCount && renderProgress > 0
        ? `Rendering slide ${renderProgress} / ${slideCount}…`
        : "Loading PDF…")
    : null;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push("/create")} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a", padding: "0 4px 0 0" }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2a" }}>🎤 Presentation</div>
          <div style={{ color: "#6b6b8a", fontSize: 13 }}>Set up your timed presentation</div>
        </div>
      </div>

      {/* PDF upload */}
      <div style={{ background: "#ffffff", borderRadius: 18, border: "1.5px solid #ece9ff", padding: "22px", marginBottom: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15, marginBottom: 4 }}>Upload your presentation</div>
        <div style={{ color: "#6b6b8a", fontSize: 13, marginBottom: 16 }}>We'll show your slides full-screen so you can present just like in a real meeting</div>

        {pdfFile ? (
          <div style={{ background: "#f0fdf9", border: "1.5px solid #a7f3d0", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>📊</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#1a1a2a", fontWeight: 700, fontSize: 14 }}>{pdfFile.name}</div>
                <div style={{ color: "#6b6b8a", fontSize: 12, marginTop: 2 }}>
                  {loadingLabel ?? (slideCount ? `${slideCount} slides · ${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB`)}
                </div>
              </div>
              {!loadingPdf && (
                <button onClick={removePdf} style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer" }}>✕</button>
              )}
            </div>
            {loadingPdf && slideCount && slideCount > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ background: "#e6f7f1", borderRadius: 99, height: 6 }}>
                  <div style={{ background: "#10b981", borderRadius: 99, height: 6, width: `${(renderProgress / slideCount) * 100}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <button onClick={() => setTargetMinutes((m) => Math.max(1, m - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid #fde68a", background: "#fffbf0", color: "#f59e0b", fontSize: 20, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
          <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#fffbf0", border: "1.5px solid #fde68a", borderRadius: 12, overflow: "hidden" }}>
            <input
              type="number" min={1} max={120} value={targetMinutes}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setTargetMinutes(Math.max(1, Math.min(120, v))); }}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", textAlign: "center", fontSize: 22, fontWeight: 800, color: "#f59e0b", padding: "8px 0", fontFamily: "inherit", MozAppearance: "textfield" } as React.CSSProperties}
            />
            <span style={{ color: "#6b6b8a", fontSize: 14, paddingRight: 14 }}>min</span>
          </div>
          <button onClick={() => setTargetMinutes((m) => Math.min(120, m + 1))} style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid #fde68a", background: "#fffbf0", color: "#f59e0b", fontSize: 20, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
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
      >{pdfFile ? (loadingPdf ? "Preparing slides…" : "Start with slides") : "Start presentation"}</button>
    </div>
  );
}

const labelStyle: React.CSSProperties = { color: "#1a1a2a", fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "13px 14px", borderRadius: 12, border: "1px solid #ece9ff", fontSize: 15, color: "#1a1a2a", background: "#ffffff", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
