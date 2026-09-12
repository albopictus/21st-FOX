import React, { useRef, useState } from 'react';
import { X, LinkSimple, UploadSimple, Trash } from '@phosphor-icons/react';
import { processImageToBlob } from '../../utils/file';
import { putImageBlob } from '../../utils/blobRef';
import TokenImg from './TokenImg';

/**
 * 相框小组件换图弹窗：贴 URL 或选本地文件。本地文件压到 maxWidth 800 后存 blobref。
 * 每个 image 网格条目单独调用，写回 item.config.src。
 */
export const ImagePickerModal: React.FC<{
  isOpen: boolean;
  currentSrc?: string;
  onSave: (src: string | undefined) => void;
  onClose: () => void;
  acnh?: boolean;
  paper?: boolean;
}> = ({ isOpen, currentSrc, onSave, onClose, acnh = false, paper = false }) => {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const blob = await processImageToBlob(file, { maxWidth: 800, quality: 0.9 });
      const ref = await putImageBlob(blob);
      onSave(ref);
      onClose();
    } catch (e: any) {
      setErr(e?.message || '处理图片失败');
    } finally {
      setBusy(false);
    }
  };

  const panelCls = acnh
    ? 'bg-[#faf6ec]/95 text-[#725d42] border-2 border-[#e8e2d6]'
    : paper
    ? 'bg-[#f5f0e6]/95 text-[#4a3e31] border border-[#ddd5c7]'
    : 'bg-white/90 dark:bg-neutral-900/90 text-slate-800 dark:text-neutral-100 border border-white/60 dark:border-white/10 backdrop-blur-2xl';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-5 animate-fade-in select-none">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-xs rounded-3xl p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)] ${panelCls}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold">相框图片</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/10 active:scale-90">
            <X size={14} weight="bold" />
          </button>
        </div>

        {currentSrc ? (
          <div className="mb-3 rounded-2xl overflow-hidden border border-current/10 aspect-video bg-black/5">
            <TokenImg value={currentSrc} alt="" className="w-full h-full object-cover" />
          </div>
        ) : null}

        <label className="text-[11px] font-bold opacity-60 flex items-center gap-1.5 mb-1">
          <LinkSimple size={12} weight="bold" /> 图片链接
        </label>
        <div className="flex gap-2 mb-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="flex-1 min-w-0 rounded-xl px-3 py-2 text-xs bg-black/5 dark:bg-white/10 border border-current/10 outline-none"
          />
          <button
            disabled={!url.trim() || busy}
            onClick={() => { onSave(url.trim()); onClose(); }}
            className="px-3 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-40 active:scale-95"
          >
            用这个
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        <button
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 active:scale-95 disabled:opacity-50"
        >
          <UploadSimple size={14} weight="bold" /> {busy ? '处理中…' : '选择本地图片'}
        </button>

        {err && <p className="text-[11px] text-red-500 mt-2">{err}</p>}

        {currentSrc && (
          <button
            onClick={() => { onSave(undefined); onClose(); }}
            className="w-full mt-2 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 text-red-500 bg-red-500/10 hover:bg-red-500/15 active:scale-95"
          >
            <Trash size={12} weight="bold" /> 清空
          </button>
        )}
      </div>
    </div>
  );
};

export default ImagePickerModal;
