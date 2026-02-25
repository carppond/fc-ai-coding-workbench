import { create } from "zustand";
import type { Session, Thread } from "../lib/types";
import * as ipc from "../ipc/commands";

interface SessionState {
  sessions: Session[];
  activeSession: Session | null;
  threadsBySession: Record<string, Thread[]>;
  activeThread: Thread | null;
  loading: boolean;

  loadSessions: (projectId: string) => Promise<void>;
  loadAllSessions: () => Promise<void>;
  createSession: (projectId: string, title: string) => Promise<Session>;
  setActiveSession: (session: Session) => Promise<void>;
  updateSession: (id: string, title?: string, pinned?: boolean) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  loadThreads: (sessionId: string) => Promise<void>;
  createThread: (
    sessionId: string,
    title: string,
    provider: string,
    model: string,
    mode: string,
    sourceThreadId?: string,
    handoffMetaJson?: string
  ) => Promise<Thread>;
  setActiveThread: (thread: Thread) => void;
  updateThread: (id: string, title?: string, lastModel?: string, lastMode?: string, pinned?: boolean) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSession: null,
  threadsBySession: {},
  activeThread: null,
  loading: false,

  loadSessions: async (projectId) => {
    set({ loading: true });
    try {
      const sessions = await ipc.listSessions(projectId);
      set({ sessions, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  loadAllSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await ipc.listAllSessions();
      set({ sessions, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createSession: async (projectId, title) => {
    const session = await ipc.createSession(projectId, title);
    set((s) => ({ sessions: [session, ...s.sessions] }));
    return session;
  },

  setActiveSession: async (session) => {
    set({ activeSession: session });
    await get().loadThreads(session.id);
  },

  updateSession: async (id, title, pinned) => {
    await ipc.updateSession(id, title, pinned);
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id
          ? { ...sess, ...(title !== undefined && { title }), ...(pinned !== undefined && { pinned }) }
          : sess
      ),
      activeSession: s.activeSession?.id === id
        ? { ...s.activeSession, ...(title !== undefined && { title }), ...(pinned !== undefined && { pinned }) }
        : s.activeSession,
    }));
  },

  deleteSession: async (id) => {
    await ipc.deleteSession(id);
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSession: s.activeSession?.id === id ? null : s.activeSession,
      activeThread: s.activeSession?.id === id ? null : s.activeThread,
    }));
  },

  loadThreads: async (sessionId) => {
    const threads = await ipc.listThreads(sessionId);
    set((s) => ({
      threadsBySession: { ...s.threadsBySession, [sessionId]: threads },
    }));
  },

  createThread: async (sessionId, title, provider, model, mode, sourceThreadId, handoffMetaJson) => {
    const thread = await ipc.createThread(sessionId, title, provider, model, mode, sourceThreadId, handoffMetaJson);
    set((s) => ({
      threadsBySession: {
        ...s.threadsBySession,
        [sessionId]: [thread, ...(s.threadsBySession[sessionId] || [])],
      },
      activeThread: thread,
    }));
    return thread;
  },

  setActiveThread: (thread) => {
    set({ activeThread: thread });
  },

  updateThread: async (id, title, lastModel, lastMode, pinned) => {
    await ipc.updateThread(id, title, lastModel, lastMode, pinned);
    set((s) => {
      const updatedThreadsBySession = { ...s.threadsBySession };
      for (const [sid, threads] of Object.entries(updatedThreadsBySession)) {
        updatedThreadsBySession[sid] = threads.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(title !== undefined && { title }),
                ...(lastModel !== undefined && { last_model: lastModel }),
                ...(lastMode !== undefined && { last_mode: lastMode }),
                ...(pinned !== undefined && { pinned }),
              }
            : t
        );
      }
      return {
        threadsBySession: updatedThreadsBySession,
        activeThread:
          s.activeThread?.id === id
            ? {
                ...s.activeThread,
                ...(title !== undefined && { title }),
                ...(lastModel !== undefined && { last_model: lastModel }),
                ...(lastMode !== undefined && { last_mode: lastMode }),
                ...(pinned !== undefined && { pinned }),
              }
            : s.activeThread,
      };
    });
  },

  deleteThread: async (id) => {
    await ipc.deleteThread(id);
    set((s) => {
      const updatedThreadsBySession = { ...s.threadsBySession };
      for (const [sid, threads] of Object.entries(updatedThreadsBySession)) {
        updatedThreadsBySession[sid] = threads.filter((t) => t.id !== id);
      }
      return {
        threadsBySession: updatedThreadsBySession,
        activeThread: s.activeThread?.id === id ? null : s.activeThread,
      };
    });
  },
}));
