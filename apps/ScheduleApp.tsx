


import React, { useState, useEffect, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { Task, Anniversary, CharacterProfile, ScheduleEvent, MemoNote, AppID, Message } from '../types';
import Modal from '../components/os/Modal';
import { ContextBuilder } from '../utils/context';
import { safeResponseJson } from '../utils/safeApi';
import { injectMemoryPalace } from '../utils/memoryPalace/pipeline';
import { CharacterGroupFilterBar, filterCharactersByGroup, GROUP_FILTER_ALL } from '../components/character/CharacterGroupFilter';
import { getCalendarDayDifference, getLocalDateKey } from '../utils/localDate';
import { useLocalDateKey } from '../hooks/useLocalDateKey';
import { trackEvent } from '../utils/analytics';
import TokenImg from '../components/os/TokenImg';
import { 
    BUILTIN_CATEGORIES, 
    MEMO_FORMAT_TEMPLATES, 
    getCustomCategories, 
    addCustomCategory, 
    deleteCustomCategory, 
    getDefaultTemplateForCategory 
} from '../utils/memoTemplates';

const TWEMOJI_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72';
const twemojiUrl = (codepoint: string) => `${TWEMOJI_BASE}/${codepoint}.png`;

type ThemeMode = 'cyber' | 'soft' | 'minimal';

// Theme Configuration Definitions
const THEMES: Record<ThemeMode, any> = {
    cyber: {
        id: 'cyber',
        bg: 'bg-[#0f172a]',
        text: 'text-slate-200',
        textSub: 'text-slate-500',
        accent: 'text-cyan-400',
        border: 'border-cyan-900/30',
        card: 'bg-slate-900/50 backdrop-blur-md border border-slate-700/50',
        buttonPrimary: 'bg-cyan-600 hover:bg-cyan-500 text-white rounded-none skew-x-[-10deg]',
        font: 'font-mono',
        iconDone: 'text-green-500',
        decoLine: 'bg-slate-800',
        modalBg: 'bg-[#0f172a] border border-cyan-500',
        input: 'bg-slate-800 text-white border-none rounded-none',
        label: 'QUEST LOG',
        eventLabel: 'SCHEDULES',
        memoLabel: 'MEMOS'
    },
    soft: {
        id: 'soft',
        bg: 'bg-[#fff0f5]', // Lavender Blush
        text: 'text-slate-700',
        textSub: 'text-slate-400',
        accent: 'text-pink-500',
        border: 'border-pink-100',
        card: 'bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-sm border border-white',
        buttonPrimary: 'bg-pink-400 hover:bg-pink-500 text-white rounded-2xl shadow-lg shadow-pink-200',
        font: 'font-sans',
        iconDone: 'text-pink-400',
        decoLine: 'bg-pink-200',
        modalBg: 'bg-white/90 rounded-[2.5rem]',
        input: 'bg-pink-50 text-slate-700 border border-pink-100 rounded-xl',
        label: '监督契约',
        eventLabel: '约定日程',
        memoLabel: '共享备忘'
    },
    minimal: {
        id: 'minimal',
        bg: 'bg-[#eef2f6]', // Classic Neumorphism base
        text: 'text-slate-600',
        textSub: 'text-slate-400',
        accent: 'text-indigo-500',
        border: 'border-transparent',
        // Neumorphism Outer Shadow
        card: 'bg-[#eef2f6] rounded-2xl shadow-[6px_6px_12px_#d1d9e6,-6px_-6px_12px_#ffffff]',
        // Neumorphism Pressed State simulation for buttons usually, but here flat prompt
        buttonPrimary: 'bg-[#eef2f6] text-slate-600 font-bold rounded-xl shadow-[6px_6px_12px_#d1d9e6,-6px_-6px_12px_#ffffff] active:shadow-[inset_4px_4px_8px_#d1d9e6,inset_-4px_-4px_8px_#ffffff]',
        font: 'font-sans',
        iconDone: 'text-slate-400',
        decoLine: 'bg-slate-300',
        modalBg: 'bg-[#eef2f6] rounded-2xl shadow-2xl',
        input: 'bg-[#eef2f6] text-slate-700 rounded-xl shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]',
        label: 'Focus',
        eventLabel: 'Timeline',
        memoLabel: 'Notes'
    }
};

interface ScheduleAppProps {
    initialTab?: 'quest' | 'server_events' | 'memos';
}

const ScheduleApp: React.FC<ScheduleAppProps> = ({ initialTab }) => {
    const { closeApp, openApp, setActiveCharacterId, characters, activeCharacterId, apiConfig, addToast, userProfile, updateUserProfile, characterGroups } = useOS();
    const localDateKey = useLocalDateKey();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [anniversaries, setAnniversaries] = useState<ScheduleEvent[]>([]);
    const [memos, setMemos] = useState<MemoNote[]>([]);
    const [activeTab, setActiveTab] = useState<'quest' | 'server_events' | 'memos'>(initialTab || 'server_events');
    const [selectedCategory, setSelectedCategory] = useState<string>('全部');
    const [memoSearchQuery, setMemoSearchQuery] = useState<string>('');
    
    // Custom Categories State
    const [customCategories, setCustomCategories] = useState<string[]>(() => getCustomCategories());
    const [showCategoryManageModal, setShowCategoryManageModal] = useState(false);
    const [newCustomCategoryInput, setNewCustomCategoryInput] = useState('');

    // Push to Chat Modal States
    const [showPushConfirmModal, setShowPushConfirmModal] = useState(false);
    const [memoToPush, setMemoToPush] = useState<MemoNote | null>(null);
    const [pushTargetCharId, setPushTargetCharId] = useState<string>(activeCharacterId || '');
    const [pushCharGroupId, setPushCharGroupId] = useState<string>(GROUP_FILTER_ALL);
    
    // Processing State for feedback
    const [processingTaskIds, setProcessingTaskIds] = useState<Set<string>>(new Set());

    // Theme State
    const [currentThemeMode, setCurrentThemeMode] = useState<ThemeMode>('cyber');
    const theme = THEMES[currentThemeMode];

    // Add / Edit Modal States
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<ScheduleEvent | null>(null);
    const [showMemoModal, setShowMemoModal] = useState(false);
    const [editingMemo, setEditingMemo] = useState<MemoNote | null>(null);

    // Task Forms
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskSupervisor, setNewTaskSupervisor] = useState<string>(activeCharacterId || '');
    const [supervisorGroupId, setSupervisorGroupId] = useState<string>(GROUP_FILTER_ALL); // 选监督人的分组筛选

    // Schedule Forms
    const [scheduleTitle, setScheduleTitle] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleRemarks, setScheduleRemarks] = useState('');
    const [scheduleChar, setScheduleChar] = useState<string>(activeCharacterId || '');
    const [scheduleCharGroupId, setScheduleCharGroupId] = useState<string>(GROUP_FILTER_ALL);

    // Memo Forms
    const [memoTitle, setMemoTitle] = useState('');
    const [memoContent, setMemoContent] = useState('');
    const [memoCategory, setMemoCategory] = useState('默认');
    const [memoChar, setMemoChar] = useState<string>(activeCharacterId || '');
    const [memoCharGroupId, setMemoCharGroupId] = useState<string>(GROUP_FILTER_ALL);
    const [memoPinned, setMemoPinned] = useState(false);

    useEffect(() => {
        loadData();
        // Load theme from local storage if needed, defaulting to cyber
        const saved = localStorage.getItem('schedule_app_theme');
        if (saved && THEMES[saved as ThemeMode]) {
            setCurrentThemeMode(saved as ThemeMode);
        }
    }, []);

    const toggleTheme = () => {
        const modes: ThemeMode[] = ['cyber', 'soft', 'minimal'];
        const nextIndex = (modes.indexOf(currentThemeMode) + 1) % modes.length;
        const nextMode = modes[nextIndex];
        setCurrentThemeMode(nextMode);
        localStorage.setItem('schedule_app_theme', nextMode);
        trackEvent('切换日程界面主题', { theme: nextMode });
    };

    const loadData = async () => {
        const [t, a, m] = await Promise.all([
            DB.getAllTasks(),
            DB.getAllScheduleEvents(),
            DB.getAllMemoNotes()
        ]);
        setTasks(t.sort((a, b) => b.createdAt - a.createdAt));
        setAnniversaries(a.sort((a, b) => a.date.localeCompare(b.date)));
        setMemos(m.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt));
    };

    // --- AI Logic ---

    const generateTaskReward = async (task: Task) => {
        const supervisor = characters.find(c => c.id === task.supervisorId);
        if (!supervisor || !apiConfig.apiKey) {
            addToast('任务已完成', 'success');
            return;
        }

        // FEEDBACK: Show loading state immediately
        // Note: The caller handles setting processingTaskIds, but we can also add a toast
        addToast(`${supervisor.name} 正在确认你的成果...`, 'info');

        try {
            // 1. Build Persona Context
            // RESTORED: Full context
            await injectMemoryPalace(supervisor, undefined, task.title);
            const baseContext = ContextBuilder.buildCoreContext(supervisor, userProfile);

            const userPrompt = `
### 场景：任务完成 (Task Completed)
用户 (${userProfile.name}) 刚刚在现实生活中完成了一个任务/契约： "${task.title}"。
你是监督人。

### 任务
请根据你的人设，对用户完成任务这一行为做出反应。
- 如果你是严厉的：勉强认可，或者催促下一个。
- 如果你是温柔的：给予温暖的夸奖。
- 如果你是傲娇的：别扭地表示一下。
- **关键**：不要问我用什么语气，**你自己**根据你的人设决定。

**输出要求**:
- 仅输出一句话（类似气泡通知）。
- **必须使用用户常用语言**。
- 不要有引号。`;

            // 2. Separate System and User roles
            const messages = [
                { role: "system", content: baseContext },
                { role: "user", content: userPrompt }
            ];

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: messages,
                    temperature: 0.9, 
                    max_tokens: 8000 
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error ${response.status}: ${errorText.slice(0, 100)}`);
            }

            const data = await safeResponseJson(response);
            
            // Extract content, handling potential reasoning_content or empty standard content
            let text = data.choices?.[0]?.message?.content?.trim();
            if (!text && data.choices?.[0]?.message?.reasoning_content) {
                // If standard content is empty but model "thought" about it, try to use thought or fallback
                console.warn("AI returned empty content but has reasoning.");
            }
            
            if (text) {
                text = text.replace(/^["']|["']$/g, '');
                addToast(`${supervisor.name}: ${text}`, 'success');
                // Inject into Chat Memory (Localized & Personalized)
                await DB.saveMessage({
                    charId: supervisor.id,
                    role: 'system',
                    type: 'text',
                    content: `[系统: ${userProfile.name} 完成了任务 "${task.title}"。${supervisor.name} 评价道: "${text}"]`
                });
            } else {
                console.warn("AI returned empty content", data);
                addToast('任务完成 (AI 未返回评价)', 'success');
            }

        } catch (e: any) {
            console.error("Task Reward Error:", e);
            addToast(`评价生成失败: ${e.message}`, 'error');
        }
    };

    const generateAnniversaryThought = async (anni: Anniversary) => {
        const char = characters.find(c => c.id === anni.charId);
        if (!char || !apiConfig.apiKey) return;

        // Check cache (24h)
        if (anni.aiThought && anni.lastThoughtGeneratedAt && (Date.now() - anni.lastThoughtGeneratedAt < 24 * 60 * 60 * 1000)) {
            return;
        }

        // FEEDBACK: Show loading state if explicit call
        if (Date.now() - (anni.lastThoughtGeneratedAt || 0) > 10000) {
             addToast(`${char.name} 正在查阅日历...`, 'info');
        }

        const daysDiff = getCalendarDayDifference(getLocalDateKey(), anni.date) ?? 0;
        const dayText = daysDiff > 0 ? `还有 ${daysDiff} 天` : (daysDiff === 0 ? '就是今天!' : `已经过去 ${Math.abs(daysDiff)} 天了`);

        // RESTORED: Full context
        await injectMemoryPalace(char, undefined, anni.title);
        const baseContext = ContextBuilder.buildCoreContext(char, userProfile);

        const userPrompt = `
### 场景：纪念日提醒
事件: "${anni.title}"
时间状态: ${dayText}

### 任务
请根据你的人设，针对这个日期发表一句简短的感想。
**输出要求**:
- 仅输出一句话。
- **必须使用用户常用语言**。`;

        const messages = [
            { role: "system", content: baseContext },
            { role: "user", content: userPrompt }
        ];

        try {
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: messages,
                    temperature: 0.8,
                    max_tokens: 8000
                })
            });

            if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(`API Error ${response.status}: ${errorText.slice(0, 50)}`);
            }

            const data = await safeResponseJson(response);
            const text = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
            
            if (text) {
                const updatedAnni = { ...anni, aiThought: text, lastThoughtGeneratedAt: Date.now() };
                await DB.saveAnniversary(updatedAnni);
                setAnniversaries(prev => prev.map(a => a.id === anni.id ? updatedAnni : a));
            } else {
                console.warn("AI returned empty thought", data);
            }
        } catch (e: any) { 
            console.error("Anniversary Thought Error:", e);
            // No toast for background update failure to avoid annoyance
        }
    };

    // --- Actions ---

    const handleAddTask = async () => {
        if (!newTaskTitle.trim()) return;
        const task: Task = {
            id: `task-${Date.now()}`,
            title: newTaskTitle,
            supervisorId: newTaskSupervisor || characters[0]?.id,
            tone: 'gentle', // Deprecated but kept for type compatibility
            isCompleted: false,
            createdAt: Date.now()
        };
        await DB.saveTask(task);
        setTasks(prev => [task, ...prev]);
        setShowTaskModal(false);
        setNewTaskTitle('');
    };

    const handleToggleTask = async (task: Task) => {
        const updated = { ...task, isCompleted: !task.isCompleted, completedAt: !task.isCompleted ? Date.now() : undefined };
        await DB.saveTask(updated);
        setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
        
        if (updated.isCompleted) {
            // 契约任务完成奖励 20 金币
            const curCoins = userProfile.coins ?? 300;
            updateUserProfile({ coins: curCoins + 20 });
            addToast('契约达成！获得 20 金币 🪙', 'success');

            // Start Visual Loading State on the Item
            setProcessingTaskIds(prev => new Set(prev).add(task.id));
            try {
                await generateTaskReward(updated);
            } finally {
                // End Visual Loading State
                setProcessingTaskIds(prev => {
                    const next = new Set(prev);
                    next.delete(task.id);
                    return next;
                });
            }
        }
    };

    const handleDeleteTask = async (id: string) => {
        await DB.deleteTask(id);
        setTasks(prev => prev.filter(t => t.id !== id));
    };

    const handleOpenAddSchedule = () => {
        setEditingSchedule(null);
        setScheduleTitle('');
        setScheduleDate(localDateKey);
        setScheduleTime('');
        setScheduleRemarks('');
        setScheduleChar(activeCharacterId || characters[0]?.id || '');
        setShowScheduleModal(true);
    };

    const handleOpenEditSchedule = (s: ScheduleEvent) => {
        setEditingSchedule(s);
        setScheduleTitle(s.title);
        setScheduleDate(s.date);
        setScheduleTime(s.time || '');
        setScheduleRemarks(s.remarks || '');
        setScheduleChar(s.charId || activeCharacterId || characters[0]?.id || '');
        setShowScheduleModal(true);
    };

    const handleSaveSchedule = async () => {
        if (!scheduleTitle.trim() || !scheduleDate) return;
        if (editingSchedule) {
            const updated: ScheduleEvent = {
                ...editingSchedule,
                title: scheduleTitle.trim(),
                date: scheduleDate,
                time: scheduleTime.trim() || undefined,
                remarks: scheduleRemarks.trim() || undefined,
                charId: scheduleChar || characters[0]?.id || '',
                lastEditedBy: 'user',
                lastEditedAt: Date.now(),
                authorName: userProfile.name,
            };
            await DB.saveScheduleEvent(updated);
            setAnniversaries(prev => prev.map(a => a.id === updated.id ? updated : a).sort((a, b) => a.date.localeCompare(b.date)));
            addToast('日程已更新', 'success');
        } else {
            const newEvent: ScheduleEvent = {
                id: `event-${Date.now()}`,
                title: scheduleTitle.trim(),
                date: scheduleDate,
                time: scheduleTime.trim() || undefined,
                remarks: scheduleRemarks.trim() || undefined,
                charId: scheduleChar || characters[0]?.id || '',
                createdBy: 'user',
                authorName: userProfile.name,
                createdAt: Date.now(),
            };
            await DB.saveScheduleEvent(newEvent);
            setAnniversaries(prev => [...prev, newEvent].sort((a, b) => a.date.localeCompare(b.date)));
            addToast('已添加日程', 'success');
        }
        setShowScheduleModal(false);
    };

    const handleDeleteSchedule = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        await DB.deleteScheduleEvent(id);
        setAnniversaries(prev => prev.filter(a => a.id !== id));
        addToast('日程已删除', 'info');
    };

    const handleOpenAddMemo = () => {
        setEditingMemo(null);
        setMemoTitle('');
        const defaultCat = selectedCategory !== '全部' ? selectedCategory : '默认';
        setMemoCategory(defaultCat);
        setMemoContent(getDefaultTemplateForCategory(defaultCat, localDateKey));
        setMemoChar(activeCharacterId || '');
        setMemoPinned(false);
        setShowMemoModal(true);
    };

    const handleOpenEditMemo = (m: MemoNote) => {
        setEditingMemo(m);
        setMemoTitle(m.title);
        setMemoContent(m.content);
        setMemoCategory(m.category || '默认');
        setMemoChar(m.charId || '');
        setMemoPinned(!!m.pinned);
        setShowMemoModal(true);
    };

    const handleChangeMemoCategory = (newCat: string) => {
        setMemoCategory(newCat);
        if (!memoContent.trim()) {
            const tpl = getDefaultTemplateForCategory(newCat, localDateKey);
            if (tpl) setMemoContent(tpl);
        }
    };

    const handleApplyFormatTemplate = (templateId: string) => {
        const tplObj = MEMO_FORMAT_TEMPLATES.find(t => t.id === templateId);
        if (!tplObj) return;
        const textToInsert = tplObj.getTemplate(localDateKey);
        if (!textToInsert) {
            if (memoContent.trim() && window.confirm('是否清空当前正文内容？')) {
                setMemoContent('');
            }
            return;
        }

        if (!memoContent.trim()) {
            setMemoContent(textToInsert);
        } else {
            const choice = window.confirm(`正文已有内容。\n点击【确定】替换正文为【${tplObj.label}】格式\n点击【取消】追加到正文末尾`);
            if (choice) {
                setMemoContent(textToInsert);
            } else {
                setMemoContent(prev => prev.trimEnd() + '\n\n' + textToInsert);
            }
        }
    };

    const handleAddCustomCategory = () => {
        const trimmed = newCustomCategoryInput.trim();
        if (!trimmed) return;
        const updated = addCustomCategory(trimmed);
        setCustomCategories(updated);
        setNewCustomCategoryInput('');
        addToast(`已添加新分类「${trimmed}」`, 'success');
    };

    const handleDeleteCustomCategory = (cat: string) => {
        const updated = deleteCustomCategory(cat);
        setCustomCategories(updated);
        if (selectedCategory === cat) setSelectedCategory('全部');
        addToast(`已删除分类「${cat}」`, 'info');
    };

    const handlePushMemoToChat = async (targetMemo: MemoNote, overrideCharId?: string) => {
        const targetId = overrideCharId || targetMemo.charId || activeCharacterId;
        if (!targetId) {
            setMemoToPush(targetMemo);
            setPushTargetCharId(activeCharacterId || (characters[0]?.id ?? ''));
            setShowPushConfirmModal(true);
            return;
        }
        const targetChar = characters.find(c => c.id === targetId);
        if (!targetChar) {
            addToast('未找到对应角色', 'error');
            return;
        }

        const previewText = targetMemo.content.slice(0, 200);
        const userMsg: Message = {
            id: Date.now(),
            charId: targetId,
            role: 'user',
            type: 'memo_card',
            content: `[分享便签] 《${targetMemo.title}》\n${targetMemo.content.slice(0, 150)}${targetMemo.content.length > 150 ? '...' : ''}`,
            timestamp: Date.now(),
            metadata: {
                memoId: targetMemo.id,
                title: targetMemo.title,
                preview: previewText,
                authorName: userProfile.name,
                action: 'share',
                category: targetMemo.category || '默认',
            },
        };
        await DB.saveMessage(userMsg);
        sessionStorage.setItem(`chat_pending_auto_trigger_${targetId}`, 'true');
        addToast(`已将《${targetMemo.title}》发送给 ${targetChar.name}`, 'success');
        setActiveCharacterId(targetId);
        openApp(AppID.Chat);
    };

    const handleSaveMemo = async (andPush = false) => {
        if (!memoTitle.trim() && !memoContent.trim()) return;
        const title = memoTitle.trim() || '无标题备忘';
        let savedMemo: MemoNote;
        if (editingMemo) {
            savedMemo = {
                ...editingMemo,
                title,
                content: memoContent,
                category: memoCategory.trim() || '默认',
                charId: memoChar || undefined,
                pinned: memoPinned,
                lastEditedBy: 'user',
                lastEditedAt: Date.now(),
                authorName: userProfile.name,
            };
            await DB.saveMemoNote(savedMemo);
            setMemos(prev => prev.map(m => m.id === savedMemo.id ? savedMemo : m).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt));
            addToast('备忘录已保存', 'success');
        } else {
            savedMemo = {
                id: `memo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                title,
                content: memoContent,
                category: memoCategory.trim() || '默认',
                charId: memoChar || undefined,
                pinned: memoPinned,
                createdBy: 'user',
                authorName: userProfile.name,
                createdAt: Date.now(),
            };
            await DB.saveMemoNote(savedMemo);
            setMemos(prev => [savedMemo, ...prev].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt));
            addToast('已创建新备忘', 'success');
        }
        setShowMemoModal(false);

        if (andPush) {
            await handlePushMemoToChat(savedMemo, memoChar || activeCharacterId);
        }
    };

    const handleTogglePinMemo = async (memo: MemoNote, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated: MemoNote = {
            ...memo,
            pinned: !memo.pinned,
            lastEditedBy: 'user',
            lastEditedAt: Date.now(),
            authorName: userProfile.name,
        };
        await DB.saveMemoNote(updated);
        setMemos(prev => prev.map(m => m.id === updated.id ? updated : m).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt));
    };

    const handleDeleteMemo = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await DB.deleteMemoNote(id);
        setMemos(prev => prev.filter(m => m.id !== id));
        addToast('备忘已删除', 'info');
    };

    // --- Render Helpers ---

    const getDaysUntil = (dateStr: string) => {
        return getCalendarDayDifference(localDateKey, dateStr) ?? Number.POSITIVE_INFINITY;
    };

    const upcomingAnni = useMemo(() => {
        return anniversaries.filter(a => getDaysUntil(a.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
    }, [anniversaries, localDateKey]);

    // Trigger thoughts for upcoming anniversary on load
    useEffect(() => {
        if (upcomingAnni) {
            generateAnniversaryThought(upcomingAnni);
        }
    }, [upcomingAnni]);

    const memoCategories = useMemo(() => {
        const set = new Set<string>(['全部', ...BUILTIN_CATEGORIES, ...customCategories]);
        memos.forEach(m => {
            if (m.category) set.add(m.category);
        });
        return Array.from(set);
    }, [memos, customCategories]);

    const filteredMemos = useMemo(() => {
        return memos.filter(m => {
            const matchesCat = selectedCategory === '全部' || (m.category || '默认') === selectedCategory;
            const matchesSearch = !memoSearchQuery.trim() || 
                m.title.toLowerCase().includes(memoSearchQuery.toLowerCase()) || 
                m.content.toLowerCase().includes(memoSearchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [memos, selectedCategory, memoSearchQuery]);

    return (
        <div className={`h-full w-full flex flex-col ${theme.font} ${theme.bg} ${theme.text} relative overflow-hidden transition-colors duration-500`}>
             
             {/* Tech Background Grid (Only for Cyber) */}
             {currentThemeMode === 'cyber' && (
                 <div className="absolute inset-0 pointer-events-none opacity-20" 
                      style={{ 
                          backgroundImage: 'linear-gradient(rgba(56, 189, 248, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.1) 1px, transparent 1px)', 
                          backgroundSize: '40px 40px' 
                      }}>
                 </div>
             )}
             
             {/* Soft Background Pattern (Only for Soft) */}
             {currentThemeMode === 'soft' && (
                 <div className="absolute inset-0 pointer-events-none opacity-30" 
                      style={{ 
                          backgroundImage: 'radial-gradient(#fbcfe8 2px, transparent 2px)', 
                          backgroundSize: '20px 20px' 
                      }}>
                 </div>
             )}

             {/* Header */}
             <div className={`border-b ${theme.border} backdrop-blur-sm sticky top-0 z-20 shrink-0 relative transition-colors duration-300`} style={{ paddingTop: 'var(--safe-top)' }}>
                <div className="pt-12 pb-4 px-4 flex items-center justify-between h-24 box-border gap-2">
                <button onClick={closeApp} className={`p-2 -ml-1 rounded-full active:scale-90 transition-transform shrink-0 ${currentThemeMode === 'minimal' ? 'bg-[#eef2f6] shadow-[4px_4px_8px_#d1d9e6,-4px_-4px_8px_#ffffff]' : 'hover:bg-black/5'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 ${theme.accent}`}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>

                {/* 3 Tabs */}
                <div className={`flex gap-0.5 p-1 rounded-xl max-w-full overflow-x-auto no-scrollbar ${currentThemeMode === 'cyber' ? 'bg-black/40 border border-cyan-900/50' : (currentThemeMode === 'minimal' ? 'bg-[#eef2f6] shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : 'bg-white/50')}`}>
                    <button onClick={() => { setActiveTab('server_events'); trackEvent('切换日程标签页', { tab: 'server_events' }); }} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'server_events' ? `${theme.accent} ${currentThemeMode === 'cyber' ? 'bg-cyan-900/50 shadow-sm' : (currentThemeMode === 'minimal' ? 'shadow-[2px_2px_5px_#d1d9e6,-2px_-2px_5px_#ffffff] bg-[#eef2f6]' : 'bg-white shadow-sm')}` : `${theme.textSub}`}`}>{theme.eventLabel}</button>
                    <button onClick={() => { setActiveTab('memos'); trackEvent('切换日程标签页', { tab: 'memos' }); }} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'memos' ? `${theme.accent} ${currentThemeMode === 'cyber' ? 'bg-cyan-900/50 shadow-sm' : (currentThemeMode === 'minimal' ? 'shadow-[2px_2px_5px_#d1d9e6,-2px_-2px_5px_#ffffff] bg-[#eef2f6]' : 'bg-white shadow-sm')}` : `${theme.textSub}`}`}>{theme.memoLabel}</button>
                    <button onClick={() => { setActiveTab('quest'); trackEvent('切换日程标签页', { tab: 'quest' }); }} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'quest' ? `${theme.accent} ${currentThemeMode === 'cyber' ? 'bg-cyan-900/50 shadow-sm' : (currentThemeMode === 'minimal' ? 'shadow-[2px_2px_5px_#d1d9e6,-2px_-2px_5px_#ffffff] bg-[#eef2f6]' : 'bg-white shadow-sm')}` : `${theme.textSub}`}`}>{theme.label}</button>
                </div>

                {/* Right Actions */}
                <div className="flex gap-1.5 shrink-0">
                    {/* Theme Switcher */}
                    <button onClick={toggleTheme} className={`p-2 rounded-full active:scale-90 transition-transform ${currentThemeMode === 'minimal' ? 'shadow-[4px_4px_8px_#d1d9e6,-4px_-4px_8px_#ffffff]' : 'bg-white/10 hover:bg-white/20'}`}>
                        {currentThemeMode === 'cyber' && <img src={twemojiUrl('1f47e')} alt="alien" className="w-5 h-5" />}
                        {currentThemeMode === 'soft' && <img src={twemojiUrl('1f338')} alt="blossom" className="w-5 h-5" />}
                        {currentThemeMode === 'minimal' && <img src={twemojiUrl('26aa')} alt="circle" className="w-5 h-5" />}
                    </button>

                    {/* Add Button */}
                    <button 
                        onClick={() => { 
                            if (activeTab === 'quest') setShowTaskModal(true);
                            else if (activeTab === 'server_events') handleOpenAddSchedule();
                            else handleOpenAddMemo();
                            trackEvent('打开新建条目弹窗', { kind: activeTab }); 
                        }} 
                        className={`p-2 rounded-full active:scale-90 transition-transform ${theme.accent} ${currentThemeMode === 'minimal' ? 'shadow-[4px_4px_8px_#d1d9e6,-4px_-4px_8px_#ffffff]' : 'hover:bg-white/10'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    </button>
                </div>
                </div>

                {/* Decoration Line */}
                {currentThemeMode === 'cyber' && <div className="absolute bottom-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 z-10">
                
                {/* Hero Anniversary Card (Shown in server_events or when upcoming) */}
                {activeTab === 'server_events' && upcomingAnni && (
                    <div className={`w-full rounded-2xl p-5 relative overflow-hidden group transition-all duration-300 ${currentThemeMode === 'minimal' ? 'bg-[#eef2f6] shadow-[inset_5px_5px_10px_#d1d9e6,inset_-5px_-5px_10px_#ffffff]' : (currentThemeMode === 'soft' ? 'bg-gradient-to-r from-pink-300 to-purple-300 text-white shadow-lg shadow-pink-200' : 'bg-gradient-to-r from-slate-900 to-slate-800 border border-purple-500/30')}`}>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-2">
                                <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${currentThemeMode === 'minimal' ? 'text-slate-400' : 'text-white/80 bg-white/20'}`}>即将到来</div>
                                <div className="text-3xl font-bold tracking-tighter">{getDaysUntil(upcomingAnni.date)} <span className="text-xs opacity-60 font-normal">天后</span></div>
                            </div>
                            <div className="text-xl font-bold mb-4">{upcomingAnni.title}</div>
                            
                            {/* AI Thought Bubble */}
                            <div className={`flex items-start gap-3 p-3 rounded-xl ${currentThemeMode === 'minimal' ? 'bg-[#eef2f6] shadow-[5px_5px_10px_#d1d9e6,-5px_-5px_10px_#ffffff]' : 'bg-white/20 backdrop-blur-md'}`}>
                                <TokenImg value={characters.find(c => c.id === upcomingAnni.charId)?.avatar} className="w-8 h-8 rounded-full object-cover" />
                                <div className={`text-xs font-medium leading-relaxed italic ${currentThemeMode === 'minimal' ? 'text-slate-500' : 'text-white/90'}`}>
                                    "{upcomingAnni.aiThought || "加载中..."}"
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── TAB 1: 约定日程 (server_events) ─── */}
                {activeTab === 'server_events' && (
                    <div className={`relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-0 before:w-[1px] ${theme.decoLine}`}>
                        <div>
                             <div className="flex items-center justify-between mb-4 -ml-6 pl-6">
                                 <h3 className={`text-xs font-bold uppercase tracking-widest ${theme.textSub}`}>约定日程列表</h3>
                                 <button onClick={handleOpenAddSchedule} className={`text-xs font-bold ${theme.accent} hover:underline`}>+ 新建日程</button>
                             </div>

                             {anniversaries.length === 0 ? (
                                 <div className={`text-center py-10 border-2 border-dashed rounded-xl ${currentThemeMode === 'cyber' ? 'border-slate-800' : 'border-slate-200'}`}>
                                     <div className={theme.textSub}>暂无日程约定，点击右上角 + 创建</div>
                                 </div>
                             ) : (
                                 <div className="space-y-4">
                                     {anniversaries.map(a => {
                                         const char = characters.find(c => c.id === a.charId);
                                         const daysLeft = getDaysUntil(a.date);
                                         return (
                                             <div key={a.id} className="relative group">
                                                 <div className={`absolute -left-[20px] top-4 w-2 h-2 rounded-full z-10 ${currentThemeMode === 'cyber' ? 'bg-black border border-cyan-400' : 'bg-pink-400'}`}></div>
                                                 <div 
                                                     onClick={() => handleOpenEditSchedule(a)}
                                                     className={`${theme.card} p-4 rounded-xl cursor-pointer hover:border-cyan-500/50 transition-all`}
                                                 >
                                                     <div className="flex items-start justify-between gap-2">
                                                         <div className="min-w-0 flex-1">
                                                             <div className="flex items-center gap-2 flex-wrap">
                                                                 <span className={`text-sm font-bold ${theme.text}`}>{a.title}</span>
                                                                 {daysLeft === 0 && (
                                                                     <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-500 text-white animate-pulse">就是今天</span>
                                                                 )}
                                                                 {daysLeft > 0 && daysLeft <= 3 && (
                                                                     <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-500">{daysLeft}天后</span>
                                                                 )}
                                                             </div>
                                                             <div className={`text-[11px] ${theme.textSub} font-mono mt-1 flex items-center gap-2 flex-wrap`}>
                                                                 <span>📅 {a.date}</span>
                                                                 {a.time && <span>⏰ {a.time}</span>}
                                                                 {char && <span>👤 {char.name}</span>}
                                                             </div>
                                                             {a.remarks && (
                                                                 <div className={`mt-2 text-xs p-2 rounded-lg opacity-85 leading-relaxed ${currentThemeMode === 'cyber' ? 'bg-slate-800/80 text-slate-300' : 'bg-black/5 text-slate-600'}`}>
                                                                     {a.remarks}
                                                                 </div>
                                                             )}
                                                             <div className="mt-2 text-[10px] text-slate-400">
                                                                 {a.lastEditedBy ? `最后由 ${a.authorName || (a.lastEditedBy === 'user' ? userProfile.name : (char?.name || '角色'))} 修改` : (a.authorName ? `由 ${a.authorName} 创建` : '')}
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                             <button 
                                                                 onClick={(e) => { e.stopPropagation(); handleOpenEditSchedule(a); }}
                                                                 className="p-1 text-slate-400 hover:text-cyan-400 text-xs"
                                                                 title="编辑"
                                                             >
                                                                 ✎
                                                             </button>
                                                             <button 
                                                                 onClick={(e) => handleDeleteSchedule(a.id, e)} 
                                                                 className="p-1 text-slate-400 hover:text-red-400 text-xs"
                                                                 title="删除"
                                                             >
                                                                 ×
                                                             </button>
                                                         </div>
                                                     </div>
                                                 </div>
                                             </div>
                                         );
                                     })}
                                 </div>
                             )}
                        </div>

                        {/* Completed Tasks History Log */}
                         <div>
                             <h3 className={`text-xs font-bold uppercase tracking-widest mb-6 -ml-6 pl-6 pt-4 ${theme.textSub}`}>契约完成履历</h3>
                             <div className="space-y-4">
                                 {tasks.filter(t => t.isCompleted).sort((a,b) => (b.completedAt || 0) - (a.completedAt || 0)).map(t => (
                                     <div key={t.id} className="relative">
                                         <div className={`absolute -left-[20px] top-2 w-2 h-2 rounded-full z-10 ${currentThemeMode === 'cyber' ? 'bg-black border border-green-600' : 'bg-slate-300'}`}></div>
                                         <div className={`text-xs ${theme.textSub} font-mono`}>[{new Date(t.completedAt || 0).toLocaleDateString()}] 任务完成</div>
                                         <div className={`text-sm ${theme.text} font-bold mt-1 pl-1 border-l-2 ${theme.decoLine}`}>{t.title}</div>
                                     </div>
                                 ))}
                             </div>
                         </div>
                    </div>
                )}

                {/* ─── TAB 2: 共享备忘 (memos) ─── */}
                {activeTab === 'memos' && (
                    <div className="space-y-4">
                        {/* Search & Category Filter */}
                        <div className="space-y-2">
                            <input 
                                value={memoSearchQuery}
                                onChange={e => setMemoSearchQuery(e.target.value)}
                                placeholder="🔍 搜索便签或备忘内容..."
                                className={`w-full px-3 py-2 text-xs focus:outline-none rounded-xl ${theme.input}`}
                            />
                            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 items-center">
                                {memoCategories.map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? `${theme.buttonPrimary} shadow-sm` : `${theme.card} ${theme.textSub} opacity-80 hover:opacity-100`}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setShowCategoryManageModal(true)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all border border-dashed opacity-75 hover:opacity-100 flex items-center gap-1 shrink-0 ${
                                        currentThemeMode === 'cyber' ? 'border-cyan-700 text-cyan-400 hover:bg-cyan-950/40' : 'border-pink-300 text-pink-500 hover:bg-pink-50'
                                    }`}
                                    title="增减自定义标签"
                                >
                                    <span>+ 标签</span>
                                </button>
                            </div>
                        </div>

                        {filteredMemos.length === 0 ? (
                            <div className={`text-center py-14 border-2 border-dashed rounded-xl ${currentThemeMode === 'cyber' ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div className="text-3xl mb-2">📝</div>
                                <div className={theme.textSub}>暂无备忘内容，点击右上角 + 创建</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {filteredMemos.map(memo => {
                                    const char = characters.find(c => c.id === memo.charId);
                                    return (
                                        <div 
                                            key={memo.id}
                                            onClick={() => handleOpenEditMemo(memo)}
                                            className={`${theme.card} p-4 rounded-2xl cursor-pointer hover:border-cyan-500/40 transition-all relative group overflow-hidden`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {memo.pinned && (
                                                        <span className="text-xs shrink-0" title="置顶">📌</span>
                                                    )}
                                                    <span className={`text-sm font-bold truncate ${theme.text}`}>{memo.title}</span>
                                                    {memo.category && (
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${currentThemeMode === 'cyber' ? 'bg-cyan-950/70 text-cyan-400 border border-cyan-800/40' : 'bg-pink-100 text-pink-600'}`}>
                                                            {memo.category}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handlePushMemoToChat(memo); }}
                                                        className="text-xs p-1 text-slate-400 hover:text-emerald-400"
                                                        title="推送到聊天框"
                                                    >
                                                        📤
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleTogglePinMemo(memo, e)}
                                                        className={`text-xs p-1 ${memo.pinned ? 'text-amber-400' : 'text-slate-400 hover:text-amber-400'}`}
                                                        title={memo.pinned ? "取消置顶" : "置顶"}
                                                    >
                                                        📌
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleOpenEditMemo(memo); }}
                                                        className="text-xs p-1 text-slate-400 hover:text-cyan-400"
                                                        title="编辑"
                                                    >
                                                        ✎
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleDeleteMemo(memo.id, e)}
                                                        className="text-xs p-1 text-slate-400 hover:text-red-400"
                                                        title="删除"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Content snippet */}
                                            <p className={`text-xs leading-relaxed whitespace-pre-wrap line-clamp-4 ${theme.textSub} mb-3 font-mono`}>
                                                {memo.content}
                                            </p>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-700/20 text-[10px] text-slate-400">
                                                <div className="flex items-center gap-1.5">
                                                    {char && (
                                                        <span className="flex items-center gap-1">
                                                            <TokenImg value={char.avatar} className="w-3.5 h-3.5 rounded-full object-cover" />
                                                            <span>{char.name}</span>
                                                            <span>·</span>
                                                        </span>
                                                    )}
                                                    <span>{memo.lastEditedBy ? `最后由 ${memo.authorName || (memo.lastEditedBy === 'user' ? userProfile.name : '对方')} 编辑` : `由 ${memo.authorName || '用户'} 创建`}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePushMemoToChat(memo); }}
                                                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 transition-colors ${
                                                            currentThemeMode === 'cyber' ? 'bg-cyan-950/80 text-cyan-400 hover:bg-cyan-900 border border-cyan-800/40' : 'bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200'
                                                        }`}
                                                        title="推送到与TA的聊天"
                                                    >
                                                        <span>📤 推送</span>
                                                    </button>
                                                    <span className="font-mono">
                                                        {new Date(memo.lastEditedAt || memo.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB 3: 监督契约 (quest) ─── */}
                {activeTab === 'quest' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2 px-1">
                            <div className={`w-2 h-2 rounded-full animate-pulse ${currentThemeMode === 'cyber' ? 'bg-cyan-500' : (currentThemeMode === 'soft' ? 'bg-pink-400' : 'bg-slate-400')}`}></div>
                            <h3 className={`text-xs font-bold uppercase tracking-[0.2em] ${theme.accent}`}>进行中契约</h3>
                        </div>
                        
                        {tasks.filter(t => !t.isCompleted).length === 0 && (
                            <div className={`text-center py-12 border-2 border-dashed rounded-xl ${currentThemeMode === 'cyber' ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div className={theme.textSub}>暂无契约任务，点击右上角 + 创建</div>
                            </div>
                        )}

                        {tasks.filter(t => !t.isCompleted).map(task => {
                            const supervisor = characters.find(c => c.id === task.supervisorId);
                            const isProcessing = processingTaskIds.has(task.id);
                            
                            return (
                                <div key={task.id} className={`${theme.card} p-4 flex items-center gap-4 group relative overflow-hidden transition-all duration-300 rounded-xl`}>
                                    {/* Supervisor Icon */}
                                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 relative border border-white/10">
                                        {supervisor ? <TokenImg value={supervisor.avatar} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" /> : <span className="text-xs">?</span>}
                                        <div className={`absolute -bottom-0 -right-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${currentThemeMode === 'soft' ? 'bg-white text-pink-500' : 'bg-black text-cyan-500'}`}>!</div>
                                    </div>
                                    
                                    <div className="flex-1">
                                        <div className={`${theme.text} font-bold text-sm tracking-wide`}>{task.title}</div>
                                        <div className={`text-[10px] ${theme.textSub} mt-1 font-mono uppercase`}>
                                            监督人: {supervisor?.name || 'Unknown'}
                                        </div>
                                    </div>

                                    {/* Action Button Area */}
                                    {isProcessing ? (
                                        <div className="flex items-center gap-2 px-2 py-2">
                                            <div className={`w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin ${theme.accent}`}></div>
                                            <span className={`text-[10px] font-bold animate-pulse ${theme.accent}`}>验收中...</span>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={() => handleToggleTask(task)}
                                            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded transition-all active:scale-95 ${currentThemeMode === 'minimal' ? 'shadow-[4px_4px_8px_#d1d9e6,-4px_-4px_8px_#ffffff] text-slate-500 active:shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : (currentThemeMode === 'soft' ? 'bg-pink-100 text-pink-500' : 'bg-cyan-900/30 text-cyan-400 border border-cyan-800')}`}
                                        >
                                            完成
                                        </button>
                                    )}
                                    
                                    <button onClick={() => handleDeleteTask(task.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1">×</button>
                                </div>
                            );
                        })}

                        {tasks.filter(t => t.isCompleted).length > 0 && (
                            <div className="pt-8 opacity-50">
                                <h3 className={`text-xs font-bold uppercase tracking-[0.2em] px-1 mb-4 ${theme.textSub}`}>已完成</h3>
                                {tasks.filter(t => t.isCompleted).map(task => (
                                    <div key={task.id} className={`flex items-center gap-3 py-2 px-2 border-b ${currentThemeMode === 'cyber' ? 'border-slate-800/50' : 'border-slate-100'}`}>
                                        <div className={`${theme.iconDone} text-xs font-mono`}>[DONE]</div>
                                        <span className={`text-sm line-through ${theme.textSub}`}>{task.title}</span>
                                        <button onClick={() => handleDeleteTask(task.id)} className="ml-auto text-slate-400 hover:text-red-500 text-xs">DEL</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>

            {/* Task Modal */}
            <Modal isOpen={showTaskModal} title={currentThemeMode === 'cyber' ? "INITIALIZE QUEST" : "新建监督契约"} onClose={() => setShowTaskModal(false)} footer={<button onClick={handleAddTask} className={`w-full py-3 font-bold transition-all ${theme.buttonPrimary}`}>确认添加</button>}>
                <div className={`space-y-6 ${currentThemeMode === 'minimal' ? 'p-2' : ''}`}>
                    <input autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="契约目标 (例如: 每天背20个单词)" className={`w-full px-4 py-3 text-sm focus:outline-none ${theme.input}`} />
                    
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">选择监督人</label>
                        <CharacterGroupFilterBar characters={characters} groups={characterGroups}
                            value={supervisorGroupId} onChange={setSupervisorGroupId} className="mb-2" />
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            {filterCharactersByGroup(characters, characterGroups, supervisorGroupId).map(c => (
                                <button key={c.id} onClick={() => setNewTaskSupervisor(c.id)} className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all min-w-[60px] ${newTaskSupervisor === c.id ? `${currentThemeMode === 'minimal' ? 'shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : 'border-current'}` : 'border-transparent opacity-50'}`}>
                                    <TokenImg value={c.avatar} className="w-10 h-10 rounded-md object-cover" />
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${theme.text}`}>{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Schedule Event Modal (Add / Edit) */}
            <Modal 
                isOpen={showScheduleModal} 
                title={editingSchedule ? (currentThemeMode === 'cyber' ? "EDIT SCHEDULE" : "编辑日程约定") : (currentThemeMode === 'cyber' ? "REGISTER SCHEDULE" : "添加日程约定")} 
                onClose={() => setShowScheduleModal(false)} 
                footer={<button onClick={handleSaveSchedule} className={`w-full py-3 font-bold transition-all ${theme.buttonPrimary}`}>{editingSchedule ? '保存修改' : '保存记录'}</button>}
            >
                <div className={`space-y-4 ${currentThemeMode === 'minimal' ? 'p-2' : ''}`}>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">日程标题</label>
                        <input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder="事件名称 (例如: 周末去猫咖)" className={`w-full px-4 py-3 text-sm focus:outline-none ${theme.input}`} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">日期</label>
                            <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className={`w-full px-4 py-3 text-sm focus:outline-none ${theme.input}`} />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">时间 (可选)</label>
                            <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className={`w-full px-4 py-3 text-sm focus:outline-none ${theme.input}`} />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">备注说明 (可选)</label>
                        <textarea 
                            rows={3}
                            value={scheduleRemarks} 
                            onChange={e => setScheduleRemarks(e.target.value)} 
                            placeholder="地点、要带的东西、约定细节..." 
                            className={`w-full px-4 py-2.5 text-sm focus:outline-none rounded-xl ${theme.input}`} 
                        />
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">约定对象</label>
                        <CharacterGroupFilterBar characters={characters} groups={characterGroups}
                            value={scheduleCharGroupId} onChange={setScheduleCharGroupId} className="mb-2" />
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            {filterCharactersByGroup(characters, characterGroups, scheduleCharGroupId).map(c => (
                                <button key={c.id} onClick={() => setScheduleChar(c.id)} className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all min-w-[60px] ${scheduleChar === c.id ? `${currentThemeMode === 'minimal' ? 'shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : 'border-current'}` : 'border-transparent opacity-50'}`}>
                                    <TokenImg value={c.avatar} className="w-10 h-10 rounded-md object-cover" />
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${theme.text}`}>{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Memo Modal (Add / Edit) */}
            <Modal 
                isOpen={showMemoModal} 
                title={editingMemo ? (currentThemeMode === 'cyber' ? "EDIT MEMO" : "编辑便签") : (currentThemeMode === 'cyber' ? "NEW MEMO" : "新建便签")} 
                onClose={() => setShowMemoModal(false)} 
                footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => handleSaveMemo(false)} className={`flex-1 py-3 font-bold transition-all text-xs rounded-xl ${theme.buttonPrimary}`}>
                            {editingMemo ? '💾 保存便签' : '💾 创建便签'}
                        </button>
                        <button 
                            onClick={() => handleSaveMemo(true)} 
                            className={`py-3 px-4 font-bold transition-all text-xs rounded-xl flex items-center justify-center gap-1.5 shrink-0 ${
                                currentThemeMode === 'cyber'
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    : 'bg-pink-500 hover:bg-pink-600 text-white'
                            }`}
                            title="保存便签并发送给对应角色"
                        >
                            <span>📤</span>
                            <span>推送到聊天</span>
                        </button>
                    </div>
                }
            >
                <div className={`space-y-4 ${currentThemeMode === 'minimal' ? 'p-2' : ''}`}>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block tracking-widest">便签标题</label>
                        <input value={memoTitle} onChange={e => setMemoTitle(e.target.value)} placeholder="便签标题 (例如: 约会清单 / 待办事项 / 灵感)" className={`w-full px-4 py-2.5 text-sm focus:outline-none rounded-xl ${theme.input}`} />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">分类标签</label>
                            <button 
                                type="button" 
                                onClick={() => setShowCategoryManageModal(true)} 
                                className={`text-[10px] flex items-center gap-1 hover:underline ${currentThemeMode === 'cyber' ? 'text-cyan-400' : 'text-pink-500'}`}
                            >
                                <span>⚙️ 管理标签</span>
                            </button>
                        </div>
                        {/* Quick category pills */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {memoCategories.filter(c => c !== '全部').map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => handleChangeMemoCategory(cat)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                        memoCategory === cat
                                            ? `${theme.buttonPrimary} shadow-sm`
                                            : `${theme.card} ${theme.textSub} opacity-75 hover:opacity-100`
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <input 
                                value={memoCategory} 
                                onChange={e => handleChangeMemoCategory(e.target.value)} 
                                placeholder="或直接输入标签名" 
                                className={`flex-1 px-3 py-2 text-xs focus:outline-none rounded-xl ${theme.input}`} 
                            />
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold shrink-0">
                                <input type="checkbox" checked={memoPinned} onChange={e => setMemoPinned(e.target.checked)} className="rounded" />
                                <span>📌 置顶</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">便签正文 (长文本)</label>
                            <span className="text-[10px] text-slate-400">选择格式模板:</span>
                        </div>

                        {/* 格式模板快捷栏 */}
                        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 mb-2">
                            {MEMO_FORMAT_TEMPLATES.map(tpl => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => handleApplyFormatTemplate(tpl.id)}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 border transition-all shrink-0 ${
                                        currentThemeMode === 'cyber' 
                                            ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-cyan-500 hover:text-cyan-400' 
                                            : 'bg-white border-slate-200 text-slate-700 hover:border-pink-300 hover:text-pink-600 shadow-sm'
                                    }`}
                                    title={tpl.description}
                                >
                                    <span>{tpl.icon}</span>
                                    <span>{tpl.label}</span>
                                </button>
                            ))}
                        </div>

                        <textarea 
                            rows={7}
                            value={memoContent} 
                            onChange={e => setMemoContent(e.target.value)} 
                            placeholder="在这里写下需要记住的事情、待办清单、表格或者想说的话..." 
                            className={`w-full px-4 py-3 text-xs leading-relaxed focus:outline-none rounded-xl ${theme.input} font-mono`} 
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">共享角色 (可选)</label>
                        <CharacterGroupFilterBar characters={characters} groups={characterGroups}
                            value={memoCharGroupId} onChange={setMemoCharGroupId} className="mb-2" />
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            <button onClick={() => setMemoChar('')} className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all min-w-[60px] ${!memoChar ? `${currentThemeMode === 'minimal' ? 'shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : 'border-current'}` : 'border-transparent opacity-50'}`}>
                                <div className="w-10 h-10 rounded-md bg-slate-500/20 flex items-center justify-center text-xs font-bold">全员</div>
                                <span className={`text-[10px] font-bold whitespace-nowrap mt-2 ${theme.text}`}>不限</span>
                            </button>
                            {filterCharactersByGroup(characters, characterGroups, memoCharGroupId).map(c => (
                                <button key={c.id} onClick={() => setMemoChar(c.id)} className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all min-w-[60px] ${memoChar === c.id ? `${currentThemeMode === 'minimal' ? 'shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : 'border-current'}` : 'border-transparent opacity-50'}`}>
                                    <TokenImg value={c.avatar} className="w-10 h-10 rounded-md object-cover" />
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${theme.text}`}>{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Category Management Modal */}
            <Modal
                isOpen={showCategoryManageModal}
                title={currentThemeMode === 'cyber' ? "TAG MANAGEMENT" : "管理分类标签"}
                onClose={() => setShowCategoryManageModal(false)}
            >
                <div className={`space-y-4 ${currentThemeMode === 'minimal' ? 'p-2' : ''}`}>
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">系统预设分类 (不可删除)</div>
                        <div className="flex gap-1.5 flex-wrap">
                            {BUILTIN_CATEGORIES.map(cat => (
                                <span key={cat} className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${currentThemeMode === 'cyber' ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                                    {cat}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">自定义标签</div>
                        {customCategories.length === 0 ? (
                            <div className="text-xs text-slate-500 py-1">暂无自定义标签，可在下方输入添加</div>
                        ) : (
                            <div className="flex gap-1.5 flex-wrap">
                                {customCategories.map(cat => (
                                    <span key={cat} className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${currentThemeMode === 'cyber' ? 'bg-cyan-950/60 border-cyan-800/60 text-cyan-300' : 'bg-pink-50 border-pink-200 text-pink-700'}`}>
                                        <span>{cat}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => handleDeleteCustomCategory(cat)}
                                            className="text-slate-400 hover:text-red-400 font-bold ml-1 text-sm leading-none"
                                            title="删除标签"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-slate-700/30">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">新增自定义标签</label>
                        <div className="flex gap-2">
                            <input
                                value={newCustomCategoryInput}
                                onChange={e => setNewCustomCategoryInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddCustomCategory(); }}
                                placeholder="输入新标签 (如: 灵感 / 游戏 / 秘密)"
                                className={`flex-1 px-3 py-2 text-xs focus:outline-none rounded-xl ${theme.input}`}
                            />
                            <button
                                type="button"
                                onClick={handleAddCustomCategory}
                                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${theme.buttonPrimary}`}
                            >
                                添加
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Push To Chat Character Picker Modal */}
            <Modal
                isOpen={showPushConfirmModal}
                title="选择推送到哪位角色的聊天"
                onClose={() => { setShowPushConfirmModal(false); setMemoToPush(null); }}
                footer={
                    <button
                        onClick={() => {
                            if (memoToPush && pushTargetCharId) {
                                setShowPushConfirmModal(false);
                                handlePushMemoToChat(memoToPush, pushTargetCharId);
                                setMemoToPush(null);
                            }
                        }}
                        disabled={!pushTargetCharId}
                        className={`w-full py-3 font-bold transition-all text-xs rounded-xl ${theme.buttonPrimary}`}
                    >
                        确认推送并打开私聊
                    </button>
                }
            >
                <div className={`space-y-4 ${currentThemeMode === 'minimal' ? 'p-2' : ''}`}>
                    {memoToPush && (
                        <div className={`p-3 rounded-xl border text-xs ${currentThemeMode === 'cyber' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="font-bold mb-1">📝 《{memoToPush.title}》</div>
                            <div className="text-slate-400 line-clamp-2 font-mono">{memoToPush.content}</div>
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">选择目标角色</label>
                        <CharacterGroupFilterBar characters={characters} groups={characterGroups}
                            value={pushCharGroupId} onChange={setPushCharGroupId} className="mb-2" />
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            {filterCharactersByGroup(characters, characterGroups, pushCharGroupId).map(c => (
                                <button 
                                    key={c.id} 
                                    onClick={() => setPushTargetCharId(c.id)} 
                                    className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-all min-w-[65px] ${pushTargetCharId === c.id ? `${currentThemeMode === 'minimal' ? 'shadow-[inset_2px_2px_5px_#d1d9e6,inset_-2px_-2px_5px_#ffffff]' : 'border-current'}` : 'border-transparent opacity-50'}`}
                                >
                                    <TokenImg value={c.avatar} className="w-10 h-10 rounded-md object-cover" />
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${theme.text}`}>{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ScheduleApp;
