import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Square, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transcribeJobAudio, draftJobFromVoice, type AiJobDraft } from "@/lib/ai-job.functions";

type Step = "idle" | "recording" | "working" | "questions" | "done";

export function VoiceJobWriter({ onDraft }: { onDraft: (job: AiJobDraft["job"]) => void }) {
  const transcribe = useServerFn(transcribeJobAudio);
  const draft = useServerFn(draftJobFromVoice);
  const [step, setStep] = useState<Step>("idle");
  const [busyText, setBusyText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        handleAudio(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      };
      r.start();
      rec.current = r;
      setSecs(0);
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
      setStep("recording");
    } catch {
      toast.error("We need microphone access to record. Please allow it and try again.");
    }
  }
  function stop() {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stop();
  }

  async function handleAudio(blob: Blob) {
    setStep("working"); setBusyText("Listening to your recording...");
    try {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const { text } = await transcribe({ data: { audio: btoa(bin), mime: blob.type || "audio/webm" } });
      const full = transcript ? `${transcript}\n${text}` : text;
      setTranscript(full);
      setBusyText("Writing your job description...");
      const out = await draft({ data: { transcript: full, answers: [], final: false } });
      onDraft(out.job);
      if (out.questions.length) {
        setQuestions(out.questions); setAnswers(out.questions.map(() => "")); setStep("questions");
      } else setStep("done");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong.");
      setStep("idle");
    }
  }

  async function finalize() {
    setStep("working"); setBusyText("Finishing your posting...");
    try {
      const out = await draft({ data: { transcript, answers: questions.map((q, i) => ({ q, a: answers[i] ?? "" })), final: true } });
      onDraft(out.job);
      setStep("done");
      toast.success("Your job description is ready! Review it below, then post.");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong.");
      setStep("questions");
    }
  }

  return (
    <div className="rounded-xl border border-sapphire/30 bg-sapphire/5 p-4">
      <div className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-sapphire" />Write it with your voice</div>
      {step === "idle" && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">Just talk about the role: what they'll do, who you're looking for, pay and hours. AI writes the posting.</p>
          <Button type="button" className="mt-3" onClick={start}><Mic />Start recording</Button>
        </>
      )}
      {step === "recording" && (
        <div className="mt-3 flex items-center gap-3">
          <span className="size-3 animate-pulse rounded-full bg-destructive" />
          <span className="text-sm tabular-nums">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
          <Button type="button" variant="destructive" onClick={stop}><Square />Done talking</Button>
        </div>
      )}
      {step === "working" && <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{busyText}</p>}
      {step === "questions" && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">A few quick questions to finish it up (skip any you like):</p>
          {questions.map((q, i) => (
            <div key={i} className="space-y-1.5">
              <Label>{q}</Label>
              <Input value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" onClick={finalize}><Sparkles />Finish description</Button>
            <Button type="button" variant="outline" onClick={start}><Mic />Add more by voice</Button>
          </div>
        </div>
      )}
      {step === "done" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">Done! Check the preview below and edit anything.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => { setTranscript(""); setStep("idle"); }}><RotateCcw />Start over</Button>
        </div>
      )}
    </div>
  );
}
