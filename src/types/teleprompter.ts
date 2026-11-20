export type StudioView = 'editor' | 'stage' | 'review';

export type RecordingMode = 'video-audio' | 'audio-only' | 'prompter-only';

export type PrompterFontFamily = 'sans' | 'serif' | 'mono';

export type PrompterTheme = 'obsidian' | 'paper' | 'contrast';

export type CameraLayoutMode = 'pip' | 'backdrop' | 'hidden';

export type ScriptFormat = 'markdown' | 'plain';

export interface Script {
  id: string;
  title: string;
  content: string;
  format: ScriptFormat;
  updatedAt: number;
  cloudSynced?: boolean;
}

export interface SectionMarker {
  index: number;
  title: string;
  blockIndex: number;
}

export interface PrompterSettings {
  fontSize: number; // px (24 - 96)
  lineHeight: number; // 1.2 - 2.0
  wordsPerMinute: number; // 60 - 280 WPM
  columnWidth: number; // % (45 - 95)
  fontFamily: PrompterFontFamily;
  textAlign: 'left' | 'center';
  theme: PrompterTheme;
  mirrorHorizontal: boolean;
  mirrorVertical: boolean;
  showGuideLine: boolean;
  guideLinePosition: number; // % from top (20 - 50)
  countdownSeconds: 0 | 3 | 5;
  recordingMode: RecordingMode;
  cameraLayout: CameraLayoutMode;
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
}

export interface ReviewNote {
  id: string;
  timestampSeconds: number;
  text: string;
  createdAt: number;
}

export interface TakeRecording {
  id: string;
  scriptId: string;
  scriptTitle: string;
  scriptSnapshot: string;
  mode: 'video-audio' | 'audio-only';
  mimeType: string;
  blob: Blob;
  durationSeconds: number;
  wordsPerMinute: number;
  createdAt: number;
  notes: ReviewNote[];
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
}
