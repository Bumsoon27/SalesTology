"use client";

// 파트너사 목록 + 보기 범위 탭 (부문 전체 / 내 사업 관련 / SOS 인바운드).
// 목록은 한 번에 받아 화면에서 바로 거른다 → 탭을 누르면 즉시 바뀐다.
// 주소(?scope=mine|sos)는 처음 열 때만 읽는다 (링크로 특정 탭을 열 때). 탭을 누르면 화면 상태만 바뀐다.
import Link from "next/link";
import { useState } from "react";
import { inScope, PARTNER_SCOPES, type PartnerScope } from "./count";
import type { Partner } from "./queries";

const ROLE_LABEL = { customer: "고객사", si: "매출처(SI)", supplier: "매입처" } as const;
const SCOPE_LABEL: Record<PartnerScope, string> = { all: "부문 전체", mine: "내 사업 관련", sos: "SOS 인바운드" };
const SCOPE_HINT: Record<PartnerScope, string> = {
  all: "같은 부문 모두의 사업 기준입니다",
  mine: "내가 영업대표인 사업 — 대시보드와 같은 기준",
  sos: "SOS 시그널(리드)에서 사업으로 전환된 사업에 연결된 회사",
};
const EMPTY: Record<PartnerScope, string> = {
  all: "아직 등록된 파트너사가 없습니다. 왼쪽에서 자주 함께하는 고객사·SI·매입처를 먼저 등록해 두세요.",
  mine: "내 사업에 연결된 파트너사가 없습니다.",
  sos: "SOS 에서 전환된 사업이 아직 없습니다.",
};

export function PartnerBrowser({ partners, initialScope }: { partners: Partner[]; initialScope: PartnerScope }) {
  const [scope, setScope] = useState<PartnerScope>(initialScope);
  const shown = partners.filter((p) => inScope(p, scope));

  const pick = (s: PartnerScope) => setScope(s);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="보기 범위" className="inline-flex rounded-lg border border-line p-0.5">
          {PARTNER_SCOPES.map((s) => {
            const on = s === scope;
            const n = partners.filter((p) => inScope(p, s)).length;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? s === "sos"
                      ? "bg-[#ff6a0d]/20 text-[#ffb27f] ring-1 ring-[#ff6a0d]/50"
                      : "bg-accent/20 text-fg ring-1 ring-accent/50"
                    : "text-muted hover:bg-white/[0.06] hover:text-fg"
                }`}
              >
                {SCOPE_LABEL[s]} <span className={on ? "" : "opacity-70"}>{n}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted">{SCOPE_HINT[scope]}</p>
      </div>

      {/* 무엇이 걸러졌는지 — 전체와 1~2곳만 차이 나면 바뀐 걸 알아보기 어려웠다 */}
      {scope !== "all" && partners.length > shown.length && (
        <p className="text-[11px] text-muted">
          {shown.length}곳 표시 · {partners.length - shown.length}곳 숨김
          {scope === "mine" ? " (다른 사람 사업에만 연결된 회사·사업 없는 회사)" : " (SOS 에서 들어온 사업이 없는 회사)"}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">{EMPTY[scope]}</div>
      ) : (
        <ul key={scope} className="grid animate-[fadeIn_.18s_ease-out] gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <PartnerCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PartnerCard({ p }: { p: Partner }) {
  return (
    <li className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/partners/${p.id}`} className="font-medium hover:text-accent hover:underline">
          {p.name} <span aria-hidden className="text-xs text-muted">›</span>
        </Link>
        <span className="shrink-0 text-right text-xs text-muted">
          사업 {p.dealCount}건
          {p.dealCount > 0 && (
            <span className="block text-[10px]">
              내 사업 {p.myDealCount}
              {p.sosDealCount > 0 && <span className="text-[#ff9a5c]"> · SOS 전환 {p.sosDealCount}</span>}
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.roles.map((r) => (
          <span key={r} className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
            {ROLE_LABEL[r]}
          </span>
        ))}
        {p.sosDealCount > 0 && (
          <span className="rounded-full border border-[#ff6a0d]/50 bg-[#ff6a0d]/10 px-2 py-0.5 text-[11px] text-[#ff9a5c]">SOS</span>
        )}
      </div>
      {(p.contactName || p.contactInfo) && (
        <p className="mt-3 text-xs text-muted">{[p.contactName, p.contactInfo].filter(Boolean).join(" · ")}</p>
      )}
      {p.memo && <p className="mt-1 text-xs text-muted">{p.memo}</p>}
    </li>
  );
}
