import React, { useState, useEffect } from 'react';
import { Note, PushPin, Minus, Plus } from '@phosphor-icons/react';
import { DB } from '../../../utils/db';
import { AppID, MemoNote, DesktopWidgetSize } from '../../../types';

interface MemoHomeWidgetProps {
  contentColor: string;
  openApp: (id: string) => void;
  acnh?: boolean;
  paper?: boolean;
  editing?: boolean;
  onDelete?: () => void;
  size?: DesktopWidgetSize;
}

export const MemoHomeWidget: React.FC<MemoHomeWidgetProps> = ({
  contentColor,
  openApp,
  acnh = false,
  paper = false,
  editing = false,
  onDelete,
  size = '2x2',
}) => {
  const [memo, setMemo] = useState<MemoNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    DB.getAllMemoNotes()
      .then((memos) => {
        if (cancelled) return;
        if (memos && memos.length > 0) {
          // 置顶优先，随后按更新时间或创建时间倒序
          const sorted = [...memos].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return (b.lastEditedAt || b.createdAt) - (a.lastEditedAt || a.createdAt);
          });
          setMemo(sorted[0]);
        } else {
          setMemo(null);
        }
      })
      .catch((err) => {
        console.error('Failed to load memo for widget:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const acCard = acnh
    ? { background: 'rgb(247,243,223)', border: '2px solid #e8e2d6', boxShadow: '0 6px 18px rgba(61,52,40,0.12)', color: '#725d42' }
    : undefined;

  const isWide = size === '4x2';

  return (
    <div className="relative group select-none w-full h-full">
      {/* 编辑模式下的红色删除按钮 */}
      {editing && onDelete && (
        <button
          data-launcher-action="remove"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-red-500 text-white font-black text-sm flex items-center justify-center shadow-lg active:scale-90 z-30 transition-transform hover:bg-red-600"
          title="删除便签组件"
        >
          <Minus size={14} weight="bold" />
        </button>
      )}

      <div
        onClick={() => {
          if (!editing) openApp(AppID.Memo);
        }}
        className={`w-full h-full rounded-[1.75rem] p-4 flex flex-col justify-between cursor-pointer transition-transform active:scale-[0.98] ${
          acnh
            ? 'shadow-sm'
            : paper
            ? 'bg-[#f4efe4] border border-[#5b4833]/15 shadow-sm text-[#3c3226]'
            : 'bg-white/20 backdrop-blur-xl border border-white/25 shadow-[0_8px_24px_rgba(0,0,0,0.14)] text-white'
        }`}
        style={
          paper
            ? {
                background: 'rgba(224,221,215,0.40)',
                border: '1px solid rgba(91,72,51,0.10)',
                boxShadow: '0 5px 16px rgba(91,72,51,0.06)',
                color: contentColor,
              }
            : acCard || { color: contentColor }
        }
      >
        {/* 顶部标题行 */}
        <div className="flex items-center justify-between min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Note size={15} weight="fill" className={acnh ? 'text-[#82D5BB]' : paper ? 'text-[#788369]' : 'text-amber-300'} />
            <span className="text-[11px] font-black uppercase tracking-wider opacity-85 truncate">
              便签
            </span>
          </div>
          {memo?.pinned ? (
            <PushPin size={13} weight="fill" className="text-amber-500 shrink-0" />
          ) : (
            <span className="text-[9px] opacity-40 uppercase tracking-widest font-mono">
              MEMO
            </span>
          )}
        </div>

        {/* 中部内容预览 */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center opacity-40 text-xs">
            加载中...
          </div>
        ) : memo ? (
          <div className="flex-1 my-2 min-h-0 flex flex-col justify-center">
            {memo.title && (
              <div className="text-xs font-black truncate mb-1">
                {memo.title}
              </div>
            )}
            <div className={`text-[11px] opacity-80 leading-relaxed font-sans ${isWide ? 'line-clamp-3' : 'line-clamp-2'}`}>
              {memo.content || '（暂无正文）'}
            </div>
          </div>
        ) : (
          <div className="flex-1 my-2 flex flex-col items-center justify-center opacity-50 text-center gap-1">
            <div className="text-xs font-bold">轻触记录</div>
            <div className="text-[10px] opacity-75">灵感或随笔</div>
          </div>
        )}

        {/* 底部信息行 */}
        <div className="flex items-center justify-between text-[9px] opacity-50 pt-1 border-t border-current/10">
          <span className="truncate">
            {memo?.authorName ? `by ${memo.authorName}` : 'SullyOS Memo'}
          </span>
          <span>轻触打开</span>
        </div>
      </div>
    </div>
  );
};

export default MemoHomeWidget;
