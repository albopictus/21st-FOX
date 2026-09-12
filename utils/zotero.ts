/**
 * Zotero 学术文献联动与标准引用导出工具
 */

import type { StudyPaper } from '../types';

export interface ZoteroConfig {
    targetType?: 'user' | 'group'; // 'user' 为个人文库，'group' 为群组协同文库
    userId: string;
    groupId?: string;
    apiKey: string;
    collectionKey?: string;
}

export interface ZoteroSyncResult {
    success: boolean;
    itemKey?: string;
    message?: string;
    webUrl?: string;
    clientUri?: string;
}

const STORAGE_KEY = 'sully_zotero_config';

/**
 * 获取本地保存的 Zotero 配置
 */
export function getZoteroConfig(): ZoteroConfig {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                return {
                    targetType: parsed.targetType === 'group' ? 'group' : 'user',
                    userId: String(parsed.userId || '').trim(),
                    groupId: String(parsed.groupId || '').trim(),
                    apiKey: String(parsed.apiKey || '').trim(),
                    collectionKey: String(parsed.collectionKey || '').trim() || undefined
                };
            }
        }
    } catch {}
    return { targetType: 'user', userId: '', groupId: '', apiKey: '' };
}

/**
 * 保存 Zotero 配置至本地
 */
export function saveZoteroConfig(config: ZoteroConfig): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            targetType: config.targetType === 'group' ? 'group' : 'user',
            userId: config.userId.trim(),
            groupId: config.groupId?.trim() || '',
            apiKey: config.apiKey.trim(),
            collectionKey: config.collectionKey?.trim() || undefined
        }));
    } catch (e) {
        console.warn('保存 Zotero 配置失败:', e);
    }
}

/**
 * 将字符串作者名拆解为 Zotero CSL-JSON 作者对象
 * 支持:
 * - "Smith, John" -> { firstName: "John", lastName: "Smith" }
 * - "John Smith" -> { firstName: "John", lastName: "Smith" }
 * - "Ning Yan" -> { firstName: "Ning", lastName: "Yan" }
 */
export function parseAuthorNameToCreator(nameStr: string): { creatorType: 'author'; firstName: string; lastName: string } {
    const clean = nameStr.replace(/\bet al\.?$/i, '').trim();
    if (!clean) {
        return { creatorType: 'author', firstName: '', lastName: 'Unknown' };
    }

    // 格式 "LastName, FirstName"
    if (clean.includes(',')) {
        const parts = clean.split(',').map(s => s.trim());
        return {
            creatorType: 'author',
            lastName: parts[0] || 'Unknown',
            firstName: parts.slice(1).join(' ')
        };
    }

    // 格式 "FirstName LastName"
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return {
            creatorType: 'author',
            firstName: '',
            lastName: parts[0]
        };
    }

    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, parts.length - 1).join(' ');
    return {
        creatorType: 'author',
        firstName,
        lastName
    };
}

/**
 * 解析作者字符串列表
 */
export function parseAuthorStringList(authorString?: string): Array<{ creatorType: 'author'; firstName: string; lastName: string }> {
    if (!authorString) return [];
    // 按分号或逗号拆分作者（避免把 "Smith, J." 拆碎）
    const rawList = authorString.includes(';')
        ? authorString.split(';')
        : authorString.split(/,(?=\s*[A-Z][a-z]+|\s*[A-Z]\.)/);

    return rawList
        .map(s => s.trim())
        .filter(s => s && !/^et al\.?$/i.test(s))
        .map(parseAuthorNameToCreator);
}

function generateRandomHex32(): string {
    const chars = '0123456789abcdef';
    let str = '';
    for (let i = 0; i < 32; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}

/**
 * 测试 Zotero API 连接是否畅通
 */
export async function testZoteroConnection(config: ZoteroConfig): Promise<{ success: boolean; message: string; username?: string }> {
    const isGroup = config.targetType === 'group';
    const targetId = (isGroup ? config.groupId : config.userId)?.trim() || '';
    const apiKey = config.apiKey.trim();

    if (!targetId || !apiKey) {
        return {
            success: false,
            message: isGroup ? '请填写完整的 Group ID 与 API Key' : '请填写完整的 User ID 与 API Key'
        };
    }

    const endpoint = isGroup
        ? `https://api.zotero.org/groups/${encodeURIComponent(targetId)}/items?limit=1`
        : `https://api.zotero.org/users/${encodeURIComponent(targetId)}/items?limit=1`;

    try {
        const res = await fetch(endpoint, {
            headers: {
                'Zotero-API-Version': '3',
                'Zotero-API-Key': apiKey
            }
        });
        if (res.status === 401 || res.status === 403) {
            return {
                success: false,
                message: isGroup
                    ? '授权失败：API Key 无效或无权访问该 Group ID 群组文库（请在 API Key 设置中勾选该群组的 Read/Write 写入权限）'
                    : '授权失败：API Key 无效或无权访问该 User ID 的文库'
            };
        }
        if (!res.ok) {
            return { success: false, message: `连接异常: HTTP ${res.status}` };
        }
        return {
            success: true,
            message: isGroup
                ? `Zotero 群组连接成功！群组文库 (${targetId}) 访问正常。`
                : `Zotero 个人文库连接成功！文库访问正常。`,
            username: targetId
        };
    } catch (e: any) {
        return { success: false, message: `网络连接异常: ${e.message || '请检查网络连接'}` };
    }
}

/**
 * 同步文献至 Zotero 官方云端个人文库或群组文库
 */
export async function syncPaperToZotero(paper: StudyPaper, config: ZoteroConfig): Promise<ZoteroSyncResult> {
    const isGroup = config.targetType === 'group';
    const targetId = (isGroup ? config.groupId : config.userId)?.trim() || '';
    const apiKey = config.apiKey.trim();

    if (!targetId || !apiKey) {
        return {
            success: false,
            message: isGroup ? '请先在下方填写目标群组 Group ID 与 API Key' : '请先在下方填写您的 Zotero User ID 与 API Key'
        };
    }

    // 提取发表年份
    let pubYear = '';
    if (paper.pubDate) {
        const yMatch = paper.pubDate.match(/\b(19|20)\d{2}\b/);
        if (yMatch) pubYear = yMatch[0];
    }

    // 解析作者
    const creators = parseAuthorStringList(paper.authorString);
    if (creators.length === 0) {
        creators.push({ creatorType: 'author', firstName: '', lastName: 'Unknown' });
    }

    // 提取关键词标签
    const tags = (paper.keywords || []).map(k => ({ tag: k.trim() })).filter(t => t.tag);

    // 确定落地 URL
    const targetUrl = paper.doi
        ? `https://doi.org/${paper.doi}`
        : (paper.pmcid ? `https://europepmc.org/articles/${paper.pmcid}` : undefined);

    // 组装 Zotero journalArticle 数据项
    const itemData: any = {
        itemType: 'journalArticle',
        title: paper.title.replace(/\.$/, '').trim(),
        creators,
        publicationTitle: paper.journalTitle || 'Academic Journal',
        date: paper.pubDate || pubYear,
        DOI: paper.doi || '',
        abstractNote: paper.abstract || '',
        url: targetUrl || '',
        tags,
        extra: paper.pmcid ? `PMCID: ${paper.pmcid}` : ''
    };

    if (config.collectionKey) {
        itemData.collections = [config.collectionKey.trim()];
    }

    const endpoint = isGroup
        ? `https://api.zotero.org/groups/${encodeURIComponent(targetId)}/items`
        : `https://api.zotero.org/users/${encodeURIComponent(targetId)}/items`;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Zotero-API-Version': '3',
                'Zotero-API-Key': apiKey,
                'Zotero-Write-Token': generateRandomHex32(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([itemData])
        });

        if (res.status === 403 || res.status === 401) {
            return {
                success: false,
                message: isGroup
                    ? `Zotero 授权失败 (HTTP ${res.status})：请检查 API Key 是否正确，并确认在 Zotero 官网密钥设置中将该群组权限设为 "Read/Write"。`
                    : `Zotero 授权失败 (HTTP ${res.status})：请检查 User ID 与 API Key 是否正确，并确认赋予了 "Allow library write access" 权限。`
            };
        }

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return {
                success: false,
                message: `Zotero 同步失败 (HTTP ${res.status}): ${errText || '网络错误'}`
            };
        }

        const data = await res.json();
        
        // 检查失败项
        if (data?.failed && Object.keys(data.failed).length > 0) {
            const firstErr = data.failed['0'] || Object.values(data.failed)[0] as any;
            return {
                success: false,
                message: `Zotero 保存失败 (${firstErr?.code || 'Error'}): ${firstErr?.message || '字段格式不合规'}`
            };
        }

        // Zotero 官方规范返回结构：{ "success": { "0": "<itemKey>" }, "unchanged": {}, "failed": {} }
        const itemKey = (data?.success && (data.success['0'] || Object.values(data.success)[0]))
            || (data?.successful && (data.successful['0']?.key || Object.values(data.successful)[0]?.key))
            || (Array.isArray(data?.success) ? data.success[0] : undefined);

        if (itemKey && typeof itemKey === 'string') {
            const webUrl = isGroup
                ? `https://www.zotero.org/groups/${targetId}/items/${itemKey}`
                : `https://www.zotero.org/users/${targetId}/items/${itemKey}`;
            const clientUri = isGroup
                ? `zotero://select/groups/${targetId}/items/${itemKey}`
                : `zotero://select/library/items/${itemKey}`;

            return {
                success: true,
                itemKey,
                message: isGroup
                    ? `已成功同步保存至 Zotero 群组文库 (Group ${targetId})！`
                    : '已成功同步保存至您的 Zotero 个人文库！',
                webUrl,
                clientUri
            };
        }

        return {
            success: true,
            message: '文献已成功推送到 Zotero 服务器！'
        };
    } catch (e: any) {
        return {
            success: false,
            message: `网络请求失败: ${e.message || '请检查网络连接'}`
        };
    }
}

/**
 * 生成标准 RIS 文献引用格式（.ris）
 * 适合双击由 Zotero、EndNote、Mendeley、PaperShip 等桌面/移动端学术工具直接识别入库
 */
export function generateRisContent(paper: StudyPaper): string {
    const lines: string[] = [];
    lines.push('TY  - JOUR');
    lines.push(`TI  - ${paper.title.replace(/\.$/, '')}`);

    // 作者
    const creators = parseAuthorStringList(paper.authorString);
    if (creators.length > 0) {
        creators.forEach(c => {
            const name = c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName;
            lines.push(`AU  - ${name}`);
        });
    } else if (paper.authorString) {
        lines.push(`AU  - ${paper.authorString}`);
    }

    if (paper.journalTitle) {
        lines.push(`JO  - ${paper.journalTitle}`);
        lines.push(`T2  - ${paper.journalTitle}`);
    }

    // 年份与日期
    if (paper.pubDate) {
        lines.push(`DA  - ${paper.pubDate}`);
        const yMatch = paper.pubDate.match(/\b(19|20)\d{2}\b/);
        if (yMatch) lines.push(`PY  - ${yMatch[0]}`);
    }

    if (paper.doi) {
        lines.push(`DO  - ${paper.doi}`);
        lines.push(`UR  - https://doi.org/${paper.doi}`);
    } else if (paper.pmcid) {
        lines.push(`UR  - https://europepmc.org/articles/${paper.pmcid}`);
    }

    if (paper.abstract) {
        lines.push(`AB  - ${paper.abstract.replace(/\r?\n/g, ' ')}`);
    }

    if (paper.keywords && paper.keywords.length > 0) {
        paper.keywords.forEach(kw => {
            lines.push(`KW  - ${kw.trim()}`);
        });
    }

    if (paper.pmcid) {
        lines.push(`M3  - PMCID: ${paper.pmcid}`);
    }

    lines.push('ER  - ');
    return lines.join('\n');
}

/**
 * 生成标准 BibTeX 文献引用格式（.bib）
 * 适合 LaTeX 论文写作、Overleaf 及科研笔记引用
 */
export function generateBibtexContent(paper: StudyPaper): string {
    // 生成引用键 Citation Key: 如 smith2024title
    const creators = parseAuthorStringList(paper.authorString);
    const firstAuthor = (creators[0]?.lastName || 'author').toLowerCase().replace(/[^a-z0-9]/g, '');
    let year = '2024';
    if (paper.pubDate) {
        const yMatch = paper.pubDate.match(/\b(19|20)\d{2}\b/);
        if (yMatch) year = yMatch[0];
    }
    const firstTitleWord = paper.title.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'paper';
    const citeKey = `${firstAuthor}${year}${firstTitleWord}`;

    // 格式化作者
    const authorBibtex = creators.length > 0
        ? creators.map(c => c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName).join(' and ')
        : (paper.authorString || 'Unknown');

    const lines: string[] = [];
    lines.push(`@article{${citeKey},`);
    lines.push(`  title = {${paper.title.replace(/\.$/, '')}},`);
    lines.push(`  author = {${authorBibtex}},`);
    if (paper.journalTitle) {
        lines.push(`  journal = {${paper.journalTitle}},`);
    }
    lines.push(`  year = {${year}},`);
    if (paper.pubDate && paper.pubDate !== year) {
        lines.push(`  date = {${paper.pubDate}},`);
    }
    if (paper.doi) {
        lines.push(`  doi = {${paper.doi}},`);
        lines.push(`  url = {https://doi.org/${paper.doi}},`);
    } else if (paper.pmcid) {
        lines.push(`  url = {https://europepmc.org/articles/${paper.pmcid}},`);
    }
    if (paper.keywords && paper.keywords.length > 0) {
        lines.push(`  keywords = {${paper.keywords.join(', ')}},`);
    }
    lines.push('}');
    return lines.join('\n');
}

/**
 * 生成标准 APA 7th 格式引用文本
 */
export function generateApaCitation(paper: StudyPaper): string {
    const creators = parseAuthorStringList(paper.authorString);
    let authorStr = '';
    if (creators.length === 1) {
        const c = creators[0];
        const initial = c.firstName ? `${c.firstName[0].toUpperCase()}.` : '';
        authorStr = `${c.lastName}, ${initial}`.trim();
    } else if (creators.length === 2) {
        const a1 = creators[0];
        const a2 = creators[1];
        authorStr = `${a1.lastName}, ${a1.firstName ? a1.firstName[0] + '.' : ''} & ${a2.lastName}, ${a2.firstName ? a2.firstName[0] + '.' : ''}`;
    } else if (creators.length > 2) {
        const a1 = creators[0];
        authorStr = `${a1.lastName}, ${a1.firstName ? a1.firstName[0] + '.' : ''} et al.`;
    } else {
        authorStr = paper.authorString || 'Unknown Author';
    }

    let year = 'n.d.';
    if (paper.pubDate) {
        const yMatch = paper.pubDate.match(/\b(19|20)\d{2}\b/);
        if (yMatch) year = yMatch[0];
    }

    const title = paper.title.replace(/\.$/, '');
    const journal = paper.journalTitle ? ` *${paper.journalTitle}*` : '';
    const doiPart = paper.doi ? ` https://doi.org/${paper.doi}` : '';

    return `${authorStr} (${year}). ${title}.${journal}.${doiPart}`;
}

/**
 * 触发文件下载（如 .ris 或 .bib）
 */
export function downloadTextFile(filename: string, content: string, mimeType: string = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
