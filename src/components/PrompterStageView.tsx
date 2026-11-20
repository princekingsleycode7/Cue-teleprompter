import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Circle,
  Eye,
  EyeOff,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';
import {
  CameraLayoutMode,
  PrompterSettings,
  PrompterTheme,
  Script,
} from '../types/teleprompter';
import {
  extractSectionMarkers,
  InlineToken,
  parseInlineTokens,
  splitMarkdownBlocks,
} from '../utils/markdown';
import {
  countWords,
  estimateReadingSeconds,
  formatTimecode,
} from '../utils/media';

interface PrompterStageViewProps {
  script: Script;
  settings: PrompterSettings;
  stream: MediaStream | null;
  permissionState: 'idle' | 'requesting' | 'ready' | 'error';
  hardwareError: string | null;
  audioLevel: number;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingElapsed: number;
  onUpdateSettings: (patch: Partial<PrompterSettings>) => void;
  onRequestHardware: () => Promise<MediaStream | null>;
  onStartRecording: () => Promise<boolean>;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopAndSaveTake: () => Promise<void>;
  onGoToReview: () => void;
}

function renderInlineFormatted(text: string, cueClass: string): React.ReactNode {
  const tokens: InlineToken[] = parseInlineTokens(text);
  return tokens.map((tok, idx) => {
    if (tok.isCue) {
      return (
        <span
          key={idx}
          className={`inline-block font-mono text-[0.58em] uppercase tracking-wide font-semibold mx-1 ${cueClass}`}
        >
          {tok.text}
        </span>
      );
    }
    let node: React.ReactNode = tok.text;
    if (tok.bold) {
      node = <strong className="font-bold">{node}</strong>;
    }
    if (tok.italic) {
      node = <em className="italic">{node}</em>;
    }
    if (tok.underline) {
      node = (
        <span className="underline decoration-2 underline-offset-4 decoration-amber-400/80">
          {node}
        </span>
      );
    }
    return <React.Fragment key={idx}>{node}</React.Fragment>;
  });
}

export function PrompterStageView({
  script,
  settings,
  stream,
  hardwareError,
  audioLevel,
  isRecording,
  isRecordingPaused,
  recordingElapsed,
  onUpdateSettings,
  onRequestHardware,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopAndSaveTake,
  onGoToReview,
}: PrompterStageViewProps) {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textContentRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map());
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const backdropVideoRef = useRef<HTMLVideoElement | null>(null);

  const [isScrolling, setIsScrolling] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [presentationElapsed, setPresentationElapsed] = useState(0);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedBannerVisible, setSavedBannerVisible] = useState(false);
  const [optionsSheetOpen, setOptionsSheetOpen] = useState(false);

  const scrollPosFloatRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const countdownTimerRef = useRef<number | null>(null);

  const wordCount = useMemo(() => countWords(script.content), [script.content]);
  const totalEstimatedSeconds = useMemo(
    () => estimateReadingSeconds(script.content, settings.wordsPerMinute),
    [script.content, settings.wordsPerMinute]
  );

  const blocks = useMemo(
    () => splitMarkdownBlocks(script.content),
    [script.content]
  );
  const sectionMarkers = useMemo(
    () => extractSectionMarkers(script.content),
    [script.content]
  );

  // Attach hardware video stream
  useEffect(() => {
    const hasVideo =
      settings.recordingMode === 'video-audio' &&
      stream !== null &&
      stream.getVideoTracks().length > 0;

    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject =
        hasVideo && settings.cameraLayout === 'pip' ? stream : null;
    }
    if (backdropVideoRef.current) {
      backdropVideoRef.current.srcObject =
        hasVideo && settings.cameraLayout === 'backdrop' ? stream : null;
    }
  }, [stream, settings.recordingMode, settings.cameraLayout]);

  useEffect(() => {
    if (settings.recordingMode !== 'prompter-only' && !stream) {
      onRequestHardware();
    }
  }, [settings.recordingMode, stream, onRequestHardware]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Presentation elapsed timer (runs whenever scrolling or actively recording)
  useEffect(() => {
    const timerActive = isScrolling || (isRecording && !isRecordingPaused);
    if (!timerActive) return;

    const interval = window.setInterval(() => {
      setPresentationElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isScrolling, isRecording, isRecordingPaused]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && stageContainerRef.current) {
        await stageContainerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if restricted by frame
    }
  }, []);

  const updateActiveSectionFromScroll = useCallback(
    (scrollTop: number) => {
      const container = scrollContainerRef.current;
      if (!container || sectionMarkers.length === 0) return;
      const guideOffsetPx =
        (settings.guideLinePosition / 100) * container.clientHeight;
      const focalY = scrollTop + guideOffsetPx + 24;

      let currentIdx = 0;
      for (let i = 0; i < sectionMarkers.length; i++) {
        const marker = sectionMarkers[i];
        const el = blockRefs.current.get(marker.blockIndex);
        if (el && el.offsetTop <= focalY) {
          currentIdx = i;
        }
      }
      setActiveSectionIndex(currentIdx);
    },
    [sectionMarkers, settings.guideLinePosition]
  );

  const resetToTop = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setIsScrolling(false);
    setPresentationElapsed(0);
    setActiveSectionIndex(0);
    scrollPosFloatRef.current = 0;
    isProgrammaticScrollRef.current = true;
    el.scrollTop = 0;
    setScrollProgress(0);
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, []);

  // Sub-pixel WPM-calibrated scrolling (formatting never slows or speeds WPM)
  useEffect(() => {
    if (!isScrolling) {
      lastFrameTimeRef.current = null;
      return;
    }

    let rafId = 0;

    const tick = (now: number) => {
      const el = scrollContainerRef.current;
      const textEl = textContentRef.current;
      if (!el || !textEl) return;

      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = now;
        scrollPosFloatRef.current = el.scrollTop;
      }

      const deltaSeconds = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
      lastFrameTimeRef.current = now;

      const textHeight = textEl.offsetHeight;
      const totalSpeechSeconds = Math.max(
        (Math.max(wordCount, 12) / settings.wordsPerMinute) * 60,
        4
      );
      const pxPerSecond = Math.max(12, textHeight / totalSpeechSeconds);

      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextPos = Math.min(
        maxScroll,
        scrollPosFloatRef.current + pxPerSecond * deltaSeconds
      );
      scrollPosFloatRef.current = nextPos;

      isProgrammaticScrollRef.current = true;
      el.scrollTop = nextPos;
      if (maxScroll > 0) {
        setScrollProgress(Math.min(1, nextPos / maxScroll));
      }
      updateActiveSectionFromScroll(nextPos);

      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });

      if (nextPos >= maxScroll && maxScroll > 0) {
        setIsScrolling(false);
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isScrolling, settings.wordsPerMinute, updateActiveSectionFromScroll, wordCount]);

  const handleManualScroll = () => {
    const el = scrollContainerRef.current;
    if (!el || isProgrammaticScrollRef.current) return;
    scrollPosFloatRef.current = el.scrollTop;
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    setScrollProgress(Math.min(1, el.scrollTop / maxScroll));
    updateActiveSectionFromScroll(el.scrollTop);
  };

  const jumpToBlock = (blockEl: HTMLElement | undefined) => {
    const container = scrollContainerRef.current;
    if (!container || !blockEl) return;
    const guideOffsetPx =
      (settings.guideLinePosition / 100) * container.clientHeight;
    const targetScroll = Math.max(0, blockEl.offsetTop - guideOffsetPx);
    scrollPosFloatRef.current = targetScroll;
    isProgrammaticScrollRef.current = true;
    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    setScrollProgress(Math.min(1, targetScroll / maxScroll));
    updateActiveSectionFromScroll(targetScroll);
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 320);
  };

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownValue(null);
  }, []);

  useEffect(() => {
    return () => clearCountdown();
  }, [clearCountdown]);

  const beginRecordingWithCountdown = useCallback(async () => {
    if (settings.recordingMode === 'prompter-only') {
      setIsScrolling(true);
      return;
    }

    if (settings.countdownSeconds === 0) {
      const ok = await onStartRecording();
      if (ok) setIsScrolling(true);
      return;
    }

    if (!stream) {
      const acquired = await onRequestHardware();
      if (!acquired) return;
    }

    clearCountdown();
    let remaining: number = settings.countdownSeconds;
    setCountdownValue(remaining);

    countdownTimerRef.current = window.setInterval(async () => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        const ok = await onStartRecording();
        if (ok) setIsScrolling(true);
      } else {
        setCountdownValue(remaining);
      }
    }, 1000);
  }, [
    clearCountdown,
    onRequestHardware,
    onStartRecording,
    settings.countdownSeconds,
    settings.recordingMode,
    stream,
  ]);

  const handleStopRecording = useCallback(async () => {
    setIsScrolling(false);
    await onStopAndSaveTake();
    setSavedBannerVisible(true);
    setTimeout(() => setSavedBannerVisible(false), 6000);
  }, [onStopAndSaveTake]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsScrolling((prev) => !prev);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        onUpdateSettings({
          wordsPerMinute: Math.min(280, settings.wordsPerMinute + 5),
        });
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        onUpdateSettings({
          wordsPerMinute: Math.max(60, settings.wordsPerMinute - 5),
        });
      } else if (e.key === ']') {
        e.preventDefault();
        onUpdateSettings({ fontSize: Math.min(96, settings.fontSize + 2) });
      } else if (e.key === '[') {
        e.preventDefault();
        onUpdateSettings({ fontSize: Math.max(24, settings.fontSize - 2) });
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetToTop();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onUpdateSettings({ mirrorHorizontal: !settings.mirrorHorizontal });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onUpdateSettings,
    resetToTop,
    settings.fontSize,
    settings.mirrorHorizontal,
    settings.wordsPerMinute,
    toggleFullscreen,
  ]);

  const cycleCameraLayout = () => {
    const order: CameraLayoutMode[] = ['pip', 'backdrop', 'hidden'];
    const idx = order.indexOf(settings.cameraLayout);
    onUpdateSettings({ cameraLayout: order[(idx + 1) % order.length] });
  };

  const themeClasses = {
    obsidian: {
      bg: 'bg-[#050507]',
      text: 'text-zinc-100',
      cue: 'text-amber-400',
      sectionBg: 'bg-amber-500/12 border-amber-500/45 text-amber-200',
      fadeTop: 'from-[#050507] via-[#050507]/85 to-transparent',
      fadeBottom: 'from-[#050507] via-[#050507]/85 to-transparent',
      guideBg: 'bg-white/[0.03] border-amber-500/45',
      muted: 'text-zinc-400',
    },
    contrast: {
      bg: 'bg-black',
      text: 'text-[#FDE68A]',
      cue: 'text-rose-400',
      sectionBg: 'bg-rose-500/15 border-rose-400/50 text-rose-200',
      fadeTop: 'from-black via-black/85 to-transparent',
      fadeBottom: 'from-black via-black/85 to-transparent',
      guideBg: 'bg-amber-400/[0.05] border-amber-400/60',
      muted: 'text-zinc-400',
    },
    paper: {
      bg: 'bg-[#F8F7F4]',
      text: 'text-zinc-900',
      cue: 'text-rose-700',
      sectionBg: 'bg-amber-500/15 border-amber-600/50 text-amber-950',
      fadeTop: 'from-[#F8F7F4] via-[#F8F7F4]/85 to-transparent',
      fadeBottom: 'from-[#F8F7F4] via-[#F8F7F4]/85 to-transparent',
      guideBg: 'bg-zinc-900/[0.04] border-amber-600/50',
      muted: 'text-zinc-600',
    },
  }[settings.theme];

  const fontFamilyClass =
    settings.fontFamily === 'serif'
      ? 'font-prompter-serif'
      : settings.fontFamily === 'mono'
        ? 'font-prompter-mono'
        : 'font-prompter-sans';

  const mirrorTransform = `${settings.mirrorHorizontal ? 'scaleX(-1)' : ''} ${
    settings.mirrorVertical ? 'scaleY(-1)' : ''
  }`.trim();

  // Remaining time based on script scroll progress and WPM target
  const remainingSeconds = Math.max(
    0,
    Math.round(totalEstimatedSeconds * (1 - scrollProgress))
  );

  const hasVideoTrack =
    settings.recordingMode === 'video-audio' &&
    stream !== null &&
    stream.getVideoTracks().length > 0;

  return (
    <div
      ref={stageContainerRef}
      className={`relative flex-1 min-h-0 flex flex-col overflow-hidden ${themeClasses.bg}`}
    >
      {/* Optional Full-Bleed Camera Backdrop */}
      {hasVideoTrack && settings.cameraLayout === 'backdrop' && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <video
            ref={backdropVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover -scale-x-100 opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/75" />
        </div>
      )}

      {/* Presentation Timer & Section Progress Strip */}
      <div className="relative z-20 border-b border-zinc-800/50 bg-black/25 backdrop-blur-sm">
        {/* Progress Track Line */}
        <div className="h-[3px] w-full bg-zinc-800/70">
          <div
            className="h-full bg-amber-500 transition-[width] duration-150"
            style={{ width: `${Math.round(scrollProgress * 100)}%` }}
          />
        </div>

        <div className="px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Elapsed & Remaining Timer */}
          <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
            <div className="flex items-center gap-1.5">
              <span className={themeClasses.muted}>Elapsed</span>
              <span
                className={`font-semibold ${
                  settings.theme === 'paper' ? 'text-zinc-900' : 'text-zinc-100'
                }`}
              >
                {formatTimecode(presentationElapsed)}
              </span>
            </div>
            <span aria-hidden="true" className="text-zinc-600">
              /
            </span>
            <div className="flex items-center gap-1.5">
              <span className={themeClasses.muted}>Remaining</span>
              <span className="font-semibold text-amber-400">
                {formatTimecode(remainingSeconds)}
              </span>
            </div>
          </div>

          {/* Recording Badge & Live Mic Meter */}
          <div className="flex items-center gap-3">
            {isRecording && (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-rose-600 text-white text-xs font-mono font-semibold tabular-nums">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>{isRecordingPaused ? 'PAUSED' : 'REC'}</span>
                <span>{formatTimecode(recordingElapsed)}</span>
              </div>
            )}

            {settings.recordingMode !== 'prompter-only' && (
              <div
                className="flex items-center gap-2"
                title="Microphone Input Level"
              >
                <span className={`text-[11px] font-mono ${themeClasses.muted}`}>
                  MIC
                </span>
                <div className="w-16 sm:w-20 h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-75 ${
                      audioLevel > 85
                        ? 'bg-rose-500'
                        : audioLevel > 55
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Section Progress Markers Bar */}
        {sectionMarkers.length > 0 && (
          <div className="px-4 sm:px-6 pb-2.5 flex items-center gap-2 overflow-x-auto">
            {sectionMarkers.map((marker) => {
              const isCurrent = marker.index === activeSectionIndex;
              const isPast = marker.index < activeSectionIndex;
              return (
                <button
                  key={`${marker.blockIndex}-${marker.title}`}
                  type="button"
                  onClick={() =>
                    jumpToBlock(blockRefs.current.get(marker.blockIndex))
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    isCurrent
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : isPast
                        ? 'bg-zinc-800/70 text-zinc-400 hover:text-zinc-200'
                        : 'bg-zinc-900/80 border border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <span className="font-mono text-[11px] tabular-nums">
                    {String(marker.index + 1).padStart(2, '0')}
                  </span>
                  <span>{marker.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hardware Error Notice */}
      {hardwareError && settings.recordingMode !== 'prompter-only' && (
        <div className="relative z-20 mx-4 sm:mx-auto mt-2 px-4 py-2 rounded-lg bg-rose-950/90 border border-rose-800/70 text-xs text-rose-100 flex items-center gap-3">
          <span>{hardwareError}</span>
          <button
            type="button"
            onClick={onRequestHardware}
            className="underline font-medium whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {/* Take Saved Notification */}
      {savedBannerVisible && (
        <div className="relative z-30 mx-4 sm:mx-auto mt-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 flex items-center gap-3 shadow-lg">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>Presentation take saved locally.</span>
          <button
            type="button"
            onClick={onGoToReview}
            className="font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2 whitespace-nowrap"
          >
            Review Take
          </button>
        </div>
      )}

      {/* Picture-in-Picture Camera Monitor */}
      {hasVideoTrack && settings.cameraLayout === 'pip' && (
        <div className="absolute top-28 right-4 sm:right-6 z-20 w-36 sm:w-56 aspect-video rounded-xl overflow-hidden border border-zinc-700/80 bg-zinc-950 shadow-2xl">
          <video
            ref={pipVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover -scale-x-100"
          />
        </div>
      )}

      {/* Reading Glass Viewport */}
      <div className="relative flex-1 min-h-0">
        {settings.showGuideLine && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 z-10 border-y ${themeClasses.guideBg}`}
            style={{
              top: `${settings.guideLinePosition}%`,
              height: `${Math.max(56, settings.fontSize * settings.lineHeight * 1.15)}px`,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="max-w-6xl mx-auto h-full px-3 sm:px-4 flex items-center justify-between">
              <span className="w-2.5 h-2.5 border-l-2 border-t-2 border-amber-500 rotate-135" />
              <span className="w-2.5 h-2.5 border-r-2 border-t-2 border-amber-500 -rotate-135" />
            </div>
          </div>
        )}

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-20 z-10 bg-gradient-to-b ${themeClasses.fadeTop}`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-24 z-10 bg-gradient-to-t ${themeClasses.fadeBottom}`}
        />

        {/* Scrollable Prompter Canvas */}
        <div
          ref={scrollContainerRef}
          onScroll={handleManualScroll}
          className="relative z-0 h-full w-full overflow-y-auto px-5 sm:px-12"
        >
          <div
            ref={textContentRef}
            className={`mx-auto transition-[max-width] duration-150 ${fontFamilyClass} ${themeClasses.text}`}
            style={{
              maxWidth: `min(100%, ${settings.columnWidth}%)`,
              paddingTop: `${settings.guideLinePosition}vh`,
              paddingBottom: '65vh',
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              textAlign: settings.textAlign,
              transform: mirrorTransform || undefined,
            }}
          >
            {blocks.length === 0 ? (
              <p className="opacity-60">
                Your script is empty. Return to Script &amp; Setup to add text.
              </p>
            ) : (
              blocks.map((block, blockIndex) => {
                if (block.type === 'section') {
                  const markerObj = sectionMarkers.find(
                    (m) => m.blockIndex === blockIndex
                  );
                  const markerNum = markerObj ? markerObj.index + 1 : 1;
                  return (
                    <div
                      key={blockIndex}
                      ref={(el) => {
                        if (el) blockRefs.current.set(blockIndex, el);
                        else blockRefs.current.delete(blockIndex);
                      }}
                      onClick={(e) => jumpToBlock(e.currentTarget)}
                      className={`cursor-pointer my-10 px-5 py-3.5 rounded-xl border flex items-center gap-3.5 ${themeClasses.sectionBg}`}
                    >
                      <span className="font-mono text-[0.42em] font-semibold tracking-widest uppercase px-2 py-0.5 rounded bg-amber-500 text-zinc-950 shrink-0 tabular-nums">
                        {String(markerNum).padStart(2, '0')}
                      </span>
                      <span className="font-display text-[0.65em] font-bold tracking-tight">
                        {block.title}
                      </span>
                    </div>
                  );
                }

                if (block.type === 'cue') {
                  return (
                    <div
                      key={blockIndex}
                      ref={(el) => {
                        if (el) blockRefs.current.set(blockIndex, el);
                        else blockRefs.current.delete(blockIndex);
                      }}
                      onClick={(e) => jumpToBlock(e.currentTarget)}
                      className={`cursor-pointer my-6 font-mono text-[0.52em] tracking-wide uppercase font-semibold ${themeClasses.cue}`}
                    >
                      {block.text}
                    </div>
                  );
                }

                if (block.type === 'list') {
                  return (
                    <ul
                      key={blockIndex}
                      ref={(el) => {
                        if (el) blockRefs.current.set(blockIndex, el);
                        else blockRefs.current.delete(blockIndex);
                      }}
                      onClick={(e) => jumpToBlock(e.currentTarget)}
                      className="cursor-pointer mb-8 list-disc pl-[1.15em] space-y-3 text-left"
                    >
                      {block.items.map((item, itemIdx) => (
                        <li key={itemIdx}>
                          {renderInlineFormatted(item, themeClasses.cue)}
                        </li>
                      ))}
                    </ul>
                  );
                }

                return (
                  <p
                    key={blockIndex}
                    ref={(el) => {
                      if (el) blockRefs.current.set(blockIndex, el);
                      else blockRefs.current.delete(blockIndex);
                    }}
                    onClick={(e) => jumpToBlock(e.currentTarget)}
                    title="Tap to jump reading line here"
                    className="cursor-pointer mb-8 last:mb-0"
                  >
                    {block.lines.map((line, lIdx) => (
                      <React.Fragment key={lIdx}>
                        {renderInlineFormatted(line, themeClasses.cue)}
                        {lIdx < block.lines.length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </p>
                );
              })
            )}
          </div>
        </div>

        {/* Countdown Overlay */}
        {countdownValue !== null && (
          <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <div className="font-mono text-7xl sm:text-8xl font-bold text-white tabular-nums">
              {countdownValue}
            </div>
            <p className="text-sm text-zinc-300">
              Starting {settings.recordingMode === 'video-audio' ? 'camera & ' : ''}
              prompter...
            </p>
            <button
              type="button"
              onClick={clearCountdown}
              className="px-5 py-2.5 min-h-[44px] text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Breathable Mobile-Friendly Stage Control Dock */}
      <div className="relative z-30 border-t border-zinc-800/90 bg-[#0D0D10]/95 backdrop-blur-md px-3 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Primary Playback & Recording */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsScrolling((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white transition-colors whitespace-nowrap shrink-0"
            >
              {isScrolling ? (
                <>
                  <Pause className="w-4 h-4" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>Scroll</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={resetToTop}
              aria-label="Reset script and timer to top"
              title="Reset (R)"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>

            {settings.recordingMode !== 'prompter-only' && (
              <>
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={beginRecordingWithCountdown}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Circle className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    <span>Record</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={
                        isRecordingPaused ? onResumeRecording : onPauseRecording
                      }
                      className="px-3 py-2.5 min-h-[44px] text-xs font-medium rounded-xl bg-zinc-800 text-zinc-100 hover:bg-zinc-700 whitespace-nowrap"
                    >
                      {isRecordingPaused ? 'Resume' : 'Pause Rec'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-500 whitespace-nowrap"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                      <span>Stop</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quick Speed & Size Controls (compact on mobile, expanded on desktop) */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Decrease scroll speed"
                onClick={() =>
                  onUpdateSettings({
                    wordsPerMinute: Math.max(60, settings.wordsPerMinute - 5),
                  })
                }
                className="min-w-[40px] min-h-[40px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center"
              >
                <Minus className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="font-mono text-xs text-zinc-100 tabular-nums px-1 whitespace-nowrap">
                {settings.wordsPerMinute} WPM
              </span>
              <button
                type="button"
                aria-label="Increase scroll speed"
                onClick={() =>
                  onUpdateSettings({
                    wordsPerMinute: Math.min(280, settings.wordsPerMinute + 5),
                  })
                }
                className="min-w-[40px] min-h-[40px] rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Decrease font size"
                onClick={() =>
                  onUpdateSettings({
                    fontSize: Math.max(24, settings.fontSize - 2),
                  })
                }
                className="min-w-[40px] min-h-[40px] text-xs font-semibold rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
              >
                A-
              </button>
              <span className="font-mono text-xs text-zinc-100 tabular-nums px-1">
                {settings.fontSize}px
              </span>
              <button
                type="button"
                aria-label="Increase font size"
                onClick={() =>
                  onUpdateSettings({
                    fontSize: Math.min(96, settings.fontSize + 2),
                  })
                }
                className="min-w-[40px] min-h-[40px] text-xs font-semibold rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
              >
                A+
              </button>
            </div>
          </div>

          {/* Stage Options Sheet Trigger + Desktop Quick Toggles */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOptionsSheetOpen(true)}
              aria-label="Open stage display options"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span className="hidden sm:inline">Display</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="hidden sm:inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stage Display Options Sheet (keeps bottom dock spacious on mobile & desktop) */}
      {optionsSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={() => setOptionsSheetOpen(false)}
          />
          <div className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0D0D10] border border-zinc-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Stage Display Controls
              </h2>
              <button
                type="button"
                onClick={() => setOptionsSheetOpen(false)}
                aria-label="Close display controls"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Font Size Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Speaker Font Size</span>
                <span className="font-mono text-zinc-100 tabular-nums">
                  {settings.fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={24}
                max={96}
                step={2}
                value={settings.fontSize}
                onChange={(e) =>
                  onUpdateSettings({ fontSize: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            {/* Speed Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium">Scroll Speed</span>
                <span className="font-mono text-zinc-100 tabular-nums">
                  {settings.wordsPerMinute} WPM
                </span>
              </div>
              <input
                type="range"
                min={60}
                max={280}
                step={5}
                value={settings.wordsPerMinute}
                onChange={(e) =>
                  onUpdateSettings({ wordsPerMinute: Number(e.target.value) })
                }
                className="studio-slider w-full"
              />
            </div>

            {/* Stage Theme */}
            <div className="space-y-2">
              <span className="block text-xs text-zinc-300 font-medium">
                Glass Theme
              </span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                {(
                  [
                    { id: 'obsidian', label: 'Dark' },
                    { id: 'contrast', label: 'Amber' },
                    { id: 'paper', label: 'Paper' },
                  ] as { id: PrompterTheme; label: string }[]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: item.id })}
                    className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                      settings.theme === item.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Countdown Delay & Toggles */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ showGuideLine: !settings.showGuideLine })
                }
                className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border text-xs font-medium ${
                  settings.showGuideLine
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                }`}
              >
                {settings.showGuideLine ? (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                )}
                Guide Line
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    mirrorHorizontal: !settings.mirrorHorizontal,
                  })
                }
                className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border text-xs font-medium ${
                  settings.mirrorHorizontal
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                }`}
              >
                <FlipHorizontal className="w-4 h-4" aria-hidden="true" />
                Mirror H
              </button>

              {settings.recordingMode === 'video-audio' && (
                <button
                  type="button"
                  onClick={cycleCameraLayout}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border bg-zinc-900 border-zinc-800 text-zinc-200 text-xs font-medium"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  Camera: {settings.cameraLayout.toUpperCase()}
                </button>
              )}

              <select
                aria-label="Countdown delay"
                value={settings.countdownSeconds}
                onChange={(e) =>
                  onUpdateSettings({
                    countdownSeconds: Number(e.target.value) as 0 | 3 | 5,
                  })
                }
                className="min-h-[44px] px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-mono"
              >
                <option value={0}>0s countdown</option>
                <option value={3}>3s countdown</option>
                <option value={5}>5s countdown</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
