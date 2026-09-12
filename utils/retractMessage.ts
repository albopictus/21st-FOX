/**
 * 撤回一条消息的统一实现（DB 层）。用户在消息菜单里手动撤回、AI 用 [[ACTION:RETRACT]]
 * 撤回自己的消息，都走这里，保证 DB 里的形态一致。
 *
 * 撤回 = 把 Message.content 就地改写成「给 AI 看的那句」：
 *   - by='user'      → `[用户撤回了一条消息]`（AI 只知道撤回了，看不到原文）
 *   - by='assistant' → `[你撤回了这条消息，原内容：「…」]`（AI 知道撤回了 + 原文摘要）
 * 原文只留在 metadata.retracted，供 UI 折叠「查看原文」和 5 秒撤销用。所有 AI 上下文
 * 读取口都直接吃改写后的 content，天然安全，无需额外过滤。
 */
import { DB } from './db';
import type { Message, MessageType, RetractedMeta } from '../types';

/** 可撤回的消息类型（有副作用的卡片不做撤回） */
export const RETRACTABLE_TYPES: MessageType[] = ['text', 'image', 'emoji', 'voice'];

export const isRetractable = (m: Pick<Message, 'role' | 'type' | 'metadata'>): boolean =>
    m.role !== 'system' && !m.metadata?.retracted && RETRACTABLE_TYPES.includes(m.type);

const summarize = (type: MessageType, content: string): string =>
    type === 'text' ? content
    : type === 'image' ? '[图片]'
    : type === 'voice' ? '[语音]'
    : '[表情]';

export const buildRetractedFields = (
    msg: Pick<Message, 'role' | 'type' | 'content'>,
): { aiFacingContent: string; retracted: RetractedMeta } => {
    const by: RetractedMeta['by'] = msg.role === 'assistant' ? 'assistant' : 'user';
    const aiFacingContent = by === 'user'
        ? '[用户撤回了一条消息]'
        : `[你撤回了这条消息，原内容：「${summarize(msg.type, msg.content)}」]`;
    const retracted: RetractedMeta = {
        by,
        originalContent: msg.content,
        originalType: msg.type,
        at: Date.now(),
    };
    return { aiFacingContent, retracted };
};

/**
 * 就地把一条消息改成撤回态（DB 层）。返回原始 content / metadata / type 供撤销用。
 */
export const retractMessageInDb = async (
    msg: Pick<Message, 'id' | 'role' | 'type' | 'content' | 'metadata'>,
): Promise<{
    aiFacingContent: string;
    retracted: RetractedMeta;
    originalContent: string;
    originalMetadata: any;
    originalType: MessageType;
}> => {
    const { aiFacingContent, retracted } = buildRetractedFields(msg);
    await DB.updateMessage(msg.id, aiFacingContent);
    await DB.updateMessageMetadata(msg.id, prev => ({ ...(prev || {}), retracted }));
    return {
        aiFacingContent,
        retracted,
        originalContent: msg.content,
        originalMetadata: msg.metadata,
        originalType: msg.type,
    };
};

/**
 * AI 用 [[ACTION:RETRACT]] / [[ACTION:RETRACT|n]] 撤回自己的消息。
 * n 只在「该角色自己的、还没撤回的、可撤回类型」的消息里数（1 = 最近一条）。
 * 用户的消息不在可寻址范围内 —— AI 结构上无法撤回用户消息。
 * 返回被撤回消息的 id（没有可撤回目标时返回 null）。
 */
export const retractOwnMessageByAI = async (
    charId: string,
    stepsBack: number,
): Promise<number | null> => {
    const n = Math.max(1, Math.floor(stepsBack) || 1);
    // 倒序取近史（含已进记忆宫殿的，保证"往前第 n 条"可预期）
    const recent = await DB.getRecentMessagesByCharId(charId, 120, true);
    const ownRetractable = recent
        .filter(m => m.role === 'assistant' && !m.metadata?.retracted && RETRACTABLE_TYPES.includes(m.type))
        .reverse(); // newest first
    const target = ownRetractable[n - 1];
    if (!target) return null;
    await retractMessageInDb(target);
    return target.id;
};
