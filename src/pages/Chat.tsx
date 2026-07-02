import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  Edit3,
  Gauge,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  Send,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { cn } from '../lib/utils';
import { backendApi as api } from '../services/backendApi';
import type { ChatMessage, ChatSession, KnowledgeBase } from '../types/domain';

export function Chat() {
  const { currentModel, user } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const creatingFallbackSessionRef = useRef(false);
  const lastPersistedSettingsRef = useRef('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(0.9);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [recentMessageLimit, setRecentMessageLimit] = useState(8);
  const [showThinking, setShowThinking] = useState(true);
  const [enableThinking, setEnableThinking] = useState(true);
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]);
  const [attachedDocumentIds, setAttachedDocumentIds] = useState<string[]>([]);
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [updatingMessageId, setUpdatingMessageId] = useState<string | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsageState>({ status: 'idle' });

  const ensureFallbackSession = async () => {
    if (creatingFallbackSessionRef.current) return;
    creatingFallbackSessionRef.current = true;
    try {
      const session = await api.createChatSession(currentModel);
      setSessions((items) => {
        const next = items.length === 0 ? [session] : items;
        const nextActive = next[0].id;
        window.queueMicrotask(() => {
          setActiveSessionId(nextActive);
          setSearchParams({ sessionId: nextActive });
        });
        return next;
      });
    } finally {
      creatingFallbackSessionRef.current = false;
    }
  };

  useEffect(() => {
    void api.listKnowledgeBases().then((items) => {
      setKnowledgeBases(items);
    });
  }, []);

  useEffect(() => {
    void api.listChatSessions().then((items) => {
      if (items.length === 0) {
        void ensureFallbackSession();
        return;
      }
      setSessions(items);
      const requestedSessionId = searchParams.get('sessionId');
      setActiveSessionId(items.find((item) => item.id === requestedSessionId)?.id ?? items[0]?.id ?? '');
    });
  }, [currentModel, searchParams, setSearchParams]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  );
  const hasKnowledgeContext = selectedKnowledgeBaseIds.length > 0 || attachedDocumentIds.length > 0;
  const isVisionModel = currentModel.includes('VL');

  const scrollToLatestMessage = (behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' }));
    });
  };

  useEffect(() => {
    scrollToLatestMessage('auto');
  }, [activeSessionId]);

  const settingsKey = (
    model: string,
    currentTemperature: number,
    currentTopP: number,
    currentMaxTokens: number,
    currentRecentMessageLimit: number,
    currentShowThinking: boolean,
    currentEnableThinking: boolean,
    kbIds: string[],
    docIds: string[],
  ) =>
    JSON.stringify({
      model,
      temperature: currentTemperature,
      topP: currentTopP,
      maxTokens: currentMaxTokens,
      recentMessageLimit: currentRecentMessageLimit,
      showThinking: currentShowThinking,
      enableThinking: currentEnableThinking,
      knowledgeBaseIds: kbIds,
      attachedDocumentIds: docIds,
    });

  useEffect(() => {
    if (!activeSession) return;
    const sessionTemperature = activeSession.temperature ?? 0.2;
    const sessionTopP = activeSession.topP ?? 0.9;
    const sessionMaxTokens = activeSession.maxTokens ?? 2048;
    const sessionRecentLimit = activeSession.recentMessageLimit ?? 8;
    const sessionShowThinking = activeSession.showThinking ?? true;
    const sessionEnableThinking = activeSession.enableThinking ?? true;
    const sessionKnowledgeBaseIds = activeSession.selectedKnowledgeBaseIds ?? [];
    const sessionAttachedDocumentIds = activeSession.attachedDocumentIds ?? [];
    lastPersistedSettingsRef.current = settingsKey(
      currentModel,
      sessionTemperature,
      sessionTopP,
      sessionMaxTokens,
      sessionRecentLimit,
      sessionShowThinking,
      sessionEnableThinking,
      sessionKnowledgeBaseIds,
      sessionAttachedDocumentIds,
    );
    setTemperature(sessionTemperature);
    setTopP(sessionTopP);
    setMaxTokens(sessionMaxTokens);
    setRecentMessageLimit(sessionRecentLimit);
    setShowThinking(sessionShowThinking);
    setEnableThinking(sessionEnableThinking);
    setSelectedKnowledgeBaseIds(sessionKnowledgeBaseIds);
    setAttachedDocumentIds(sessionAttachedDocumentIds);
  }, [activeSessionId, activeSession, currentModel]);

  useEffect(() => {
    if (!activeSession) return;
    const key = settingsKey(currentModel, temperature, topP, maxTokens, recentMessageLimit, showThinking, enableThinking, selectedKnowledgeBaseIds, attachedDocumentIds);
    if (key === lastPersistedSettingsRef.current) return;
    const handle = window.setTimeout(() => {
      void api
        .updateChatSessionSettings(activeSession.id, {
          model: currentModel,
          temperature,
          topP,
          maxTokens,
          recentMessageLimit,
          showThinking,
          enableThinking,
          knowledgeBaseIds: selectedKnowledgeBaseIds,
          attachedDocumentIds,
        })
        .then((updated) => {
          lastPersistedSettingsRef.current = key;
          setSessions((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        });
    }, 500);
    return () => window.clearTimeout(handle);
  }, [activeSession, attachedDocumentIds, currentModel, enableThinking, maxTokens, recentMessageLimit, selectedKnowledgeBaseIds, showThinking, temperature, topP]);

  useEffect(() => {
    if (!activeSession || !user) {
      setContextUsage({ status: 'idle' });
      return;
    }
    const handle = window.setTimeout(() => {
      setContextUsage({ status: 'loading' });
      void api
        .getContextUsage(activeSession.id, inputValue, currentModel, user, {
          temperature,
          topP,
          maxTokens,
          recentMessageLimit,
          showThinking,
          enableThinking,
          knowledgeBaseIds: selectedKnowledgeBaseIds,
          attachedDocumentIds,
          imageDataUrls,
        })
        .then((usage) => setContextUsage({ status: 'ready', ...usage }))
        .catch(() => setContextUsage({ status: 'unavailable' }));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [activeSession, attachedDocumentIds, currentModel, enableThinking, imageDataUrls, inputValue, maxTokens, recentMessageLimit, selectedKnowledgeBaseIds, showThinking, temperature, topP, user]);

  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSearchParams({ sessionId });
  };

  const createSession = async () => {
    const session = await api.createChatSession(currentModel);
    setSessions((items) => [session, ...items]);
    selectSession(session.id);
  };

  const archiveSession = async (sessionId: string) => {
    await api.archiveChatSession(sessionId);
    const next = sessions.filter((item) => item.id !== sessionId);
    setSessions(next);
    if (activeSessionId === sessionId) {
      const nextActive = next[0]?.id ?? '';
      if (nextActive) {
        setActiveSessionId(nextActive);
        setSearchParams({ sessionId: nextActive });
      } else {
        void ensureFallbackSession();
      }
    }
  };

  const sendContent = async (content: string, optimistic = true) => {
    if ((!content.trim() && imageDataUrls.length === 0) || !activeSession || !user) return;
    const imagesToSend = imageDataUrls;
    if (imagesToSend.length > 0) setImageDataUrls([]);
    setGenerating(true);
    if (optimistic) {
      const optimisticSession: ChatSession = {
        ...activeSession,
        messages: [...activeSession.messages, { id: `local-${Date.now()}`, role: 'user', content: content || '[image]', createdAt: 'just now', imageDataUrls: imagesToSend }],
      };
      setSessions((items) => items.map((item) => (item.id === activeSession.id ? optimisticSession : item)));
      scrollToLatestMessage();
    }
    try {
      const updated = await api.sendMessageStream(
        activeSession.id,
        content,
        currentModel,
        user,
        {
          temperature,
          topP,
          maxTokens,
          recentMessageLimit,
          showThinking,
          enableThinking,
          knowledgeBaseIds: selectedKnowledgeBaseIds,
          attachedDocumentIds,
          imageDataUrls: imagesToSend,
        },
        {
          onStart: (userMessage, assistantMessage) => {
            setStreamingMessageId(assistantMessage.id);
            setSessions((items) =>
              items.map((item) =>
                item.id === activeSession.id
                  ? {
                      ...item,
                      messages: [
                        ...item.messages.filter((message) => !message.id.startsWith('local-')),
                        ...(item.messages.some((message) => message.id === userMessage.id) ? [] : [userMessage]),
                        ...(item.messages.some((message) => message.id === assistantMessage.id) ? [] : [assistantMessage]),
                      ],
                    }
                  : item,
              ),
            );
          },
          onContent: (messageId, delta) => {
            setSessions((items) =>
              items.map((item) =>
                item.id === activeSession.id
                  ? {
                      ...item,
                      messages: item.messages.map((message) => (message.id === messageId ? { ...message, content: `${message.content}${delta}` } : message)),
                    }
                  : item,
              ),
            );
          },
          onReasoning: (messageId, delta) => {
            setSessions((items) =>
              items.map((item) =>
                item.id === activeSession.id
                  ? {
                      ...item,
                      messages: item.messages.map((message) =>
                        message.id === messageId ? { ...message, reasoning: `${message.reasoning ?? ''}${delta}` } : message,
                      ),
                    }
                  : item,
              ),
            );
          },
        },
      );
      setSessions((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setActiveSessionId(updated.id);
    } finally {
      setStreamingMessageId(null);
      setGenerating(false);
    }
  };

  const send = async () => {
    const content = inputValue.trim();
    if (!content && imageDataUrls.length === 0) return;
    if (imageDataUrls.length > 0 && !isVisionModel) return;
    setInputValue('');
    await sendContent(content);
  };

  const previousUserContent = (messageId: string) => {
    const index = activeSession?.messages.findIndex((message) => message.id === messageId) ?? -1;
    if (!activeSession || index <= 0) return '';
    return [...activeSession.messages.slice(0, index)].reverse().find((message) => message.role === 'user')?.content ?? '';
  };

  const replaceSession = (updated: ChatSession) => {
    setSessions((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setActiveSessionId(updated.id);
  };

  const nextAssistantMessageId = (messageId: string) => {
    if (!activeSession) return null;
    const index = activeSession.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return null;
    for (const message of activeSession.messages.slice(index + 1)) {
      if (message.role === 'assistant') return message.id;
      if (message.role === 'user') return null;
    }
    return null;
  };

  const regenerateMessage = async (message: ChatMessage) => {
    const assistantMessageId = message.role === 'assistant' ? message.id : nextAssistantMessageId(message.id);
    if (!assistantMessageId) return;
    setUpdatingMessageId(assistantMessageId);
    setStreamingMessageId(assistantMessageId);
    setSessions((items) =>
      items.map((item) =>
        item.id === activeSession?.id
          ? {
              ...item,
              messages: item.messages.map((itemMessage) =>
                itemMessage.id === assistantMessageId ? { ...itemMessage, content: '', reasoning: null, citations: [] } : itemMessage,
              ),
            }
          : item,
      ),
    );
    try {
      const updated = await api.regenerateChatMessageStream(assistantMessageId, {
        onContent: (messageId, delta) => {
          setSessions((items) =>
            items.map((item) =>
              item.id === activeSession?.id
                ? {
                    ...item,
                    messages: item.messages.map((itemMessage) =>
                      itemMessage.id === messageId ? { ...itemMessage, content: `${itemMessage.content}${delta}` } : itemMessage,
                    ),
                  }
                : item,
            ),
          );
        },
        onReasoning: (messageId, delta) => {
          setSessions((items) =>
            items.map((item) =>
              item.id === activeSession?.id
                ? {
                    ...item,
                    messages: item.messages.map((itemMessage) =>
                      itemMessage.id === messageId ? { ...itemMessage, reasoning: `${itemMessage.reasoning ?? ''}${delta}` } : itemMessage,
                    ),
                  }
                : item,
            ),
          );
        },
      });
      replaceSession(updated);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '重新生成失败';
      setSessions((items) =>
        items.map((item) =>
          item.id === activeSession?.id
            ? {
                ...item,
                messages: item.messages.map((itemMessage) =>
                  itemMessage.id === assistantMessageId ? { ...itemMessage, content: `重新生成失败：${messageText}` } : itemMessage,
                ),
              }
            : item,
        ),
      );
    } finally {
      setStreamingMessageId(null);
      setUpdatingMessageId(null);
    }
  };

  const editMessage = async (messageId: string, content: string) => {
    const assistantMessageId = nextAssistantMessageId(messageId);
    setUpdatingMessageId(assistantMessageId ?? messageId);
    if (assistantMessageId) setStreamingMessageId(assistantMessageId);
    setSessions((items) =>
      items.map((item) =>
        item.id === activeSession?.id
          ? {
              ...item,
              messages: item.messages.map((itemMessage) => {
                if (itemMessage.id === messageId) return { ...itemMessage, content };
                if (itemMessage.id === assistantMessageId) return { ...itemMessage, content: '', reasoning: null, citations: [] };
                return itemMessage;
              }),
            }
          : item,
      ),
    );
    try {
      const updated = await api.editChatMessageStream(messageId, content, [], {
        onStart: (userMessage) => {
          setSessions((items) =>
            items.map((item) =>
              item.id === activeSession?.id
                ? {
                    ...item,
                    messages: item.messages.map((itemMessage) => (itemMessage.id === userMessage.id ? userMessage : itemMessage)),
                  }
                : item,
            ),
          );
        },
        onContent: (streamMessageId, delta) => {
          setSessions((items) =>
            items.map((item) =>
              item.id === activeSession?.id
                ? {
                    ...item,
                    messages: item.messages.map((itemMessage) =>
                      itemMessage.id === streamMessageId ? { ...itemMessage, content: `${itemMessage.content}${delta}` } : itemMessage,
                    ),
                  }
                : item,
            ),
          );
        },
        onReasoning: (streamMessageId, delta) => {
          setSessions((items) =>
            items.map((item) =>
              item.id === activeSession?.id
                ? {
                    ...item,
                    messages: item.messages.map((itemMessage) =>
                      itemMessage.id === streamMessageId ? { ...itemMessage, reasoning: `${itemMessage.reasoning ?? ''}${delta}` } : itemMessage,
                    ),
                  }
                : item,
            ),
          );
        },
      });
      replaceSession(updated);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '编辑后重新生成失败';
      if (assistantMessageId) {
        setSessions((items) =>
          items.map((item) =>
            item.id === activeSession?.id
              ? {
                  ...item,
                  messages: item.messages.map((itemMessage) =>
                    itemMessage.id === assistantMessageId ? { ...itemMessage, content: `编辑后重新生成失败：${messageText}` } : itemMessage,
                  ),
                }
              : item,
          ),
        );
      }
    } finally {
      setStreamingMessageId(null);
      setUpdatingMessageId(null);
    }
  };

  const feedbackMessage = async (message: ChatMessage, feedback: 'like' | 'dislike') => {
    if (message.role !== 'assistant') return;
    const nextFeedback = message.feedback === feedback ? 'clear' : feedback;
    replaceSession(await api.feedbackChatMessage(message.id, nextFeedback));
  };

  const uploadAttachment = async (file: File) => {
    if (!activeSession || !user) return;
    const targetKnowledgeBaseId = selectedKnowledgeBaseIds[0];
    if (!targetKnowledgeBaseId) return;
    setUploadingAttachment(true);
    try {
      const result = await api.uploadSessionAttachment(activeSession.id, file, targetKnowledgeBaseId);
      setAttachedDocumentIds((items) => [...items, result.documentId]);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const addImages = async (files: FileList | null) => {
    if (!files || !isVisionModel) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, 4 - imageDataUrls.length));
    const dataUrls = await Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );
    setImageDataUrls((items) => [...items, ...dataUrls].slice(0, 4));
  };

  return (
    <div className="flex h-full w-full bg-slate-50 relative overflow-hidden">
      <div className="w-60 bg-white border-r border-slate-200 flex-col shrink-0 z-10 hidden md:flex">
        <div className="p-3 border-b border-slate-100">
          <button onClick={createSession} className="w-full text-blue-600 hover:bg-slate-50 rounded flex items-center justify-center py-1.5 text-xs font-bold">
            <Plus className="w-3.5 h-3.5 mr-1" />
            新建对话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          <h4 className="text-[10px] font-bold text-slate-400 mb-1 px-2 uppercase">最近会话</h4>
          <div className="space-y-0.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group flex items-center gap-1 rounded text-xs transition-colors',
                  activeSession?.id === session.id ? 'bg-blue-50 border border-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                <button onClick={() => selectSession(session.id)} className="min-w-0 flex-1 text-left p-2">
                  <div className="truncate">{session.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{session.updatedAt}</div>
                </button>
                <button
                  onClick={() => void archiveSession(session.id)}
                  className="mr-1 p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="归档会话"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-slate-100">
          <Link to="/chat/archived" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center">
            <Archive className="w-3.5 h-3.5 mr-1" />
            查看归档会话
          </Link>
        </div>
      </div>

      <div className={cn('flex-1 flex flex-col min-w-0 bg-slate-50 transition-[margin] duration-300', drawerOpen && 'mr-80')}>
        <div className="h-14 border-b border-slate-200 bg-white/90 backdrop-blur-sm flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center space-x-3 min-w-0">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            <h2 className="text-slate-800 font-semibold truncate">{activeSession?.title ?? '新的对话'}</h2>
          </div>
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={cn('p-1.5 rounded-md transition-colors', drawerOpen ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100')}
            title="会话设置"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:px-6 space-y-6 custom-scrollbar scroll-smooth">
          {activeSession?.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onEdit={(content) => void editMessage(message.id, content)}
              onRegenerate={() => void regenerateMessage(message)}
              onFeedback={(feedback) => void feedbackMessage(message, feedback)}
              isUpdating={updatingMessageId === message.id}
              showThinking={showThinking}
            />
          ))}
          {generating && !streamingMessageId && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 border border-blue-200 text-center leading-8 text-xs font-bold">AI</div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                {hasKnowledgeContext ? '正在检索知识库并调用 GLM-5.1...' : '正在调用 GLM-5.1...'}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 md:px-6 shrink-0 bg-white border-t border-slate-200">
          <div className="relative">
            <textarea
              className="w-full border rounded-lg p-3 pr-72 text-sm focus:ring-2 focus:ring-blue-500 h-24 bg-slate-50 resize-none"
              placeholder="在此输入问题，Shift+Enter 换行。"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onPaste={(event) => {
                if (!isVisionModel) return;
                const imageItems = Array.from(event.clipboardData.items) as DataTransferItem[];
                const imageFiles = imageItems
                  .filter((item) => item.type.startsWith('image/'))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => Boolean(file));
                if (imageFiles.length > 0) {
                  event.preventDefault();
                  const transfer = new DataTransfer();
                  imageFiles.forEach((file) => transfer.items.add(file));
                  void addImages(transfer.files);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <ContextUsageIndicator usage={contextUsage} />
              <button
                onClick={() => setDrawerOpen(true)}
                className="px-2 py-1.5 rounded border border-slate-200 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1"
                title="引用知识库"
              >
                <Database className="w-3.5 h-3.5" />
                引用知识库
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAttachment(file);
                  event.target.value = '';
                }}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  void addImages(event.target.files);
                  event.target.value = '';
                }}
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={!activeSession || !isVisionModel || imageDataUrls.length >= 4}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                title={isVisionModel ? '上传图片给 VL 模型' : '请先切换到 Qwen3-VL-8B-Instruct'}
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!activeSession || uploadingAttachment || knowledgeBases.length === 0}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                title="上传会话文档"
              >
                {uploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
              <button
                onClick={send}
                disabled={(!inputValue.trim() && imageDataUrls.length === 0) || (imageDataUrls.length > 0 && !isVisionModel) || generating || !activeSession}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-bold shadow-sm transition-colors flex items-center gap-1',
                  (inputValue.trim() || imageDataUrls.length > 0) && !(imageDataUrls.length > 0 && !isVisionModel) && !generating && activeSession ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-slate-100 text-slate-300 cursor-not-allowed',
                )}
              >
                <Send className="w-3.5 h-3.5" />
                发送
              </button>
            </div>
          </div>
          {imageDataUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {imageDataUrls.map((url, index) => (
                <div key={`${url.slice(0, 32)}-${index}`} className="relative w-14 h-14 rounded border border-slate-200 overflow-hidden bg-slate-50">
                  <img src={url} alt={`upload ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setImageDataUrls((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                    className="absolute right-0 top-0 bg-black/50 text-white w-5 h-5 grid place-items-center"
                    title="移除图片"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachedDocumentIds.length > 0 && <div className="mt-2 text-[11px] text-slate-500">当前会话附件已索引：{attachedDocumentIds.length} 个。</div>}
        </div>
      </div>

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        temperature={temperature}
        setTemperature={setTemperature}
        topP={topP}
        setTopP={setTopP}
        maxTokens={maxTokens}
        setMaxTokens={setMaxTokens}
        recentMessageLimit={recentMessageLimit}
        setRecentMessageLimit={setRecentMessageLimit}
        showThinking={showThinking}
        setShowThinking={setShowThinking}
        enableThinking={enableThinking}
        setEnableThinking={setEnableThinking}
        knowledgeBases={knowledgeBases}
        selectedKnowledgeBaseIds={selectedKnowledgeBaseIds}
        setSelectedKnowledgeBaseIds={setSelectedKnowledgeBaseIds}
      />
    </div>
  );
}

function SettingsDrawer({
  open,
  onClose,
  temperature,
  setTemperature,
  topP,
  setTopP,
  maxTokens,
  setMaxTokens,
  recentMessageLimit,
  setRecentMessageLimit,
  showThinking,
  setShowThinking,
  enableThinking,
  setEnableThinking,
  knowledgeBases,
  selectedKnowledgeBaseIds,
  setSelectedKnowledgeBaseIds,
}: {
  open: boolean;
  onClose: () => void;
  temperature: number;
  setTemperature: (value: number) => void;
  topP: number;
  setTopP: (value: number) => void;
  maxTokens: number;
  setMaxTokens: (value: number) => void;
  recentMessageLimit: number;
  setRecentMessageLimit: (value: number) => void;
  showThinking: boolean;
  setShowThinking: (value: boolean) => void;
  enableThinking: boolean;
  setEnableThinking: (value: boolean) => void;
  knowledgeBases: KnowledgeBase[];
  selectedKnowledgeBaseIds: string[];
  setSelectedKnowledgeBaseIds: (value: string[] | ((items: string[]) => string[])) => void;
}) {
  return (
    <div
      className={cn(
        'absolute right-0 top-0 h-full w-80 bg-white border-l border-slate-200 shadow-2xl z-20 transform transition-transform duration-300 ease-in-out flex flex-col',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <div className="p-3 border-b flex justify-between items-center bg-slate-50">
        <span className="font-bold text-xs text-slate-700">会话设置</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs text-slate-600">
        <SettingSlider label="温度" value={temperature} min={0} max={1.5} step={0.1} onChange={setTemperature} help="越低越稳定严谨，越高越发散。知识库问答推荐 0.2。" />
        <SettingSlider label="Top-P" value={topP} min={0.1} max={1} step={0.05} onChange={setTopP} help="控制候选词采样范围。推荐 0.9，兼顾准确和自然。" />
        <SettingSlider label="最大输出 Token" value={maxTokens} min={256} max={4096} step={256} onChange={setMaxTokens} help="限制回答长度。长文档问答推荐 2048。" />
        <SettingSlider label="最近消息条数" value={recentMessageLimit} min={0} max={50} step={1} onChange={setRecentMessageLimit} help="控制发送给模型的历史消息数量。0 表示不带历史；一轮问答通常占 2 条消息。" />

        <label className="flex items-center justify-between border border-slate-200 rounded p-3">
          <span>
            <span className="font-bold text-slate-700 block">显示思考过程</span>
            <span className="text-[11px] text-slate-400">开启后展示模型 reasoning 字段，可折叠。</span>
          </span>
          <input type="checkbox" checked={showThinking} onChange={(event) => setShowThinking(event.target.checked)} />
        </label>

        <label className="flex items-center justify-between border border-slate-200 rounded p-3">
          <span>
            <span className="font-bold text-slate-700 block">模型 Thinking 模式</span>
            <span className="text-[11px] text-slate-400">控制模型是否进入深度思考。关闭后要求模型直接回答。</span>
          </span>
          <input type="checkbox" checked={enableThinking} onChange={(event) => setEnableThinking(event.target.checked)} />
        </label>

        <div>
          <h4 className="font-bold text-slate-700 mb-2 flex items-center">
            <Database className="w-3.5 h-3.5 mr-1 text-blue-500" />
            引用知识库
          </h4>
          <div className="space-y-2">
            {knowledgeBases.map((kb) => (
              <label key={kb.id} className="flex items-center gap-2 border border-slate-200 rounded p-2">
                <input
                  type="checkbox"
                  checked={selectedKnowledgeBaseIds.includes(kb.id)}
                  onChange={(event) => {
                    setSelectedKnowledgeBaseIds((items) =>
                      event.target.checked ? [...items, kb.id] : items.filter((item) => item !== kb.id),
                    );
                  }}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-700 truncate">{kb.name}</span>
                  <span className="text-[10px] text-slate-400">文件数 {kb.fileCount} / {kb.status}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  help,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  help: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-slate-700">{label}</span>
        <span className="font-mono text-slate-500">{value}</span>
      </div>
      <input className="w-full" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <p className="text-[11px] leading-4 text-slate-400 mt-1">{help}</p>
    </div>
  );
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

type ContextUsageState =
  | { status: 'idle' | 'loading' | 'unavailable' }
  | { status: 'ready'; usedTokens: number; maxTokens: number; percent: number; model: string; messageCount: number; source: string };

function ContextUsageIndicator({ usage }: { usage: ContextUsageState }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const ratio = usage.status === 'ready' && usage.maxTokens > 0 ? Math.min(1, usage.usedTokens / usage.maxTokens) : 0;
  const strokeDashoffset = circumference * (1 - ratio);
  const color = ratio >= 0.9 ? '#dc2626' : ratio > 0.7 ? '#f59e0b' : '#2563eb';
  const title =
    usage.status === 'ready'
      ? [`Context usage: ${usage.percent}%`, `Used: ${usage.usedTokens} / ${usage.maxTokens} tokens`, `Model: ${usage.model}`, `API messages: ${usage.messageCount}`, `Source: ${usage.source}`].join('\n')
      : usage.status === 'loading'
        ? 'Loading exact context usage from model tokenizer API'
        : 'Exact context usage unavailable';

  return (
    <div className="relative w-8 h-8 grid place-items-center text-slate-500" title={title}>
      <svg viewBox="0 0 24 24" className="absolute inset-0 w-8 h-8 -rotate-90">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300"
        />
      </svg>
      <Gauge className="w-3.5 h-3.5 relative" />
    </div>
  );
}

function exportMarkdown(message: ChatMessage) {
  const citations = message.citations?.length
    ? `\n\n## 引用\n${message.citations.map((citation, index) => `${index + 1}. ${citation.title} (${citation.knowledgeBaseName}, ${citation.similarity}%)\n\n> ${citation.excerpt}`).join('\n\n')}`
    : '';
  const markdown = `# ${message.model ?? 'AI 回答'}\n\n${message.content}${citations}\n`;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `answer-${message.id}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatMetric(value?: number, suffix = '') {
  return typeof value === 'number' && value > 0 ? `${value}${suffix}` : '-';
}

const TOKEN_METRIC_TITLE = 'Token values use model API usage when available. If stream usage is missing, the backend falls back to an approximate local estimate.';

function formatDuration(ms?: number) {
  if (typeof ms !== 'number' || ms <= 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function splitThinking(content: string, reasoning?: string | null, includeThinking = true) {
  const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (!thinkMatch) return { thinking: includeThinking ? (reasoning ?? '') : '', answer: content };
  const answer = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
  if (!includeThinking) return { thinking: '', answer };
  const thinking = [reasoning, thinkMatch[1]]
    .filter((item): item is string => Boolean(item?.trim()))
    .join('\n\n')
    .trim();
  return { thinking, answer };
}

function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  onFeedback,
  isUpdating,
  showThinking,
}: {
  message: ChatMessage;
  key?: string;
  onEdit: (content: string) => void;
  onRegenerate: () => void;
  onFeedback: (feedback: 'like' | 'dislike') => void;
  isUpdating?: boolean;
  showThinking: boolean;
}) {
  const isUser = message.role === 'user';
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(message.content);
  const parsed = splitThinking(message.content, message.reasoning, showThinking);
  const visibleContent = isUser ? message.content : parsed.answer;
  const thinking = isUser ? '' : parsed.thinking;

  return (
    <div className={cn('flex gap-3 w-full', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && <div className="w-8 h-8 rounded shrink-0 text-center leading-8 text-xs font-bold bg-blue-100 text-blue-600 border border-blue-200">AI</div>}

      <div className={cn('p-3 rounded-lg text-sm max-w-[78%] shadow-sm', isUser ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-800')}>
        {!isUser && message.model && <div className="text-[10px] text-blue-600 font-bold mb-2">{message.model}</div>}

        {!isUser && isUpdating && (
          <div className="mb-2 flex items-center gap-2 rounded border border-blue-100 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在重新生成答案...
          </div>
        )}

        {!isUser && thinking && (
          <div className="mb-3 border border-slate-200 rounded bg-slate-50">
            <button onClick={() => setThinkingOpen(!thinkingOpen)} className="w-full px-2 py-1.5 text-xs font-semibold text-slate-600 flex items-center">
              {thinkingOpen ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
              思考过程
            </button>
            {thinkingOpen && <div className="px-3 pb-3 text-xs leading-5 text-slate-600 whitespace-pre-wrap">{thinking}</div>}
          </div>
        )}

        {message.imageDataUrls && message.imageDataUrls.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {message.imageDataUrls.map((url, index) => (
              <img key={`${message.id}-${index}`} src={url} alt={`uploaded ${index + 1}`} className="max-h-40 rounded border border-slate-200 object-cover" />
            ))}
          </div>
        )}

        {isUser && editing ? (
          <div className="space-y-2">
            <textarea
              className="w-full min-w-[280px] rounded border border-blue-200 bg-white p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-300"
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
            />
            <div className="flex gap-2 text-xs">
              <button
                className="rounded bg-white px-2 py-1 font-semibold text-blue-700"
                onClick={() => {
                  setEditing(false);
                  onEdit(draftContent);
                }}
              >
                保存
              </button>
              <button
                className="rounded bg-blue-500/40 px-2 py-1 text-white"
                onClick={() => {
                  setDraftContent(message.content);
                  setEditing(false);
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">{visibleContent}</div>
        )}

        {message.citations && message.citations.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center">
              <Search className="w-3.5 h-3.5 mr-1 text-blue-500" />
              检索到 {message.citations.length} 处真实引用
            </p>
            <div className="space-y-2">
              {message.citations.map((citation) => (
                <div key={citation.id} className="bg-slate-50 border border-slate-200 rounded p-2">
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-slate-700 text-xs">{citation.title}</span>
                    <span className="text-[10px] text-blue-600">{citation.similarity}%</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{citation.knowledgeBaseName}</div>
                  <p className="text-xs text-slate-600 mt-1 leading-5">{citation.excerpt}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={cn('flex flex-wrap items-center gap-3 mt-3 text-[11px]', isUser ? 'text-blue-100' : 'text-slate-400')}>
          {isUser ? (
            <>
              <button onClick={onRegenerate} className="hover:underline inline-flex items-center gap-1">
                <RefreshCcw className="w-3 h-3" />
                重新生成
              </button>
              <button onClick={() => setEditing(true)} className="hover:underline inline-flex items-center gap-1">
                <Edit3 className="w-3 h-3" />
                编辑
              </button>
              <button onClick={() => copyText(message.content)} className="hover:underline inline-flex items-center gap-1">
                <Copy className="w-3 h-3" />
                复制
              </button>
            </>
          ) : (
            <>
              <button onClick={onRegenerate} className="hover:text-blue-600 inline-flex items-center gap-1">
                <RefreshCcw className="w-3 h-3" />
                重新生成
              </button>
              <button onClick={() => copyText(visibleContent)} className="hover:text-blue-600 inline-flex items-center gap-1">
                <Copy className="w-3 h-3" />
                复制
              </button>
              <button onClick={() => exportMarkdown(message)} className="hover:text-blue-600 inline-flex items-center gap-1">
                <Download className="w-3 h-3" />
                导出为 Markdown
              </button>
              <button onClick={() => onFeedback('like')} className={cn('hover:text-blue-600', message.feedback === 'like' && 'text-blue-600')} title="有帮助"><ThumbsUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => onFeedback('dislike')} className={cn('hover:text-red-600', message.feedback === 'dislike' && 'text-red-600')} title="无帮助"><ThumbsDown className="w-3.5 h-3.5" /></button>
            </>
          )}
        </div>

        {!isUser && (
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400 border-t border-slate-100 pt-2">
            <span>回答时间 {formatDuration(message.responseTimeMs)}</span>
            <span>首字时延 {formatDuration(message.firstTokenLatencyMs)}</span>
            <span title={TOKEN_METRIC_TITLE}>输入 {formatMetric(message.inputTokens)} tokens</span>
            <span title={TOKEN_METRIC_TITLE}>输出 {formatMetric(message.outputTokens)} tokens</span>
            <span>速度 {formatMetric(message.tokensPerSecond, ' tokens/s')}</span>
          </div>
        )}
      </div>

      {isUser && <div className="w-8 h-8 rounded shrink-0 text-center leading-8 text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">我</div>}
    </div>
  );
}
