// Codificador WAV (PCM 16 bits, mono) para los audios grabados en el navegador
// (§1.26). Se graba con MediaRecorder en lo que el navegador sepa (webm/opus en
// Chrome, mp4/aac en Safari), se decodifica y se re-codifica acá: WAV es el
// único formato que todos los navegadores pueden producir y que Instagram
// acepta como audio. Puro, sin APIs del navegador (tests/chats-wav.test.mjs).

/** 22,05 kHz alcanza para voz y deja un minuto en ~2,6 MB. */
export const VOICE_SAMPLE_RATE = 22_050;

/** Promedia los canales en uno (la voz no necesita estéreo). */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of channels) sum += channel[index];
    mono[index] = sum / channels.length;
  }
  return mono;
}

/** Remuestreo lineal: suficiente para voz, sin depender de OfflineAudioContext. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || samples.length === 0) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(length);
  const ratio = from / to;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    out[index] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return out;
}

/** Saca el silencio de las puntas (lo que queda entre tocar "Grabar" y empezar a hablar). */
export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.015, padMs = 120): Float32Array {
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < threshold) start += 1;
  let end = samples.length - 1;
  while (end > start && Math.abs(samples[end]) < threshold) end -= 1;
  if (start >= end) return samples;
  const pad = Math.round((padMs / 1000) * sampleRate);
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad + 1));
}

function writeString(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

/** Arma el archivo WAV: cabecera RIFF de 44 bytes + PCM 16 bits little-endian. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // bytes por segundo
  view.setUint16(32, bytesPerSample, true); // alineación de bloque
  view.setUint16(34, 16, true); // bits por muestra
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Uint8Array(buffer);
}
