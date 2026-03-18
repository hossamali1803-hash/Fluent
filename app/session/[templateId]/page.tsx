"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TEMPLATES } from "@/lib/templates";

interface Message { id: string; role: "user" | "assistant"; content: string; }
type Status = "idle" | "loading" | "speaking" | "listening" | "processing";

export default function SessionPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const router = useRouter();
  const staticTemplate = TEMPLATES.find((t) => t.id === templateId);
  const generated = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("generatedScenarios") ?? "[]") : [];
  const template = staticTemplate ?? generated.find((t: any) => t.id === templateId) ?? TEMPLATES[0];

  const language = typeof window !== "undefined" ? (localStorage.getItem("practiceLanguage") ?? "en") : "en";
  const userName = typeof window !== "undefined" ? (localStorage.getItem("userName") ?? "") : "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showEnd, setShowEnd] = useState(false);

  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const turnRef = useRef(0);
  const elapsedRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionActiveRef = useRef(true);
  const listeningRef = useRef(false);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadActiveRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, liveTranscript]);

  function startTimer() {
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed((s) => s + 1);
    }, 1000);
  }

  async function startSession() {
    // Unlock audio during user gesture — required on both iOS and Android
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      await audioCtxRef.current!.resume();
    } catch {}
    // iOS silence trick to force speaker routing
    const silence = document.createElement("audio");
    silence.setAttribute("playsinline", "");
    silence.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhgCenp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6e//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAUHAAAAAAAAg4bNTQAA";
    silence.play().catch(() => {});
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    setStatus("loading");
    startTimer();
    const res = await fetch("/api/conversation/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id, openers: template.openers, language, userName: userName || undefined }),
    });
    const data = await res.json();
    const msg: Message = { id: "0", role: "assistant", content: data.text };
    setMessages([msg]);
    historyRef.current = [{ role: "assistant", content: data.text }];
    await playAudio(data.audioBase64, data.text);
  }

  function playAudio(base64: string, text?: string): Promise<void> {
    return new Promise(async (resolve) => {
      setStatus("speaking");
      const done = () => { resolve(); if (sessionActiveRef.current) startListening(); };
      if (base64) {
        try {
          // Use AudioContext — always routes to speaker on iOS, not earpiece
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
          // Fallback to HTMLAudioElement
          const audio = document.createElement("audio");
          audio.setAttribute("playsinline", "");
          audio.src = `data:audio/mpeg;base64,${base64}`;
          audioRef.current = audio;
          audio.onended = done;
          audio.onerror = done;
          audio.play().catch(done);
        }
      } else if (text) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = "en-US";
        utt.rate = 0.92;
        utt.onend = done;
        utt.onerror = done;
        window.speechSynthesis.speak(utt);
      } else {
        done();
      }
    });
  }

  async function startListening() {
    if (!sessionActiveRef.current || listeningRef.current) return;
    listeningRef.current = true;
    setStatus("listening");
    setLiveTranscript("");
    setAudioLevel(0);
    audioChunksRef.current = [];
    hasSpeechRef.current = false;
    vadActiveRef.current = true;

    try {
      if (!micStreamRef.current) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const stream = micStreamRef.current;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();

      // VAD — analyse mic levels to auto-detect end of speech
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
          vadTimerRef.current = setTimeout(() => {
            if (vadActiveRef.current) stopAndSend();
          }, 500);
        }
        requestAnimationFrame(tick);
      }
      // Short warmup delay so analyser is ready before we start detecting
      setTimeout(() => requestAnimationFrame(tick), 150);
    } catch { setStatus("listening"); }
  }

  async function stopAndSend() {
    listeningRef.current = false;
    vadActiveRef.current = false;
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    setAudioLevel(0);
    const mr = mediaRecorderRef.current;
    if (!mr) { startListening(); return; }
    setStatus("processing");
    setLiveTranscript("Transcribing...");

    await new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
      mr.stop();
    });
    mediaRecorderRef.current = null;

    const mimeType = audioChunksRef.current[0]?.type || "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    audioChunksRef.current = [];

    const form = new FormData();
    form.append("audio", blob);
    form.append("language", language);
    try {
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const { text } = await res.json();
      setLiveTranscript("");
      if (text?.trim()) sendTurn(text.trim());
      else startListening();
    } catch {
      setLiveTranscript("");
      startListening();
    }
  }

  async function sendTurn(userText: string) {
    setStatus("processing");
    setLiveTranscript("");
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: userText };
    setMessages((prev) => [...prev, userMsg]);
    historyRef.current = [...historyRef.current, { role: "user", content: userText }];
    turnRef.current += 1;

    try {
      const res = await fetch("/api/conversation/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: userText,
          history: historyRef.current.slice(0, -1),
          templateId: template.id,
          turnNumber: turnRef.current,
          systemPrompt: template.systemPrompt,
          language,
          userName: userName || undefined,
        }),
      });
      const data = await res.json();
      const aiMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: data.text };
      setMessages((prev) => [...prev, aiMsg]);
      historyRef.current = [...historyRef.current, { role: "assistant", content: data.text }];
      await playAudio(data.audioBase64, data.text);
    } catch (e) {
      console.error(e);
      setStatus("listening");
      startListening();
    }
  }

  function stopEverything() {
    sessionActiveRef.current = false;
    listeningRef.current = false;
    vadActiveRef.current = false;
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    // Stop AudioContext source (main audio playback path)
    try { audioSourceRef.current?.stop(); } catch {}
    audioSourceRef.current = null;
    // Stop HTMLAudioElement fallback
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    window.speechSynthesis.cancel();
    // Stop mic
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function endSession() {
    stopEverything();
    localStorage.setItem("debriefPending", JSON.stringify({
      history: historyRef.current,
      templateId: template.id,
      templateName: template.name,
      durationSeconds: elapsedRef.current,
    }));
    router.push("/debrief");
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const statusLabel: Record<Status, string> = {
    idle: "",
    loading: "Starting...",
    speaking: `${template.persona} is speaking...`,
    processing: "Processing...",
    listening: "Listening...",
  };

  const conversationStarted = status === "speaking" || status === "listening" || status === "processing";

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#f5f4ff" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #ece9ff", background: "#ffffff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => { if (conversationStarted) setShowEnd(true); else router.push("/"); }}
                style={{ background: "transparent", border: "none", color: "#6b6b8a", fontSize: 20, cursor: "pointer", padding: "0 8px 0 0" }}
          >←</button>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f0e17", fontWeight: 800, fontSize: 16 }}>
            {template.persona[0]}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2a" }}>{template.persona}</div>
            <div style={{ color: "#6b6b8a", fontSize: 12 }}>{template.personaRole}</div>
          </div>
        </div>
        <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 16 }}>{fmt(elapsed)}</div>
        <button
          onClick={() => setShowEnd(true)}
          disabled={status === "idle" || status === "loading"}
          style={{ background: "transparent", border: "1px solid #ef444440", color: "#ef4444", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600, opacity: status === "idle" || status === "loading" ? 0.4 : 1 }}
        >End</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
        {status === "idle" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, paddingBottom: 40 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f0e17", fontWeight: 800, fontSize: 28 }}>
              {template.persona[0]}
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2a" }}>{template.name}</div>
              <div style={{ color: "#6b6b8a", fontSize: 14, marginTop: 4 }}>with {template.persona} · {template.personaRole}</div>
            </div>
            <button
              onClick={startSession}
              style={{ background: "#f59e0b", color: "#0f0e17", border: "none", borderRadius: 14, padding: "16px 40px", fontSize: 17, fontWeight: 800, cursor: "pointer", marginTop: 8 }}
            >Start conversation</button>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isAI = msg.role === "assistant";
              return (
                <div key={msg.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end" }}>
                  <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>
                    {isAI ? template.persona.toUpperCase() : "YOU"}
                  </div>
                  <div style={{
                    maxWidth: "80%",
                    background: isAI ? "#ffffff" : "#f0eeff",
                    borderRadius: 16, borderTopLeftRadius: isAI ? 4 : 16, borderTopRightRadius: isAI ? 16 : 4,
                    padding: "12px 16px",
                    border: `1px solid ${isAI ? "#ece9ff" : "#d4c9ff"}`,
                    fontSize: 15, lineHeight: 1.5, color: "#1a1a2a",
                  }}>{msg.content}</div>
                </div>
              );
            })}
            {status === "processing" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>{template.persona.toUpperCase()}</div>
                <div style={{ background: "#ffffff", borderRadius: 16, borderTopLeftRadius: 4, padding: "14px 18px", border: "1px solid #ece9ff", display: "inline-flex", gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#ece9ff", animation: `pulse 1s ${i * 0.25}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Bottom bar */}
      {status !== "idle" && (
        <div style={{ padding: "16px 20px 24px", borderTop: "1px solid #ece9ff", background: "#ffffff", flexShrink: 0 }}>
          {liveTranscript && status === "listening" && (
            <div style={{ background: "#f0eeff", border: "1px solid #d4c9ff", borderRadius: 12, padding: "10px 14px", marginBottom: 12, color: "#6b6b8a", fontSize: 14, fontStyle: "italic" }}>
              {liveTranscript}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: status === "listening" ? "#f59e0b" : "#6b6b8a", fontSize: 13 }}>
              {status === "listening" && (
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {[0.3, 0.6, 1, 0.6, 0.3].map((scale, i) => (
                    <div key={i} style={{
                      width: 3, borderRadius: 99, background: "#f59e0b",
                      height: `${8 + audioLevel * 20 * scale}px`,
                      transition: "height 0.1s",
                    }} />
                  ))}
                </div>
              )}
              {statusLabel[status]}
            </div>
            {status === "listening" && (
              <button onClick={stopAndSend} style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "#f0eeff", border: "1px solid #d4c9ff",
                color: "#8b5cf6", fontSize: 18, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>↑</button>
            )}
          </div>
        </div>
      )}

      {/* End modal */}
      {showEnd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: "#ffffff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 440, border: "1px solid #ece9ff" }}>
            <h2 style={{ textAlign: "center", margin: "0 0 8px", color: "#1a1a2a" }}>End session?</h2>
            <p style={{ color: "#6b6b8a", textAlign: "center", marginBottom: 28 }}>You'll get a full debrief with scores and feedback.</p>
            <button
              onClick={endSession}
              style={{ width: "100%", background: "#ef4444", color: "white", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}
            >End & see results</button>
            <button
              onClick={() => setShowEnd(false)}
              style={{ width: "100%", background: "#f0eeff", color: "#1a1a2a", border: "1px solid #d4c9ff", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}
            >Keep going</button>
            <button
              onClick={() => { stopEverything(); router.push("/"); }}
              style={{ width: "100%", background: "transparent", color: "#6b6b8a", border: "none", borderRadius: 14, padding: 12, fontSize: 14, cursor: "pointer" }}
            >Discard & go home</button>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
