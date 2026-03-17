"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Task {
  id: string; title: string; why: string; cue: string;
  skillType?: "vocabulary" | "grammar" | "structure" | "fluency";
  targetWords?: string[];
  templateName: string; xpReward: number; status: "pending" | "completed";
  stars?: number; createdAt: string;
}
interface Message { id: string; role: "user" | "assistant"; content: string; }
type Stage = "ready" | "speaking" | "listening" | "processing" | "assessing" | "result";

function Stars({ count, size = 36 }: { count: number; size?: number }) {
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      {[1,2,3,4,5].map((i) => (
        <span key={i} style={{ fontSize: size, filter: i <= count ? "none" : "grayscale(1) opacity(0.2)" }}>⭐</span>
      ))}
    </div>
  );
}

export default function TaskPracticePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const language = typeof window !== "undefined" ? (localStorage.getItem("practiceLanguage") ?? "en") : "en";
  const [task, setTask] = useState<Task | null>(null);
  const [stage, setStage] = useState<Stage>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [toFiveStars, setToFiveStars] = useState("");
  const [xpEarned, setXpEarned] = useState(0);
  const [turnNumber, setTurnNumber] = useState(0);

  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadActiveRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tasks: Task[] = JSON.parse(localStorage.getItem("tasks") ?? "[]");
    const found = tasks.find((t) => t.id === id);
    if (!found) { router.push("/tasks"); return; }
    setTask(found);
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function startSession() {
    if (!task) return;
    const silence = document.createElement("audio");
    silence.setAttribute("playsinline", "");
    silence.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhgCenp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6enp6e//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAUHAAAAAAAAg4bNTQAA";
    silence.play().catch(() => {});
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    setStage("processing");
    const res = await fetch("/api/task/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskTitle: task.title, why: task.why, cue: task.cue, targetWords: task.targetWords, language }),
    });
    const data = await res.json();
    const msg: Message = { id: "0", role: "assistant", content: data.text };
    setMessages([msg]);
    historyRef.current = [{ role: "assistant", content: data.text }];
    await playAudioThenListen(data.audioBase64, data.text);
  }

  function playAudioThenListen(base64: string, text: string): Promise<void> {
    return new Promise(async (resolve) => {
      setStage("speaking");
      const done = () => { resolve(); startListening(); };
      if (base64) {
        try {
          if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
            audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
          }
          const ctx = audioCtxRef.current;
          await ctx.resume();
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const buffer = await ctx.decodeAudioData(bytes.buffer);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.onended = done;
          source.start(0);
        } catch {
          const audio = document.createElement("audio");
          audio.setAttribute("playsinline", "");
          audio.src = `data:audio/mpeg;base64,${base64}`;
          audio.onended = done; audio.onerror = done;
          audio.play().catch(done);
        }
      } else {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = "en-US"; utt.rate = 0.92;
        utt.onend = done; utt.onerror = done;
        window.speechSynthesis.speak(utt);
      }
    });
  }

  async function startListening() {
    setStage("listening");
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

      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
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
        if (rms > 12) {
          hasSpeechRef.current = true;
          if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
        } else if (hasSpeechRef.current && !vadTimerRef.current) {
          vadTimerRef.current = setTimeout(() => {
            if (vadActiveRef.current) stopAndSend();
          }, 500);
        }
        requestAnimationFrame(tick);
      }
      setTimeout(() => requestAnimationFrame(tick), 150);
    } catch { setStage("listening"); }
  }

  async function stopAndSend() {
    if (!task) return;
    vadActiveRef.current = false;
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    setAudioLevel(0);
    const mr = mediaRecorderRef.current;
    if (!mr) { startListening(); return; }
    setStage("processing");
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
      const sttRes = await fetch("/api/stt", { method: "POST", body: form });
      const { text: userText } = await sttRes.json();
      setLiveTranscript("");
      if (!userText?.trim()) { startListening(); return; }

      const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: userText };
      setMessages((prev) => [...prev, userMsg]);
      historyRef.current = [...historyRef.current, { role: "user", content: userText }];
      const newTurn = turnNumber + 1;
      setTurnNumber(newTurn);

      const res = await fetch("/api/task/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyRef.current, taskTitle: task.title, why: task.why, cue: task.cue, targetWords: task.targetWords, turnNumber: newTurn, language }),
      });
      const data = await res.json();
      const aiMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: data.text };
      setMessages((prev) => [...prev, aiMsg]);
      historyRef.current = [...historyRef.current, { role: "assistant", content: data.text }];

      if (data.done) {
        setStage("speaking");
        await new Promise<void>((resolve) => {
          if (data.audioBase64) {
            const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          } else {
            window.speechSynthesis.cancel();
            const utt = new SpeechSynthesisUtterance(data.text);
            utt.lang = "en-US"; utt.rate = 0.92;
            utt.onend = () => resolve();
            utt.onerror = () => resolve();
            window.speechSynthesis.speak(utt);
          }
        });
        assess();
      } else {
        await playAudioThenListen(data.audioBase64, data.text);
      }
    } catch {
      setLiveTranscript("");
      startListening();
    }
  }

  async function assess() {
    if (!task) return;
    setStage("assessing");
    const res = await fetch("/api/task/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskTitle: task.title, why: task.why, cue: task.cue, targetWords: task.targetWords, skillType: task.skillType, history: historyRef.current, language }),
    });
    const data = await res.json();
    const earnedStars = Math.max(1, Math.min(5, data.stars ?? 3));
    const earned = Math.round((earnedStars / 5) * task.xpReward);

    setStars(earnedStars);
    setFeedback(data.feedback ?? "");
    setToFiveStars(data.toFiveStars ?? "");
    setXpEarned(earned);

    const tasks: Task[] = JSON.parse(localStorage.getItem("tasks") ?? "[]");
    const prev = tasks.find(t => t.id === task.id);
    // Only update if improved
    if (!prev?.stars || earnedStars >= (prev.stars ?? 0)) {
      const updated = tasks.map((t) =>
        t.id === task.id ? { ...t, status: "completed" as const, stars: earnedStars } : t
      );
      localStorage.setItem("tasks", JSON.stringify(updated));
      const prevXP = parseInt(localStorage.getItem("totalXP") ?? "340");
      localStorage.setItem("totalXP", String(prevXP + earned));
    }
    setStage("result");
  }

  function retry() {
    vadActiveRef.current = false;
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioChunksRef.current = [];
    setMessages([]);
    historyRef.current = [];
    setTurnNumber(0);
    setLiveTranscript("");
    setStars(0);
    setFeedback("");
    setToFiveStars("");
    setStage("ready");
  }

  if (!task) return null;

  const starLabel = stars === 5 ? "Perfect!" : stars === 4 ? "Great job!" : stars === 3 ? "Good effort!" : stars === 2 ? "Keep at it" : "Just getting started";
  const starColor = stars >= 4 ? "#10b981" : stars === 3 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#f5f4ff" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #ece9ff", background: "#ffffff", flexShrink: 0 }}>
        <button onClick={() => router.push("/tasks")} style={{ background: "transparent", border: "none", color: "#6b6b8a", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 8 }}>← Tasks</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2a" }}>{task.title}</div>
          <div style={{ background: "#fffbf0", border: "1px solid #fde68a", borderRadius: 8, padding: "4px 10px" }}>
            <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>up to +{task.xpReward} XP</span>
          </div>
        </div>
        <div style={{ color: "#6b6b8a", fontSize: 13, marginTop: 4 }}>{task.why}</div>
      </div>

      {/* Ready screen */}
      {stage === "ready" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", gap: 24 }}>
          <div style={{ textAlign: "left", width: "100%" }}>
            <div style={{ color: "#6b6b8a", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Keep this in mind</div>
            <div style={{ background: "#f3f0ff", border: "1px solid #d4c9ff", borderRadius: 14, padding: "16px 20px" }}>
              <p style={{ color: "#1a1a2a", fontSize: 16, margin: 0, lineHeight: 1.6 }}>{task.cue}</p>
              {task.targetWords?.length ? (
                <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {task.targetWords.map((w) => (
                    <span key={w} style={{ background: "#8b5cf6", color: "#ffffff", borderRadius: 20, padding: "4px 14px", fontSize: 14, fontWeight: 600 }}>{w}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <p style={{ color: "#6b6b8a", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            A short conversation will start. Respond naturally — the AI will create the right moment for you to apply this.
          </p>
          <button onClick={startSession} style={{ background: "#f59e0b", color: "#0f0e17", border: "none", borderRadius: 14, padding: "18px 48px", fontSize: 17, fontWeight: 800, cursor: "pointer" }}>
            Start conversation
          </button>
        </div>
      )}

      {/* Conversation */}
      {(stage === "speaking" || stage === "listening" || stage === "processing") && (
        <>
          {/* Subtle cue banner */}
          <div style={{ background: "#f3f0ff", borderBottom: "1px solid #d4c9ff", padding: "10px 20px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "#8b5cf6", fontSize: 12, flexShrink: 0, marginTop: 1 }}>💡</span>
              <span style={{ color: "#8b5cf6", fontSize: 13, lineHeight: 1.4 }}>{task.cue}</span>
            </div>
            {task.targetWords?.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {task.targetWords.map((w) => (
                  <span key={w} style={{ background: "#8b5cf6", color: "#ffffff", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{w}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
            {messages.map((msg) => {
              const isAI = msg.role === "assistant";
              return (
                <div key={msg.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end" }}>
                  <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 }}>
                    {isAI ? "COACH" : "YOU"}
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
            {stage === "processing" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>COACH</div>
                <div style={{ background: "#ffffff", borderRadius: 16, borderTopLeftRadius: 4, padding: "14px 18px", border: "1px solid #ece9ff", display: "inline-flex", gap: 6 }}>
                  {[0,1,2].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#ece9ff", animation: `pulse 1s ${i*0.25}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: "16px 20px 24px", borderTop: "1px solid #ece9ff", background: "#ffffff", flexShrink: 0 }}>
            {liveTranscript && stage === "listening" && (
              <div style={{ background: "#f0eeff", border: "1px solid #d4c9ff", borderRadius: 12, padding: "10px 14px", marginBottom: 12, color: "#6b6b8a", fontSize: 14, fontStyle: "italic" }}>
                {liveTranscript}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: stage === "listening" ? "#f59e0b" : "#6b6b8a", fontSize: 13 }}>
                {stage === "listening" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    {[0.3, 0.6, 1, 0.6, 0.3].map((scale, i) => (
                      <div key={i} style={{ width: 3, borderRadius: 99, background: "#f59e0b", height: `${8 + audioLevel * 20 * scale}px`, transition: "height 0.1s" }} />
                    ))}
                  </div>
                )}
                {stage === "listening" ? "Listening..." : stage === "speaking" ? "Coach is speaking..." : "Processing..."}
              </div>
              {stage === "listening" && (
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
        </>
      )}

      {/* Assessing */}
      {stage === "assessing" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, border: "3px solid #ece9ff", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ color: "#6b6b8a" }}>Assessing your performance...</div>
        </div>
      )}

      {/* Result */}
      {stage === "result" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 24px 40px", textAlign: "center" }}>
          <Stars count={stars} size={40} />
          <h2 style={{ color: starColor, fontSize: 26, fontWeight: 800, margin: "12px 0 4px" }}>{starLabel}</h2>
          <div style={{ color: "#f59e0b", fontSize: 20, fontWeight: 700, marginBottom: 28 }}>+{xpEarned} XP earned</div>

          <div style={{ background: "#ffffff", border: "1px solid #ece9ff", borderRadius: 16, padding: "18px 20px", marginBottom: 16, textAlign: "left" }}>
            <div style={{ color: "#6b6b8a", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Feedback</div>
            <p style={{ color: "#1a1a2a", fontSize: 15, margin: 0, lineHeight: 1.5 }}>{feedback}</p>
          </div>

          {stars < 5 && toFiveStars && (
            <div style={{ background: "#f3f0ff", border: "1px solid #d4c9ff", borderRadius: 16, padding: "18px 20px", marginBottom: 28, textAlign: "left" }}>
              <div style={{ color: "#8b5cf6", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>How to get ⭐⭐⭐⭐⭐</div>
              <p style={{ color: "#1a1a2a", fontSize: 15, margin: 0, lineHeight: 1.5 }}>{toFiveStars}</p>
            </div>
          )}

          {stars < 5 && (
            <button onClick={retry} style={{ width: "100%", background: "#f0eeff", color: "#1a1a2a", border: "1px solid #d4c9ff", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>
              Try again for more stars
            </button>
          )}
          <button onClick={() => router.push("/tasks")} style={{ width: "100%", background: "#f59e0b", color: "#0f0e17", border: "none", borderRadius: 14, padding: 18, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
            Back to tasks
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
