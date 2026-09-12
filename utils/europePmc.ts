import type { StudyPaper } from '../types';
import { parseJatsXml } from './jatsParser';
import { getProxyWorkerUrl } from './proxyWorker';

const BASE_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

// ─── 网络重试 ───
// EBI（英国）/ NCBI（美国）这两个接口对国内移动网络（尤其蜂窝数据、弱 wifi）
// 延迟高、丢包也多，桌面宽带上很少复现的"网络错误"在手机上几乎每检索几次就撞一回。
// 原来一次 fetch 不成直接把 catch 抛给用户，这里给瞬时故障（超时、连接层失败、
// 5xx/429）一次自动重试的机会——4xx 之类的客户端错误不重试，重试只会让用户多等，
// 换不来不同的结果。
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2; // 一共最多尝试 3 次
const RETRY_DELAYS_MS = [800, 1800];

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, { ...init, signal: controller.signal });
            clearTimeout(timer);
            // 5xx / 429 是接口那边的瞬时抖动，值得重试；其余状态码（含 4xx）原样交回调用方判断。
            if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
                lastError = new Error(`HTTP ${res.status}`);
                await sleep(RETRY_DELAYS_MS[attempt]);
                continue;
            }
            return res;
        } catch (e) {
            clearTimeout(timer);
            lastError = e;
            if (attempt < MAX_RETRIES) {
                await sleep(RETRY_DELAYS_MS[attempt]);
                continue;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error('网络请求失败');
}

/**
 * 直连优先，直连失败（重试耗尽）再落到 Worker 代理兜底（`/europepmc`，见 worker/index.js）。
 *
 * 直连是快路径：多数网络环境下 EBI/NCBI 本来就能连通，走 Worker 纯粹多绕一跳，没必要
 * 每次都走。只有直连的全部重试都失败才落到代理——常见成因是移动网络对这类跨境直连做
 * DNS 劫持/连接重置，浏览器侧表现为 CORS 被拦或直接连不上，且是稳定复现（同一条网络
 * 路径重试三次结果一样），跟其余联网功能（Notion/飞书/Brave 搜索……）一样，走 Worker
 * 代理（跑在 Cloudflare 全球边缘）才能绕开这类劫持。
 */
async function fetchAcademicApi(url: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetchWithRetry(url, init);
    } catch (directError) {
        try {
            const proxyUrl = `${getProxyWorkerUrl()}/europepmc?target=${encodeURIComponent(url)}`;
            return await fetchWithRetry(proxyUrl, init);
        } catch {
            // 两条路都走不通：把直连那次的错误抛出去，对用户/日志来说信息量更大
            // （能看出是网络问题，不是代理这一跳本身配置错了）。
            throw directError instanceof Error ? directError : new Error('网络请求失败');
        }
    }
}

export interface EuropePmcArticleSummary {
    id: string;
    pmcid?: string;
    title: string;
    authorString?: string;
    journalTitle?: string;
    pubYear?: string;
    firstPublicationDate?: string;
    pubDate?: string;
    doi?: string;
    abstractText?: string;
    keywords?: string[];
    isOpenAccess?: string;
    hasFT?: string;
    pubType?: string;
    isAbstractOnly?: boolean;
    hasPDF?: boolean;
    pdfUrl?: string;
}

/**
 * 检索欧洲生物信息研究所（Europe PMC）的文献（支持普通关键词、DOI 精确反查、以及开放获取 / 全文献切换）
 * @param query 学科关键词或标准 DOI（如 "CRISPR", "10.1038/s41586-024-xxxx"）
 * @param limit 返回条数，默认 8
 * @param options.openAccessOnly 是否仅限开放获取全文文献，默认 false（可检索包括 Nature/Science/Cell 等全学科顶刊摘要与元数据）
 * @param options.yearsBack 只看最近 N 年发表的文献（如 3 = 近 3 年），不传或传 0/负数则不限年份
 * @param options.excludeAbstractOnly 排除会议简报 / 快讯这类只有摘要没有正文的条目
 *
 * DOI 精确反查模式下忽略后面三项过滤——DOI 本身就是唯一定位，不该被年份/类型筛掉。
 */
export async function searchEuropePmcArticles(
    query: string,
    limit: number = 8,
    options?: { openAccessOnly?: boolean; yearsBack?: number; excludeAbstractOnly?: boolean }
): Promise<EuropePmcArticleSummary[]> {
    const trimmed = query.trim() || 'bioengineering';

    // 识别输入是否为标准 DOI（如 10.1038/... 或 doi: 10.xxxx/...）
    const doiMatch = trimmed.match(/^(?:doi:\s*|https?:\/\/doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i);
    const isDoi = Boolean(doiMatch);

    let queryString: string;
    if (isDoi && doiMatch) {
        const cleanDoi = doiMatch[1];
        // DOI 精准检索：支持任意期刊与文献
        queryString = `(DOI:"${cleanDoi}" OR "${cleanDoi}")`;
    } else {
        // 几个过滤条件互相独立、可以叠加：开放获取、年份范围、排除会议摘要都是各自一个
        // AND 子句，缺哪个就不拼哪个——不是三选一。
        const clauses: string[] = [];
        if (options?.openAccessOnly) clauses.push('OPEN_ACCESS:Y AND (HAS_FT:Y OR HAS_PDF:Y)');
        if (options?.yearsBack && options.yearsBack > 0) {
            const fromYear = new Date().getFullYear() - options.yearsBack + 1;
            clauses.push(`PUB_YEAR:[${fromYear} TO 3000]`);
        }
        if (options?.excludeAbstractOnly) clauses.push('NOT PUB_TYPE:"meeting-abstract"');

        // 全文献探索模式：收录全球 4000+ 万篇学术文献（含 Nature/Science/Cell/PNAS 等顶刊最新摘要、机理与作者关键词）
        queryString = clauses.length > 0
            ? `${clauses.join(' AND ')} AND (${trimmed})`
            : `(${trimmed})`;
    }

    const url = `${BASE_URL}/search?query=${encodeURIComponent(queryString)}&format=json&pageSize=${limit}&resultType=core`;

    const res = await fetchAcademicApi(url, {
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error(`Europe PMC 检索失败: HTTP ${res.status}`);
    }

    const data = await res.json();
    const list: any[] = data?.resultList?.result || [];

    return list.map(item => {
        const rawAbstract = item.abstractText || '';
        const cleanAbstract = rawAbstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const journalTitle = item.journalTitle || item.journalInfo?.journal?.title || item.journalInfo?.journal?.medlineAbbreviation || 'Academic';
        const pubDate = item.firstPublicationDate
            || item.electronicPublicationDate
            || item.journalInfo?.printPublicationDate
            || item.journalInfo?.dateOfPublication
            || item.pubYear;

        const pubTypes: string = (
            typeof item.pubTypeList?.pubType === 'string'
                ? item.pubTypeList.pubType
                : Array.isArray(item.pubTypeList?.pubType)
                ? item.pubTypeList.pubType.join(' ')
                : ''
        );
        const isAbstractOnly = /meeting|conference|abstract/i.test(pubTypes);

        const cleanPmcid = item.pmcid || (item.source === 'PMC' ? `PMC${item.id}` : undefined);
        const hasPdf = item.hasPDF === 'Y' || Boolean(cleanPmcid);

        // 提取原文献自带的作者关键词
        const extractedKeywords: string[] = [];
        if (item.keywordList?.keyword) {
            const rawKws = Array.isArray(item.keywordList.keyword) ? item.keywordList.keyword : [item.keywordList.keyword];
            rawKws.forEach((k: any) => {
                const s = String(k || '').replace(/^[•\s\-_]+/, '').trim();
                if (s && !extractedKeywords.includes(s)) extractedKeywords.push(s);
            });
        }
        // 若缺少作者关键词，选用 MeSH 专业学术主题词补充
        if (extractedKeywords.length === 0 && item.meshHeadingList?.meshHeading) {
            const headings = Array.isArray(item.meshHeadingList.meshHeading)
                ? item.meshHeadingList.meshHeading
                : [item.meshHeadingList.meshHeading];
            headings.forEach((h: any) => {
                const name = h?.descriptorName ? String(h.descriptorName).trim() : '';
                if (name && !extractedKeywords.includes(name)) extractedKeywords.push(name);
            });
        }

        // 优先获取 fullTextUrlList 中的官方 PDF 直链，若无则使用官方现代化 PDF 渲染地址，杜绝旧 ptpmcrender.fcgi 520 报错
        const fullTextList = Array.isArray(item.fullTextUrlList?.fullTextUrl)
            ? item.fullTextUrlList.fullTextUrl
            : (item.fullTextUrlList?.fullTextUrl ? [item.fullTextUrlList.fullTextUrl] : []);
        const directPdfObj = fullTextList.find((u: any) => u.documentStyle === 'pdf');

        let pdfUrl: string | undefined = undefined;
        if (directPdfObj?.url && !directPdfObj.url.includes('ptpmcrender.fcgi')) {
            pdfUrl = directPdfObj.url;
        } else if (cleanPmcid) {
            pdfUrl = `https://europepmc.org/articles/${cleanPmcid.toUpperCase()}?pdf=render`;
        }

        return {
            id: item.id,
            pmcid: cleanPmcid,
            title: (item.title || '').replace(/\.$/, ''),
            authorString: item.authorString,
            journalTitle,
            pubYear: item.pubYear,
            firstPublicationDate: item.firstPublicationDate,
            pubDate,
            doi: item.doi,
            abstractText: cleanAbstract || undefined,
            keywords: extractedKeywords.length > 0 ? extractedKeywords : undefined,
            isOpenAccess: item.isOpenAccess,
            hasFT: item.hasFT,
            pubType: pubTypes || undefined,
            isAbstractOnly,
            hasPDF: hasPdf,
            pdfUrl
        };
    }).filter(item => Boolean(item.title && (item.pmcid || item.doi || item.abstractText || item.hasPDF)));
}

/**
 * 获取指定 PMC 的 JATS XML 全文（优先请求 Europe PMC REST API，遭遇 503 等异常时自动兜底切换至 NCBI PMC efetch）
 */
export async function fetchEuropePmcFullTextXml(pmcid: string): Promise<string> {
    const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
    const numericId = cleanId.replace(/^PMC/i, '');

    // 1. 优先尝试 Europe PMC REST 端点
    try {
        const url = `${BASE_URL}/${cleanId}/fullTextXML`;
        const res = await fetchAcademicApi(url, {
            headers: {
                'Accept': 'application/xml, text/xml'
            }
        });

        if (res.ok) {
            const xml = await res.text();
            if (xml && xml.length >= 50 && !xml.includes('503 Service Temporarily Unavailable')) {
                return xml;
            }
        }
    } catch (e) {
        console.warn(`Europe PMC fetch 异常，尝试切换至 NCBI 兜底:`, e);
    }

    // 2. 备选方案：NCBI Entrez efetch
    try {
        const ncbiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${numericId}&retmode=xml`;
        const ncbiRes = await fetchAcademicApi(ncbiUrl);
        if (ncbiRes.ok) {
            const ncbiXml = await ncbiRes.text();
            if (ncbiXml && ncbiXml.length >= 50) {
                return ncbiXml;
            }
        }
    } catch (e) {
        console.warn(`NCBI fallback 也未能获取:`, e);
    }

    throw new Error(`获取文献 JATS XML 失败 (${cleanId}): Europe PMC 与 NCBI 均未能返回有效全文`);
}

/**
 * 高级封装：一键抓取、清洗并解析为积木协议 StudyPaper
 */
export async function fetchAndParseStudyPaper(
    pmcid: string,
    keywords: string[] = [],
    summaryFallback?: Partial<EuropePmcArticleSummary>
): Promise<StudyPaper> {
    const rawId = pmcid.trim();
    const isPmc = rawId.toUpperCase().startsWith('PMC') || Boolean(summaryFallback?.pmcid);
    const cleanId = isPmc
        ? (rawId.toUpperCase().startsWith('PMC') ? rawId.toUpperCase() : `PMC${rawId}`)
        : rawId;

    const pdfUrl = summaryFallback?.pdfUrl || (isPmc ? `https://europepmc.org/articles/${cleanId}?pdf=render` : undefined);
    const combinedKeywords = (summaryFallback?.keywords && summaryFallback.keywords.length > 0)
        ? summaryFallback.keywords
        : keywords;

    let xml = '';
    if (isPmc) {
        try {
            xml = await fetchEuropePmcFullTextXml(cleanId);
        } catch (err) {
            console.warn(`无法获取 ${cleanId} 的 JATS XML 全文，自动降级为摘要阅读模式:`, err);
        }
    }

    // 如果未获取到 JATS XML 全文（例如官方仅收录纯摘要、或属于 closed-access 顶刊），降级生成摘要阅读块，让用户可以顺畅研读摘要并一键下载原版 PDF
    if (!xml) {
        if (summaryFallback?.abstractText || summaryFallback?.title) {
            return {
                id: cleanId,
                pmcid: cleanId,
                doi: summaryFallback?.doi,
                title: summaryFallback.title || cleanId,
                journalTitle: summaryFallback.journalTitle || 'Academic',
                pubDate: summaryFallback.pubDate || summaryFallback.pubYear,
                pubType: summaryFallback.pubType,
                authorString: summaryFallback.authorString,
                keywords: combinedKeywords,
                abstract: summaryFallback.abstractText,
                blocks: [
                    {
                        id: 'abstract_heading',
                        type: 'heading',
                        level: 2,
                        text: 'Abstract / 论文摘要'
                    },
                    {
                        id: 'abstract_content',
                        type: 'paragraph',
                        text: summaryFallback.abstractText || '该文献暂未收录开放 JATS XML 结构化全文，可前往出版社官网或通过 DOI 阅读完整正文。'
                    }
                ],
                fetchedAt: Date.now(),
                readProgress: 0,
                isFavorite: false,
                hasPDF: Boolean(summaryFallback.hasPDF || pdfUrl),
                pdfUrl
            };
        }
        throw new Error(`获取文献失败 (${cleanId}): 未找到该文献的有效全文或摘要`);
    }

    const parsed = parseJatsXml(xml, cleanId);
    const finalKeywords = (parsed.keywords && parsed.keywords.length > 0) ? parsed.keywords : combinedKeywords;

    const paper: StudyPaper = {
        id: cleanId,
        pmcid: cleanId,
        doi: parsed.doi || summaryFallback?.doi,
        title: parsed.title,
        journalTitle: parsed.journalTitle || summaryFallback?.journalTitle,
        pubDate: parsed.pubDate || summaryFallback?.pubDate,
        pubType: summaryFallback?.pubType,
        authorString: parsed.authors.slice(0, 5).join(', ') + (parsed.authors.length > 5 ? ' et al.' : '') || summaryFallback?.authorString,
        keywords: finalKeywords,
        abstract: parsed.abstractText || summaryFallback?.abstractText,
        blocks: parsed.blocks,
        fetchedAt: Date.now(),
        readProgress: 0,
        isFavorite: false,
        hasPDF: Boolean(summaryFallback?.hasPDF || pdfUrl),
        pdfUrl
    };

    return paper;
}
