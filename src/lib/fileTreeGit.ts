import type { GitFileStatus } from "./types";

/** Relative paths use the backend's slash-separated format. A backslash alone
 * is not evidence of Windows: it is a legal POSIX filename character. */
function isWindowsPath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || /^(?:\\\\|\/\/)[^\\/]+[\\/]/.test(path);
}

function rootLength(path: string, windows: boolean): number {
  if (!windows) return path.startsWith("/") ? 1 : 0;
  const slashPath = path.replace(/\\/g, "/");
  const root = slashPath.match(/^(?:\/\/\?\/)?[a-z]:\/|^\/\/(?:\?\/UNC\/)?[^/]+\/[^/]+(?:\/|$)/i);
  return root?.[0].length ?? 0;
}

export function fileNameFromPath(path: string): string {
  const windows = isWindowsPath(path);
  const trimmed = path.replace(windows ? /[\\/]+$/ : /\/+$/, "");
  if (!trimmed) return path;
  const separator = windows ? Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) : trimmed.lastIndexOf("/");
  // A drive root has no basename; retain its absolute spelling for display.
  if (windows && /^(?:[\\/]{2}\?[\\/])?[a-z]:$/i.test(trimmed)) return path;
  return trimmed.slice(separator + 1);
}

/** Keep roots absolute and preserve the original spelling for filesystem IO. */
export function parentDirectory(path: string): string {
  const windows = isWindowsPath(path);
  const root = rootLength(path, windows);
  let end = path.length;
  while (end > root && (path[end - 1] === "/" || (windows && path[end - 1] === "\\"))) end--;
  const trimmed = path.slice(0, end);
  const separator = windows ? Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) : trimmed.lastIndexOf("/");
  return path.slice(0, Math.max(root, separator));
}

/** Join backend/Git relative paths without folding the real path's case or
 * removing verbatim prefixes. Windows verbatim paths require backslashes. */
export function joinProjectPath(root: string, relative: string): string {
  if (!relative) return root;
  if (isWindowsPath(root)) {
    return `${root.replace(/[\\/]+$/, "").replace(/\//g, "\\")}\\${relative.replace(/^[\\/]+/, "").replace(/\//g, "\\")}`;
  }
  if (!root) return relative;
  return `${root.replace(/\/+$/, "")}/${relative.replace(/^\/+/, "")}`;
}

/** Comparison only: never pass this key to a filesystem or terminal command. */
export function normalizePathKey(path: string): string {
  if (!isWindowsPath(path)) return path.replace(/\/+$/, "") || "/";
  let key = path.replace(/\\/g, "/");
  if (/^\/\/\?\/UNC\//i.test(key)) key = `//${key.slice(8)}`;
  else if (/^\/\/\?\/[a-z]:\//i.test(key)) key = key.slice(4);
  key = key.replace(/\/+$/, "").toLowerCase();
  return /^[a-z]:$/.test(key) ? `${key}/` : key;
}

/** Nested projects belong to the most specific root, never a prefix sibling. */
export function findProjectRoot(roots: Iterable<string>, filePath: string): string | undefined {
  const path = normalizePathKey(filePath);
  const windows = isWindowsPath(filePath);
  let owner: string | undefined;
  let ownerLength = -1;
  for (const root of roots) {
    if (isWindowsPath(root) !== windows) continue;
    const key = normalizePathKey(root);
    const prefix = key.endsWith("/") ? key : `${key}/`;
    if ((path === key || path.startsWith(prefix)) && key.length > ownerLength) {
      owner = root;
      ownerLength = key.length;
    }
  }
  return owner;
}

export function buildGitDecorations(
  projectPath: string,
  statuses: readonly GitFileStatus[],
): { gitStatusMap: Map<string, GitFileStatus>; gitDirtyDirs: Set<string> } {
  const gitStatusMap = new Map<string, GitFileStatus>();
  const gitDirtyDirs = new Set<string>();
  const root = normalizePathKey(projectPath);
  const prefix = root.endsWith("/") ? root : `${root}/`;
  for (const status of statuses) {
    const path = normalizePathKey(joinProjectPath(projectPath, status.path));
    const previous = gitStatusMap.get(path);
    // Conflict > unstaged worktree change > index-only change, regardless of
    // the order in which Git supplies its two entries for the same file.
    if (!previous || (previous.status !== "conflicted"
      && (status.status === "conflicted" || (previous.staged && !status.staged)))) {
      gitStatusMap.set(path, status);
    }
    let parent = path;
    while (parent !== root) {
      const next = parentDirectory(parent);
      if (next === parent || !next) break;
      parent = normalizePathKey(next);
      if (parent !== root && !parent.startsWith(prefix)) break;
      gitDirtyDirs.add(parent);
    }
  }
  return { gitStatusMap, gitDirtyDirs };
}
