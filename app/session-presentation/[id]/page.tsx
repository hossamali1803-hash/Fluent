"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Phase = "ready" | "presenting" | "transcribing" | "qa" | "done";
type QAStatus = "speaking" | "listening" | "processing";
interface Message { id: string; role: "user" | "assistant"; content: string; }

interface PresentationConfig {
  id: string; title: string; targetMinutes: number;
  hasQA: boolean; qaCount: number;
  fileContent?: string; language: string;
}

export default function PresentationSession() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [config, setConfig] = useState<PresentationConfig | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [qaMessages, setQaMessages] = useState<Message[]>([]);
  const [qaStatus, setQaStatus] = useState<QAStatus>("speaking");
  const [qaElapsed, setQaElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const qaHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const qaTurnRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadActiveRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const listeningRef = useRef(false);
  const sessionActiveRef = useRef(true);

  useEffect(() => {
    const raw = localStorage.getItem(`presentation-${id}`);
    if (raw) setConfig(JSON.parse(raw));
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [qaMessages, liveTranscript]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    cleanup();
  }, []);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (qaTimerRef.current) clearInterval(qaTimerRef.current);
    if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
    vadActiveRef.current = false;
    try { audioSourceRef.current?.stop(); } catch {}
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { mediaRecorderRef.current?.stop(); } catch {}
  }

  // ── PRESENTATION PHASE ──────────────────────────────────────────────
  async function beginPresenting() {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      await audioCtxRef.current.resume();
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

    // Timer
    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (config && next >= config.targetMinutes * 60) {
          clearInterval(timerRef.current!);
          donePresenting();
        }
        return next;
      });
    }, 1000);

    // Live level visualiser
    const ctx = audioCtxRef.current!;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      if (phase === "presenting" || true) {
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        setAudioLevel(Math.min(rms / 40, 1));
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  async function donePresenting() {
    if (timerRef.current) clearInterval(timerRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setPhase("transcribing");

    const mr = mediaRecorderRef.current;
    if (!mr) { finishWithoutQA(); return; }

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
      setTranscript(text ?? "");
      if (config?.hasQA && text?.trim()) {
        await startQA(text.trim());
      } else {
        finishWithoutQA(text ?? "");
      }
    } catch {
      finishWithoutQA();
    }
  }

  function finishWithoutQA(presentationText = "") {
    localStorage.setItem("debriefPending", JSON.stringify({
      history: [{ role: "user", content: presentationText || "Presentation completed." }],
      templateId: "presentation",
      templateName: config?.title ?? "Presentation",
      durationSeconds: elapsed,
    }));
    router.push("/debrief");
  }

  // ── Q&A PHASE ──────────────────────────────────────────────────────
  async function startQA(presentationText: string) {
    setPhase("qa");
    qaTimerRef.current = setInterval(() => setQaElapsed((s) => s + 1), 1000);
    setQaStatus("speaking");

    const fileNote = config?.fileContent
      ? `\n\nThe speaker also provided these notes:\n<<<${config.fileContent.slice(0, 2000)}>>>`
      : "";

    const systemPrompt = `You are an engaged audience member conducting Q&A after a presentation titled "${config?.title}".
The speaker said: <<<${presentationText.slice(0, 3000)}>>>${fileNote}

Ask exactly ${config?.qaCount ?? 3} insightful follow-up questions based on the presentation, one at a time.
Keep each question concise (under 20 words). After all ${config?.qaCount ?? 3} questions have been answered, say: "Thank you for your presentation. Great job."`;

    try {
      const res = await fetch("/api/conversation/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: "Please begin the Q&A.",
          history: [],
          templateId: "presentation",
          systemPrompt,
          turnNumber: 1,
          language: config?.language ?? "en",
        }),
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
          const buffer = await ctx.decodeAudioData(bytes.buffer);
          const source = ctx.createBufferSource();
          audioSourceRef.current = source;
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.onended = done;
          source.start(0);
        } catch {
          if (text) { window.speechSynthesis.cancel(); const utt = new SpeechSynthesisUtterance(text); utt.onend = done; utt.onerror = done; window.speechSynthesis.speak(utt); }
          else done();
        }
      } else if (text) {
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
      const stream = micStreamRef.current ?? await navigator.mediaDevices.getUserMedia({ audio: true });
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
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      function tick() {
        if (!vadActiveRef.current) return;
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        setAudioLevel(Math.min(rms / 40, 1));
        const isSpeaking = rms > 12;
        if (isSpeaking) {
          hasSpeechRef.current = true;
          if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
        } else if (hasSpeechRef.current && !vadTimerRef.current) {
          vadTimerRef.current = setTimeout(() => { if (vadActiveRef.current) stopQAAndSend(); }, 500);
        }
        requestAnimationFrame(tick);
      }
      setTimeout(() => requestAnimationFrame(tick), 150);
    } catch { setQaStatus("listening"); }
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

    const fileNote = config?.fileContent ? `\n\nThe speaker also provided these notes:\n<<<${config.fileContent.slice(0, 2000)}>>>` : "";
    const systemPrompt = `You are an engaged audience member conducting Q&A after a presentation titled "${config?.title}".
The speaker said: <<<${transcript.slice(0, 3000)}>>>${fileNote}
Ask exactly ${config?.qaCount ?? 3} insightful follow-up questions based on the presentation, one at a time.
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
      if (isDone) { await playAudioOnly(data.audioBase64, data.text); endQA(); }
      else await playAudio(data.audioBase64, data.text);
    } catch { endQA(); }
  }

  async function playAudioOnly(base64: string, text?: string) {
    return new Promise<void>(async (resolve) => {
      try {
        const ctx = audioCtxRef.current!;
        await ctx.resume();
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        const source = ctx.createBufferSource();
        source.buffer = buffer; source.connect(ctx.destination);
        source.onended = () => resolve(); source.start(0);
      } catch {
        if (text) { const utt = new SpeechSynthesisUtterance(text); utt.onend = () => resolve(); window.speechSynthesis.speak(utt); }
        else resolve();
      }
    });
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
      durationSeconds: elapsed + qaElapsed,
    }));
    router.push("/debrief");
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const remaining = config ? Math.max(0, config.targetMinutes * 60 - elapsed) : 0;
  const progress = config ? Math.min((elapsed / (config.targetMinutes * 60)) * 100, 100) : 0;

  if (!config) return <div style={{ minHeight: "100vh", background: "#f5f4ff" }} />;

  // ── READY ──
  if (phase === "ready") return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24, minHeight: "100vh" }}>
      <button onClick={() => router.push("/create/presentation")} style={{ alignSelf: "flex-start", background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a" }}>←</button>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🎤</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2a", marginBottom: 8 }}>{config.title}</div>
        <div style={{ color: "#6b6b8a", fontSize: 15 }}>{config.targetMinutes} min{config.hasQA ? ` · ${config.qaCount} Q&A questions after` : " · No Q&A"}</div>
      </div>
      <div style={{ background: "#fffbf0", borderRadius: 16, padding: "16px 20px", border: "1px solid #fde68a", width: "100%", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, color: "#1a1a2a", marginBottom: 6 }}>How it works</div>
        <div style={{ color: "#6b6b8a", fontSize: 14, lineHeight: 1.6 }}>
          1. Click Start — a timer begins<br />
          2. Present for up to {config.targetMinutes} minutes{remaining > 0 ? "" : ""}<br />
          3. Click "Done presenting" when finished{config.hasQA ? `\n4. AI asks ${config.qaCount} follow-up questions` : ""}
        </div>
      </div>
      <button
        onClick={beginPresenting}
        style={{ width: "100%", padding: "18px", borderRadius: 14, border: "none", background: "#f59e0b", color: "#0f0e17", fontSize: 18, fontWeight: 800, cursor: "pointer" }}
      >Start presentation</button>
    </div>
  );

  // ── PRESENTING ──
  if (phase === "presenting") return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#fffbf0" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #fde68a", background: "#ffffff", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2a" }}>{config.title}</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: remaining <= 30 ? "#ef4444" : "#f59e0b", fontVariant: "tabular-nums" }}>{fmt(remaining)}</div>
        </div>
        {/* Progress bar */}
        <div style={{ background: "#fde68a", borderRadius: 99, height: 6 }}>
          <div style={{ background: "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: 99, height: 6, width: `${progress}%`, transition: "width 1s linear" }} />
        </div>
      </div>

      {/* Centre — mic level */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, height: 60 }}>
          {[0.3, 0.6, 0.8, 1, 0.8, 0.6, 0.3].map((scale, i) => (
            <div key={i} style={{ width: 5, borderRadius: 99, background: "#f59e0b", height: `${10 + audioLevel * 50 * scale}px`, transition: "height 0.1s" }} />
          ))}
        </div>
        <div style={{ color: "#6b6b8a", fontSize: 14 }}>Elapsed: {fmt(elapsed)}</div>
        <div style={{ color: "#1a1a2a", fontWeight: 600, fontSize: 15 }}>You're presenting — take your time</div>
      </div>

      {/* Done button */}
      <div style={{ padding: "20px", background: "#ffffff", borderTop: "1px solid #fde68a", flexShrink: 0 }}>
        <button
          onClick={donePresenting}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "#f59e0b", color: "#0f0e17", fontSize: 16, fontWeight: 800, cursor: "pointer" }}
        >Done presenting{config.hasQA ? " — start Q&A" : " — finish"}</button>
      </div>
    </div>
  );

  // ── TRANSCRIBING ──
  if (phase === "transcribing") return (
    <div style={{ minHeight: "100vh", background: "#f5f4ff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 16, height: 16, border: "3px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "#6b6b8a", fontSize: 15 }}>Transcribing your presentation...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  // ── Q&A ──
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: qaStatus === "listening" ? "#f59e0b" : "#6b6b8a", fontSize: 13 }}>
          {qaStatus === "listening" && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {[0.3, 0.6, 1, 0.6, 0.3].map((scale, i) => (
                <div key={i} style={{ width: 3, borderRadius: 99, background: "#f59e0b", height: `${8 + audioLevel * 20 * scale}px`, transition: "height 0.1s" }} />
              ))}
            </div>
          )}
          {qaStatus === "speaking" ? "Audience is asking..." : qaStatus === "processing" ? liveTranscript || "Processing..." : "Listening — answer the question"}
        </div>
        {qaStatus === "listening" && (
          <button onClick={stopQAAndSend} style={{ marginTop: 10, width: "100%", background: "#f0eeff", border: "1px solid #d4c9ff", borderRadius: 12, padding: "12px", color: "#8b5cf6", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>Done answering ↑</button>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );

  return null;
}
