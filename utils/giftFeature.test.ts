import { describe, it, expect, beforeEach } from 'vitest';
import {
    PRESET_GIFTS,
    loadCustomGifts,
    addCustomGift,
    updateCustomGift,
    deleteCustomGift,
    canClaimDailyAllowance,
    DAILY_ALLOWANCE_COINS,
    CUSTOM_GIFTS_STORAGE_KEY
} from './giftCatalog';
import { normalizeMessageContent } from './messageFormat';
import { Message } from '../types';

describe('Custom Gift & Coins Feature (Furniture Pattern)', () => {
    beforeEach(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(CUSTOM_GIFTS_STORAGE_KEY);
        }
    });

    it('PRESET_GIFTS is empty array as preset gifts are deleted in favor of custom gifts', () => {
        expect(PRESET_GIFTS).toEqual([]);
    });

    it('supports custom gift CRUD operations like furniture assets', () => {
        expect(loadCustomGifts()).toEqual([]);

        // 1. Add custom gift
        const item1 = addCustomGift({
            name: '手作焦糖曲奇',
            image: 'https://example.com/cookies.png',
            price: 25,
            description: '带有浓郁黄油香气的手工曲奇',
            defaultNote: '尝尝我刚烤好的曲奇～'
        });
        expect(item1.id).toBeTruthy();
        expect(item1.name).toBe('手作焦糖曲奇');
        expect(item1.image).toBe('https://example.com/cookies.png');
        expect(item1.price).toBe(25);

        // 2. Load custom gifts
        const list1 = loadCustomGifts();
        expect(list1.length).toBe(1);
        expect(list1[0].name).toBe('手作焦糖曲奇');

        // 3. Update custom gift
        updateCustomGift(item1.id, { price: 30, name: '特制焦糖曲奇' });
        const list2 = loadCustomGifts();
        expect(list2[0].name).toBe('特制焦糖曲奇');
        expect(list2[0].price).toBe(30);

        // 4. Delete custom gift
        deleteCustomGift(item1.id);
        expect(loadCustomGifts().length).toBe(0);
    });

    it('canClaimDailyAllowance accurately determines eligibility', () => {
        const today = '2026-09-10';
        expect(canClaimDailyAllowance(undefined, today)).toBe(true);
        expect(canClaimDailyAllowance('2026-09-09', today)).toBe(true);
        expect(canClaimDailyAllowance('2026-09-10', today)).toBe(false);
        expect(DAILY_ALLOWANCE_COINS).toBe(50);
    });

    it('normalizeMessageContent formats user gift message with description for LLM context', () => {
        const msg: Message = {
            id: 1,
            charId: 'sully',
            role: 'user',
            type: 'gift',
            content: '[送出礼物: 草莓甜甜圈（松软可口）]',
            timestamp: 1700000000000,
            metadata: {
                giftName: '草莓甜甜圈',
                icon: 'https://example.com/donut.png',
                cost: 20,
                description: '松软可口、草莓果酱夹心',
                note: '请你吃下午茶！',
                sender: 'user'
            }
        };
        const text = normalizeMessageContent(msg, 'Sully', '小明');
        expect(text).toContain('小明 向 Sully 赠送了「草莓甜甜圈」');
        expect(text).toContain('（松软可口、草莓果酱夹心）');
        expect(text).toContain('附言：“请你吃下午茶！”');
    });

    it('normalizeMessageContent formats gift receipt message for LLM context', () => {
        const msg: Message = {
            id: 2,
            charId: 'sully',
            role: 'assistant',
            type: 'gift',
            content: '[已收下礼物]',
            timestamp: 1700000000000,
            metadata: {
                receipt: 'accepted',
                giftName: '草莓甜甜圈',
                sender: 'assistant'
            }
        };
        const text = normalizeMessageContent(msg, 'Sully', '小明');
        expect(text).toContain('[礼物回执] Sully收下了礼物「草莓甜甜圈」');
    });
});

