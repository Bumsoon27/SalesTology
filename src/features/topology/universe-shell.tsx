"use client";

// 대시보드 그래프 + 왼쪽 상세 패널 + 검색.
// 노드를 누르거나, 검색하거나, 티커에서 ?focus=노드id 로 들어오면 그 노드로 이동하고 패널이 열린다.
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Universe } from "./universe";
import { SearchPalette } from "./search-palette";
import { DetailPanel } from "@/features/deals/detail-panel";
import type { UniverseData, UniverseNode } from "./types";

export function UniverseShell({ data, expandAll }: { data: UniverseData; expandAll: boolean }) {
  const focus = useSearchParams().get("focus");
  // 사용자가 고른 노드는 그때의 focus 값과 함께 기억한다 → 티커로 focus 가 바뀌면 그쪽이 우선
  const [picked, setPicked] = useState<{ id: string | null; via: string | null; fly: boolean } | null>(null);
  const selectedId = picked && picked.via === focus ? picked.id : focus;
  const selected = data.nodes.find((n) => n.id === selectedId && n.kind !== "me") ?? null;
  // 클릭은 이미 보이는 노드라 이동하지 않고, 검색·티커는 이동한다
  const flyId = picked && picked.via === focus ? (picked.fly ? picked.id : null) : focus;

  const onSelect = useCallback((n: UniverseNode) => setPicked({ id: n.kind === "me" ? null : n.id, via: focus, fly: false }), [focus]);
  const onSearch = useCallback((n: UniverseNode) => setPicked({ id: n.id, via: focus, fly: true }), [focus]);

  return (
    <>
      <div className="absolute inset-0">
        <Universe data={data} expandAll={expandAll} onSelect={onSelect} focusId={flyId} />
      </div>
      <div className="absolute left-4 top-4 z-10">
        <SearchPalette nodes={data.nodes} onPick={onSearch} />
      </div>
      <DetailPanel node={selected} onClose={() => setPicked({ id: null, via: focus, fly: false })} />
    </>
  );
}
