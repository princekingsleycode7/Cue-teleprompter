import { FileText, Film, Play } from 'lucide-react';
import { StudioView } from '../types/teleprompter';

interface MobileBottomNavProps {
  activeView: StudioView;
  takesCount: number;
  onSelectView: (view: StudioView) => void;
}

export function MobileBottomNav({
  activeView,
  takesCount,
  onSelectView,
}: MobileBottomNavProps) {
  if (activeView === 'stage') return null;

  const tabs: {
    id: StudioView;
    label: string;
    icon: typeof FileText;
  }[] = [
    { id: 'editor', label: 'Script', icon: FileText },
    { id: 'stage', label: 'Stage', icon: Play },
    {
      id: 'review',
      label: takesCount > 0 ? `Review (${takesCount})` : 'Review',
      icon: Film,
    },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-[#0D0D10]/95 backdrop-blur-md border-t border-zinc-800/90 grid grid-cols-3 items-center"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectView(tab.id)}
            className={`h-full flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive ? 'text-amber-400' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
