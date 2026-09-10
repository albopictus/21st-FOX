import React, { useState, useMemo, useEffect } from 'react';
import { Minus } from '@phosphor-icons/react';
import { Anniversary, CharacterProfile } from '../../../types';

interface AnniversaryWidgetProps {
  contentColor: string;
  openApp: (id: string) => void;
  anniversaries?: Anniversary[];
  characters?: CharacterProfile[];
  acnh?: boolean;
  paper?: boolean;
  editing?: boolean;
  onDelete?: () => void;
}

export const AnniversaryWidget: React.FC<AnniversaryWidgetProps> = ({
  contentColor,
  openApp,
  anniversaries = [],
  characters = [],
  acnh = false,
  paper = false,
  editing = false,
  onDelete,
}) => {
  const acCard = acnh
    ? { background: 'rgb(247,243,223)', border: '2px solid #e8e2d6', boxShadow: '0 6px 18px rgba(61,52,40,0.12)' }
    : undefined;
  const acDot = acnh ? '#6fba2c' : undefined;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const upcomingEvents = useMemo(
    () =>
      [...anniversaries]
        .filter((a: any) => a.date >= todayStr)
        .sort((a: any, b: any) => a.date.localeCompare(b.date)),
    [anniversaries, todayStr]
  );
  const EVENTS_PER_PAGE = 4;
  const eventPageCount = Math.max(1, Math.ceil(upcomingEvents.length / EVENTS_PER_PAGE));
  const [eventPage, setEventPage] = useState(0);

  useEffect(() => {
    if (eventPage > eventPageCount - 1) setEventPage(Math.max(0, eventPageCount - 1));
  }, [eventPageCount, eventPage]);

  const pagedEvents = upcomingEvents.slice(
    eventPage * EVENTS_PER_PAGE,
    eventPage * EVENTS_PER_PAGE + EVENTS_PER_PAGE
  );

  return (
    <div className="relative group w-full select-none">
      {/* 编辑模式下的红色删除按钮 */}
      {editing && onDelete && (
        <button
          data-launcher-action="remove"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-90 z-30 transition-transform hover:bg-red-600"
          title="删除纪念日组件"
        >
          <Minus size={14} weight="bold" />
        </button>
      )}

      <div
        className={`rounded-3xl p-5 flex flex-col flex-1 min-h-[200px] ${
          acnh ? 'shadow-sm' : paper ? '' : 'bg-white/25 border border-white/25 shadow-xl'
        }`}
        style={
          paper
            ? {
                background: 'rgba(224,221,215,0.36)',
                border: '1px solid rgba(91,72,51,0.07)',
                boxShadow: '0 5px 16px rgba(91,72,51,0.05)',
              }
            : acCard
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-xs font-bold opacity-60 uppercase tracking-widest flex items-center gap-2"
            style={{ color: contentColor }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: acDot || (paper ? '#a66f52' : '#c084fc') }}
            />{' '}
            Upcoming Events
          </h3>
          {eventPageCount > 1 && (
            <div className="flex items-center gap-2 shrink-0" style={{ color: contentColor }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEventPage((p) => Math.max(0, p - 1));
                }}
                disabled={eventPage === 0}
                className={`w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-25 transition-colors active:scale-90 ${
                  paper ? 'bg-[#788369]/10 hover:bg-[#788369]/20' : 'bg-white/15 hover:bg-white/30'
                }`}
                aria-label="Previous events"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-3 h-3"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <span className="text-[10px] font-mono opacity-60 tabular-nums">
                {eventPage + 1}/{eventPageCount}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEventPage((p) => Math.min(eventPageCount - 1, p + 1));
                }}
                disabled={eventPage >= eventPageCount - 1}
                className={`w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-25 transition-colors active:scale-90 ${
                  paper ? 'bg-[#788369]/10 hover:bg-[#788369]/20' : 'bg-white/15 hover:bg-white/30'
                }`}
                aria-label="Next events"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-3 h-3"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {upcomingEvents.length > 0 ? (
            pagedEvents.map((anni: any) => (
              <div
                key={anni.id}
                onClick={() => openApp('schedule')}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-transform active:scale-[0.98] ${
                  acnh
                    ? 'bg-[#efe7d4] border border-[#e0d6c0]'
                    : paper
                    ? 'bg-[#f3ecdf]/70 border border-[#5b4833]/10'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                <div
                  className={`w-10 h-10 shrink-0 rounded-lg flex flex-col items-center justify-center ${
                    acnh
                      ? 'bg-[#82D5BB] text-white border border-[#6cc0a6]'
                      : paper
                      ? 'bg-[#a66f52]/12 text-[#8c5d46] border border-[#a66f52]/15'
                      : 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                  }`}
                >
                  <span className="text-[9px] opacity-70">{anni.date.split('-')[1]}</span>
                  <span className="text-sm font-bold leading-none">{anni.date.split('-')[2]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: contentColor }}>
                    {anni.title}
                  </div>
                  <div className="text-[10px] opacity-50 truncate" style={{ color: contentColor }}>
                    {characters.find((c: any) => c.id === anni.charId)?.name || 'Unknown'}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div
              onClick={() => openApp('schedule')}
              className="text-center opacity-30 text-xs py-8 cursor-pointer hover:opacity-50 transition"
              style={{ color: contentColor }}
            >
              No upcoming events
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnniversaryWidget;
