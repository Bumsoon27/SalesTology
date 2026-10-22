import Link from "next/link";
import { groupByOrg } from "../analysis/group";
import { daysUntil } from "../lib/date";
import { DEADLINE_LABEL, LEAD_STATUS_LABEL, STAGE_LABEL } from "../lib/labels";
import { formatWon } from "../summary/template";
import type { LeadListItem } from "../types";

// 리드 목록 — 사업별(한 줄씩) / 기관별(기관 행을 펼치면 사업). 줄을 누르면 상세(?lead=)가 열린다
type ListProps = {
  items: LeadListItem[];
  view: "deal" | "org";
  today: string;
  hrefFor: (leadId: string) => string;
  selectedId: string | null;
};

export function LeadList({ items, view, today, hrefFor, selectedId }: ListProps) {
  const row = (it: LeadListItem, hideOrg?: boolean) => (
    <LeadRow item={it} today={today} hideOrg={hideOrg} href={hrefFor(it.id)} selected={it.id === selectedId} />
  );
  if (view === "deal") {
    return (
      <ul className="flex flex-col gap-3">
        {items.map((it) => (
          <li key={it.id}>{row(it)}</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-col">
      {groupByOrg(items).map((g) => (
        <li key={g.orgId} className="border-b border-[var(--sos-divider-lite)]">
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
              <span className="min-w-0 flex-1 text-base text-[var(--sos-text-strong)]">
                <span aria-hidden className="mr-2 inline-block text-[var(--sos-text-hint)] transition-transform duration-200 group-open:rotate-90">
                  ›
                </span>
                {g.orgName}
              </span>
              <span className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">
                사업 {g.count} · 예산 합계 {g.budgetSum > 0 ? formatWon(g.budgetSum) : "미공개"} · 최고 점수{" "}
                <span className="text-sm font-semibold text-[var(--sos-text-strong)]">{g.topScore}</span>
              </span>
            </summary>
            <ul className="flex flex-col gap-3 pb-4 pl-4">
              {g.items.map((it) => (
                <li key={it.id}>{row(it, true)}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

type RowProps = { item: LeadListItem; today: string; hideOrg?: boolean; href: string; selected: boolean };

function LeadRow({ item, today, hideOrg, href, selected }: RowProps) {
  const summaryLine = item.summary?.split("\n")[0]?.trim();
  return (
    <article
      className={`relative rounded-[6px] border p-5 transition-colors duration-200 hover:border-[var(--sos-text-hint)] ${
        selected ? "border-[var(--sos-text-sub)]" : "border-[var(--sos-divider)]"
      } ${item.hasNewProgress ? "bg-[var(--sos-bg-highlight)]" : "bg-[var(--sos-bg-surface)]"}`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base text-[var(--sos-text-strong)]">
            {/* 줄 전체를 누를 수 있게 링크를 카드 크기로 넓힌다 */}
            <Link href={href} scroll={false} aria-current={selected ? "true" : undefined} className="after:absolute after:inset-0 after:content-['']">
              {item.title}
            </Link>
            {!hideOrg && item.orgName && <span className="ml-2 text-xs font-medium text-[var(--sos-text-sub)]">{item.orgName}</span>}
          </h3>
          {summaryLine && <p className="mt-1 truncate text-sm text-[var(--sos-text)]">{summaryLine}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="sos-num text-base font-semibold text-[var(--sos-text-strong)]" aria-label={`점수 ${item.score}`}>
            {item.score}
          </span>
          <Badges item={item} />
        </div>
      </div>
      <p className="sos-num mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[var(--sos-text-sub)]">
        <span>{STAGE_LABEL[item.stage]}</span>
        <Deadline item={item} today={today} />
        <span>예산 {formatWon(item.budget)}</span>
        {item.assigneeName && <span>담당 {item.assigneeName}</span>}
      </p>
    </article>
  );
}

function Deadline({ item, today }: { item: LeadListItem; today: string }) {
  if (!item.nextDeadlineAt) return null;
  const d = daysUntil(item.nextDeadlineAt, today);
  const label = item.nextDeadlineType ? DEADLINE_LABEL[item.nextDeadlineType] : "마감";
  if (d < 0) return <span className="text-[var(--sos-text-hint)]">{label} 지남</span>;
  // 색만으로 전하지 않는다 — 항상 D-n 글자와 함께
  const color = d <= 3 ? "text-[var(--sos-red)]" : d <= 7 ? "text-[var(--sos-yellow)]" : "";
  return (
    <span className={color}>
      {label} D-{d}
    </span>
  );
}

/** 상태 표시 (시각 설계서 §5.3) — 목록 줄과 상세 카드가 같이 쓴다 */
export function Badges({ item }: { item: Pick<LeadListItem, "status" | "companyId" | "hasNewProgress" | "keywordMismatch"> }) {
  const tags: { text: string; color: string }[] = [];
  if (item.status === "converted") tags.push({ text: LEAD_STATUS_LABEL.converted, color: "text-[var(--sos-green)]" });
  else if (item.status !== "new") tags.push({ text: LEAD_STATUS_LABEL[item.status], color: "text-[var(--sos-text-sub)]" });
  if (item.companyId) tags.push({ text: "기존 고객", color: "text-[var(--sos-blue)]" });
  if (item.hasNewProgress) tags.push({ text: "새 진행", color: "text-[var(--sos-yellow)]" });
  if (item.keywordMismatch) tags.push({ text: "키워드 불일치", color: "text-[var(--sos-yellow)]" });
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap justify-end gap-2 text-xs font-medium">
      {tags.map((t) => (
        <span key={t.text} className={t.color}>
          {t.text}
        </span>
      ))}
    </span>
  );
}
