import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PrompterStageView } from './components/PrompterStageView';
import { ReviewTakesView } from './components/ReviewTakesView';
import { ScriptEditorView } from './components/ScriptEditorView';
import { TopBar } from './components/TopBar';
import { auth, googleProvider, testConnection } from './firebase';
import { useMediaHardware } from './hooks/useMediaHardware';
import {
  PrompterSettings,
  ReviewNote,
  Script,
  StudioView,
  TakeRecording,
} from './types/teleprompter';
import {
  deleteCloudScript,
  ensureUserProfile,
  subscribeToUserScripts,
  uploadLocalScriptsToCloud,
  upsertCloudScript,
} from './utils/firestoreScripts';
import {
  deleteTake,
  getAllTakes,
  loadActiveScriptId,
  loadScripts,
  loadSettings,
  saveActiveScriptId,
  saveScripts,
  saveSettings,
  saveTake,
  updateTakeNotes,
} from './utils/storage';

export default function App() {
  const initialScripts = useMemo(() => loadScripts(), []);
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [activeScriptId, setActiveScriptId] = useState<string>(() =>
    loadActiveScriptId(initialScripts)
  );
  const [settings, setSettings] = useState<PrompterSettings>(() => loadSettings());
  const [activeView, setActiveView] = useState<StudioView>('editor');
  const [takes, setTakes] = useState<TakeRecording[]>([]);
  const [takesLoading, setTakesLoading] = useState<boolean>(true);

  // Firebase Auth & Cloud Sync state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const cloudSyncTimersRef = useRef<Map<string, number>>(new Map());
  const hasSeededCloudRef = useRef<boolean>(false);
  const localScriptsRef = useRef<Script[]>(scripts);
  localScriptsRef.current = scripts;

  const hardware = useMediaHardware({
    mode: settings.recordingMode,
    videoDeviceId: settings.selectedVideoDeviceId,
    audioDeviceId: settings.selectedAudioDeviceId,
  });

  // Startup Firestore connectivity check
  useEffect(() => {
    testConnection();
  }, []);

  // Auth listener & Firestore subscription
  useEffect(() => {
    let unsubScripts: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubScripts) {
        unsubScripts();
        unsubScripts = null;
      }

      setUser(nextUser);
      setAuthReady(true);
      setCloudError(null);
      hasSeededCloudRef.current = false;

      if (!nextUser) {
        return;
      }

      try {
        setIsSyncingCloud(true);
        await ensureUserProfile(nextUser);

        unsubScripts = subscribeToUserScripts(
          nextUser.uid,
          async (cloudScripts) => {
            if (cloudScripts.length === 0 && !hasSeededCloudRef.current) {
              hasSeededCloudRef.current = true;
              try {
                await uploadLocalScriptsToCloud(
                  nextUser.uid,
                  localScriptsRef.current
                );
              } catch (err) {
                setCloudError(
                  err instanceof Error
                    ? err.message
                    : 'Failed to sync initial local scripts.'
                );
              } finally {
                setIsSyncingCloud(false);
              }
              return;
            }

            hasSeededCloudRef.current = true;
            if (cloudScripts.length > 0) {
              setScripts(cloudScripts);
              setActiveScriptId((currId) =>
                cloudScripts.some((s) => s.id === currId)
                  ? currId
                  : cloudScripts[0].id
              );
            }
            setIsSyncingCloud(false);
          },
          (err) => {
            setIsSyncingCloud(false);
            setCloudError(err.message);
          }
        );
      } catch (err) {
        setIsSyncingCloud(false);
        setCloudError(
          err instanceof Error ? err.message : 'Unable to initialize cloud sync.'
        );
      }
    });

    return () => {
      unsubAuth();
      if (unsubScripts) unsubScripts();
    };
  }, []);

  // Load persisted takes from IndexedDB on mount
  useEffect(() => {
    let active = true;
    getAllTakes()
      .then((loaded) => {
        if (active) setTakes(loaded);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setTakesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    saveScripts(scripts);
  }, [scripts]);

  useEffect(() => {
    saveActiveScriptId(activeScriptId);
  }, [activeScriptId]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const activeScript = useMemo(() => {
    return scripts.find((s) => s.id === activeScriptId) ?? scripts[0];
  }, [scripts, activeScriptId]);

  const updateSettings = useCallback((patch: Partial<PrompterSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (
      hardware.permissionState === 'ready' &&
      settings.recordingMode !== 'prompter-only' &&
      !hardware.isRecording
    ) {
      hardware.requestHardwareStream(settings.recordingMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.selectedVideoDeviceId, settings.selectedAudioDeviceId]);

  const scheduleCloudUpsert = useCallback(
    (script: Script) => {
      if (!user) return;
      const prevTimer = cloudSyncTimersRef.current.get(script.id);
      if (prevTimer) clearTimeout(prevTimer);

      const timer = window.setTimeout(async () => {
        try {
          setIsSyncingCloud(true);
          await upsertCloudScript(user.uid, script);
          setCloudError(null);
        } catch (err) {
          setCloudError(
            err instanceof Error ? err.message : 'Cloud sync failed.'
          );
        } finally {
          setIsSyncingCloud(false);
        }
      }, 650);

      cloudSyncTimersRef.current.set(script.id, timer);
    },
    [user]
  );

  const handleCreateScript = useCallback(() => {
    const newScript: Script = {
      id: `script-${Date.now()}`,
      title: 'Untitled Script',
      content: '',
      format: 'markdown',
      updatedAt: Date.now(),
      cloudSynced: Boolean(user),
    };
    setScripts((prev) => [newScript, ...prev]);
    setActiveScriptId(newScript.id);
    if (user) {
      scheduleCloudUpsert(newScript);
    }
  }, [scheduleCloudUpsert, user]);

  const handleDeleteScript = useCallback(
    async (id: string) => {
      setScripts((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((s) => s.id !== id);
        if (id === activeScriptId && filtered[0]) {
          setActiveScriptId(filtered[0].id);
        }
        return filtered;
      });
      if (user) {
        try {
          await deleteCloudScript(user.uid, id);
        } catch (err) {
          setCloudError(
            err instanceof Error ? err.message : 'Failed to delete cloud script.'
          );
        }
      }
    },
    [activeScriptId, user]
  );

  const handleUpdateScript = useCallback(
    (
      id: string,
      patch: Partial<Pick<Script, 'title' | 'content' | 'format'>>
    ) => {
      setScripts((prev) =>
        prev.map((script) => {
          if (script.id !== id) return script;
          const updated: Script = {
            ...script,
            ...patch,
            updatedAt: Date.now(),
          };
          scheduleCloudUpsert(updated);
          return updated;
        })
      );
    },
    [scheduleCloudUpsert]
  );

  const handleSignIn = useCallback(async () => {
    setCloudError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setCloudError(
        err instanceof Error
          ? err.message
          : 'Google sign-in was cancelled or blocked.'
      );
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setCloudError(null);
    await signOut(auth);
  }, []);

  const handleUploadLocalToCloud = useCallback(async () => {
    if (!user) return;
    setIsSyncingCloud(true);
    setCloudError(null);
    try {
      await uploadLocalScriptsToCloud(user.uid, scripts);
    } catch (err) {
      setCloudError(
        err instanceof Error ? err.message : 'Failed to upload scripts.'
      );
    } finally {
      setIsSyncingCloud(false);
    }
  }, [scripts, user]);

  const handleStopAndSaveTake = useCallback(async () => {
    const completed = await hardware.stopRecording();
    if (!completed || !activeScript) return;

    const newTake: TakeRecording = {
      id: `take-${Date.now()}`,
      scriptId: activeScript.id,
      scriptTitle: activeScript.title || 'Untitled Script',
      scriptSnapshot: activeScript.content,
      mode: completed.mode,
      mimeType: completed.mimeType,
      blob: completed.blob,
      durationSeconds: completed.durationSeconds,
      wordsPerMinute: settings.wordsPerMinute,
      createdAt: Date.now(),
      notes: [],
    };

    setTakes((prev) => [newTake, ...prev]);
    try {
      await saveTake(newTake);
    } catch {
      // Keep take in memory even if IndexedDB fails
    }
  }, [activeScript, hardware, settings.wordsPerMinute]);

  const handleAddNote = useCallback(async (takeId: string, note: ReviewNote) => {
    let nextNotes: ReviewNote[] = [];
    setTakes((prev) =>
      prev.map((take) => {
        if (take.id !== takeId) return take;
        nextNotes = [...take.notes, note];
        return { ...take, notes: nextNotes };
      })
    );
    try {
      await updateTakeNotes(takeId, nextNotes);
    } catch {
      // ignore IndexedDB error
    }
  }, []);

  const handleDeleteNote = useCallback(async (takeId: string, noteId: string) => {
    let nextNotes: ReviewNote[] = [];
    setTakes((prev) =>
      prev.map((take) => {
        if (take.id !== takeId) return take;
        nextNotes = take.notes.filter((n) => n.id !== noteId);
        return { ...take, notes: nextNotes };
      })
    );
    try {
      await updateTakeNotes(takeId, nextNotes);
    } catch {
      // ignore IndexedDB error
    }
  }, []);

  const handleDeleteTake = useCallback(async (takeId: string) => {
    setTakes((prev) => prev.filter((t) => t.id !== takeId));
    try {
      await deleteTake(takeId);
    } catch {
      // ignore IndexedDB error
    }
  }, []);

  const handleSelectView = useCallback(
    (view: StudioView) => {
      if (hardware.isRecording && view !== 'stage') return;
      setActiveView(view);
      if (view === 'review') {
        hardware.stopStream();
      }
    },
    [hardware]
  );

  const handlePrimaryTopAction = useCallback(() => {
    if (hardware.isRecording) return;
    if (activeView === 'stage') {
      setActiveView('editor');
    } else {
      setActiveView('stage');
    }
  }, [activeView, hardware.isRecording]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#09090B] text-zinc-100">
      <TopBar
        activeView={activeView}
        takesCount={takes.length}
        isRecording={hardware.isRecording}
        onSelectView={handleSelectView}
        onPrimaryAction={handlePrimaryTopAction}
      />

      {activeView === 'editor' && activeScript && (
        <ScriptEditorView
          scripts={scripts}
          activeScript={activeScript}
          settings={settings}
          user={user}
          authReady={authReady}
          isSyncingCloud={isSyncingCloud}
          cloudError={cloudError}
          stream={hardware.stream}
          videoDevices={hardware.videoDevices}
          audioDevices={hardware.audioDevices}
          permissionState={hardware.permissionState}
          hardwareError={hardware.errorMessage}
          audioLevel={hardware.audioLevel}
          onSelectScript={setActiveScriptId}
          onCreateScript={handleCreateScript}
          onDeleteScript={handleDeleteScript}
          onUpdateScript={handleUpdateScript}
          onUpdateSettings={updateSettings}
          onTestHardware={(overrideMode) =>
            hardware.requestHardwareStream(overrideMode)
          }
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onUploadLocalToCloud={handleUploadLocalToCloud}
        />
      )}

      {activeView === 'stage' && activeScript && (
        <PrompterStageView
          script={activeScript}
          settings={settings}
          stream={hardware.stream}
          permissionState={hardware.permissionState}
          hardwareError={hardware.errorMessage}
          audioLevel={hardware.audioLevel}
          isRecording={hardware.isRecording}
          isRecordingPaused={hardware.isRecordingPaused}
          recordingElapsed={hardware.recordingElapsed}
          onUpdateSettings={updateSettings}
          onRequestHardware={() => hardware.requestHardwareStream()}
          onStartRecording={hardware.startRecording}
          onPauseRecording={hardware.pauseRecording}
          onResumeRecording={hardware.resumeRecording}
          onStopAndSaveTake={handleStopAndSaveTake}
          onGoToReview={() => {
            hardware.stopStream();
            setActiveView('review');
          }}
        />
      )}

      {activeView === 'review' && (
        <ReviewTakesView
          takes={takes}
          isLoading={takesLoading}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onDeleteTake={handleDeleteTake}
          onLaunchStage={() => setActiveView('stage')}
        />
      )}

      <MobileBottomNav
        activeView={activeView}
        takesCount={takes.length}
        onSelectView={handleSelectView}
      />
    </div>
  );
}
