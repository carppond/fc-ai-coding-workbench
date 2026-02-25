import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { Message, StreamChunk, ChatMessage } from "../lib/types";
import * as ipc from "../ipc/commands";

type ChatStatus = "idle" | "sending" | "streaming" | "stopping" | "error";

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
    // Clean up previous listener
    const prev = get().unlistenFn;
    if (prev) prev();

    // Save user message to DB
    let userMsg: Message;
    try {
      userMsg = await ipc.createMessage(threadId, "user", content, provider, model, mode);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: `Failed to save message: ${errorMsg}` });
      return;
    }
    set((s) => ({
      messages: [...s.messages, userMsg],
      streamingContent: "",
      status: "sending",
      error: null,
    }));

    // Prepare message history for the API call
    const allMessages: ChatMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Set up streaming listener
    let accumulated = "";
    const unlisten = await listen<StreamChunk>(`stream-chunk-${threadId}`, (event) => {
      const chunk = event.payload;
      if (chunk.error) {
        set({ status: "error", error: chunk.error, streamingContent: accumulated });
        return;
      }
      if (chunk.done) {
        // Save assistant message to DB
        if (accumulated) {
          ipc
            .createMessage(threadId, "assistant", accumulated, provider, model, mode)
            .then((assistantMsg) => {
              set((s) => ({
                messages: [...s.messages, assistantMsg],
                streamingContent: "",
                status: "idle",
              }));
            })
            .catch((e) => {
              console.error("Failed to save assistant message:", e);
              set({ streamingContent: "", status: "idle" });
            });
        } else {
          set({ streamingContent: "", status: "idle" });
        }
        return;
      }
      accumulated += chunk.delta;
      set({ streamingContent: accumulated, status: "streaming" });
    });

    set({ unlistenFn: unlisten, status: "streaming" });

    try {
      await ipc.sendMessage(threadId, allMessages, provider, model, mode, baseUrl);
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: errorMsg });
    }
  },

  stopStreaming: async (threadId) => {
    set({ status: "stopping" });
    try {
      await ipc.stopStreaming(threadId);
    } catch (e) {
      console.error("Failed to stop streaming:", e);
    }
  },

  clearMessages: () => {
    const prev = get().unlistenFn;
    if (prev) prev();
    set({ messages: [], streamingContent: "", status: "idle", error: null, unlistenFn: null });
  },
}));
