"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Status = "ready" | "asking" | "listening" | "processing" | "done";

interface InterviewConfig {
  id: string; title: string; questions: string[]; language: string;
}
interface Answer { question: string; answer: string; }

export default function InterviewSession() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [config, setConfig] = useState<InterviewConfig | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadActiveRef = useRef(false);
  const hasSpeechRef = useRef(false);
  const listeningRef = useRef(false);
  const sessionActiveRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem(`interview-${id}`);
    if (raw) setConfig(JSON.parse(raw));
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [answers, status, currentQ]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    cleanup();
  }, []);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
    vadActiveRef.current = false;
    try { audioSourceRef.current?.stop(); } catch {}
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    try { mediaRecorderRef.current?.stop(); } catch {}
  }

  async function begin() {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;
      await ctx.resume();
      // iOS Safari requires actual audio playback within the gesture handler to unlock
      // the audio session — just calling resume() is not enough.
      const silent = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
    } catch {}
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    await askQuestion(0);
  }

  async function askQuestion(index: number) {
    if (!config || index >= config.questions.length) { finish(); return; }
    setCurrentQ(index);
    setStatus("asking");

    const questionText = config.questions[index];
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: questionText }),
      });
      const { audioBase64 } = await res.json();
      await playAudio(audioBase64, questionText);
    } catch {
      // Fallback to speech synthesis
      await speakText(questionText);
    }
    if (sessionActiveRef.current) startListening(index);
  }

  function playAudio(base64: string, fallbackText?: string): Promise<void> {
    return new Promise(async (resolve) => {
      // Safety net: never hang longer than 20s waiting for audio to end
      const timeout = setTimeout(() => resolve(), 20_000);
      const done = () => { clearTimeout(timeout); resolve(); };

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
          source.buffer = buffer; source.connect(ctx.destination);
          source.onended = done; source.start(0);
          return;
        } catch {}
      }
      if (fallbackText) await speakText(fallbackText);
      done();
    });
  }

  function speakText(text: string): Promise<void> {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = config?.language === "de" ? "de-DE" : "en-US";
      utt.rate = 0.92;
      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    });
  }

  async function startListening(questionIndex: number) {
    if (!sessionActiveRef.current || listeningRef.current) return;
    listeningRef.current = true;
    setStatus("listening");
    setLiveTranscript("");
    setAudioLevel(0);
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
          vadTimerRef.current = setTimeout(() => { if (vadActiveRef.current) stopAndTranscribe(questionIndex); }, 800);
        }
        requestAnimationFrame(tick);
      }
      setTimeout(() => requestAnimationFrame(tick), 150);
    } catch {}
  }

  async function stopAndTranscribe(questionIndex: number) {
    listeningRef.current = false;
    vadActiveRef.current = false;
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    setAudioLevel(0);
    const mr = mediaRecorderRef.current;
    if (!mr) { startListening(questionIndex); return; }
    setStatus("processing");
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
      if (text?.trim()) {
        const answer = text.trim();
        const question = config?.questions[questionIndex] ?? "";
        setAnswers((prev) => [...prev, { question, answer }]);
        const nextQ = questionIndex + 1;
        if (config && nextQ >= config.questions.length) {
          finish([...answers, { question, answer }]);
        } else {
          await askQuestion(nextQ);
        }
      } else {
        startListening(questionIndex);
      }
    } catch {
      setLiveTranscript("");
      startListening(questionIndex);
    }
  }

  function finish(finalAnswers?: Answer[]) {
    sessionActiveRef.current = false;
    cleanup();
    setStatus("done");
    const allAnswers = finalAnswers ?? answers;
    const history = allAnswers.flatMap((a) => [
      { role: "assistant" as const, content: a.question },
      { role: "user" as const, content: a.answer },
    ]);
    localStorage.setItem("debriefPending", JSON.stringify({
      history,
      templateId: "interview",
      templateName: config?.title ?? "Interview Practice",
      durationSeconds: elapsed,
    }));
    router.push("/debrief");
  }

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!config) return <div style={{ minHeight: "100vh", background: "#f0fdf9" }} />;

  // ── READY ──
  if (status === "ready") return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <button onClick={() => router.push("/create/interview")} style={{ alignSelf: "flex-start", background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#6b6b8a" }}>←</button>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>🎯</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2a", marginBottom: 8 }}>{config.title}</div>
        <div style={{ color: "#6b6b8a", fontSize: 15 }}>{config.questions.length} question{config.questions.length !== 1 ? "s" : ""}</div>
      </div>
      <div style={{ width: "100%", background: "#f0fdf9", borderRadius: 16, border: "1px solid #a7f3d0", padding: "16px 20px" }}>
        <div style={{ fontWeight: 700, color: "#1a1a2a", marginBottom: 8 }}>Questions</div>
        {config.questions.map((q, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <div style={{ color: "#10b981", fontWeight: 700, fontSize: 13, minWidth: 20 }}>Q{i + 1}</div>
            <div style={{ color: "#374151", fontSize: 14, lineHeight: 1.4 }}>{q}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#f0fdf9", borderRadius: 14, padding: "12px 16px", border: "1px solid #a7f3d0", width: "100%", boxSizing: "border-box" }}>
        <div style={{ color: "#6b6b8a", fontSize: 13, lineHeight: 1.6 }}>
          The AI will ask each question aloud, then listen to your answer. Silence for 0.8s moves to the next question.
        </div>
      </div>
      <button
        onClick={begin}
        style={{ width: "100%", padding: "18px", borderRadius: 14, border: "none", background: "#10b981", color: "#ffffff", fontSize: 18, fontWeight: 800, cursor: "pointer" }}
      >Begin interview</button>
    </div>
  );

  // ── IN PROGRESS ──
  const q = config.questions[currentQ] ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#f0fdf9" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #a7f3d0", background: "#ffffff", flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 700, color: "#1a1a2a", fontSize: 15 }}>{config.title}</div>
          <div style={{ color: "#6b6b8a", fontSize: 12 }}>Question {Math.min(currentQ + 1, config.questions.length)} of {config.questions.length}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ color: "#10b981", fontWeight: 700, fontSize: 15, fontVariant: "tabular-nums" }}>{fmt(elapsed)}</div>
          <button onClick={() => finish()} style={{ background: "transparent", border: "1px solid #ef444440", color: "#ef4444", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>End</button>
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 6, padding: "12px 20px", background: "#ffffff", borderBottom: "1px solid #a7f3d0", flexShrink: 0 }}>
        {config.questions.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < currentQ ? "#10b981" : i === currentQ ? "#059669" : "#d1fae5" }} />
        ))}
      </div>

      {/* History + current question */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
        {answers.map((a, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>Q{i + 1} · INTERVIEWER</div>
            <div style={{ background: "#ffffff", borderRadius: 16, borderTopLeftRadius: 4, padding: "12px 16px", border: "1px solid #a7f3d0", fontSize: 15, color: "#1a1a2a", marginBottom: 8 }}>{a.question}</div>
            <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600, textAlign: "right" }}>YOU</div>
            <div style={{ background: "#f0fdf9", borderRadius: 16, borderTopRightRadius: 4, padding: "12px 16px", border: "1px solid #a7f3d0", fontSize: 15, color: "#1a1a2a", textAlign: "right" }}>{a.answer}</div>
          </div>
        ))}

        {/* Current question */}
        {(status === "asking" || status === "listening" || status === "processing") && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#6b6b8a", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>Q{currentQ + 1} · INTERVIEWER</div>
            <div style={{ background: "#ffffff", borderRadius: 16, borderTopLeftRadius: 4, padding: "12px 16px", border: "1.5px solid #10b981", fontSize: 15, color: "#1a1a2a" }}>{q}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Bottom status */}
      <div style={{ padding: "16px 20px 28px", borderTop: "1px solid #a7f3d0", background: "#ffffff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: status === "listening" ? 10 : 0 }}>
          {status === "listening" && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {[0.3, 0.6, 1, 0.6, 0.3].map((scale, i) => (
                <div key={i} style={{ width: 3, borderRadius: 99, background: "#10b981", height: `${8 + audioLevel * 20 * scale}px`, transition: "height 0.1s" }} />
              ))}
            </div>
          )}
          <div style={{ color: status === "listening" ? "#10b981" : "#6b6b8a", fontSize: 13 }}>
            {status === "asking" ? "Interviewer is asking..." : status === "processing" ? liveTranscript || "Processing..." : "Listening — answer when ready"}
          </div>
        </div>
        {status === "listening" && (
          <button
            onClick={() => stopAndTranscribe(currentQ)}
            style={{ width: "100%", background: "#f0fdf9", border: "1px solid #a7f3d0", borderRadius: 12, padding: "12px", color: "#10b981", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >Done answering ↑</button>
        )}
      </div>
    </div>
  );
}
