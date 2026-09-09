import type { GitFileStatus } from "./types";

/** A shared key for native Windows paths and slash-separated Git paths. */
export function normalizePathKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
}

/** Nested projects belong to the most specific root, never a prefix sibling. */
export function findProjectRoot(roots: Iterable<string>, filePath: string): string | undefined {
  const path = normalizePathKey(filePath);
  let owner: string | undefined;
  let ownerLength = -1;
  for (const root of roots) {
    const key = normalizePathKey(root);
    const prefix = key === "/" ? "/" : `${key}/`;
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
  const prefix = root === "/" ? "/" : `${root}/`;
  for (const status of statuses) {
    const path = normalizePathKey(`${prefix}${status.path}`);
    const previous = gitStatusMap.get(path);
    // Conflict > unstaged worktree change > index-only change, regardless of
    // the order in which Git supplies its two entries for the same file.
    if (!previous || (previous.status !== "conflicted"
      && (status.status === "conflicted" || (previous.staged && !status.staged)))) {
      gitStatusMap.set(path, status);
    }
    let parent = path;
    while (parent !== root) {
      const separator = parent.lastIndexOf("/");
      if (separator < 0) break;
      parent = normalizePathKey(parent.slice(0, separator));
      if (parent !== root && !parent.startsWith(prefix)) break;
      gitDirtyDirs.add(parent);
    }
  }
  return { gitStatusMap, gitDirtyDirs };
}
