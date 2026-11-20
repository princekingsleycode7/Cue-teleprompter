import { MediaDeviceOption } from '../types/teleprompter';

export function stripFormattingForWordCount(markdown: string): string {
  return markdown
    .replace(/^##\s*\[SECTION:\s*[^\]]+\]\s*$/gim, ' ')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/<\/?u>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .trim();
}

export function countWords(text: string): number {
  const cleaned = stripFormattingForWordCount(text);
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

export function estimateReadingSeconds(text: string, wordsPerMinute: number): number {
  const words = countWords(text);
  const pauseMatches = text.match(/\[PAUSE\s+(\d+)s?\]/gi) || [];
  const pauseSeconds = pauseMatches.reduce((acc, token) => {
    const num = parseInt(token.replace(/\D/g, ''), 10);
    return acc + (Number.isFinite(num) ? num : 2);
  }, 0);
  const speechSeconds = words > 0 ? (words / Math.max(wordsPerMinute, 30)) * 60 : 0;
  return Math.round(speechSeconds + pauseSeconds);
}

export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getBestMimeType(mode: 'video-audio' | 'audio-only'): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates =
    mode === 'video-audio'
      ? [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=h264,opus',
          'video/webm',
          'video/mp4',
        ]
      : [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export async function listAvailableMediaDevices(): Promise<{
  videoDevices: MediaDeviceOption[];
  audioDevices: MediaDeviceOption[];
}> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return { videoDevices: [], audioDevices: [] };
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices: MediaDeviceOption[] = [];
  const audioDevices: MediaDeviceOption[] = [];

  devices.forEach((device) => {
    if (device.kind === 'videoinput') {
      videoDevices.push({
        deviceId: device.deviceId,
        label: device.label || `Camera ${videoDevices.length + 1}`,
        kind: 'videoinput',
      });
    } else if (device.kind === 'audioinput') {
      audioDevices.push({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${audioDevices.length + 1}`,
        kind: 'audioinput',
      });
    }
  });

  return { videoDevices, audioDevices };
}

export function getFileExtensionForMime(mimeType: string, mode: 'video-audio' | 'audio-only'): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mp4')) return mode === 'video-audio' ? 'mp4' : 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  return 'webm';
}
