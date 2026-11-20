import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Camera,
  Cloud,
  CloudOff,
  Download,
  FileUp,
  FlipHorizontal,
  FlipVertical,
  FolderOpen,
  LogOut,
  Mic,
  Plus,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  VideoOff,
  X,
} from 'lucide-react';
import {
  MediaDeviceOption,
  PrompterFontFamily,
  PrompterSettings,
  PrompterTheme,
  RecordingMode,
  Script,
} from '../types/teleprompter';
import { extractSectionMarkers } from '../utils/markdown';
import {
  countWords,
  estimateReadingSeconds,
  formatRelativeDate,
  formatTimecode,
} from '../utils/media';
import { RichScriptEditor } from './RichScriptEditor';

interface ScriptEditorViewProps {
  scripts: Script[];
  activeScript: Script;
  settings: PrompterSettings;
  user: User | null;
  authReady: boolean;
  isSyncingCloud: boolean;
  cloudError: string | null;
  stream: MediaStream | null;
  videoDevices: MediaDeviceOption[];
  audioDevices: MediaDeviceOption[];
  permissionState: 'idle' | 'requesting' | 'ready' | 'error';
  hardwareError: string | null;
  audioLevel: number;
  onSelectScript: (id: string) => void;
  onCreateScript: () => void;
  onDeleteScript: (id: string) => void;
  onUpdateScript: (
    id: string,
    patch: Partial<Pick<Script, 'title' | 'content' | 'format'>>
  ) => void;
  onUpdateSettings: (patch: Partial<PrompterSettings>) => void;
  onTestHardware: (overrideMode?: RecordingMode) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onUploadLocalToCloud: () => void;
}

export function ScriptEditorView({
  scripts,
  activeScript,
  settings,
  user,
  authReady,
  isSyncingCloud,
  cloudError,
  stream,
  videoDevices,
  audioDevices,
  permissionState,
  hardwareError,
  audioLevel,
  onSelectScript,
  onCreateScript,
  onDeleteScript,
  onUpdateScript,
  onUpdateSettings,
  onTestHardware,
  onSignIn,
  onSignOut,
  onUploadLocalToCloud,
}: ScriptEditorViewProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = previewVideoRef.current;
    if (!videoEl) return;
    if (stream && settings.recordingMode === 'video-audio' && setupOpen) {
      videoEl.srcObject = stream;
    } else {
      videoEl.srcObject = null;
    }
  }, [stream, settings.recordingMode, setupOpen]);

  const wordCount = useMemo(
    () => countWords(activeScript.content),
    [activeScript.content]
  );
  const estSeconds = useMemo(
    () => estimateReadingSeconds(activeScript.content, settings.wordsPerMinute),
    [activeScript.content, settings.wordsPerMinute]
  );
  const sectionCount = useMemo(
    () => extractSectionMarkers(activeScript.content).length,
    [activeScript.content]
  );

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const baseTitle = file.name.replace(/\.[^.]+$/, '');
      onUpdateScript(activeScript.id, {
        title:
          activeScript.title === 'Untitled Script'
            ? baseTitle
            : activeScript.title,
        content: text,
        format: file.name.toLowerCase().endsWith('.txt') ? 'plain' : 'markdown',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleExportScript = (ext: 'md' | 'txt') => {
    const safeName = (activeScript.title || 'script')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob([activeScript.content], {
      type: ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName || 'script'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleModeChange = (nextMode: RecordingMode) => {
    onUpdateSettings({ recordingMode: nextMode });
    if (nextMode !== 'prompter-only' && permissionState === 'ready') {
      onTestHardware(nextMode);
    }
  };

  const hasLiveVideo =
    settings.recordingMode === 'video-audio' &&
    stream !== null &&
    stream.getVideoTracks().length > 0;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-[#09090B] overflow-y-auto">
      {/* Spacious Centered Studio Canvas */}
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col px-5 sm:px-10 pt-5 pb-24 md:pb-12">
        {/* Clean Workspace Trigger Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              Scripts ({scripts.length})
            </button>

            <button
              type="button"
              onClick={onCreateScript}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 text-zinc-400" aria-hidden="true" />
              New
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {user ? (
                <>
                  <Cloud className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {isSyncingCloud ? 'Syncing...' : 'Cloud Synced'}
                  </span>
                  <span className="sm:hidden">Synced</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                  <span>Cloud Sign In</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-medium rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              <SlidersHorizontal className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>
                {settings.wordsPerMinute} WPM · {settings.fontSize}px
              </span>
            </button>
          </div>
        </div>

        {/* Script Title & Quiet Metadata */}
        <div className="space-y-3 pb-6">
          <input
            type="text"
            value={activeScript.title}
            onChange={(e) =>
              onUpdateScript(activeScript.id, { title: e.target.value })
            }
            placeholder="Presentation Title"
            aria-label="Presentation Title"
            className="w-full bg-transparent font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-zinc-400 tabular-nums">
            <span>{wordCount} words</span>
            <span aria-hidden="true">·</span>
            <span>Est. {formatTimecode(estSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatRelativeDate(activeScript.updatedAt)}</span>
          </div>
        </div>

        {/* Rich Text Editor */}
        <RichScriptEditor
          scriptId={activeScript.id}
          content={activeScript.content}
          onChange={(nextMarkdown) =>
            onUpdateScript(activeScript.id, { content: nextMarkdown })
          }
        />
      </div>

      {/* Left Slide-Over Drawer: Scripts Library & Cloud Sync */}
      {libraryOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={() => setLibraryOpen(false)}
          />
          <aside className="relative z-10 w-full max-w-sm bg-[#0D0D10] border-r border-zinc-800 flex flex-col h-full shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Scripts &amp; Cloud Sync
              </h2>
              <button
                type="button"
                onClick={() => setLibraryOpen(false)}
                aria-label="Close scripts drawer"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Cloud Account Panel */}
            <div className="p-5 border-b border-zinc-800/80 space-y-3">
              {!authReady ? (
                <p className="text-xs text-zinc-400">Checking account status...</p>
              ) : user ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-100 truncate">
                        {user.displayName || 'Speaker Account'}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        {user.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white whitespace-nowrap shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      Sign Out
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onUploadLocalToCloud}
                    disabled={isSyncingCloud}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-xs font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    {isSyncingCloud ? 'Syncing Scripts...' : 'Sync All Scripts to Cloud'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Sign in with Google to save your Markdown scripts to the cloud and access them on any phone, tablet, or desktop.
                  </p>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
                  >
                    <Cloud className="w-4 h-4" aria-hidden="true" />
                    Sign In with Google
                  </button>
                </div>
              )}

              {cloudError && (
                <p className="text-xs text-rose-400">{cloudError}</p>
              )}
            </div>

            {/* Import & Export */}
            <div className="px-5 py-3 border-b border-zinc-800/80 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 rounded-lg"
              >
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                Import .md/.txt
              </button>
              <button
                type="button"
                onClick={() => handleExportScript('md')}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export .md
              </button>
              <button
                type="button"
                onClick={() => handleExportScript('txt')}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-zinc-700 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                .txt
              </button>
            </div>

            {/* Script List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {scripts.map((script) => {
                const isSelected = script.id === activeScript.id;
                const words = countWords(script.content);
                const secs = estimateReadingSeconds(
                  script.content,
                  settings.wordsPerMinute
                );
                return (
                  <div
                    key={script.id}
                    className={`flex items-center justify-between gap-2 rounded-xl p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-zinc-800/85 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectScript(script.id);
                        setLibraryOpen(false);
                      }}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="text-sm font-medium truncate">
                        {script.title || 'Untitled Script'}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 tabular-nums">
                        <span>{words} words</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimecode(secs)}</span>
                        {script.cloudSynced && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">Cloud</span>
                          </>
                        )}
                      </div>
                    </button>

                    {scripts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteScript(script.id)}
                        aria-label={`Delete ${script.title}`}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => {
                  onCreateScript();
                  setLibraryOpen(false);
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Create New Script
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Right Slide-Over Drawer: Typography, Pacing & Hardware Setup */}
      {setupOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-xs"
            onClick={() => setSetupOpen(false)}
          />
          <aside className="relative z-10 w-full max-w-md bg-[#0D0D10] border-l border-zinc-800 flex flex-col h-full shadow-2xl">
            <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-zinc-100">
                Stage &amp; Hardware Setup
              </h2>
              <button
                type="button"
                onClick={() => setSetupOpen(false)}
                aria-label="Close setup drawer"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-7">
              {/* Pacing & Typography */}
              <section className="space-y-5">
                <h3 className="font-display text-sm font-semibold text-zinc-200">
                  Pacing &amp; Speaker Display
                </h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="setup-wpm" className="text-zinc-300 font-medium">
                      Scroll Speed
                    </label>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {settings.wordsPerMinute} WPM
                    </span>
                  </div>
                  <input
                    id="setup-wpm"
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="setup-fontsize" className="text-zinc-300 font-medium">
                      Speaker Font Size
                    </label>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {settings.fontSize}px
                    </span>
                  </div>
                  <input
                    id="setup-fontsize"
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="setup-lineheight" className="text-zinc-300 font-medium">
                        Line Spacing
                      </label>
                      <span className="font-mono text-zinc-200 tabular-nums">
                        {settings.lineHeight.toFixed(1)}
                      </span>
                    </div>
                    <input
                      id="setup-lineheight"
                      type="range"
                      min={1.2}
                      max={2.0}
                      step={0.1}
                      value={settings.lineHeight}
                      onChange={(e) =>
                        onUpdateSettings({ lineHeight: Number(e.target.value) })
                      }
                      className="studio-slider w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="setup-width" className="text-zinc-300 font-medium">
                        Column Width
                      </label>
                      <span className="font-mono text-zinc-200 tabular-nums">
                        {settings.columnWidth}%
                      </span>
                    </div>
                    <input
                      id="setup-width"
                      type="range"
                      min={45}
                      max={95}
                      step={5}
                      value={settings.columnWidth}
                      onChange={(e) =>
                        onUpdateSettings({ columnWidth: Number(e.target.value) })
                      }
                      className="studio-slider w-full"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-xs text-zinc-300 font-medium">
                    Typeface
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                    {(
                      [
                        { id: 'sans', label: 'Sans' },
                        { id: 'serif', label: 'Serif' },
                        { id: 'mono', label: 'Mono' },
                      ] as { id: PrompterFontFamily; label: string }[]
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onUpdateSettings({ fontFamily: item.id })}
                        className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors ${
                          settings.fontFamily === item.id
                            ? 'bg-zinc-800 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-xs text-zinc-300 font-medium">
                    Stage Glass Theme
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                    {(
                      [
                        { id: 'obsidian', label: 'Dark Glass' },
                        { id: 'contrast', label: 'Amber Cue' },
                        { id: 'paper', label: 'Paper Light' },
                      ] as { id: PrompterTheme; label: string }[]
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onUpdateSettings({ theme: item.id })}
                        className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors ${
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

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ mirrorHorizontal: !settings.mirrorHorizontal })
                    }
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium rounded-xl border transition-colors ${
                      settings.mirrorHorizontal
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <FlipHorizontal className="w-4 h-4" aria-hidden="true" />
                    Mirror H
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ mirrorVertical: !settings.mirrorVertical })
                    }
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium rounded-xl border transition-colors ${
                      settings.mirrorVertical
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <FlipVertical className="w-4 h-4" aria-hidden="true" />
                    Mirror V
                  </button>
                </div>
              </section>

              <hr className="border-zinc-800/80" />

              {/* Hardware Setup */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-zinc-200">
                    Camera &amp; Microphone
                  </h3>
                  {settings.recordingMode !== 'prompter-only' && (
                    <button
                      type="button"
                      onClick={() => onTestHardware()}
                      disabled={permissionState === 'requesting'}
                      className="text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-4"
                    >
                      {permissionState === 'ready'
                        ? 'Reconnect'
                        : permissionState === 'requesting'
                          ? 'Connecting...'
                          : 'Test Hardware'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
                  {(
                    [
                      { id: 'video-audio', label: 'Video + Mic' },
                      { id: 'audio-only', label: 'Voice Only' },
                      { id: 'prompter-only', label: 'Script Only' },
                    ] as { id: RecordingMode; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleModeChange(item.id)}
                      className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors ${
                        settings.recordingMode === item.id
                          ? 'bg-zinc-800 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {hardwareError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-200 space-y-2"
                  >
                    <p>{hardwareError}</p>
                    <div className="flex items-center gap-3">
                      {settings.recordingMode === 'video-audio' && (
                        <button
                          type="button"
                          onClick={() => handleModeChange('audio-only')}
                          className="font-medium text-white underline"
                        >
                          Use Voice Only
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleModeChange('prompter-only')}
                        className="font-medium text-zinc-300 underline"
                      >
                        Script Only
                      </button>
                    </div>
                  </div>
                )}

                {settings.recordingMode !== 'prompter-only' && (
                  <div className="space-y-4">
                    {settings.recordingMode === 'video-audio' && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="camera-select"
                          className="flex items-center gap-1.5 text-xs text-zinc-400"
                        >
                          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                          Camera
                        </label>
                        <select
                          id="camera-select"
                          value={settings.selectedVideoDeviceId}
                          onChange={(e) =>
                            onUpdateSettings({
                              selectedVideoDeviceId: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2.5 min-h-[44px] text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Default System Camera</option>
                          {videoDevices.map((dev) => (
                            <option key={dev.deviceId} value={dev.deviceId}>
                              {dev.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label
                        htmlFor="mic-select"
                        className="flex items-center gap-1.5 text-xs text-zinc-400"
                      >
                        <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                        Microphone
                      </label>
                      <select
                        id="mic-select"
                        value={settings.selectedAudioDeviceId}
                        onChange={(e) =>
                          onUpdateSettings({
                            selectedAudioDeviceId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2.5 min-h-[44px] text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Default System Microphone</option>
                        {audioDevices.map((dev) => (
                          <option key={dev.deviceId} value={dev.deviceId}>
                            {dev.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {settings.recordingMode === 'video-audio' && (
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                        {hasLiveVideo ? (
                          <video
                            ref={previewVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover -scale-x-100"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 px-4 text-center">
                            <VideoOff
                              className="w-5 h-5 text-zinc-500"
                              aria-hidden="true"
                            />
                            <button
                              type="button"
                              onClick={() => onTestHardware()}
                              className="px-3.5 py-2 min-h-[40px] text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg"
                            >
                              Preview Camera
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Mic Input Level</span>
                        <span className="font-mono text-zinc-300 tabular-nums">
                          {permissionState === 'ready'
                            ? `${audioLevel}%`
                            : 'Inactive'}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
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
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
