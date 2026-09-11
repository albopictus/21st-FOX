import React, { useMemo } from 'react';
import { Plus } from '@phosphor-icons/react';
import { INSTALLED_APPS } from '../../../constants';
import AppIcon from '../AppIcon';

interface QuadAppsWidgetProps {
  apps?: (string | null | undefined)[];
  openApp: (id: string) => void;
  editing?: boolean;
  contentColor?: string;
  acnh?: boolean;
  paper?: boolean;
  onOpenManager?: (slotIndex?: number) => void;
}

export const QuadAppsWidget: React.FC<QuadAppsWidgetProps> = React.memo(({
  apps = [],
  openApp,
  editing = false,
  acnh = false,
  paper = false,
  onOpenManager,
}) => {
  // 固定 4 个槽位（0: 左上, 1: 右上, 2: 左下, 3: 右下）
  const slots = useMemo(() => {
    return [0, 1, 2, 3].map(idx => (apps && apps[idx]) ? apps[idx] : null);
  }, [apps]);

  const bgClass = acnh
    ? 'bg-[#faf6ec]/75 border border-[#e8e2d6] shadow-sm text-[#725d42]'
    : paper
    ? 'bg-white/45 border border-[#5b4833]/10 shadow-sm text-[#4a3e31]'
    : 'bg-white/20 dark:bg-white/5 border border-white/25 dark:border-white/10 shadow-sm backdrop-blur-md';

  return (
    <div
      onClick={() => {
        if (editing) onOpenManager?.();
      }}
      className={`w-full h-full rounded-3xl p-2 grid grid-cols-2 grid-rows-2 place-items-center gap-x-1 gap-y-2 transition-all duration-200 select-none ${bgClass} ${
        editing ? 'cursor-pointer' : ''
      }`}
    >
      {slots.map((appId, slotIndex) => {
        const app = appId ? INSTALLED_APPS.find(a => a.id === appId) : null;
        if (app) {
          return (
            <div
              key={`slot-${slotIndex}-${app.id}`}
              className="w-full h-full flex items-center justify-center relative transition-transform duration-200"
            >
              <AppIcon
                app={app}
                onClick={() => {
                  if (!editing) {
                    openApp(app.id);
                  } else {
                    onOpenManager?.(slotIndex);
                  }
                }}
                size="md"
              />
            </div>
          );
        }

        // 空槽位
        return (
          <div
            key={`slot-${slotIndex}-empty`}
            className="w-full h-full flex items-center justify-center"
          >
            {editing ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenManager?.(slotIndex);
                }}
                className="w-11 h-11 rounded-2xl border border-dashed border-current/25 bg-white/10 dark:bg-black/10 hover:bg-white/20 flex items-center justify-center text-current/40 hover:text-current/70 active:scale-95 transition cursor-pointer"
                title="添加应用"
              >
                <Plus size={16} weight="bold" />
              </button>
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 opacity-20" />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default QuadAppsWidget;
