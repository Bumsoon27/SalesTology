import { Suspense } from "react";
import { AppHeader } from "@/shared/ui/app-header";
import { getPartners, type Partner } from "@/features/partners/queries";
import { PartnerForm } from "@/features/partners/partner-form";

// 파트너사(SI·매입처) 사전 등록 — 영업기회 입력 시 여기서 고른다
export default function PartnersPage() {
  return (
    <>
      <AppHeader active="core" page="partners" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-6 lg:grid-cols-[360px_1fr]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <PartnerForm />
        </div>
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold">파트너사</h1>
            <p className="text-xs text-muted">여러 사업에 함께할수록 우주에서 더 크게 빛납니다</p>
          </div>
          <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
            <PartnerList />
          </Suspense>
        </section>
      </main>
    </>
  );
}

const ROLE_LABEL = { si: "SI", supplier: "매입처" } as const;

async function PartnerList() {
  const partners = await getPartners();
  if (partners.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
        아직 등록된 파트너사가 없습니다. 왼쪽에서 자주 함께하는 SI·매입처를 먼저 등록해 두세요.
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {partners.map((p) => (
        <PartnerCard key={p.id} p={p} />
      ))}
    </ul>
  );
}

function PartnerCard({ p }: { p: Partner }) {
  return (
    <li className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{p.name}</p>
        <span className="shrink-0 text-xs text-muted">사업 {p.dealCount}건</span>
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
