// 16-bit PCM WAV helpers shared by the browser (capture) and the server (Bhashini chunking).
// Pure functions over typed arrays, so they are unit-tested without an audio device.

/** Speech is recorded and sent at this rate; Bhashini is told the same number. */
export const ASR_RATE = 16000;

/** Encode mono float samples in [-1, 1] as a 16-bit PCM WAV file. */
export function encodeWav16(pcm: Float32Array | Int16Array, sampleRate = ASR_RATE): Uint8Array {
  const n = pcm.length;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  out.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = pcm[i]!;
    if (pcm instanceof Int16Array) {
      out.setInt16(44 + i * 2, s, true);
    } else {
      const v = Math.max(-1, Math.min(1, s));
      out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
  }
  return new Uint8Array(out.buffer);
}

export type Wav = { sampleRate: number; channels: number; samples: Int16Array };

/** Read a 16-bit PCM WAV (the format this app records). Other encodings are refused, not guessed. */
export function decodeWav16(bytes: Uint8Array): Wav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
    throw new Error("not a WAV file");
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let format = 0;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      if (format !== 1 || bits !== 16) throw new Error("only 16-bit PCM WAV is supported");
      const count = Math.floor(Math.min(size, bytes.length - body) / 2);
      const samples = new Int16Array(count);
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(body + i * 2, true);
      return { sampleRate, channels, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Mono samples of a decoded WAV: channels averaged. */
export function monoOf(wav: Wav): Int16Array {
  if (wav.channels <= 1) return wav.samples;
  const frames = Math.floor(wav.samples.length / wav.channels);
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < wav.channels; c++) sum += wav.samples[f * wav.channels + c]!;
    out[f] = Math.round(sum / wav.channels);
  }
  return out;
}

/**
 * Cut long speech into pieces of at most `maxSeconds`, each cut placed at the quietest 100 ms
 * window in the last `searchSeconds` before the limit, so a cut lands in a pause rather than
 * inside a word. Short audio comes back as one piece.
 */
export function splitAtPauses(
  samples: Int16Array,
  sampleRate: number,
  maxSeconds = 25,
  searchSeconds = 4,
): Int16Array[] {
  const max = Math.floor(maxSeconds * sampleRate);
  const win = Math.max(1, Math.floor(0.1 * sampleRate));
  const search = Math.floor(searchSeconds * sampleRate);
  const pieces: Int16Array[] = [];
  let start = 0;
  while (samples.length - start > max) {
    const hi = start + max;
    const lo = Math.max(start + win, hi - search);
    let best = hi;
    let bestEnergy = Number.POSITIVE_INFINITY;
    for (let w = lo; w + win <= hi; w += Math.floor(win / 2)) {
      let e = 0;
      for (let i = w; i < w + win; i++) e += Math.abs(samples[i]!);
      if (e < bestEnergy) {
        bestEnergy = e;
        best = w + Math.floor(win / 2);
      }
    }
    pieces.push(samples.subarray(start, best));
    start = best;
  }
  pieces.push(samples.subarray(start));
  return pieces;
}

/** Seconds of audio in a decoded WAV. */
export function durationOf(wav: Wav): number {
  return wav.samples.length / Math.max(1, wav.channels) / wav.sampleRate;
}
