import Link from "next/link";

// SOS 화면 사이 이동 (글자 탭 — 시각 설계서 §5.5). 관리자가 고른 부문은 주소로 이어 간다
const TABS = [
  { href: "/sos", label: "사업 리드" },
  { href: "/sos/settings", label: "키워드 설정" },
  { href: "/sos/runs", label: "실행 기록" },
] as const;

export type SosTab = (typeof TABS)[number]["href"];

export function SosNav({ current, team }: { current: SosTab; team: string | null }) {
  return (
    <nav aria-label="SOS 메뉴" className="flex gap-5 border-b border-[var(--sos-divider-lite)]">
      {TABS.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={team ? `${t.href}?team=${encodeURIComponent(team)}` : t.href}
            aria-current={active ? "page" : undefined}
            // 글자 탭(28px)의 누르는 영역을 위로 넓혀 44px
            className={`relative -mb-px border-b-2 pb-2 text-sm before:absolute before:inset-x-0 before:-top-4 before:bottom-0 before:content-[''] font-medium transition-colors duration-200 ${
              active
                ? "border-[var(--sos-text-strong)] text-[var(--sos-text-strong)]"
                : "border-transparent text-[var(--sos-text-sub)] hover:text-[var(--sos-accent)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
