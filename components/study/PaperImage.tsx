import React, { useState, useEffect, useMemo } from 'react';
import { ArrowsClockwise, ImageSquare, ArrowSquareOut } from '@phosphor-icons/react';
import { buildPaperImageMirrors } from '../../utils/paperImage';

export { buildPaperImageMirrors };

export interface PaperImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src?: string;
    alt?: string;
    fallbackLabel?: string;
    enableProxyFallback?: boolean;
    showErrorPlaceholder?: boolean;
}

/**
 * 学术文献图表专用图片组件：
 * 1. 默认设置 referrerPolicy="no-referrer"，避开 NCBI/PMC 防盗链 403
 * 2. 移动网络弱网或海外科研 CDN 阻断时，自动回退到 Worker /europepmc 代理
 * 3. 最终失败时优雅展示重试与浏览器原图跳转卡片，避免页面红叉破损
 */
export const PaperImage: React.FC<PaperImageProps> = ({
    src,
    alt = '学术文献插图',
    className = '',
    style,
    fallbackLabel,
    enableProxyFallback = true,
    showErrorPlaceholder = true,
    onError,
    onLoad,
    ...rest
}) => {
    const mirrors = useMemo(() => buildPaperImageMirrors(src, enableProxyFallback), [src, enableProxyFallback]);
    const [mirrorIndex, setMirrorIndex] = useState(0);
    const [hasError, setHasError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // 当源图片切换时重置状态
    useEffect(() => {
        setMirrorIndex(0);
        setHasError(false);
        setIsLoaded(false);
    }, [src]);

    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        if (mirrorIndex < mirrors.length - 1) {
            // 切换到下一个镜像（如 Worker 代理兜底）
            setMirrorIndex(prev => prev + 1);
        } else {
            setHasError(true);
            onError?.(e);
        }
    };

    const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        setIsLoaded(true);
        setHasError(false);
        onLoad?.(e);
    };

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHasError(false);
        setMirrorIndex(0);
        setIsLoaded(false);
    };

    if (hasError && showErrorPlaceholder) {
        return (
            <div
                className={`flex flex-col items-center justify-center p-4 rounded-xl bg-slate-100/80 border border-dashed border-slate-300 text-slate-500 text-xs ${className}`}
                style={style}
            >
                <ImageSquare size={28} className="text-slate-400 mb-1.5" />
                <span className="font-medium text-[11px] text-slate-600 mb-1">
                    {fallbackLabel || alt || '文献图表加载受限'}
                </span>
                <span className="text-[10px] text-slate-400 mb-2">海外科研图床网络连接超时</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[10px] font-medium shadow-sm hover:bg-slate-50 active:scale-95 transition flex items-center gap-1"
                    >
                        <ArrowsClockwise size={11} />
                        <span>点击重试</span>
                    </button>
                    {src && (
                        <a
                            href={src}
                            target="_blank"
                            rel="noreferrer noopener"
                            onClick={e => e.stopPropagation()}
                            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-emerald-700 text-[10px] font-medium shadow-sm hover:bg-slate-50 active:scale-95 transition flex items-center gap-1"
                        >
                            <ArrowSquareOut size={11} />
                            <span>浏览器打开原图</span>
                        </a>
                    )}
                </div>
            </div>
        );
    }

    const currentUrl = mirrors[mirrorIndex];

    return (
        <img
            src={currentUrl}
            alt={alt}
            referrerPolicy="no-referrer"
            onError={handleImgError}
            onLoad={handleImgLoad}
            className={`${className} ${!isLoaded ? 'opacity-90' : 'opacity-100'} transition-opacity duration-150`}
            style={style}
            {...rest}
        />
    );
};

export default PaperImage;
