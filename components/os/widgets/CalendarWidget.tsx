import React from 'react';
import { Calendar as CalendarIcon, Minus, Plus } from '@phosphor-icons/react';
import { Anniversary } from '../../../types';

interface CalendarWidgetProps {
  contentColor: string;
  openApp: (id: string) => void;
  anniversaries?: Anniversary[];
  acnh?: boolean;
  paper?: boolean;
  editing?: boolean;
  onDelete?: () => void;
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
}) => {
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

  const acCard = acnh ? { background: 'rgb(247,243,223)', border: '2px solid #e8e2d6', boxShadow: '0 6px 18px rgba(61,52,40,0.12)' } : undefined;
  const acDot = acnh ? '#6fba2c' : undefined;

  return (
    <div className="relative group w-full select-none">
      {/* 编辑模式下的红色删除按钮 */}
      {editing && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-90 z-30 transition-transform hover:bg-red-600"
          title="删除日历组件"
        >
          <Minus size={14} weight="bold" />
        </button>
      )}

      <div
        className={`w-full rounded-3xl p-5 transition-transform ${
          acnh ? 'shadow-sm' : paper ? '' : 'bg-white/20 backdrop-blur-xl border border-white/25 shadow-xl'
        }`}
        style={
          paper
            ? {
                background: 'rgba(224,221,215,0.38)',
                border: '1px solid rgba(91,72,51,0.08)',
                boxShadow: '0 5px 16px rgba(91,72,51,0.06)',
              }
            : acCard
        }
      >
        <div className="flex justify-between items-center mb-3" style={{ color: contentColor }}>
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="opacity-80" />
            <h3 className="text-lg font-black tracking-wider">
              {monthName} {currentYear}
            </h3>
          </div>
          <button
            onClick={() => openApp('schedule')}
            className={`p-1.5 rounded-full cursor-pointer transition-colors active:scale-95 ${
              acnh
                ? 'bg-[#82D5BB]/30 hover:bg-[#82D5BB]/50 text-[#725d42]'
                : paper
                ? 'bg-[#788369]/10 hover:bg-[#788369]/20 text-[#3c3226]'
                : 'bg-white/20 hover:bg-white/35 text-white'
            }`}
            title="查看完整日程与日历"
          >
            <Plus size={15} weight="bold" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center mb-1.5">
          {CALENDAR_WEEKDAYS.map((day) => (
            <div key={day.key} className="text-[10px] font-bold opacity-45" style={{ color: contentColor }}>
              {day.label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1.5 gap-x-1 text-center">
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
                className="flex flex-col items-center justify-center h-7 relative cursor-pointer"
                onClick={() => openApp('schedule')}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold ${
                    isToday
                      ? acnh
                        ? 'text-white font-bold'
                        : paper
                        ? 'text-white font-bold'
                        : 'bg-white text-black font-bold shadow-md'
                      : 'opacity-85'
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
                    className="w-1.5 h-1.5 rounded-full absolute bottom-0 shadow-xs border border-black/10"
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
