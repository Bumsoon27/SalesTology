"use client";

// 우주 + 왼쪽 상세 패널을 묶는다. 노드를 누르거나, 티커에서 ?focus=노드id 로 들어오면 패널이 열린다.
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Universe } from "./universe";
import { DetailPanel } from "@/features/deals/detail-panel";
import type { UniverseData, UniverseNode } from "./types";

export function UniverseShell({ data, expandAll }: { data: UniverseData; expandAll: boolean }) {
  const focus = useSearchParams().get("focus");
  // 사용자가 고른 노드는 그때의 focus 값과 함께 기억한다 → 티커로 focus 가 바뀌면 그쪽이 우선
  const [picked, setPicked] = useState<{ id: string | null; via: string | null } | null>(null);
  const selectedId = picked && picked.via === focus ? picked.id : focus;
  const selected = data.nodes.find((n) => n.id === selectedId && n.kind !== "me") ?? null;

  const onSelect = useCallback((n: UniverseNode) => setPicked({ id: n.kind === "me" ? null : n.id, via: focus }), [focus]);

  return (
    <>
      <div className="absolute inset-0">
        <Universe data={data} expandAll={expandAll} onSelect={onSelect} />
      </div>
      <DetailPanel node={selected} onClose={() => setPicked({ id: null, via: focus })} />
    </>
  );
}
