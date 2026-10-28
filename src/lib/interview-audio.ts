export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const value of chunk) {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

export async function startAudioCapture(stream: MediaStream) {
  const context = new AudioContext({ sampleRate: 16000 });
  await context.resume();
  const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const node = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let paused = false;
  node.onaudioprocess = (e) => {
    if (!paused) chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(node);
  node.connect(context.destination);
  const dispose = () => {
    stream.getTracks().forEach((t) => t.stop());
    node.disconnect();
    source.disconnect();
    node.onaudioprocess = null;
    void context.close();
  };
  return {
    pause: (v: boolean) => {
      paused = v;
    },
    dispose,
    stop: () => {
      const duration = chunks.reduce((n, c) => n + c.length, 0) / context.sampleRate;
      const blob = encodeWav(chunks, context.sampleRate);
      dispose();
      if (duration < 1) throw new Error("Recording was empty; please record again.");
      return { file: new File([blob], "interview.wav", { type: "audio/wav" }), duration };
    },
  };
}
export async function extractAudio(file: File) {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const samples = audio.getChannelData(channel);
      for (let i = 0; i < mono.length; i++)
        mono[i] = (mono[i] ?? 0) + (samples[i] ?? 0) / audio.numberOfChannels;
    }
    return {
      file: new File([encodeWav([mono], audio.sampleRate)], "interview.wav", { type: "audio/wav" }),
      duration: audio.duration,
    };
  } finally {
    await context.close();
  }
}
