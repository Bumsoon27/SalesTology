// 방사형 궤도 배치 (설계서 §6.3): 서브트리의 보이는 리프 수에 비례해 부채꼴을 나누고,
// 각 노드의 목표 좌표를 자기 부채꼴 가운데·자기 궤도 위에 둔다.
import type { UniverseNode } from "./types";

export type Target = { angle: number; depth: number };

export function computeTargets(nodes: UniverseNode[]): Map<string, Target> {
  const children = new Map<string, UniverseNode[]>();
  let root: UniverseNode | undefined;
  for (const n of nodes) {
    if (!n.parentId) root = n;
    else children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  }
  const targets = new Map<string, Target>();
  if (!root) return targets;

  const leafCount = new Map<string, number>();
  const countLeaves = (n: UniverseNode): number => {
    const kids = children.get(n.id) ?? [];
    const c = kids.length ? kids.reduce((s, k) => s + countLeaves(k), 0) : 1;
    leafCount.set(n.id, c);
    return c;
  };
  countLeaves(root);

  // 궤도는 노드 종류가 아니라 트리 깊이로 정한다 — 부문 보기(부문 → 영업대표 → 고객사 → 사업)도 한 칸씩 밀려 배치된다
  const assign = (n: UniverseNode, start: number, span: number, depth: number) => {
    targets.set(n.id, { angle: start + span / 2, depth: Math.min(depth, 4) });
    const kids = children.get(n.id) ?? [];
    const total = leafCount.get(n.id) ?? 1;
    let cursor = start;
    for (const k of kids) {
      const s = (span * (leafCount.get(k.id) ?? 1)) / total;
      assign(k, cursor, s, depth + 1);
      cursor += s;
    }
  };
  assign(root, -Math.PI / 2, Math.PI * 2, 0);
  return targets;
}

/** 궤도 반지름. 화면 크기에 맞춰 늘고 줄어든다. */
export function orbitRadius(depth: number, scale: number): number {
  return [0, 165, 285, 365, 440][depth] * scale;
}

/** 노드 크기: 연관도(weight)가 클수록 크다 */
export function nodeRadius(n: UniverseNode): number {
  switch (n.kind) {
    case "me":
      return 13;
    case "member":
      return 8;
    case "customer":
      return 4 + 9 * Math.sqrt(n.weight);
    case "deal":
      return 2.4 + 3.6 * Math.sqrt(n.weight);
    default:
      return 1.8;
  }
}
