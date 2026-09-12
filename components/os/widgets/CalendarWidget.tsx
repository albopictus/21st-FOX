import React from 'react';
import { Minus } from '@phosphor-icons/react';
import { Anniversary } from '../../../types';

interface CalendarWidgetProps {
  contentColor: string;
  openApp: (id: string) => void;
  anniversaries?: Anniversary[];
  acnh?: boolean;
  paper?: boolean;
  editing?: boolean;
  onDelete?: () => void;
  opacity?: number;
}

const CALENDAR_WEEKDAYS = [
  { key: 'sun', label: 'S' },
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
] as const;

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  contentColor,
  openApp,
  anniversaries = [],
  acnh = false,
  paper = false,
  editing = false,
  onDelete,
  opacity = 100,
}) => {
  const scale = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
  const acCard: React.CSSProperties | undefined = acnh
    ? {
        background: `rgba(247,243,223, ${scale})`,
        border: `2px solid rgba(232,226,214, ${scale})`,
        boxShadow: `0 6px 18px rgba(61,52,40, ${0.12 * scale})`,
        color: '#725d42',
      }
    : undefined;
  const paperCard: React.CSSProperties | undefined = paper
    ? {
        background: `rgba(224,221,215, ${0.36 * scale})`,
        border: `1px solid rgba(91,72,51, ${0.07 * scale})`,
        boxShadow: `0 5px 16px rgba(91,72,51, ${0.055 * scale})`,
        color: contentColor,
      }
    : undefined;
  const defaultCard: React.CSSProperties | undefined = !acnh && !paper
    ? {
        background: `rgba(255,255,255, ${0.25 * scale})`,
        backdropFilter: scale > 0.05 ? `blur(${20 * scale}px)` : 'none',
        WebkitBackdropFilter: scale > 0.05 ? `blur(${20 * scale}px)` : 'none',
        border: `1px solid rgba(255,255,255, ${0.25 * scale})`,
        boxShadow: `0 8px 32px rgba(0,0,0, ${0.18 * scale}), inset 0 1px 0 rgba(255,255,255, ${0.08 * scale})`,
        color: contentColor,
      }
    : undefined;

  const cardStyle: React.CSSProperties = {
    ...(paperCard || acCard || defaultCard),
    textShadow: scale < 0.4 ? '0 1px 3px rgba(0,0,0,0.45)' : undefined,
  };

  const acDot = acnh ? '#6fba2c' : undefined;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthName = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][currentMonth];

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const totalDays = getDaysInMonth(currentYear, currentMonth);
  const startOffset = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarDays = Array.from({ length: totalDays }, (_, i) => i + 1);
  const paddingDays = Array.from({ length: startOffset }, () => null);

  return (
    <div className="relative group w-full h-full select-none">
      {/* 编辑模式下的红色删除按钮 */}
      {editing && onDelete && (
        <button
          data-launcher-action="remove"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-90 z-30 transition-transform hover:bg-red-600"
          title="删除日历组件"
        >
          <Minus size={14} weight="bold" />
        </button>
      )}

      <div
        className="h-full flex flex-col rounded-3xl p-3 overflow-hidden"
        style={cardStyle}
      >
        <div className="flex justify-between items-center mb-1.5 shrink-0" style={{ color: contentColor }}>
          <h3 className="text-sm font-bold tracking-widest">
            {monthName} {currentYear}
          </h3>
          <div
            onClick={() => { if (!editing) openApp('schedule'); }}
            className={`p-1 rounded-full cursor-pointer transition-colors ${
              acnh
                ? 'bg-[#82D5BB]/30 hover:bg-[#82D5BB]/50'
                : paper
                ? 'bg-[#788369]/10 hover:bg-[#788369]/20'
                : 'bg-white/20 hover:bg-white/40'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-x-1 text-center mb-0.5 shrink-0">
          {CALENDAR_WEEKDAYS.map((day) => (
            <div key={day.key} className="text-[9px] font-bold opacity-40" style={{ color: contentColor }}>
              {day.label}
            </div>
          ))}
        </div>

        {/* 日期网格填满剩余空间：整行整月都塞进容器，行高随大小自适应 */}
        <div className="grid grid-cols-7 grid-rows-6 gap-x-1 gap-y-0.5 text-center flex-1 min-h-0">
          {paddingDays.map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {calendarDays.map((day) => {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = day === now.getDate();
            const hasEvent = anniversaries.some((a: any) => a.date === dateStr);

            return (
              <div
                key={day}
                className="flex items-center justify-center relative cursor-pointer min-h-0"
                onClick={() => { if (!editing) openApp('schedule'); }}
              >
                <div
                  className={`aspect-square h-full max-h-7 max-w-7 flex items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? acnh || paper
                        ? 'text-white font-bold'
                        : 'bg-white text-black font-bold shadow-lg'
                      : 'opacity-80'
                  }`}
                  style={
                    isToday
                      ? acnh
                        ? { background: '#19c8b9' }
                        : paper
                        ? { background: '#788369', boxShadow: '0 4px 10px rgba(91,72,51,0.14)' }
                        : {}
                      : { color: contentColor }
                  }
                >
                  {day}
                </div>
                {hasEvent && (
                  <div
                    className="w-1 h-1 rounded-full absolute bottom-0 shadow-sm border border-black/10"
                    style={{ background: acDot || (paper ? '#a66f52' : '#c084fc') }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarWidget;
