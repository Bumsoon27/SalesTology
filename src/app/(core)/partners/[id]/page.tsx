import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { getCompanyDetail } from "@/features/partners/queries";
import { isOpenDeal, isWonDeal, summarizeCompany, type CompanyRole } from "@/features/partners/detail";
import { relationshipStrength, TIER_LABEL, type Interaction } from "@/features/deals/relationship";
import { NOTE_LABEL } from "@/features/deals/notes";
import { STAGE_LABEL } from "@/features/deals/types";
import { todayInSeoul } from "@/features/deals/status";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_LABEL: Record<CompanyRole, string> = { customer: "고객사", si: "매출처(SI)", supplier: "매입처" };
const TIER_COLOR = { strong: "text-st-green", medium: "text-accent", weak: "text-st-yellow", cold: "text-muted" } as const;

// 고객사(파트너사) 상세 — 걸린 사업·실적·최근 활동 기록·관계 강도를 한 화면에 (Salesforce Account 화면 참고)
export default function CompanyPage({ params }: PageProps<"/partners/[id]">) {
  return (
    <>
      <AppHeader active="core" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<p className="p-10 text-center text-sm text-muted">불러오는 중…</p>}>
          <Company params={params} />
        </Suspense>
      </main>
    </>
  );
}

function eok(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

async function Company({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  if (!UUID.test(id)) notFound();
  const c = await getCompanyDetail(id);
  if (!c) notFound();

  const today = todayInSeoul();
  const s = summarizeCompany(c.deals);
  const interactions: Interaction[] = [
    ...c.notes.map((n) => ({ on: n.occurredOn, kind: n.kind })),
    ...c.deals.filter(isOpenDeal).map((d) => ({ on: d.lastActivityAt, kind: "deal_touch" as const })),
  ];
  const rel = relationshipStrength(interactions, today);

  return (
    <div className="mx-auto w-full max-w-6xl animate-[fadeIn_.18s_ease-out] space-y-6 p-4 sm:p-6">
      <Link href="/partners" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <span aria-hidden>←</span> 파트너사
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{c.name}</h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.roles.map((r) => (
              <span key={r} className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                {ROLE_LABEL[r]}
              </span>
            ))}
          </div>
          {(c.contactName || c.contactInfo) && <p className="mt-2 text-xs text-muted">{[c.contactName, c.contactInfo].filter(Boolean).join(" · ")}</p>}
          {c.memo && <p className="mt-1 max-w-2xl text-xs text-muted">{c.memo}</p>}
        </div>
        <div className="text-right" title="최근 활동 기록·진행 중 사업의 활동으로 계산 (30일 지나면 무게가 줄어듭니다)">
          <p className="text-[11px] text-muted">관계 강도</p>
          <p className={`text-xl font-semibold ${TIER_COLOR[rel.tier]}`}>
            {TIER_LABEL[rel.tier]} <span className="text-xs font-normal text-muted tabular-nums">{rel.score}</span>
          </p>
          <p className="text-[10px] text-muted">{rel.lastOn ? `마지막 접촉 ${rel.lastOn}` : "기록 없음"}</p>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "진행 중", value: `${s.open}건`, sub: eok(s.openAmount) },
          { label: "수주", value: `${s.won}건`, sub: `${eok(s.wonAmount)} · GP ${eok(s.wonGp)}` },
          { label: "실주", value: `${s.lost}건`, sub: null },
          { label: "담당 영업대표", value: `${s.owners.length}명`, sub: s.owners.slice(0, 3).join(", ") || null },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface/60 p-4">
            <p className="text-[11px] text-muted">{k.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{k.value}</p>
            {k.sub && <p className="mt-0.5 truncate text-xs text-muted tabular-nums">{k.sub}</p>}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="mb-3 text-sm font-semibold">사업 {s.total}건</h2>
          {c.deals.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">볼 수 있는 사업이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {c.deals.map((d) => (
                <li key={d.id}>
                  <Link href={`/dashboard?focus=d:${d.id}`} className={`flex items-center justify-between gap-3 py-2 text-xs hover:text-accent ${isOpenDeal(d) || isWonDeal(d) ? "" : "opacity-60"}`}>
                    <span className="min-w-0">
                      <span className="block truncate">{d.name}</span>
                      <span className="text-[11px] text-muted">
                        {d.roles.map((r) => ROLE_LABEL[r]).join("·")} · {d.owner}
                        {d.ownerId === user.id && " (나)"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold">{d.amount == null ? "-" : eok(d.amount)}</span>
                      <span className="text-[11px] text-muted">{d.status === "lost" ? "실주" : d.status === "on_hold" ? `보류 · ${STAGE_LABEL[d.stage]}` : d.status === "closed" ? "종료" : STAGE_LABEL[d.stage]}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="mb-3 text-sm font-semibold">최근 활동 기록</h2>
          {c.notes.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">아직 기록이 없습니다. 사업 상세 패널에서 통화·미팅을 남겨 보세요.</p>
          ) : (
            <ul className="space-y-3">
              {c.notes.map((n) => (
                <li key={n.id} className="text-xs">
                  <p className="text-[11px] text-muted">
                    <span className="text-fg">{NOTE_LABEL[n.kind]}</span> · {n.occurredOn} · {n.author}
                    {n.counterpart && ` → ${n.counterpart}`}
                  </p>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap">{n.body}</p>
                  <Link href={`/dashboard?focus=d:${n.dealId}`} className="text-[11px] text-muted hover:text-accent">
                    {n.dealName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
