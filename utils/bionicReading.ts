/**
 * ADHD 仿生阅读（Bionic Reading）算法
 * 将英文单词前部加粗，帮助视线聚焦与快速扫读
 */

export function formatBionicWord(word: string): string {
    // 匹配单词主体及其前后的标点符号
    const match = word.match(/^([^a-zA-Z]*)([a-zA-Z]+)([^a-zA-Z]*)$/);
    if (!match) return word;

    const [, prefix, letters, suffix] = match;
    const len = letters.length;
    let boldLen = 1;
    if (len >= 8) {
        boldLen = Math.ceil(len * 0.45);
    } else if (len >= 5) {
        boldLen = 3;
    } else if (len >= 3) {
        boldLen = 2;
    } else {
        boldLen = 1;
    }

    const boldPart = letters.slice(0, boldLen);
    const restPart = letters.slice(boldLen);

    return `${prefix}<b>${boldPart}</b>${restPart}${suffix}`;
}

export function applyBionicReading(text: string): string {
    if (!text) return '';

    // 保护行内数学公式 $...$
    const mathTokens: string[] = [];
    const protectedText = text.replace(/(\$[^$]+?\$)/g, (match) => {
        const token = `__MATH_TOKEN_${mathTokens.length}__`;
        mathTokens.push(match);
        return token;
    });

    // 针对每个以空白分割的 token 进行处理
    const words = protectedText.split(/(\s+)/);
    const formatted = words.map(w => {
        if (/^\s+$/.test(w) || w.startsWith('__MATH_TOKEN_')) {
            return w;
        }
        return formatBionicWord(w);
    }).join('');

    // 恢复数学公式
    return formatted.replace(/__MATH_TOKEN_(\d+)__/g, (_, idx) => {
        return mathTokens[Number(idx)] || '';
    });
}
