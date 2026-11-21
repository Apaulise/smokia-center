"use client";

import { Loader2, Mic, Square, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { createAudioQuickReply, prepareAudioUpload } from "@/lib/chats/inbox-actions";
import { AUDIO_MAX_BYTES, AUDIO_MAX_MS, audioMimeOf, formatDuration, type QuickReplyView } from "@/lib/chats/quick-replies";
import { downmix, encodeWav, resample, trimSilence, VOICE_SAMPLE_RATE } from "@/lib/chats/wav";
import { createClient } from "@/lib/supabase/client";

type Clip = { blob: Blob; mime: string; name: string; durationMs: number | null; url: string };

/** Duración real de un audio, leída por el propio navegador. */
function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null);
    audio.onerror = () => resolve(null);
    audio.src = url;
  });
}

/** Lo grabado (webm/mp4, según el navegador) → WAV mono de 22 kHz, que Instagram acepta siempre. */
async function toWav(recorded: Blob): Promise<{ blob: Blob; durationMs: number }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recorded.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const mono = trimSilence(resample(downmix(channels), decoded.sampleRate, VOICE_SAMPLE_RATE), VOICE_SAMPLE_RATE);
    const bytes = encodeWav(mono, VOICE_SAMPLE_RATE);
    return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" }), durationMs: Math.round((mono.length / VOICE_SAMPLE_RATE) * 1000) };
  } finally {
    void context.close();
  }
}

/**
 * Guarda un audio como respuesta rápida: se graba acá (hasta 60 s) o se sube
 * un archivo. El archivo va directo del navegador al bucket privado
 * `chat-audio`, a la carpeta del usuario; después se registra la fila.
 */
export function AudioRecorderDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (item: QuickReplyView) => void }) {
  const [title, setTitle] = useState("");
  const [clip, setClip] = useState<Clip | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<"convirtiendo" | "guardando" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  }

  useEffect(() => () => stopTracks(), []);

  function replaceClip(next: Clip | null) {
    setClip((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return next;
    });
  }

  function reset() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
    setRecording(false);
    setElapsed(0);
    replaceClip(null);
    setTitle("");
    setError(null);
    setBusy(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function start() {
    setError(null);
    replaceClip(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("El navegador no dio acceso al micrófono. Revisá el permiso del sitio.");
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream.current);
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    media.onstop = async () => {
      stopTracks();
      setRecording(false);
      if (chunks.length === 0) return;
      setBusy("convirtiendo");
      try {
        const { blob, durationMs } = await toWav(new Blob(chunks, { type: media.mimeType }));
        replaceClip({ blob, mime: "audio/wav", name: "grabacion.wav", durationMs, url: URL.createObjectURL(blob) });
      } catch {
        setError("No se pudo procesar la grabación. Probá de nuevo o subí un archivo.");
      } finally {
        setBusy(null);
      }
    };
    recorder.current = media;
    media.start(250);
    setRecording(true);
    const startedAt = Date.now();
    setElapsed(0);
    ticker.current = setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      if (ms >= AUDIO_MAX_MS) media.stop();
    }, 200);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const mime = audioMimeOf(file.type, file.name);
    if (!mime) {
      setError("Ese formato no lo acepta Instagram. Subí m4a, mp3, aac o wav.");
      return;
    }
    if (file.size > AUDIO_MAX_BYTES) {
      setError("El audio puede pesar hasta 8 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    replaceClip({ blob: file, mime, name: file.name, durationMs: await readDuration(url), url });
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
  }

  async function save() {
    if (!clip) return;
    const name = title.trim();
    if (!name) {
      setError("Ponele un nombre para encontrarlo después.");
      return;
    }
    setBusy("guardando");
    setError(null);
    const prepared = await prepareAudioUpload({ mime: clip.mime, name: clip.name, size: clip.blob.size });
    if (!prepared.ok) {
      setBusy(null);
      setError(prepared.message);
      return;
    }
    const { error: uploadError } = await createClient().storage.from("chat-audio").upload(prepared.path, clip.blob, { contentType: prepared.mime, upsert: false });
    if (uploadError) {
      setBusy(null);
      setError(/bucket/i.test(uploadError.message) ? "Falta crear el bucket de audios (migración de respuestas rápidas)." : "No se pudo subir el audio. Probá de nuevo.");
      return;
    }
    const result = await createAudioQuickReply({ title: name, path: prepared.path, mime: prepared.mime, durationMs: clip.durationMs });
    setBusy(null);
    if (!result.ok || !result.item) {
      setError(result.message);
      return;
    }
    onSaved(result.item);
    close();
  }

  const left = Math.max(0, AUDIO_MAX_MS - elapsed);

  return (
    <Dialog open={open} onClose={close} title="Guardar un audio" description="Grabalo acá o subí uno. Después lo mandás con un toque desde cualquier chat.">
      <div className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="audio-title" hint="Lo que vas a buscar en el selector, p. ej. «Saludo y presentación».">
          <Input id="audio-title" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="Saludo y presentación" />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <Button variant="secondary" onClick={stop}>
              <Square className="size-3.5" strokeWidth={1.5} />
              Detener · <span className="font-mono">{formatDuration(elapsed) || "0:00"}</span>
            </Button>
          ) : (
            <Button variant="secondary" onClick={start} disabled={busy !== null}>
              <Mic className="size-3.5" strokeWidth={1.5} />
              {clip ? "Grabar de nuevo" : "Grabar"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => fileInput.current?.click()} disabled={recording || busy !== null}>
            <Upload className="size-3.5" strokeWidth={1.5} />
            Subir un archivo
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/mp4,audio/x-m4a,audio/aac,audio/mpeg,audio/wav,.m4a,.mp3,.aac,.wav"
            className="hidden"
            onChange={(event) => {
              void pickFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {recording ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-lm-ink-2" role="status">
              <span className="size-2 animate-pulse rounded-full bg-lm-danger motion-reduce:animate-none" aria-hidden />
              Grabando · quedan <span className="font-mono">{formatDuration(left) || "0:00"}</span>
            </span>
          ) : null}
          {busy === "convirtiendo" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-lm-ink-3">
              <Loader2 className="size-3 animate-spin" /> Preparando…
            </span>
          ) : null}
        </div>

        {clip ? (
          <div className="flex flex-col gap-1.5 rounded-lm-md border border-lm-line bg-lm-surface p-3">
            <audio controls src={clip.url} className="h-9 w-full" />
            <p className="text-xs text-lm-ink-3">
              {clip.durationMs ? <span className="font-mono">{formatDuration(clip.durationMs)}</span> : null}
              {clip.durationMs ? " · " : ""}
              <span className="font-mono">{(clip.blob.size / 1024 / 1024).toFixed(1)} MB</span>
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="text-[13px] text-lm-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!clip || busy !== null || recording}>
            {busy === "guardando" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Guardar audio
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
