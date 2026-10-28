"use client";

// 상세 패널 맨 아래 '복제해서 새 사업' — 같은 고객·관계사·규모로 발굴 단계 새 사업을 만들고 그 사업을 연다
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copyDeal } from "./mutations";

export function CopyDealButton({ dealId, name }: { dealId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`'${name}' 을(를) 복제해 새 사업을 만들까요?\n고객사·관계사·규모·GP·품목을 그대로 가져오고, 단계는 발굴, 기간·업무·기록은 비웁니다. 담당자는 나입니다.`)) return;
          start(async () => {
            const r = await copyDeal(dealId);
            if (!r.ok) return setError(r.error);
            setError(null);
            if (r.dealId) router.push(`/dashboard?focus=d:${r.dealId}`);
          });
        }}
        className="w-full rounded-lg border border-line px-3 py-2 text-xs text-muted hover:border-accent/40 hover:text-fg disabled:opacity-40"
      >
        {pending ? "만드는 중…" : "복제해서 새 사업 만들기"}
      </button>
      {error && <p className="text-[11px] text-st-red">{error}</p>}
    </div>
  );
}
