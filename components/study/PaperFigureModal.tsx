import React, { useState, useRef, useEffect } from 'react';
import { X, CaretUp, CaretDown, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowCounterClockwise } from '@phosphor-icons/react';
import type { PaperFigureBlock } from '../../types';

interface PaperFigureModalProps {
    figure: PaperFigureBlock | null;
    onClose: () => void;
}

export const PaperFigureModal: React.FC<PaperFigureModalProps> = ({ figure, onClose }) => {
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [captionOpen, setCaptionOpen] = useState(true);

    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const touchStartDistRef = useRef<number | null>(null);
    const touchStartScaleRef = useRef(1);

    useEffect(() => {
        // 打开时重置缩放与平移
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        setCaptionOpen(true);
    }, [figure]);

    if (!figure) return null;

    // 鼠标双击 / 触控双击快速放大
    const handleDoubleClick = () => {
        if (scale > 1.2) {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
        } else {
            setScale(2.5);
        }
    };

    // 鼠标滚轮缩放
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        setScale(prev => Math.min(4, Math.max(0.8, prev + delta)));
    };

    // 鼠标拖拽平移
    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        isDraggingRef.current = true;
        dragStartRef.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRef.current) return;
        setTranslate({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
    };

    // 触屏双指缩放与单指拖拽
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchStartDistRef.current = Math.hypot(dx, dy);
            touchStartScaleRef.current = scale;
        } else if (e.touches.length === 1 && scale > 1) {
            isDraggingRef.current = true;
            dragStartRef.current = {
                x: e.touches[0].clientX - translate.x,
                y: e.touches[0].clientY - translate.y
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && touchStartDistRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const currentDist = Math.hypot(dx, dy);
            const ratio = currentDist / touchStartDistRef.current;
            setScale(Math.min(4, Math.max(0.8, touchStartScaleRef.current * ratio)));
        } else if (e.touches.length === 1 && isDraggingRef.current) {
            setTranslate({
                x: e.touches[0].clientX - dragStartRef.current.x,
                y: e.touches[0].clientY - dragStartRef.current.y
            });
        }
    };

    const handleTouchEnd = () => {
        touchStartDistRef.current = null;
        isDraggingRef.current = false;
    };

    const resetZoom = () => {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none overflow-hidden animate-fade-in">
            {/* 顶栏操作区 */}
            <div className="flex items-center justify-between px-4 py-3 z-10 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold font-mono text-sm px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/30">
                        {figure.label || '插图原图'}
                    </span>
                    <span className="text-xs text-white/50 font-mono">
                        {Math.round(scale * 100)}%
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setScale(s => Math.min(4, s + 0.3))}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 flex items-center justify-center transition"
                        title="放大"
                    >
                        <MagnifyingGlassPlus size={16} />
                    </button>
                    <button
                        onClick={() => setScale(s => Math.max(0.8, s - 0.3))}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 flex items-center justify-center transition"
                        title="缩小"
                    >
                        <MagnifyingGlassMinus size={16} />
                    </button>
                    <button
                        onClick={resetZoom}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white/80 flex items-center justify-center transition"
                        title="重置"
                    >
                        <ArrowCounterClockwise size={16} />
                    </button>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-red-500/20 hover:bg-red-500/40 active:scale-95 text-red-300 flex items-center justify-center transition ml-2 border border-red-500/30"
                        title="关闭"
                    >
                        <X size={18} weight="bold" />
                    </button>
                </div>
            </div>

            {/* 中间高清图展示区 */}
            <div
                className="flex-1 flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={handleDoubleClick}
            >
                <img
                    src={figure.imageUrl}
                    alt={figure.label || 'Figure'}
                    className="max-w-[95%] max-h-[85%] object-contain transition-transform duration-75 ease-out shadow-2xl rounded"
                    style={{
                        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                        transformOrigin: 'center center'
                    }}
                    draggable={false}
                />
            </div>

            {/* 底部可折叠图注浮层 */}
            {(figure.caption || figure.captionZh) && (
                <div className="z-10 bg-black/85 backdrop-blur-md border-t border-white/10 transition-all duration-300">
                    <button
                        onClick={() => setCaptionOpen(!captionOpen)}
                        className="w-full py-2 px-4 flex items-center justify-between text-xs text-white/70 hover:text-white bg-white/5"
                    >
                        <span className="font-medium text-emerald-300 flex items-center gap-1.5">
                            图注与中英对照释义
                        </span>
                        {captionOpen ? <CaretDown size={14} /> : <CaretUp size={14} />}
                    </button>

                    {captionOpen && (
                        <div className="p-4 max-h-52 overflow-y-auto space-y-2.5 text-xs leading-relaxed text-white/90">
                            {figure.captionZh && (
                                <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-100 font-sans">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                                        中文学术译注
                                    </span>
                                    {figure.captionZh}
                                </div>
                            )}
                            {figure.caption && (
                                <div className="p-2.5 rounded-lg bg-white/5 text-white/80 font-serif">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-1">
                                        Original Caption
                                    </span>
                                    {figure.caption}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
