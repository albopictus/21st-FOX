import React, { useMemo } from 'react';
import { Plus, SquaresFour } from '@phosphor-icons/react';
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
  opacity?: number;
}

export const QuadAppsWidget: React.FC<QuadAppsWidgetProps> = React.memo(({
  apps = [],
  openApp,
  editing = false,
  acnh = false,
  paper = false,
  onOpenManager,
  opacity = 100,
}) => {
  // 固定 4 个槽位（0: 左上, 1: 右上, 2: 左下, 3: 右下）
  const slots = useMemo(() => {
    return [0, 1, 2, 3].map(idx => (apps && apps[idx]) ? apps[idx] : null);
  }, [apps]);

  const scale = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
  const widgetStyle: React.CSSProperties = paper ? {
    background: `rgba(224,221,215,${0.38 * scale})`,
    border: `1px solid rgba(91,72,51,${0.07 * scale})`,
    boxShadow: `0 5px 16px rgba(91,72,51,${0.055 * scale})`,
    color: '#4b4136',
  } : acnh ? {
    background: `rgba(247,243,223,${scale})`,
    border: `2px solid rgba(232,226,214,${scale})`,
    boxShadow: `0 6px 18px rgba(61,52,40,${0.12 * scale})`,
    color: '#725d42',
  } : {
    background: `rgba(255,255,255,${0.22 * scale})`,
    border: `1px solid rgba(255,255,255,${0.22 * scale})`,
    boxShadow: `0 8px 30px rgba(0,0,0,${0.22 * scale}), inset 0 1px 0 rgba(255,255,255,${0.07 * scale})`,
    backdropFilter: scale > 0.05 ? `blur(${20 * scale}px)` : 'none',
    WebkitBackdropFilter: scale > 0.05 ? `blur(${20 * scale}px)` : 'none',
  };

  return (
    <div
      onClick={() => {
        if (editing) onOpenManager?.();
      }}
      style={widgetStyle}
      className={`w-full h-full rounded-[1.75rem] p-2 grid grid-cols-2 grid-rows-2 place-items-center gap-x-1 gap-y-2 transition-transform active:scale-[0.98] select-none relative ${
        editing ? 'cursor-pointer' : ''
      }`}
    >
      {slots.map((appId, slotIndex) => {
        const app = appId ? INSTALLED_APPS.find(a => a.id === appId) : null;
        if (app) {
          return (
            <div
              key={`slot-${slotIndex}-${app.id}`}
              onClick={(e) => {
                if (editing) {
                  e.stopPropagation();
                  onOpenManager?.(slotIndex);
                }
              }}
              className="w-full h-full flex items-center justify-center relative transition-transform duration-200"
            >
              <div className={editing ? "pointer-events-none" : ""}>
                <AppIcon
                  app={app}
                  onClick={() => {
                    if (!editing) {
                      openApp(app.id);
                    }
                  }}
                  size="md"
                />
              </div>
            </div>
          );
        }

        // 空槽位
        return (
          <div
            key={`slot-${slotIndex}-empty`}
            onClick={(e) => {
              if (editing) {
                e.stopPropagation();
                onOpenManager?.(slotIndex);
              }
            }}
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

      {/* 编辑态中心提示与大热区 */}
      {editing && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onOpenManager?.();
          }}
          className={`absolute inset-0 m-auto w-11 h-11 rounded-full flex items-center justify-center shadow-xl border-2 active:scale-90 transition-transform cursor-pointer z-20 pointer-events-auto ${
            acnh
              ? 'bg-[#19c8b9] text-white border-[#faf6ec]'
              : paper
              ? 'bg-[#788369] text-white border-[#f5f0e6]'
              : 'bg-teal-500 text-white border-white/80'
          }`}
          title="管理四宫格应用"
        >
          <SquaresFour size={20} weight="bold" />
        </div>
      )}
    </div>
  );
});

export default QuadAppsWidget;
