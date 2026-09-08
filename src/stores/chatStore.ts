import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { Message, StreamChunk, ChatMessage } from "../lib/types";
import * as ipc from "../ipc/commands";

type ChatStatus = "idle" | "sending" | "streaming" | "stopping" | "error";

// ── 模块级内部状态（不放 Zustand，避免无意义重渲染） ──
// 单调递增的代数：每次 sendMessage +1，旧 listener 回调检测到代数不匹配就忽略
let _generation = 0;
// 当前活跃的 batchTimer，clearMessages / stopStreaming 可清除
let _batchTimer: ReturnType<typeof setTimeout> | null = null;

/** 清理当前流式会话：unlisten + 清 timer */
function _cleanup(get: () => ChatState) {
  const { unlistenFn } = get();
  if (unlistenFn) unlistenFn();
  if (_batchTimer) {
    clearTimeout(_batchTimer);
    _batchTimer = null;
  }
}

interface ChatState {
  messages: Message[];
  streamingContent: string;
  status: ChatStatus;
  error: string | null;
  unlistenFn: (() => void) | null;

  loadMessages: (threadId: string) => Promise<void>;
  sendMessage: (
    threadId: string,
    content: string,
    provider: string,
    model: string,
    mode: string,
    baseUrl?: string
  ) => Promise<void>;
  stopStreaming: (threadId: string) => Promise<void>;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streamingContent: "",
  status: "idle",
  error: null,
  unlistenFn: null,

  loadMessages: async (threadId) => {
    try {
      const messages = await ipc.listMessages(threadId);
      set({ messages, streamingContent: "", status: "idle", error: null });
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  },

  sendMessage: async (threadId, content, provider, model, mode, baseUrl) => {
    // ① 递增代数 → 使前一轮所有闭包失效
    const gen = ++_generation;

    // ② 清理前一轮 listener + timer
    _cleanup(get);

    // Save user message to DB
    let userMsg: Message;
    try {
      userMsg = await ipc.createMessage(threadId, "user", content, provider, model, mode);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: `Failed to save message: ${errorMsg}` });
      return;
    }

    // ③ 先设 streaming 状态，再注册 listener
    // （避免 listener 回调里 done→idle 被后续 set 覆盖回 streaming 的竞态）
    set((s) => ({
      messages: [...s.messages, userMsg],
      streamingContent: "",
      status: "streaming",
      error: null,
      unlistenFn: null,
    }));

    // Prepare message history for the API call
    const allMessages: ChatMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Set up streaming listener with batched state updates
    let accumulated = "";
    const flushBatch = () => {
      _batchTimer = null;
      // 代数不匹配 → 这轮已作废
      if (gen !== _generation) return;
      set({ streamingContent: accumulated, status: "streaming" });
    };

    const unlisten = await listen<StreamChunk>(`stream-chunk-${threadId}`, (event) => {
      // 代数不匹配 → 属于上一轮的残留事件，忽略
      if (gen !== _generation) return;

      const chunk = event.payload;
      if (chunk.error) {
        if (_batchTimer) { clearTimeout(_batchTimer); _batchTimer = null; }
        set({ status: "error", error: chunk.error, streamingContent: accumulated });
        return;
      }
      if (chunk.done) {
        if (_batchTimer) { clearTimeout(_batchTimer); _batchTimer = null; }
        // Save assistant message to DB
        if (accumulated) {
          ipc
            .createMessage(threadId, "assistant", accumulated, provider, model, mode)
            .then((assistantMsg) => {
              if (gen !== _generation) return;
              set((s) => ({
                messages: [...s.messages, assistantMsg],
                streamingContent: "",
                status: "idle",
                unlistenFn: null,
              }));
            })
            .catch((e) => {
              console.error("Failed to save assistant message:", e);
              if (gen !== _generation) return;
              set({ streamingContent: "", status: "idle", unlistenFn: null });
            });
        } else {
          set({ streamingContent: "", status: "idle", unlistenFn: null });
        }
        return;
      }
      accumulated += chunk.delta;
      if (!_batchTimer) {
        _batchTimer = setTimeout(flushBatch, 150);
      }
    });

    // ④ 注册完成后再存 unlistenFn（此时 status 已经是 streaming，无覆盖风险）
    // 如果在 await listen 期间代数已变（并发 sendMessage），丢弃这个 listener
    if (gen !== _generation) {
      unlisten();
      return;
    }
    set({ unlistenFn: unlisten });

    try {
      await ipc.sendMessage(threadId, allMessages, provider, model, mode, baseUrl);
    } catch (e: unknown) {
      if (gen !== _generation) return;
      const errorMsg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: errorMsg });
    }
  },

  stopStreaming: async (threadId) => {
    // 清理 listener + timer，确保即使后端不再 emit done 也能回到 idle
    _cleanup(get);
    set({ status: "stopping", unlistenFn: null });
    try {
      await ipc.stopStreaming(threadId);
    } catch (e) {
      console.error("Failed to stop streaming:", e);
    }
    // 无论后端是否响应，都回到 idle（防止卡死）
    if (get().status === "stopping") {
      set({ status: "idle", streamingContent: "" });
    }
  },

  clearMessages: () => {
    _cleanup(get);
    set({ messages: [], streamingContent: "", status: "idle", error: null, unlistenFn: null });
  },
}));
