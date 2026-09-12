import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchEuropePmcArticles } from './europePmc';

// 回归守卫：手机网络（尤其国内蜂窝数据到 EBI/NCBI 这类国外接口）比桌面宽带更容易
// 出现瞬时故障——超时、连接被重置、502/503/429。以前一次 fetch 不成直接把错误甩给
// 用户，这里验证瞬时故障会被自动重试、真正的客户端错误（4xx）不会被无谓地重试。

const okResult = (items: any[] = []) => ({
    ok: true,
    status: 200,
    json: async () => ({ resultList: { result: items } }),
} as any);

const RESULT_ITEM = { id: '1', title: 'A paper', pmcid: 'PMC1', hasPDF: 'Y' };

describe('searchEuropePmcArticles 的网络重试', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('第一次网络层失败（如手机弱网下 fetch 直接抛错），重试后成功', async () => {
        const fetchMock = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(okResult([RESULT_ITEM]));
        global.fetch = fetchMock;

        const list = await searchEuropePmcArticles('CRISPR');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(list).toHaveLength(1);
    }, 10000);

    it('接口 503（瞬时过载），重试后成功', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, status: 503 } as any)
            .mockResolvedValueOnce(okResult([RESULT_ITEM]));
        global.fetch = fetchMock;

        const list = await searchEuropePmcArticles('CRISPR');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(list).toHaveLength(1);
    }, 10000);

    it('直连 + Worker 代理兜底都连续 3 次失败才真正报错给用户（重试次数封顶，不无限重试）', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        global.fetch = fetchMock;

        await expect(searchEuropePmcArticles('CRISPR')).rejects.toThrow();
        // 直连 3 次 + 落到 Worker 代理兜底再 3 次 = 6 次
        expect(fetchMock).toHaveBeenCalledTimes(6);
    }, 20000);

    it('客户端错误（400）不重试——重试也换不来不同结果，只会让用户多等', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 } as any);
        global.fetch = fetchMock;

        await expect(searchEuropePmcArticles('CRISPR')).rejects.toThrow('HTTP 400');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('直连失败落到 Worker 代理兜底（/europepmc，见 worker/index.js）', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('直连全部失败后落到 Worker 代理，代理一成功就直接拿到结果', async () => {
        const fetchMock = vi.fn()
            // 直连 3 次全失败
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            // 落到 Worker 代理，第一次就成功
            .mockResolvedValueOnce(okResult([RESULT_ITEM]));
        global.fetch = fetchMock;

        const list = await searchEuropePmcArticles('CRISPR');

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(list).toHaveLength(1);

        // 第 4 次请求应该是打到 Worker 的 /europepmc，target 参数原样带着直连那次的 URL
        const proxyCallUrl = fetchMock.mock.calls[3][0] as string;
        expect(proxyCallUrl).toContain('/europepmc?target=');
        const targetParam = new URL(proxyCallUrl).searchParams.get('target') || '';
        expect(targetParam).toContain('www.ebi.ac.uk/europepmc/webservices/rest/search');
    }, 15000);

    it('直连成功时完全不碰 Worker 代理（快路径，少绕一跳）', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(okResult([RESULT_ITEM]));
        global.fetch = fetchMock;

        await searchEuropePmcArticles('CRISPR');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        // 直连走的是原样的 EBI 地址，不应该被套上代理的 ?target= 包装
        expect(fetchMock.mock.calls[0][0] as string).not.toContain('target=');
    });
});

describe('searchEuropePmcArticles 的过滤条件拼接', () => {
    const captureQuery = () => {
        const fetchMock = vi.fn().mockResolvedValue(okResult([]));
        global.fetch = fetchMock;
        return fetchMock;
    };

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.useFakeTimers({ shouldClearNativeTimers: true });
        vi.setSystemTime(new Date('2026-09-12T00:00:00Z'));
    });

    it('不传任何过滤：全文献探索模式，只有关键词本身', async () => {
        const fetchMock = captureQuery();
        await searchEuropePmcArticles('CRISPR');
        const url = fetchMock.mock.calls[0][0] as string;
        expect(decodeURIComponent(url)).toContain('query=(CRISPR)');
    });

    it('yearsBack=3：拼出 PUB_YEAR 范围子句（今年 2026，起点应为 2024）', async () => {
        const fetchMock = captureQuery();
        await searchEuropePmcArticles('CRISPR', 8, { yearsBack: 3 });
        const url = fetchMock.mock.calls[0][0] as string;
        expect(decodeURIComponent(url)).toContain('PUB_YEAR:[2024 TO 3000]');
    });

    it('excludeAbstractOnly：排除会议摘要子句', async () => {
        const fetchMock = captureQuery();
        await searchEuropePmcArticles('CRISPR', 8, { excludeAbstractOnly: true });
        const url = fetchMock.mock.calls[0][0] as string;
        expect(decodeURIComponent(url)).toContain('NOT PUB_TYPE:"meeting-abstract"');
    });

    it('openAccessOnly + yearsBack + excludeAbstractOnly 可以同时叠加，互不覆盖', async () => {
        const fetchMock = captureQuery();
        await searchEuropePmcArticles('CRISPR', 8, {
            openAccessOnly: true,
            yearsBack: 1,
            excludeAbstractOnly: true,
        });
        const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
        expect(url).toContain('OPEN_ACCESS:Y');
        expect(url).toContain('PUB_YEAR:[2026 TO 3000]');
        expect(url).toContain('NOT PUB_TYPE:"meeting-abstract"');
    });

    it('DOI 精确反查模式下忽略年份/类型过滤（DOI 本身就是唯一定位）', async () => {
        const fetchMock = captureQuery();
        await searchEuropePmcArticles('10.1038/s41586-024-00000-0', 8, {
            yearsBack: 1,
            excludeAbstractOnly: true,
        });
        const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
        expect(url).toContain('DOI:"10.1038/s41586-024-00000-0"');
        expect(url).not.toContain('PUB_YEAR');
        expect(url).not.toContain('PUB_TYPE');
    });
});
