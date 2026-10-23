import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/shared/auth/current-user";
import { AppHeader } from "@/shared/ui/app-header";
import { BackToDashboard } from "@/shared/ui/back-to-dashboard";
import { getPartners, type Partner } from "@/features/partners/queries";
import { PartnerForm } from "@/features/partners/partner-form";

// 파트너사(SI·매입처) 사전 등록 — 영업기회 입력 시 여기서 고른다
export default function PartnersPage({ searchParams }: PageProps<"/partners">) {
  return (
    <>
      <AppHeader active="core" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-6 p-6 lg:grid-cols-[360px_1fr]">
        <div className="lg:col-span-2">
          <BackToDashboard />
        </div>
        <div className="lg:sticky lg:top-6 lg:self-start">
          <PartnerForm />
        </div>
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold">파트너사</h1>
            <p className="text-xs text-muted">여러 사업에 함께할수록 대시보드에서 더 크게 빛납니다</p>
          </div>
          <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
            <PartnerList searchParams={searchParams as Promise<{ scope?: string }>} />
          </Suspense>
        </section>
      </main>
    </>
  );
}

const ROLE_LABEL = { customer: "고객사", si: "매출처(SI)", supplier: "매입처" } as const;

// 보기 범위: 부문 전체(기본) | 내 사업에 연결된 회사만. 대시보드는 '내 사업'만 보이므로 같은 기준으로 볼 수 있게 한다
async function PartnerList({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const [{ scope }, user] = await Promise.all([searchParams, requireUser()]);
  const mine = scope === "mine";
  const all = await getPartners(user.id);
  const partners = mine ? all.filter((p) => p.myDealCount > 0) : all;

  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1 text-xs transition-colors ${on ? "bg-white/10 text-fg" : "text-muted hover:text-fg"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {tab("/partners", `부문 전체 ${all.length}`, !mine)}
          {tab("/partners?scope=mine", `내 사업 관련 ${all.filter((p) => p.myDealCount > 0).length}`, mine)}
        </div>
        <p className="text-[11px] text-muted">대시보드에는 내가 영업대표인 사업만 보입니다</p>
      </div>
      {partners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          {mine
            ? "내 사업에 연결된 파트너사가 없습니다."
            : "아직 등록된 파트너사가 없습니다. 왼쪽에서 자주 함께하는 고객사·SI·매입처를 먼저 등록해 두세요."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {partners.map((p) => (
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
        <p className="font-medium">{p.name}</p>
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
      <div className="mt-2 flex gap-1.5">
        {p.roles.map((r) => (
          <span key={r} className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
            {ROLE_LABEL[r]}
          </span>
        ))}
      </div>
      {(p.contactName || p.contactInfo) && (
        <p className="mt-3 text-xs text-muted">
          {[p.contactName, p.contactInfo].filter(Boolean).join(" · ")}
        </p>
      )}
      {p.memo && <p className="mt-1 text-xs text-muted">{p.memo}</p>}
    </li>
  );
}
