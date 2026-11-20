import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Download,
  Film,
  Mic,
  Pause,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { ReviewNote, TakeRecording } from '../types/teleprompter';
import {
  formatBytes,
  formatRelativeDate,
  formatTimecode,
  getFileExtensionForMime,
} from '../utils/media';

interface ReviewTakesViewProps {
  takes: TakeRecording[];
  isLoading: boolean;
  onAddNote: (takeId: string, note: ReviewNote) => Promise<void>;
  onDeleteNote: (takeId: string, noteId: string) => Promise<void>;
  onDeleteTake: (takeId: string) => Promise<void>;
  onLaunchStage: () => void;
}

export function ReviewTakesView({
  takes,
  isLoading,
  onAddNote,
  onDeleteNote,
  onDeleteTake,
  onLaunchStage,
}: ReviewTakesViewProps) {
  const [filter, setFilter] = useState<'all' | 'video-audio' | 'audio-only'>('all');
  const [selectedTakeId, setSelectedTakeId] = useState<string>('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [noteInput, setNoteInput] = useState<string>('');
  const [rightTab, setRightTab] = useState<'notes' | 'script'>('notes');
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredTakes = useMemo(() => {
    if (filter === 'all') return takes;
    return takes.filter((t) => t.mode === filter);
  }, [filter, takes]);

  const activeTake = useMemo(() => {
    if (filteredTakes.length === 0) return null;
    return (
      filteredTakes.find((t) => t.id === selectedTakeId) ?? filteredTakes[0]
    );
  }, [filteredTakes, selectedTakeId]);

  useEffect(() => {
    if (activeTake && activeTake.id !== selectedTakeId) {
      setSelectedTakeId(activeTake.id);
    }
  }, [activeTake, selectedTakeId]);

  useEffect(() => {
    if (!activeTake) {
      setMediaUrl(null);
      setWaveformPeaks([]);
      return;
    }

    const url = URL.createObjectURL(activeTake.blob);
    setMediaUrl(url);
    setCurrentTime(0);
    setMediaDuration(activeTake.durationSeconds);
    setIsPlaying(false);

    let cancelled = false;
    if (activeTake.mode === 'audio-only') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        activeTake.blob
          .arrayBuffer()
          .then((buf) => ctx.decodeAudioData(buf))
          .then((audioBuf) => {
            if (cancelled) return;
            const channel = audioBuf.getChannelData(0);
            const barCount = 64;
            const blockSize = Math.max(1, Math.floor(channel.length / barCount));
            const peaks: number[] = [];
            for (let i = 0; i < barCount; i++) {
              let max = 0;
              const start = i * blockSize;
              for (let j = 0; j < blockSize && start + j < channel.length; j++) {
                const abs = Math.abs(channel[start + j]);
                if (abs > max) max = abs;
              }
              peaks.push(Math.max(0.08, Math.min(1, max)));
            }
            setWaveformPeaks(peaks);
          })
          .catch(() => {
            if (!cancelled) {
              setWaveformPeaks(Array.from({ length: 64 }, () => 0.35));
            }
          })
          .finally(() => {
            ctx.close().catch(() => undefined);
          });
      }
    } else {
      setWaveformPeaks([]);
    }

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [activeTake]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate, mediaUrl]);

  const getActiveMediaEl = (): HTMLMediaElement | null => {
    if (!activeTake) return null;
    return activeTake.mode === 'video-audio'
      ? videoRef.current
      : audioRef.current;
  };

  const seekToTime = (seconds: number) => {
    const el = getActiveMediaEl();
    if (!el) return;
    el.currentTime = Math.max(0, seconds);
    setCurrentTime(el.currentTime);
  };

  const togglePlayPause = () => {
    const el = getActiveMediaEl();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTake || !noteInput.trim()) return;
    const newNote: ReviewNote = {
      id: `note-${Date.now()}`,
      timestampSeconds: Math.floor(currentTime),
      text: noteInput.trim(),
      createdAt: Date.now(),
    };
    setNoteInput('');
    await onAddNote(activeTake.id, newNote);
  };

  const handleDownloadTake = () => {
    if (!activeTake || !mediaUrl) return;
    const ext = getFileExtensionForMime(activeTake.mimeType, activeTake.mode);
    const safeName = (activeTake.scriptTitle || 'presentation-take')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = `${safeName}-${formatTimecode(activeTake.durationSeconds).replace(':', 'm')}s.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090B] p-8">
        <div className="text-sm text-zinc-400">Loading saved recordings...</div>
      </div>
    );
  }

  if (takes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090B] p-6 pb-24 md:pb-8">
        <div className="max-w-md text-center space-y-5">
          <h1 className="font-display text-2xl font-semibold text-zinc-100">
            No presentation takes recorded yet
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Launch the Prompter Stage with your camera or microphone enabled to record a presentation take. All recordings stay locally on your device for instant review.
          </p>
          <button
            type="button"
            onClick={onLaunchStage}
            className="inline-flex items-center justify-center px-6 py-3 min-h-[44px] text-sm font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition-colors"
          >
            Launch Prompter Stage
          </button>
        </div>
      </div>
    );
  }

  const effectiveDuration = Math.max(
    mediaDuration || activeTake?.durationSeconds || 1,
    1
  );

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] bg-[#09090B]">
      {/* Left Sidebar: Takes Library (hidden on mobile when viewing take detail) */}
      <aside
        className={`${
          mobileDetailOpen ? 'hidden lg:flex' : 'flex'
        } flex-col min-h-0 border-r border-zinc-800/90 bg-[#0D0D10] pb-20 lg:pb-0`}
      >
        <div className="p-5 border-b border-zinc-800/80 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-zinc-100">
              Recorded Takes
            </h2>
            <span className="font-mono text-xs text-zinc-500 tabular-nums">
              {filteredTakes.length}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'video-audio', label: 'Video' },
                { id: 'audio-only', label: 'Voice' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  filter === item.id
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredTakes.length === 0 ? (
            <div className="p-6 text-xs text-zinc-500 text-center">
              No recordings match this filter.
            </div>
          ) : (
            filteredTakes.map((take) => {
              const isSelected = activeTake?.id === take.id;
              return (
                <button
                  key={take.id}
                  type="button"
                  onClick={() => {
                    setSelectedTakeId(take.id);
                    setMobileDetailOpen(true);
                  }}
                  className={`w-full text-left p-3.5 min-h-[56px] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isSelected
                      ? 'bg-zinc-800/85 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {take.mode === 'video-audio' ? (
                      <Film className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Mic className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-sm font-medium truncate">
                      {take.scriptTitle || 'Untitled Script'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500 tabular-nums">
                    <span>{formatTimecode(take.durationSeconds)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytes(take.blob.size)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRelativeDate(take.createdAt)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Review Workspace */}
      {activeTake ? (
        <main
          className={`${
            mobileDetailOpen ? 'flex' : 'hidden lg:flex'
          } flex-col min-h-0 overflow-y-auto pb-24 lg:pb-6`}
        >
          {/* Header Metadata & Actions */}
          <div className="px-5 sm:px-8 py-4 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <button
                type="button"
                onClick={() => setMobileDetailOpen(false)}
                className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-amber-400 mb-1 min-h-[36px]"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                All Takes
              </button>
              <h1 className="font-display text-lg sm:text-xl font-semibold text-zinc-100 truncate">
                {activeTake.scriptTitle || 'Untitled Script'}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 tabular-nums">
                <span>
                  {activeTake.mode === 'video-audio'
                    ? 'Video & Audio'
                    : 'Voice Recording'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatTimecode(activeTake.durationSeconds)}</span>
                <span aria-hidden="true">·</span>
                <span>{activeTake.wordsPerMinute} WPM pace</span>
                <span aria-hidden="true">·</span>
                <span>{formatRelativeDate(activeTake.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadTake}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Download
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTake(activeTake.id);
                  setMobileDetailOpen(false);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-900/60 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>

          {/* Split Player & Notes/Script */}
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
            <div className="p-5 sm:p-8 flex flex-col gap-5 border-b xl:border-b-0 xl:border-r border-zinc-800/80">
              {activeTake.mode === 'video-audio' ? (
                <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-zinc-800">
                  {mediaUrl && (
                    <video
                      ref={videoRef}
                      src={mediaUrl}
                      controls
                      playsInline
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => {
                        if (Number.isFinite(e.currentTarget.duration)) {
                          setMediaDuration(e.currentTarget.duration);
                        }
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-[#0D0D10] border border-zinc-800 p-6 space-y-5">
                  {mediaUrl && (
                    <audio
                      ref={audioRef}
                      src={mediaUrl}
                      onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => {
                        if (Number.isFinite(e.currentTarget.duration)) {
                          setMediaDuration(e.currentTarget.duration);
                        }
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                  )}

                  <div className="h-32 flex items-center gap-[3px]">
                    {(waveformPeaks.length > 0
                      ? waveformPeaks
                      : Array.from({ length: 64 }, () => 0.3)
                    ).map((peak, idx) => {
                      const barRatio = idx / 64;
                      const playedRatio = currentTime / effectiveDuration;
                      const isPlayed = barRatio <= playedRatio;
                      return (
                        <button
                          key={idx}
                          type="button"
                          aria-label={`Seek to ${formatTimecode(barRatio * effectiveDuration)}`}
                          onClick={() => seekToTime(barRatio * effectiveDuration)}
                          className="flex-1 h-full flex items-center justify-center group focus:outline-none"
                        >
                          <span
                            className={`w-full rounded-full transition-colors ${
                              isPlayed
                                ? 'bg-amber-400'
                                : 'bg-zinc-700 group-hover:bg-zinc-500'
                            }`}
                            style={{ height: `${Math.max(12, peak * 100)}%` }}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={togglePlayPause}
                      className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4" aria-hidden="true" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" aria-hidden="true" />
                          Play Audio
                        </>
                      )}
                    </button>

                    <div className="font-mono text-xs text-zinc-300 tabular-nums">
                      {formatTimecode(currentTime)} / {formatTimecode(effectiveDuration)}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Speed:</span>
                  <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                    {[0.75, 1, 1.25, 1.5].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors tabular-nums ${
                          playbackRate === rate
                            ? 'bg-zinc-800 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="font-mono text-xs text-zinc-400 tabular-nums">
                  Playhead: {formatTimecode(currentTime)}
                </div>
              </div>
            </div>

            {/* Right Pane: Timestamped Review Notes & Script Snapshot */}
            <div className="flex flex-col min-h-0 bg-[#0D0D10]">
              <div className="px-6 pt-5 pb-3 border-b border-zinc-800/80 flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => setRightTab('notes')}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    rightTab === 'notes'
                      ? 'border-amber-500 text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Review Notes ({activeTake.notes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('script')}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    rightTab === 'script'
                      ? 'border-amber-500 text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Script Snapshot
                </button>
              </div>

              {rightTab === 'notes' ? (
                <div className="flex-1 flex flex-col min-h-0 p-6 gap-5">
                  <form onSubmit={handleAddNote} className="flex gap-2">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder={`Add note at ${formatTimecode(currentTime)}...`}
                      aria-label="Timestamped presentation review note"
                      className="flex-1 min-w-0 px-3.5 py-2.5 min-h-[44px] text-sm bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={!noteInput.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-semibold bg-zinc-100 text-zinc-950 hover:bg-white rounded-xl transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Pin
                    </button>
                  </form>

                  <div className="flex-1 overflow-y-auto space-y-2.5">
                    {activeTake.notes.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-8 text-center">
                        Pin coaching notes at any timestamp while reviewing to jump straight to key moments.
                      </p>
                    ) : (
                      activeTake.notes
                        .slice()
                        .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
                        .map((note) => (
                          <div
                            key={note.id}
                            className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80"
                          >
                            <button
                              type="button"
                              onClick={() => seekToTime(note.timestampSeconds)}
                              className="flex-1 text-left space-y-1 focus:outline-none"
                            >
                              <span className="font-mono text-xs font-medium text-amber-400 tabular-nums">
                                {formatTimecode(note.timestampSeconds)}
                              </span>
                              <p className="text-sm text-zinc-200 leading-snug">
                                {note.text}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteNote(activeTake.id, note.id)}
                              aria-label="Delete note"
                              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-prompter-sans">
                    {activeTake.scriptSnapshot}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center p-8 text-sm text-zinc-500">
          Select a recording from the list to review.
        </div>
      )}
    </div>
  );
}
