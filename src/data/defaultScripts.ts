import { PrompterSettings, Script } from '../types/teleprompter';

export const DEFAULT_PROMPTER_SETTINGS: PrompterSettings = {
  fontSize: 46,
  lineHeight: 1.5,
  wordsPerMinute: 135,
  columnWidth: 74,
  fontFamily: 'sans',
  textAlign: 'left',
  theme: 'obsidian',
  mirrorHorizontal: false,
  mirrorVertical: false,
  showGuideLine: true,
  guideLinePosition: 32,
  countdownSeconds: 3,
  recordingMode: 'video-audio',
  cameraLayout: 'pip',
  selectedVideoDeviceId: '',
  selectedAudioDeviceId: '',
};

export const DEFAULT_SCRIPTS: Script[] = [
  {
    id: 'script-keynote-launch',
    title: 'Q4 Product Keynote — Opening Remarks',
    format: 'markdown',
    updatedAt: Date.now() - 1000 * 60 * 60 * 3,
    content: `## [SECTION: Opening Hook]

Good morning everyone, and **thank you** for joining us live today.

Over the past twelve months, our engineering and design teams have asked one fundamental question: *what happens when complex creative tools finally get out of your way?*

[PAUSE 2s]

## [SECTION: The Presenter Problem]

When we talk to presenters, founders, and educators, we hear the same story:

- You spend days crafting a message that truly matters.
- The moment the camera turns on, you glance down at scattered notes.
- You lose eye contact, rush your pacing, and feel disconnected.

[EMPHASIS]
Today, we are changing that workflow from <u>start to finish</u>.

## [SECTION: Three Core Principles]

Let's walk through the three principles that guided this release:

- **Calibrated pacing** that adapts naturally to your speaking cadence.
- **Zero-distraction legibility** aligned directly with your camera lens.
- **Instant hardware review** so you can inspect tone and timing right away.

[PAUSE 2s]

Let's take a closer look at how it works in practice.`,
  },
  {
    id: 'script-investor-pitch',
    title: 'Seed Round Investor Pitch (2 Minutes)',
    format: 'markdown',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    content: `## [SECTION: Introduction & Problem]

Hi everyone, I'm **Maya Chen**, co-founder of Northwind Grid.

Every year, commercial buildings waste nearly *thirty percent* of the electricity they purchase—not because owners don't care, but because existing systems are blind to real-time grid pricing.

[PAUSE 2s]

## [SECTION: Solution & Traction]

Northwind Grid fixes that with a lightweight software layer that connects to existing HVAC and battery controllers in <u>under forty-eight hours</u>.

- **No hardware rip-and-replace** or long installation downtime.
- **Twenty-two percent** reduction in peak demand charges across fourteen warehouses.
- **Seven-week payback** on an annual subscription.

## [SECTION: The Ask]

We are raising **four million dollars** to expand utility integrations across the Northeast and double our deployment team.

Thank you—I would love to answer your questions.`,
  },
  {
    id: 'script-weekly-update',
    title: 'Engineering All-Hands — Sprint Summary',
    format: 'markdown',
    updatedAt: Date.now() - 1000 * 60 * 60 * 48,
    content: `## [SECTION: Release Highlights]

Hey team, quick update on where we stand heading into **Friday's release freeze**.

Huge credit to the core runtime group: media pipeline latency dropped from *four hundred milliseconds* down to <u>ninety-five milliseconds</u>.

[PAUSE 1s]

## [SECTION: Upcoming Milestones]

Two items to keep on your radar this week:

- Staging migrations run tonight at **six PM Pacific**—please hold schema merges until confirmed.
- Customer beta feedback opens **Monday morning**, so Friday is dedicated to accessibility and bug triage.

Drop any blockers in the release channel before four o'clock. Have a great week.`,
  },
];
