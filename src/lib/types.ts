export interface Project {
  id: string;
  path: string;
  name: string;
  last_opened: number;
  settings_json: string;
}

export interface Session {
  id: string;
  project_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  pinned: boolean;
  tags_json: string;
}

export interface Thread {
  id: string;
  session_id: string;
  title: string;
  provider: string;
  last_model: string;
  last_mode: string;
  created_at: number;
  updated_at: number;
  source_thread_id: string | null;
  handoff_meta_json: string;
  pinned: boolean;
}

export interface Message {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: number;
  provider: string;
  model: string;
  mode: string;
  meta_json: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: DirEntry[] | null;
}

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface GitBranchInfo {
  name: string;
  remote: string | null;
  ahead: number;
  behind: number;
  is_detached: boolean;
}

export interface BranchListItem {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  upstream: string | null;
}

export interface StashEntry {
  index: number;
  message: string;
  timestamp: number;
}

export interface TagEntry {
  name: string;
  message: string | null;
  hash: string;
  timestamp: number;
  is_annotated: boolean;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  error: string | null;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  models: ModelConfig[];
}

export interface ModelConfig {
  id: string;
  name: string;
  modes: string[];
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      { id: "claude-opus-4", name: "Claude Opus 4", modes: ["code", "ask", "architect"] },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4", modes: ["code", "ask", "architect"] },
      { id: "claude-haiku-3.5", name: "Claude Haiku 3.5", modes: ["code", "ask", "architect"] },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4.1", name: "GPT-4.1", modes: ["code", "ask", "architect"] },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", modes: ["code", "ask", "architect"] },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", modes: ["code", "ask", "architect"] },
      { id: "o3", name: "o3", modes: ["code", "ask", "architect"] },
      { id: "o4-mini", name: "o4-mini", modes: ["code", "ask", "architect"] },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "anthropic/claude-opus-4", name: "Claude Opus 4", modes: ["code", "ask", "architect"] },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", modes: ["code", "ask", "architect"] },
      { id: "openai/gpt-4.1", name: "GPT-4.1", modes: ["code", "ask", "architect"] },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", modes: ["code", "ask", "architect"] },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", modes: ["code", "ask", "architect"] },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1", modes: ["code", "ask", "architect"] },
    ],
  },
];
