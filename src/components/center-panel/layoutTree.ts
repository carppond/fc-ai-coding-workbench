/* ── 终端分屏二叉树布局 ─────────────────────────────── */

// 叶子节点：一个终端 pane
export interface LayoutLeaf {
  type: "leaf";
  paneId: string;
  alive: boolean;
  cwd?: string;
}

// 分裂节点：将空间一分为二
export interface LayoutSplit {
  type: "split";
  id: string;       // 拖拽时定位用
  direction: "horizontal" | "vertical";
  ratio: number;    // 0~1，左/上子节点占比
  children: [LayoutNode, LayoutNode];
}

export type LayoutNode = LayoutLeaf | LayoutSplit;

let splitIdCounter = 0;
function nextSplitId(): string {
  splitIdCounter += 1;
  return `split-${splitIdCounter}`;
}

/* ── 统计叶子数量 ── */
export function countLeaves(node: LayoutNode): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.children[0]) + countLeaves(node.children[1]);
}

/* ── 获取所有叶子 paneId ── */
export function getAllPaneIds(node: LayoutNode): string[] {
  if (node.type === "leaf") return [node.paneId];
  return [...getAllPaneIds(node.children[0]), ...getAllPaneIds(node.children[1])];
}

/* ── 在指定叶子处拆分，返回新树 ── */
export function splitLeaf(
  root: LayoutNode,
  targetPaneId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
  cwd?: string,
): LayoutNode {
  if (root.type === "leaf") {
    if (root.paneId !== targetPaneId) return root;
    // 将叶子替换为 split，原叶子在左/上，新叶子在右/下
    return {
      type: "split",
      id: nextSplitId(),
      direction,
      ratio: 0.5,
      children: [
        root,
        { type: "leaf", paneId: newPaneId, alive: true, cwd },
      ],
    };
  }
  // 递归进入子节点
  const newChildren: [LayoutNode, LayoutNode] = [
    splitLeaf(root.children[0], targetPaneId, direction, newPaneId, cwd),
    splitLeaf(root.children[1], targetPaneId, direction, newPaneId, cwd),
  ];
  if (newChildren[0] === root.children[0] && newChildren[1] === root.children[1]) return root;
  return { ...root, children: newChildren };
}

/* ── 删除叶子，提升兄弟节点 ── */
// 返回 null 表示整棵树被删空（最后一个叶子）
export function removeLeaf(root: LayoutNode, targetPaneId: string): LayoutNode | null {
  if (root.type === "leaf") {
    return root.paneId === targetPaneId ? null : root;
  }
  const left = removeLeaf(root.children[0], targetPaneId);
  const right = removeLeaf(root.children[1], targetPaneId);
  // 两边都没变化
  if (left === root.children[0] && right === root.children[1]) return root;
  // 左边被删 → 提升右边
  if (left === null) return right;
  // 右边被删 → 提升左边
  if (right === null) return left;
  // 某个子树变了但都还在
  return { ...root, children: [left, right] };
}

/* ── 更新 split 节点的 ratio ── */
export function updateRatio(root: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (root.type === "leaf") return root;
  if (root.id === splitId) return { ...root, ratio };
  const newChildren: [LayoutNode, LayoutNode] = [
    updateRatio(root.children[0], splitId, ratio),
    updateRatio(root.children[1], splitId, ratio),
  ];
  if (newChildren[0] === root.children[0] && newChildren[1] === root.children[1]) return root;
  return { ...root, children: newChildren };
}

/* ── 更新叶子存活状态 ── */
export function updateLeafAlive(root: LayoutNode, paneId: string, alive: boolean): LayoutNode {
  if (root.type === "leaf") {
    if (root.paneId !== paneId) return root;
    return { ...root, alive };
  }
  const newChildren: [LayoutNode, LayoutNode] = [
    updateLeafAlive(root.children[0], paneId, alive),
    updateLeafAlive(root.children[1], paneId, alive),
  ];
  if (newChildren[0] === root.children[0] && newChildren[1] === root.children[1]) return root;
  return { ...root, children: newChildren };
}

/* ── 替换叶子（重启 pane 用）── */
export function replaceLeaf(root: LayoutNode, oldPaneId: string, newPaneId: string): LayoutNode {
  if (root.type === "leaf") {
    if (root.paneId !== oldPaneId) return root;
    return { ...root, paneId: newPaneId, alive: true };
  }
  const newChildren: [LayoutNode, LayoutNode] = [
    replaceLeaf(root.children[0], oldPaneId, newPaneId),
    replaceLeaf(root.children[1], oldPaneId, newPaneId),
  ];
  if (newChildren[0] === root.children[0] && newChildren[1] === root.children[1]) return root;
  return { ...root, children: newChildren };
}

/* ── 查找叶子的 cwd ── */
export function findLeafCwd(root: LayoutNode, paneId: string): string | undefined {
  if (root.type === "leaf") {
    return root.paneId === paneId ? root.cwd : undefined;
  }
  return findLeafCwd(root.children[0], paneId) ?? findLeafCwd(root.children[1], paneId);
}

/* ── 查找叶子是否存活 ── */
export function isLeafAlive(root: LayoutNode, paneId: string): boolean {
  if (root.type === "leaf") {
    return root.paneId === paneId ? root.alive : false;
  }
  return isLeafAlive(root.children[0], paneId) || isLeafAlive(root.children[1], paneId);
}

/* ── 4-pane 2x2 联动检测 ──
 * 当根是 vertical split，且两个子节点都是同方向的 horizontal split 时，
 * 拖拽其中一个 horizontal split 的分割线应联动另一个。
 * 反向同理（根 horizontal，子节点都 vertical）。
 * 返回联动 splitId 或 null。
 */
export function findLinkedSplit(root: LayoutNode, splitId: string): string | null {
  if (root.type !== "split") return null;
  const [c0, c1] = root.children;
  if (c0.type !== "split" || c1.type !== "split") return null;
  // 两个子 split 方向相同，且与根方向垂直
  if (c0.direction !== c1.direction) return null;
  if (c0.direction === root.direction) return null;
  if (c0.id === splitId) return c1.id;
  if (c1.id === splitId) return c0.id;
  return null;
}
