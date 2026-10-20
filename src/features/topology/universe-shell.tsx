"use client";

// 우주 + 왼쪽 상세 패널을 묶는다. 노드를 누르면 패널이 열린다.
import { useCallback, useState } from "react";
import { Universe } from "./universe";
import { DetailPanel } from "@/features/deals/detail-panel";
import type { UniverseData, UniverseNode } from "./types";

export function UniverseShell({ data, expandAll }: { data: UniverseData; expandAll: boolean }) {
  const [selected, setSelected] = useState<UniverseNode | null>(null);
  const onSelect = useCallback((n: UniverseNode) => setSelected(n.kind === "me" ? null : n), []);

  return (
    <>
      <div className="absolute inset-0">
        <Universe data={data} expandAll={expandAll} onSelect={onSelect} />
      </div>
      <DetailPanel node={selected} onClose={() => setSelected(null)} />
    </>
  );
}
