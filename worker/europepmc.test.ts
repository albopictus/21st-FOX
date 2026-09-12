import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error index.js 是纯 JS 的 Worker 入口脚本，没有类型声明文件
import worker from './index.js';

// 回归守卫：/europepmc 是给「自习室 → 学术文献晨读」直连 EBI/NCBI 失败时兜底用的
// 转发路由（见 utils/europePmc.ts 的 fetchAcademicApi）。只放行这两个域名——
// 别的 target 一律拒绝，防止被当成任意 URL 的 SSRF 跳板。

const call = (target: string, init?: RequestInit) =>
    (worker as any).fetch(
        new Request(`https://worker.example/europepmc?target=${encodeURIComponent(target)}`, init),
        {},
        {},
    );

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Worker /europepmc 代理', () => {
    it('转发到白名单内的 EBI 地址，原样带回状态码与响应体', async () => {
        const upstreamFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ resultList: { result: [] } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', upstreamFetch);

        const res = await call('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=CRISPR');

        expect(upstreamFetch).toHaveBeenCalledTimes(1);
        expect(upstreamFetch.mock.calls[0][0]).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=CRISPR');
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
        const body = await res.json();
        expect(body).toEqual({ resultList: { result: [] } });
    });

    it('转发到白名单内的 NCBI 地址', async () => {
        const upstreamFetch = vi.fn().mockResolvedValue(new Response('<xml/>', {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
        }));
        vi.stubGlobal('fetch', upstreamFetch);

        const res = await call('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=1');

        expect(upstreamFetch).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('<xml/>');
    });

    it('不在白名单里的域名一律拒绝——不是任意 URL 的转发跳板', async () => {
        const upstreamFetch = vi.fn();
        vi.stubGlobal('fetch', upstreamFetch);

        const res = await call('https://evil.example.com/steal');

        expect(res.status).toBe(400);
        expect(upstreamFetch).not.toHaveBeenCalled();
    });

    it('缺 target 参数直接拒绝', async () => {
        const upstreamFetch = vi.fn();
        vi.stubGlobal('fetch', upstreamFetch);

        const res = await (worker as any).fetch(new Request('https://worker.example/europepmc'), {}, {});

        expect(res.status).toBe(400);
        expect(upstreamFetch).not.toHaveBeenCalled();
    });

    it('只认 GET，POST 拒绝', async () => {
        const upstreamFetch = vi.fn();
        vi.stubGlobal('fetch', upstreamFetch);

        const res = await call('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=x', { method: 'POST' });

        expect(res.status).toBe(405);
        expect(upstreamFetch).not.toHaveBeenCalled();
    });

    it('上游超时/网络异常时返回 502/504，不把 worker 自己的异常抛出去', async () => {
        const upstreamFetch = vi.fn().mockRejectedValue(new TypeError('network down'));
        vi.stubGlobal('fetch', upstreamFetch);

        const res = await call('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=x');

        expect(res.status).toBe(502);
    });
});
