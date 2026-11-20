import { StudioView } from '../types/teleprompter';

interface TopBarProps {
  activeView: StudioView;
  takesCount: number;
  isRecording: boolean;
  onSelectView: (view: StudioView) => void;
  onPrimaryAction: () => void;
}

export function TopBar({
  activeView,
  takesCount,
  isRecording,
  onSelectView,
  onPrimaryAction,
}: TopBarProps) {
  const navItems: { id: StudioView; label: string }[] = [
    { id: 'editor', label: 'Script & Setup' },
    { id: 'stage', label: 'Prompter Stage' },
    {
      id: 'review',
      label: takesCount > 0 ? `Review Takes (${takesCount})` : 'Review Takes',
    },
  ];

  const primaryLabel =
    activeView === 'stage' ? 'Exit Stage' : 'Launch Stage';

  return (
    <header className="h-14 md:h-16 shrink-0 border-b border-zinc-800/90 bg-[#09090B]/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-8">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectView('editor')}
        disabled={isRecording}
        className="font-display text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm disabled:opacity-60"
      >
        CueStage
      </button>

      {/* Zone 2: Concise single-line navigation links (Desktop) */}
      <nav
        aria-label="Studio workspace views"
        className="hidden md:flex items-center gap-6"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              disabled={isRecording && item.id !== 'stage'}
              className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-sm ${
                isActive
                  ? 'text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-[1px] h-[2px] bg-amber-500"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={isRecording}
          className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 disabled:cursor-not-allowed ${
            activeView === 'stage'
              ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
              : 'bg-rose-600 text-white hover:bg-rose-500'
          }`}
        >
          {primaryLabel}
        </button>
      </div>
    </header>
  );
}
