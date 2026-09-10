import React, { useState, useMemo, useEffect } from 'react';
import { Heart, CaretLeft, CaretRight, Minus, Plus } from '@phosphor-icons/react';
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
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const upcomingEvents = useMemo(
    () =>
      [...anniversaries]
        .filter((a) => a.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [anniversaries, todayStr]
  );

  const EVENTS_PER_PAGE = 3;
  const eventPageCount = Math.max(1, Math.ceil(upcomingEvents.length / EVENTS_PER_PAGE));
  const [eventPage, setEventPage] = useState(0);

  useEffect(() => {
    if (eventPage > eventPageCount - 1) setEventPage(Math.max(0, eventPageCount - 1));
  }, [eventPageCount, eventPage]);

  const pagedEvents = upcomingEvents.slice(
    eventPage * EVENTS_PER_PAGE,
    eventPage * EVENTS_PER_PAGE + EVENTS_PER_PAGE
  );

  const acCard = acnh
    ? { background: 'rgb(247,243,223)', border: '2px solid #e8e2d6', boxShadow: '0 6px 18px rgba(61,52,40,0.12)' }
    : undefined;
  const acDot = acnh ? '#6fba2c' : undefined;

  const calculateDaysLeft = (targetDateStr: string) => {
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const parts = targetDateStr.split('-').map(Number);
    if (parts.length < 3) return null;
    const targetMidnight = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    const diff = Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
    return diff;
  };

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
          title="删除纪念日组件"
        >
          <Minus size={14} weight="bold" />
        </button>
      )}

      <div
        className={`w-full rounded-3xl p-5 flex flex-col transition-transform ${
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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2" style={{ color: contentColor }}>
            <Heart size={16} weight="fill" className="text-pink-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider opacity-85">
              纪念日与倒计时
            </h3>
          </div>

          <div className="flex items-center gap-1.5" style={{ color: contentColor }}>
            {eventPageCount > 1 && (
              <div className="flex items-center gap-1 shrink-0 mr-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEventPage((p) => Math.max(0, p - 1));
                  }}
                  disabled={eventPage === 0}
                  className={`w-5 h-5 rounded-full flex items-center justify-center disabled:opacity-25 transition-colors active:scale-90 ${
                    paper ? 'bg-[#788369]/10 hover:bg-[#788369]/20' : 'bg-white/15 hover:bg-white/30'
                  }`}
                  aria-label="Previous events"
                >
                  <CaretLeft size={12} weight="bold" />
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
                  className={`w-5 h-5 rounded-full flex items-center justify-center disabled:opacity-25 transition-colors active:scale-90 ${
                    paper ? 'bg-[#788369]/10 hover:bg-[#788369]/20' : 'bg-white/15 hover:bg-white/30'
                  }`}
                  aria-label="Next events"
                >
                  <CaretRight size={12} weight="bold" />
                </button>
              </div>
            )}
            <button
              onClick={() => openApp('schedule')}
              className={`p-1.5 rounded-full cursor-pointer transition-colors active:scale-95 ${
                acnh
                  ? 'bg-[#82D5BB]/30 hover:bg-[#82D5BB]/50 text-[#725d42]'
                  : paper
                  ? 'bg-[#788369]/10 hover:bg-[#788369]/20 text-[#3c3226]'
                  : 'bg-white/20 hover:bg-white/35 text-white'
              }`}
              title="添加纪念日"
            >
              <Plus size={13} weight="bold" />
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {upcomingEvents.length > 0 ? (
            pagedEvents.map((anni) => {
              const daysDiff = calculateDaysLeft(anni.date);
              const charName = characters.find((c) => c.id === anni.charId)?.name;
              return (
                <div
                  key={anni.id}
                  onClick={() => openApp('schedule')}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer transition-transform active:scale-[0.98] ${
                    acnh
                      ? 'bg-[#efe7d4] border border-[#e0d6c0]'
                      : paper
                      ? 'bg-[#f3ecdf]/80 border border-[#5b4833]/10'
                      : 'bg-white/10 hover:bg-white/15 border border-white/15 shadow-xs'
                  }`}
                >
                  <div
                    className={`w-10 h-10 shrink-0 rounded-xl flex flex-col items-center justify-center ${
                      acnh
                        ? 'bg-[#82D5BB] text-white border border-[#6cc0a6]'
                        : paper
                        ? 'bg-[#a66f52]/15 text-[#8c5d46] border border-[#a66f52]/20'
                        : 'bg-gradient-to-br from-purple-500/30 to-pink-500/30 text-white border border-purple-400/30'
                    }`}
                  >
                    <span className="text-[9px] opacity-75 leading-none">
                      {anni.date.split('-')[1]}月
                    </span>
                    <span className="text-sm font-black leading-none mt-0.5">
                      {anni.date.split('-')[2]}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: contentColor }}>
                      {anni.title}
                    </div>
                    <div className="text-[10px] opacity-50 truncate flex items-center gap-1.5 mt-0.5" style={{ color: contentColor }}>
                      {charName && <span>{charName}</span>}
                      <span>{anni.date}</span>
                    </div>
                  </div>

                  {daysDiff !== null && (
                    <div
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        daysDiff === 0
                          ? 'bg-pink-500 text-white animate-pulse'
                          : daysDiff <= 3
                          ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                          : acnh
                          ? 'bg-[#82D5BB]/20 text-[#2f7d6a]'
                          : paper
                          ? 'bg-[#788369]/15 text-[#5e6b50]'
                          : 'bg-white/15 text-white/90'
                      }`}
                    >
                      {daysDiff === 0 ? '今天' : `${daysDiff}天后`}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div
              onClick={() => openApp('schedule')}
              className="text-center opacity-40 text-xs py-5 cursor-pointer hover:opacity-60 transition"
              style={{ color: contentColor }}
            >
              暂无近期纪念日 · 轻触添加
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnniversaryWidget;
