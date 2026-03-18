"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPresentationFile, clearPresentationFile } from "@/lib/presentationFile";

type Phase = "ready" | "presenting" | "transcribing" | "qa" | "done";
type QAStatus = "speaking" | "listening" | "processing";
interface Message { id: string; role: "user" | "assistant"; content: string; }
interface PresentationConfig {
  id: string; title: string; targetMinutes: number;
  hasQA: boolean; qaCount: number;
  hasPdf: boolean; slideCount?: number; language: string;
}

export default function PresentationSession() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [config, setConfig] = useState<PresentationConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [totalSlides, setTotalSlides] = useState(0);
  const [renderingSlide, setRenderingSlide] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Recording state
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState("");

  // Q&A state
  const [qaMessages, setQaMessages] = useState<Message[]>([]);
  const [qaStatus, setQaStatus] = useState<QAStatus>("speaking");
  const [qaElapsed, setQaElapsed] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const qaHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const qaTurnRef = useRef(0);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadActiveRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const listeningRef = useRef(false);
  const sessionActiveRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem(`presentation-${id}`);
    if (raw) {
      const cfg = JSON.parse(raw) as PresentationConfig;
      setConfig(cfg);
      if (cfg.hasPdf) {
        setPdfLoading(true);
        loadPdf(cfg);
      }
    }
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [qaMessages]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    cleanup();
    clearPresentationFile(); // async, fire-and-forget on unmount
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "presenting") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") nextSlide();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prevSlide();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, currentSlide, totalSlides]);

  // ── PDF ──────────────────────────────────────────────────────────────
  async function loadPdf(cfg: PresentationConfig) {
    // Safety net: never block the start button for more than 10 seconds
    const giveUp = setTimeout(() => {
      setConfig((c) => c ? { ...c, hasPdf: false } : c);
      setPdfLoading(false);
    }, 10000);
    try {
      const file = await getPresentationFile();
      if (!file) {
        setConfig({ ...cfg, hasPdf: false });
        clearTimeout(giveUp);
        setPdfLoading(false);
        return;
      }
      const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
      const arrayBuffer = await file.arrayBuffer();
      const doc = await getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(doc);
      setTotalSlides(doc.numPages);
    } catch (e) {
      console.error("[loadPdf]", e);
      setConfig((c) => c ? { ...c, hasPdf: false } : c);
    }
    clearTimeout(giveUp);
    setPdfLoading(false);
  }

  const renderPage = useCallback(async (doc: any, pageNum: number) => {
    if (!doc || !canvasRef.current) return;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
    }
    setRenderingSlide(true);
    try {
      const page = await doc.getPage(pageNum);
      const canvas = canvasRef.current;
      const container = canvas.parentElement;
      const maxW = container?.clientWidth ?? window.innerWidth;
      const maxH = container?.clientHeight ?? window.innerHeight;
      const vp0 = page.getViewport({ scale: 1 });
      const scale = Math.min(maxW / vp0.width, maxH / vp0.height) * 0.98;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.error("[renderPage]", e);
    }
    setRenderingSlide(false);
  }, []);

  useEffect(() => {
    if (pdfDoc && phase === "presenting") renderPage(pdfDoc, currentSlide);
  }, [pdfDoc, currentSlide, phase, renderPage]);

  function nextSlide() {
    setCurrentSlide((s) => Math.min(s + 1, totalSlides));
  }
  function prevSlide() {
    setCurrentSlide((s) => Math.max(s - 1, 1));
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────
  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (qaTimerRef.current) clearInterval(qaTimerRef.current);
    if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
    vadActiveRef.current = false;
    try { audioSourceRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { mediaRecorderRef.current?.stop(); } catch {}
  }

  // ── PRESENT ───────────────────────────────────────────────────────────
  async function beginPresenting() {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      await audioCtxRef.current!.resume();
    } catch {}

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const mr = new MediaRecorder(stream, { mimeType });
    audioChunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setPhase("presenting");
    setCurrentSlide(1);

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed((s) => {
        const next = s + 1;
        if (config && next >= config.targetMinutes * 60) {
          clearInterval(timerRef.current!);
          donePresenting();
        }
        return next;
      });
    }, 1000);

    // Mic level visualiser
    const ctx = audioCtxRef.current!;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let animating = true;
    function tick() {
      if (!animating) return;
      analyser.getByteFrequencyData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      setAudioLevel(Math.min(rms / 40, 1));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    // Stop animation when phase changes
    const stop = () => { animating = false; };
    (window as any).__stopLevelTick = stop;
  }

  async function donePresenting() {
    if (timerRef.current) clearInterval(timerRef.current);
    (window as any).__stopLevelTick?.();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setPhase("transcribing");

    const mr = mediaRecorderRef.current;
    if (!mr || audioChunksRef.current.length === 0) { finishWithoutQA(""); return; }
    await new Promise<void>((resolve) => { mr.onstop = () => resolve(); mr.stop(); });
    mediaRecorderRef.current = null;

    const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type ?? "audio/webm" });
    audioChunksRef.current = [];
    const form = new FormData();
    form.append("audio", blob);
    form.append("language", config?.language ?? "en");

    try {
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const { text } = await res.json();
      const t = text ?? "";
      setTranscript(t);
      if (config?.hasQA && t.trim()) await startQA(t.trim());
      else finishWithoutQA(t);
    } catch { finishWithoutQA(""); }
  }

  function finishWithoutQA(presentationText = "") {
    localStorage.setItem("debriefPending", JSON.stringify({
      history: [{ role: "user", content: presentationText || "Presentation completed." }],
      templateId: "presentation",
      templateName: config?.title ?? "Presentation",
      durationSeconds: elapsedRef.current,
    }));
    router.push("/debrief");
  }

  // ── Q&A ──────────────────────────────────────────────────────────────
  async function startQA(presentationText: string) {
    setPhase("qa");
    qaTimerRef.current = setInterval(() => setQaElapsed((s) => s + 1), 1000);
    setQaStatus("speaking");

    const systemPrompt = `You are an engaged audience member conducting Q&A after a presentation titled "${config?.title}".
The speaker said: <<<${presentationText.slice(0, 3000)}>>>
Ask exactly ${config?.qaCount ?? 3} insightful follow-up questions based on the presentation, one at a time.
Keep each question concise (under 20 words). After all ${config?.qaCount ?? 3} questions have been answered, say: "Thank you for your presentation. Great job."`;

    try {
      const res = await fetch("/api/conversation/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "Please begin the Q&A.", history: [], templateId: "presentation", systemPrompt, turnNumber: 1, language: config?.language ?? "en" }),
      });
      const data = await res.json();
      const msg: Message = { id: "qa-0", role: "assistant", content: data.text };
      setQaMessages([msg]);
      qaHistoryRef.current = [{ role: "assistant", content: data.text }];
      qaTurnRef.current = 1;
      await playAudio(data.audioBase64, data.text);
    } catch { endQA(); }
  }

  async function playAudio(base64: string, text?: string): Promise<void> {
    return new Promise(async (resolve) => {
      setQaStatus("speaking");
      const done = () => { resolve(); if (sessionActiveRef.current) startQAListening(); };
      if (base64) {
        try {
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
          }
          const ctx = audioCtxRef.current!;
          await ctx.resume();
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const buf = await ctx.decodeAudioData(bytes.buffer);
          const src = ctx.createBufferSource();
          audioSourceRef.current = src;
          src.buffer = buf; src.connect(ctx.destination);
          src.onended = done; src.start(0); return;
        } catch {}
      }
      if (text) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = config?.language === "de" ? "de-DE" : "en-US";
        utt.onend = done; utt.onerror = done;
        window.speechSynthesis.speak(utt);
      } else done();
    });
  }

  async function startQAListening() {
    if (!sessionActiveRef.current || listeningRef.current) return;
    listeningRef.current = true;
    setQaStatus("listening");
    setLiveTranscript("");
    hasSpeechRef.current = false;
    vadActiveRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        if (!vadActiveRef.current) return;
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        setAudioLevel(Math.min(rms / 40, 1));
        const speaking = rms > 12;
        if (speaking) {
          hasSpeechRef.current = true;
          if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
        } else if (hasSpeechRef.current && !vadTimerRef.current) {
          vadTimerRef.current = setTimeout(() => { if (vadActiveRef.current) stopQAAndSend(); }, 500);
        }
        requestAnimationFrame(tick);
      }
      setTimeout(() => requestAnimationFrame(tick), 150);
    } catch {}
  }

  async function stopQAAndSend() {
    listeningRef.current = false;
    vadActiveRef.current = false;
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    setAudioLevel(0);
    const mr = mediaRecorderRef.current;
    if (!mr) { startQAListening(); return; }
    setQaStatus("processing");
    setLiveTranscript("Transcribing...");
    await new Promise<void>((resolve) => { mr.onstop = () => resolve(); mr.stop(); });
    mediaRecorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    const blob = new Blob(audioChunksRef.current, { type: audioChunksRef.current[0]?.type ?? "audio/webm" });
    audioChunksRef.current = [];
    const form = new FormData();
    form.append("audio", blob);
    form.append("language", config?.language ?? "en");
    try {
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const { text } = await res.json();
      setLiveTranscript("");
      if (text?.trim()) await sendQATurn(text.trim());
      else startQAListening();
    } catch { setLiveTranscript(""); startQAListening(); }
  }

  async function sendQATurn(userText: string) {
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: userText };
    setQaMessages((prev) => [...prev, userMsg]);
    qaHistoryRef.current = [...qaHistoryRef.current, { role: "user", content: userText }];
    qaTurnRef.current += 1;

    const systemPrompt = `You are an engaged audience member conducting Q&A after a presentation titled "${config?.title}".
The speaker said: <<<${transcript.slice(0, 3000)}>>>
Ask exactly ${config?.qaCount ?? 3} insightful follow-up questions, one at a time.
Keep each question concise (under 20 words). After all ${config?.qaCount ?? 3} questions have been answered, say: "Thank you for your presentation. Great job."`;

    try {
      const res = await fetch("/api/conversation/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: userText, history: qaHistoryRef.current.slice(0, -1), templateId: "presentation", systemPrompt, turnNumber: qaTurnRef.current, language: config?.language ?? "en" }),
      });
      const data = await res.json();
      const aiMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: data.text };
      setQaMessages((prev) => [...prev, aiMsg]);
      qaHistoryRef.current = [...qaHistoryRef.current, { role: "assistant", content: data.text }];
      const isDone = data.text?.toLowerCase().includes("thank you for your presentation");
      if (isDone) {
        await new Promise<void>(async (resolve) => {
          if (data.audioBase64) {
            const ctx = audioCtxRef.current!;
            await ctx.resume();
            const binary = atob(data.audioBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const buf = await ctx.decodeAudioData(bytes.buffer);
            const src = ctx.createBufferSource();
            src.buffer = buf; src.connect(ctx.destination);
            src.onended = () => resolve(); src.start(0);
          } else resolve();
        });
        endQA();
      } else {
        await playAudio(data.audioBase64, data.text);
      }
    } catch { endQA(); }
  }

  function endQA() {
    sessionActiveRef.current = false;
    cleanup();
    const allHistory = [
      { role: "user" as const, content: transcript || "Presentation completed." },
      ...qaHistoryRef.current,
    ];
    localStorage.setItem("debriefPending", JSON.stringify({
      history: allHistory,
      templateId: "presentation",
      templateName: config?.title ?? "Presentation",
      durationSeconds: elapsedRef.current + qaElapsed,
    }));
    router.push("/debrief");
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const remaining = config ? Math.max(0, config.targetMinutes * 60 - elapsed) : 0;
  const progress = config ? Math.min((elapsed / (config.targetMinutes * 60)) * 100, 100) : 0;

  if (!config) return <div style={{ minHeight: "100vh", background: "#f5f4ff" }} />;

  // ── READY ─────────────────────────────────────────────────────────────
  if (phase === "ready") return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <button onClick={() => router.push("/create/presentation")} style={{ alignSelf: "flex-start", background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a" }}>←</button>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🎤</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2a", marginBottom: 6 }}>{config.title}</div>
        <div style={{ color: "#6b6b8a", fontSize: 14 }}>
          {config.targetMinutes} min{config.hasQA ? ` · ${config.qaCount} Q&A questions` : ""}
          {pdfLoading ? " · Loading slides..." : pdfDoc ? ` · ${totalSlides} slides` : ""}
        </div>
      </div>
      <div style={{ background: "#fffbf0", borderRadius: 14, padding: "14px 18px", border: "1px solid #fde68a", width: "100%", boxSizing: "border-box" }}>
        <div style={{ color: "#6b6b8a", fontSize: 13, lineHeight: 1.7 }}>
          {config.hasPdf && pdfDoc ? (
            <>📊 Your slides will appear full-screen<br />Use <strong>← →</strong> keys or buttons to navigate<br />Recording runs in the background</>
          ) : (
            <>Present for up to {config.targetMinutes} minutes<br />Click "Done" when finished{config.hasQA ? ` · Then ${config.qaCount} Q&A questions` : ""}</>
          )}
        </div>
      </div>
      <button
        onClick={beginPresenting}
        disabled={pdfLoading}
        style={{ width: "100%", padding: "18px", borderRadius: 14, border: "none", background: pdfLoading ? "#f0eeff" : "#f59e0b", color: pdfLoading ? "#6b6b8a" : "#0f0e17", fontSize: 18, fontWeight: 800, cursor: pdfLoading ? "default" : "pointer" }}
      >{pdfLoading ? "Loading slides..." : pdfDoc ? "Start with slides" : "Start presentation"}</button>
    </div>
  );

  // ── PRESENTING WITH PDF ───────────────────────────────────────────────
  if (phase === "presenting" && pdfDoc) return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#0f0e17" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "rgba(0,0,0,0.85)", flexShrink: 0, zIndex: 10 }}>
        <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 14, maxWidth: "40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{config.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Mic level */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {[0.5, 0.8, 1, 0.8, 0.5].map((scale, i) => (
              <div key={i} style={{ width: 3, borderRadius: 99, background: "#f59e0b", height: `${4 + audioLevel * 14 * scale}px`, transition: "height 0.08s" }} />
            ))}
          </div>
          {/* Timer */}
          <div style={{ color: remaining <= 60 ? "#ef4444" : "#f59e0b", fontWeight: 800, fontSize: 16, fontVariant: "tabular-nums", minWidth: 52 }}>{fmt(remaining)}</div>
          <button
            onClick={donePresenting}
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >End</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.1)", flexShrink: 0 }}>
        <div style={{ height: 3, background: "#f59e0b", width: `${progress}%`, transition: "width 1s linear" }} />
      </div>

      {/* Slide canvas */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ maxWidth: "100%", maxHeight: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", opacity: renderingSlide ? 0.7 : 1, transition: "opacity 0.15s" }}
        />
        {renderingSlide && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 20, height: 20, border: "3px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        )}
        {/* Side nav arrows */}
        {currentSlide > 1 && (
          <button onClick={prevSlide} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#ffffff", width: 44, height: 44, borderRadius: "50%", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        )}
        {currentSlide < totalSlides && (
          <button onClick={nextSlide} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", color: "#ffffff", width: 44, height: 44, borderRadius: "50%", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 16px", background: "rgba(0,0,0,0.85)", flexShrink: 0 }}>
        <button onClick={prevSlide} disabled={currentSlide === 1} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: currentSlide === 1 ? "rgba(255,255,255,0.3)" : "#ffffff", borderRadius: 8, padding: "8px 16px", cursor: currentSlide === 1 ? "default" : "pointer", fontSize: 14 }}>← Prev</button>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>
          {currentSlide} / {totalSlides}
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginLeft: 8 }}>← → keys</span>
        </div>
        {currentSlide < totalSlides ? (
          <button onClick={nextSlide} style={{ background: "#f59e0b", border: "none", color: "#0f0e17", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Next →</button>
        ) : (
          <button onClick={donePresenting} style={{ background: "#f59e0b", border: "none", color: "#0f0e17", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Done ✓</button>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  // ── PRESENTING WITHOUT PDF ────────────────────────────────────────────
  if (phase === "presenting") return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#fffbf0" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #fde68a", background: "#ffffff", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2a" }}>{config.title}</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: remaining <= 30 ? "#ef4444" : "#f59e0b", fontVariant: "tabular-nums" }}>{fmt(remaining)}</div>
        </div>
        <div style={{ background: "#fde68a", borderRadius: 99, height: 6 }}>
          <div style={{ background: "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: 99, height: 6, width: `${progress}%`, transition: "width 1s linear" }} />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 60 }}>
          {[0.3, 0.6, 0.8, 1, 0.8, 0.6, 0.3].map((scale, i) => (
            <div key={i} style={{ width: 5, borderRadius: 99, background: "#f59e0b", height: `${10 + audioLevel * 50 * scale}px`, transition: "height 0.1s" }} />
          ))}
        </div>
        <div style={{ color: "#6b6b8a", fontSize: 14 }}>Elapsed: {fmt(elapsed)}</div>
      </div>
      <div style={{ padding: "20px", background: "#ffffff", borderTop: "1px solid #fde68a", flexShrink: 0 }}>
        <button onClick={donePresenting} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "#f59e0b", color: "#0f0e17", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          Done presenting{config.hasQA ? " — start Q&A" : ""}
        </button>
      </div>
    </div>
  );

  // ── TRANSCRIBING ──────────────────────────────────────────────────────
  if (phase === "transcribing") return (
    <div style={{ minHeight: "100vh", background: "#f5f4ff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 16, height: 16, border: "3px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "#6b6b8a", fontSize: 15 }}>Transcribing your presentation...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  // ── Q&A ──────────────────────────────────────────────────────────────
  if (phase === "qa") return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#f5f4ff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #ece9ff", background: "#ffffff", flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15 }}>Q&A — {config.title}</div>
          <div style={{ color: "#6b6b8a", fontSize: 12 }}>Audience questions</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#6b6b8a", fontSize: 14, fontVariant: "tabular-nums" }}>{fmt(qaElapsed)}</div>
          <button onClick={endQA} style={{ background: "transparent", border: "1px solid #ef444440", color: "#ef4444", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>End</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
        {qaMessages.map((msg) => {
          const isAI = msg.role === "assistant";
          return (
            <div key={msg.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end" }}>
              <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>{isAI ? "AUDIENCE" : "YOU"}</div>
              <div style={{ maxWidth: "80%", background: isAI ? "#ffffff" : "#fffbf0", borderRadius: 16, borderTopLeftRadius: isAI ? 4 : 16, borderTopRightRadius: isAI ? 16 : 4, padding: "12px 16px", border: `1px solid ${isAI ? "#ece9ff" : "#fde68a"}`, fontSize: 15, lineHeight: 1.5, color: "#1a1a2a" }}>{msg.content}</div>
            </div>
          );
        })}
        {qaStatus === "processing" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>AUDIENCE</div>
            <div style={{ background: "#ffffff", borderRadius: 16, borderTopLeftRadius: 4, padding: "14px 18px", border: "1px solid #ece9ff", display: "inline-flex", gap: 6 }}>
              {[0, 1, 2].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#ece9ff", animation: `pulse 1s ${i * 0.25}s infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: "14px 20px 24px", borderTop: "1px solid #ece9ff", background: "#ffffff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: qaStatus === "listening" ? 10 : 0 }}>
          {qaStatus === "listening" && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {[0.3, 0.6, 1, 0.6, 0.3].map((scale, i) => (
                <div key={i} style={{ width: 3, borderRadius: 99, background: "#f59e0b", height: `${8 + audioLevel * 20 * scale}px`, transition: "height 0.1s" }} />
              ))}
            </div>
          )}
          <div style={{ color: qaStatus === "listening" ? "#f59e0b" : "#6b6b8a", fontSize: 13 }}>
            {qaStatus === "speaking" ? "Audience is asking..." : qaStatus === "processing" ? liveTranscript || "Processing..." : "Listening..."}
          </div>
        </div>
        {qaStatus === "listening" && (
          <button onClick={stopQAAndSend} style={{ width: "100%", background: "#f0eeff", border: "1px solid #d4c9ff", borderRadius: 12, padding: "12px", color: "#8b5cf6", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Done answering ↑</button>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );

  return null;
}
