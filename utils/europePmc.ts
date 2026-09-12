import type { StudyPaper } from '../types';
import { parseJatsXml } from './jatsParser';

const BASE_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

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
    isOpenAccess?: string;
    hasFT?: string;
    pubType?: string;
    isAbstractOnly?: boolean;
    hasPDF?: boolean;
    pdfUrl?: string;
}

/**
 * 检索欧洲生物信息研究所（Europe PMC）的开放获取全文文献（支持普通关键词与 DOI 精确反查）
 * @param query 学科关键词或标准 DOI（如 "CRISPR", "10.1038/s41586-024-xxxx"）
 * @param limit 返回条数，默认 10
 */
export async function searchEuropePmcArticles(query: string, limit: number = 8): Promise<EuropePmcArticleSummary[]> {
    const trimmed = query.trim() || 'bioengineering';

    // 识别输入是否为标准 DOI（如 10.1038/... 或 doi: 10.xxxx/...）
    const doiMatch = trimmed.match(/^(?:doi:\s*|https?:\/\/doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)$/i);
    const isDoi = Boolean(doiMatch);

    let queryString: string;
    if (isDoi && doiMatch) {
        const cleanDoi = doiMatch[1];
        // DOI 精准检索：放宽必须具备 XML 全文限制，以便精准定位该 DOI 并在元数据中展示 PDF
        queryString = `(DOI:"${cleanDoi}" OR "${cleanDoi}")`;
    } else {
        // 普通学科关键词检索：限制开放获取与全文/PDF
        queryString = `OPEN_ACCESS:Y AND (HAS_FT:Y OR HAS_PDF:Y) AND (${trimmed})`;
    }

    const url = `${BASE_URL}/search?query=${encodeURIComponent(queryString)}&format=json&pageSize=${limit}&resultType=core`;

    const res = await fetch(url, {
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
        const pdfUrl = cleanPmcid
            ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${cleanPmcid.toUpperCase()}&blobtype=pdf`
            : (item.fullTextUrlList?.fullTextUrl?.find((u: any) => u.documentStyle === 'pdf')?.url || undefined);

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
            isOpenAccess: item.isOpenAccess,
            hasFT: item.hasFT,
            pubType: pubTypes || undefined,
            isAbstractOnly,
            hasPDF: hasPdf,
            pdfUrl
        };
    }).filter(item => Boolean(item.pmcid || item.hasPDF || isDoi));
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
        const res = await fetch(url, {
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
        const ncbiRes = await fetch(ncbiUrl);
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
    const cleanId = pmcid.toUpperCase().startsWith('PMC') ? pmcid.toUpperCase() : `PMC${pmcid}`;
    const pdfUrl = summaryFallback?.pdfUrl || (cleanId ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${cleanId}&blobtype=pdf` : undefined);

    let xml = '';
    try {
        xml = await fetchEuropePmcFullTextXml(cleanId);
    } catch (err) {
        // 如果 XML 获取失败（例如官方未收录 JATS XML，或只有 PDF/纯摘要），降级生成摘要阅读块，让用户可以顺畅研读摘要并一键下载原版 PDF
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
                keywords,
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
                        text: summaryFallback.abstractText || '该文献暂未收录开放 JATS XML 结构化全文，可点击上方「下载原版 PDF」保存官方完整版。'
                    }
                ],
                fetchedAt: Date.now(),
                readProgress: 0,
                isFavorite: false,
                hasPDF: Boolean(summaryFallback.hasPDF || pdfUrl),
                pdfUrl
            };
        }
        throw err;
    }

    const parsed = parseJatsXml(xml, cleanId);

    const paper: StudyPaper = {
        id: cleanId,
        pmcid: cleanId,
        doi: parsed.doi || summaryFallback?.doi,
        title: parsed.title,
        journalTitle: parsed.journalTitle || summaryFallback?.journalTitle,
        pubDate: parsed.pubDate || summaryFallback?.pubDate,
        pubType: summaryFallback?.pubType,
        authorString: parsed.authors.slice(0, 5).join(', ') + (parsed.authors.length > 5 ? ' et al.' : '') || summaryFallback?.authorString,
        keywords,
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
