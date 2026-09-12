import type { PaperBlock, PaperHeadingBlock, PaperParagraphBlock, PaperFigureBlock } from '../types';

export interface ParsedJatsResult {
    title: string;
    authors: string[];
    journalTitle?: string;
    pubDate?: string;
    doi?: string;
    abstractText?: string;
    keywords?: string[];
    blocks: PaperBlock[];
}

/**
 * 清理 JATS XML 中 tex-math 元素内部附带的导言区与 processing instructions
 */
export function cleanTexMath(raw: string): string {
    if (!raw) return '';
    // 去掉 processing instructions (如 <?equation-image-...?>)
    let cleaned = raw.replace(/<\?[^>]*\?>/g, '');
    // 优先提取 \begin{document} ... \end{document} 之间的纯公式主体
    const docMatch = cleaned.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (docMatch) {
        cleaned = docMatch[1];
    } else {
        // 移除 LaTeX 文档导言区声明
        cleaned = cleaned
            .replace(/\\documentclass(\[[^\]]*\])?\{[^}]*\}/g, '')
            .replace(/\\usepackage(\[[^\]]*\])?\{[^}]*\}/g, '')
            .replace(/\\setlength\{[^}]*\}\{[^}]*\}/g, '');
    }
    return cleaned.replace(/^\$+|\$+$/g, '').trim();
}

/**
 * 递归清洗内联 JATS XML 标签（如 <bold>, <italic>, <ext-link>, <xref>, <tex-math> 等），转为清晰易读的 Markdown / 行内文本
 */
function cleanInlineXml(node: Element): string {
    let result = '';

    for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === Node.TEXT_NODE) {
            result += child.textContent || '';
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            const tagName = el.tagName.toLowerCase();

            if (tagName === 'bold' || tagName === 'strong') {
                result += `**${cleanInlineXml(el).trim()}**`;
            } else if (tagName === 'italic' || tagName === 'em') {
                result += `*${cleanInlineXml(el).trim()}*`;
            } else if (tagName === 'monospace' || tagName === 'code') {
                result += `\`${cleanInlineXml(el).trim()}\``;
            } else if (tagName === 'sup') {
                result += `^(${cleanInlineXml(el).trim()})`;
            } else if (tagName === 'sub') {
                result += `_(${cleanInlineXml(el).trim()})`;
            } else if (tagName === 'tex-math') {
                const math = cleanTexMath(el.textContent || '');
                if (math) {
                    result += ` $${math}$ `;
                }
            } else if (tagName === 'mml:math' || tagName === 'math') {
                const altText = el.getAttribute('alttext');
                if (altText && (/[\\_^]/.test(altText) || altText.includes('='))) {
                    result += ` $${cleanTexMath(altText)}$ `;
                } else {
                    const mathHtml = (el.outerHTML || '')
                        .replace(/<(\/?)mml:/gi, '<$1')
                        .replace(/\sxmlns:mml="[^"]*"/gi, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (mathHtml) {
                        result += ` ${mathHtml} `;
                    } else if (el.textContent) {
                        result += ` ${el.textContent.trim()} `;
                    }
                }
            } else if (tagName === 'inline-formula' || tagName === 'disp-formula') {
                const texChild = el.querySelector('tex-math');
                if (texChild) {
                    const math = cleanTexMath(texChild.textContent || '');
                    if (math) {
                        const isDisp = tagName === 'disp-formula';
                        result += isDisp ? `\n$$${math}$$\n` : ` $${math}$ `;
                        continue;
                    }
                }
                result += cleanInlineXml(el);
            } else if (tagName === 'xref') {
                // 交叉引用（如 [1], Fig. 1），保留文本
                result += el.textContent || '';
            } else if (tagName === 'ext-link') {
                const href = el.getAttribute('xlink:href') || el.getAttribute('href') || '';
                const text = cleanInlineXml(el);
                result += href ? `[${text}](${href})` : text;
            } else {
                result += cleanInlineXml(el);
            }
        }
    }

    return result.replace(/\s+/g, ' ').trim();
}

/**
 * 从原始 JATS XML 中根据图名/xlink:href 查找 cloudpmc 对应的高清图 CDN 地址
 * 兼容 cloudpmc-path 与 image-cloudpmc-urn 等各种 PMC 标准处理指令
 */
function resolveFigureImageUrl(xmlText: string, href: string, pmcidClean: string, figSnippet?: string): { imageUrl: string; thumbUrl?: string } {
    if (!href) return { imageUrl: '' };

    const cleanFileName = href.replace(/^.*\//, ''); // 仅保留文件名
    const baseName = cleanFileName.replace(/\.[^/.]+$/, ''); // 去掉扩展名，如 Fig1.jpg -> Fig1
    const escapedFileName = cleanFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = `(?:${escapedFileName}|${escapedBaseName})`;

    // 1. 尝试匹配 XML 中内置的 NCBI Cloud PMC processing instruction:
    // 支持 <?cloudpmc-path blobs/...?> 与 <?image-cloudpmc-urn urn:cdn:blobs/...?>
    // 优先在当前 figure 节点片段内搜索，避免多图文献命中错误图
    const regexFull = new RegExp(`(?:cloudpmc-path|image-cloudpmc-urn)[^?]*?\\s+(?:urn:cdn:)?(blobs\\/[^?]*?${pattern}[^?]*)\\?>`, 'i');
    const regexThumb = new RegExp(`(?:thumb-cloudpmc-path|thumb-cloudpmc-urn)[^?]*?\\s+(?:urn:cdn:)?(blobs\\/[^?]*?${pattern}[^?]*)\\?>`, 'i');

    const matchFull = (figSnippet && figSnippet.match(regexFull)) || xmlText.match(regexFull);
    const matchThumb = (figSnippet && figSnippet.match(regexThumb)) || xmlText.match(regexThumb);

    if (matchFull && matchFull[1]) {
        const cdnUrl = `https://cdn.ncbi.nlm.nih.gov/pmc/${matchFull[1].trim()}`;
        const thumbUrl = matchThumb && matchThumb[1]
            ? `https://cdn.ncbi.nlm.nih.gov/pmc/${matchThumb[1].trim()}`
            : undefined;
        return { imageUrl: cdnUrl, thumbUrl };
    }

    // 2. Fallback: 官方 PMC 标准 blob 规则
    // 若原名无后缀，自动补 .jpg（PMC 标准图片归档默认格式，避免 404）
    const hasExt = /\.[a-zA-Z0-9]{3,4}$/i.test(cleanFileName);
    const targetFileName = hasExt ? cleanFileName : `${cleanFileName}.jpg`;
    const cleanId = pmcidClean.startsWith('PMC') ? pmcidClean : 'PMC' + pmcidClean;
    const fallbackUrl = `https://cdn.ncbi.nlm.nih.gov/pmc/articles/${cleanId}/bin/${targetFileName}`;
    return { imageUrl: fallbackUrl };
}

/**
 * 解析 JATS XML 全文字符串为积木协议结构
 */
export function parseJatsXml(xmlText: string, pmcid: string): ParsedJatsResult {
    // 若在 Node / 非浏览器环境执行，启用轻量正则兜底解析
    if (typeof DOMParser === 'undefined') {
        const titleMatch = xmlText.match(/<article-title[^>]*>([\s\S]*?)<\/article-title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : pmcid;

        const kwdMatches = Array.from(xmlText.matchAll(/<kwd[^>]*>([\s\S]*?)<\/kwd>/gi));
        const keywords = kwdMatches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);

        const abstractMatch = xmlText.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
        const abstractText = abstractMatch ? abstractMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined;

        const doiMatch = xmlText.match(/<article-id\s+pub-id-type=["']doi["'][^>]*>([\s\S]*?)<\/article-id>/i);
        const doi = doiMatch ? doiMatch[1].trim() : undefined;

        return {
            pmcid,
            title,
            authors: [],
            abstractText,
            keywords,
            blocks: abstractText ? [
                { id: 'block-1', type: 'heading', level: 2, text: 'Abstract / 论文摘要' },
                { id: 'block-2', type: 'paragraph', text: abstractText }
            ] : []
        };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error(`JATS XML 解析失败: ${parserError.textContent}`);
    }

    const pmcidClean = pmcid.replace(/^PMC/i, '');

    // 1. 元数据提取
    const titleEl = doc.querySelector('front article-meta article-title');
    const title = titleEl ? cleanInlineXml(titleEl) : 'Untitled Academic Paper';

    // 作者列表
    const authors: string[] = [];
    const contribs = doc.querySelectorAll('front article-meta contrib-group contrib[contrib-type="author"]');
    contribs.forEach(c => {
        const surname = c.querySelector('name surname')?.textContent?.trim() || '';
        const given = c.querySelector('name given-names')?.textContent?.trim() || '';
        const name = `${given} ${surname}`.trim();
        if (name) authors.push(name);
    });

    // 期刊名
    const journalTitle = doc.querySelector('front journal-meta journal-title')?.textContent?.trim()
        || doc.querySelector('front journal-meta journal-id')?.textContent?.trim()
        || undefined;

    // DOI
    const doi = doc.querySelector('front article-meta article-id[pub-id-type="doi"]')?.textContent?.trim() || undefined;

    // 出版年份/日期
    const pubDateYear = doc.querySelector('front article-meta pub-date year')?.textContent?.trim();
    const pubDateMonth = doc.querySelector('front article-meta pub-date month')?.textContent?.trim();
    const pubDateDay = doc.querySelector('front article-meta pub-date day')?.textContent?.trim();
    const pubDate = pubDateYear ? [pubDateYear, pubDateMonth, pubDateDay].filter(Boolean).join('-') : undefined;

    // 摘要
    const abstractEl = doc.querySelector('front article-meta abstract');
    let abstractText: string | undefined;
    if (abstractEl) {
        const pList = Array.from(abstractEl.querySelectorAll('p'));
        abstractText = pList.length > 0
            ? pList.map(p => cleanInlineXml(p)).join('\n\n')
            : cleanInlineXml(abstractEl);
    }

    // 关键词
    const keywords: string[] = [];
    const kwdNodes = doc.querySelectorAll('front article-meta kwd-group kwd');
    kwdNodes.forEach(k => {
        const text = cleanInlineXml(k).trim();
        if (text && !keywords.includes(text)) keywords.push(text);
    });

    // 2. 剥离参考文献与噪声节点
    const noiseSelectors = ['back', 'ref-list', 'ack', 'app-group', 'fn-group', 'notes'];
    noiseSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(node => node.remove());
    });

    // 3. 解析 Body，转换为 Block Schema
    const blocks: PaperBlock[] = [];
    let blockIndex = 0;

    // 如果有摘要，首段注入摘要
    if (abstractText) {
        blocks.push({
            id: `block-${++blockIndex}`,
            type: 'heading',
            level: 2,
            text: 'Abstract',
            textZh: '摘要'
        });
        const abstractParas = abstractText.split('\n\n').filter(Boolean);
        for (const para of abstractParas) {
            blocks.push({
                id: `block-${++blockIndex}`,
                type: 'paragraph',
                text: para
            });
        }
    }

    const bodyEl = doc.querySelector('body');
    if (!bodyEl) {
        return { title, authors, journalTitle, pubDate, doi, abstractText, blocks };
    }

    function traverse(element: Element, currentLevel: 1 | 2 | 3 = 1) {
        for (let i = 0; i < element.children.length; i++) {
            const child = element.children[i];
            const tag = child.tagName.toLowerCase();

            if (tag === 'sec') {
                const titleNode = child.querySelector(':scope > title');
                if (titleNode) {
                    const secTitle = cleanInlineXml(titleNode);
                    if (secTitle) {
                        blocks.push({
                            id: `block-${++blockIndex}`,
                            type: 'heading',
                            level: currentLevel,
                            text: secTitle
                        });
                    }
                }
                const nextLevel = Math.min(3, currentLevel + 1) as 1 | 2 | 3;
                traverse(child, nextLevel);
            } else if (tag === 'title' && element.tagName.toLowerCase() !== 'sec') {
                const tText = cleanInlineXml(child);
                if (tText) {
                    blocks.push({
                        id: `block-${++blockIndex}`,
                        type: 'heading',
                        level: currentLevel,
                        text: tText
                    });
                }
            } else if (tag === 'p') {
                const pText = cleanInlineXml(child);
                if (pText && pText.length > 5) {
                    blocks.push({
                        id: `block-${++blockIndex}`,
                        type: 'paragraph',
                        text: pText
                    });
                }
            } else if (tag === 'fig') {
                const labelNode = child.querySelector('label');
                const label = labelNode ? cleanInlineXml(labelNode) : undefined;

                const captionNode = child.querySelector('caption');
                const caption = captionNode ? cleanInlineXml(captionNode) : undefined;

                const graphicNode = child.querySelector('graphic');
                const href = graphicNode?.getAttribute('xlink:href') || graphicNode?.getAttribute('href') || '';

                const { imageUrl, thumbUrl } = resolveFigureImageUrl(xmlText, href, pmcidClean, child.outerHTML);

                if (imageUrl) {
                    blocks.push({
                        id: `block-${++blockIndex}`,
                        type: 'figure',
                        label,
                        caption,
                        imageUrl,
                        thumbUrl
                    });
                }
            } else if (tag === 'disp-formula') {
                const labelNode = child.querySelector('label');
                const label = labelNode ? cleanInlineXml(labelNode).trim() : '';

                // 优先提取 tex-math，次选 mml:math 或其他公式标签
                const texNode = child.querySelector('tex-math');
                let mathText = '';
                if (texNode) {
                    mathText = cleanTexMath(texNode.textContent || '');
                } else {
                    const mmlNode = child.querySelector('mml\\:math, math');
                    if (mmlNode) {
                        const altText = mmlNode.getAttribute('alttext');
                        if (altText && (/[\\_^]/.test(altText) || altText.includes('='))) {
                            mathText = cleanTexMath(altText);
                        } else {
                            mathText = (mmlNode.outerHTML || '')
                                .replace(/<(\/?)mml:/gi, '<$1')
                                .replace(/\sxmlns:mml="[^"]*"/gi, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                        }
                    }
                }

                if (!mathText) {
                    const cloned = child.cloneNode(true) as Element;
                    const clonedLabel = cloned.querySelector('label');
                    if (clonedLabel) clonedLabel.remove();
                    mathText = cleanInlineXml(cloned).replace(/^\$+|\$+$/g, '').trim();
                }

                if (mathText) {
                    const isMathMl = mathText.startsWith('<math');
                    const formatted = isMathMl
                        ? mathText
                        : `$$${mathText.replace(/^\$+|\$+$/g, '').trim()}$$`;
                    blocks.push({
                        id: `block-${++blockIndex}`,
                        type: 'paragraph',
                        text: label ? `${formatted}\n\n${label}` : formatted
                    });
                }
            }
        }
    }

    traverse(bodyEl, 2);

    return {
        title,
        authors,
        journalTitle,
        pubDate,
        doi,
        abstractText,
        keywords,
        blocks
    };
}
