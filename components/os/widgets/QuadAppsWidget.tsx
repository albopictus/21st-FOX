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

  const widgetStyle: React.CSSProperties = paper ? {
    background: 'rgba(224,221,215,0.38)',
    border: '1px solid rgba(91,72,51,0.07)',
    boxShadow: '0 5px 16px rgba(91,72,51,0.055)',
    color: '#4b4136',
  } : acnh ? {
    background: 'rgb(247,243,223)',
    border: '2px solid #e8e2d6',
    boxShadow: '0 6px 18px rgba(61,52,40,0.12)',
    color: '#725d42',
  } : {
    background: 'rgba(255,255,255,0.22)',
    border: '1px solid rgba(255,255,255,0.22)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.07)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  return (
    <div
      onClick={() => {
        if (editing) onOpenManager?.();
      }}
      style={widgetStyle}
      className={`w-full h-full rounded-[1.75rem] p-2 grid grid-cols-2 grid-rows-2 place-items-center gap-x-1 gap-y-2 transition-transform active:scale-[0.98] select-none ${
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
