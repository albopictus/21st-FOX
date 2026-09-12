import { getProxyWorkerUrl } from './proxyWorker';

/**
 * 构造学术文献图表的高可用加载链：直连 -> Cloudflare Worker 代理兜底
 */
export function buildPaperImageMirrors(rawSrc?: string, enableProxy = true): string[] {
    if (!rawSrc || typeof rawSrc !== 'string') return [];
    const src = rawSrc.trim();
    if (!src) return [];

    const mirrors: string[] = [src];

    if (enableProxy) {
        try {
            const parsed = new URL(src);
            const host = parsed.hostname.toLowerCase();
            if (
                host.includes('ncbi.nlm.nih.gov') ||
                host.includes('europepmc.org') ||
                host.includes('ebi.ac.uk')
            ) {
                const proxyBase = getProxyWorkerUrl();
                if (proxyBase) {
                    mirrors.push(`${proxyBase}/europepmc?target=${encodeURIComponent(src)}`);
                }
            }
        } catch {
            // 忽略非标准 URL 解析错误
        }
    }

    return mirrors;
}
