// 礼物体系与金币体系 (Gift & Coins System)
import { CustomGiftItem } from '../types';

export const DAILY_ALLOWANCE_COINS = 50;

export const CUSTOM_GIFTS_STORAGE_KEY = 'sully_custom_gifts_catalog';

/**
 * 删掉所有写死的预设礼物，改为纯用户自定义模式（参考家具模式）
 * 保留 PRESET_GIFTS 导出为空数组，兼容旧引用
 */
export const PRESET_GIFTS: CustomGiftItem[] = [];

const getStorage = (): Storage | null => {
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return null;
};

/**
 * 读取本地保存的自定义心意礼物库
 */
export function loadCustomGifts(): CustomGiftItem[] {
    const storage = getStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(CUSTOM_GIFTS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * 保存自定义心意礼物库
 */
export function saveCustomGifts(gifts: CustomGiftItem[]): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(CUSTOM_GIFTS_STORAGE_KEY, JSON.stringify(gifts));
    } catch (e) {
        console.warn('Failed to save custom gifts to localStorage', e);
    }
}

/**
 * 添加一件新的自定义心意礼物
 */
export function addCustomGift(gift: Omit<CustomGiftItem, 'id' | 'createdAt'>): CustomGiftItem {
    const current = loadCustomGifts();
    const newGift: CustomGiftItem = {
        ...gift,
        id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now()
    };
    const updated = [newGift, ...current];
    saveCustomGifts(updated);
    return newGift;
}

/**
 * 更新指定的自定义心意礼物
 */
export function updateCustomGift(id: string, updates: Partial<CustomGiftItem>): void {
    const current = loadCustomGifts();
    const updated = current.map(item => item.id === id ? { ...item, ...updates } : item);
    saveCustomGifts(updated);
}

/**
 * 删除指定的自定义心意礼物
 */
export function deleteCustomGift(id: string): void {
    const current = loadCustomGifts();
    const updated = current.filter(item => item.id !== id);
    saveCustomGifts(updated);
}

/**
 * 判断是否可领取今日津贴
 */
export function canClaimDailyAllowance(lastDate?: string, todayDate?: string): boolean {
    const today = todayDate || new Date().toISOString().slice(0, 10);
    return lastDate !== today;
}
