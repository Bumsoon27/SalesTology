import Link from "next/link";
import { listHref, type ListQuery } from "../lib/list-query";

// [사업별 | 기관별] 알약 전환 (시각 설계서 §5.5) — 선택된 쪽 흰 채움
export function ViewToggle({ query }: { query: ListQuery }) {
  const item = (view: ListQuery["view"], label: string) => {
    const on = query.view === view;
    return (
      <Link
        href={listHref(query, { view })}
        aria-current={on ? "page" : undefined}
        // 알약(32px)의 누르는 영역을 44px 로
        className={`relative rounded-[30px] px-4 py-1.5 text-sm before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] font-medium transition-colors duration-200 ${
          on
            ? "bg-[var(--sos-text-strong)] text-[var(--sos-text-on-primary)]"
            : "text-[var(--sos-text-sub)] hover:text-[var(--sos-accent)]"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="보기 전환" className="inline-flex rounded-[30px] border border-[var(--sos-divider)] p-0.5">
      {item("deal", "사업별")}
      {item("org", "기관별")}
    </nav>
  );
}
