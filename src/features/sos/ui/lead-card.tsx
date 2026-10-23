import type { ReactNode } from "react";
import type { LeadDetail } from "../types";
import { HighlightTitle } from "./highlight-title";
import { KeyNumbers } from "./key-numbers";
import { LeadActions } from "./lead-actions";
import { Badges } from "./lead-list";
import { StageBar } from "./stage-bar";

// 리드 카드 전체 (설계서 §5.2, 시각 설계서 §5.3). 맨 위는 "어떤 신규 영업기회인지" 요약
const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

const heading = "text-xs font-medium text-[var(--sos-text-sub)]";

type Props = { lead: LeadDetail; today: string; team: string | null; convertSlot?: ReactNode };

export function LeadCard({ lead, today, team, convertSlot }: Props) {
  const terms = lead.keywords.filter((k) => k.tier !== "exclude").map((k) => k.term);
  return (
    <article
      aria-label={lead.title}
      className={`flex flex-col gap-5 rounded-[6px] border border-[var(--sos-divider)] p-5 ${
        lead.hasNewProgress ? "bg-[var(--sos-bg-highlight)]" : "bg-[var(--sos-bg-surface)]"
      }`}
    >
      <SummaryBlock summary={lead.summary} source={lead.summarySource} />

      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <HighlightTitle title={lead.title} terms={terms} team={team} />
          {lead.orgName && <p className="mt-1 text-xs font-medium text-[var(--sos-text-sub)]">{lead.orgName}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="sos-num text-base font-semibold text-[var(--sos-text-strong)]" aria-label={`점수 ${lead.score}`}>
            {lead.score}
          </span>
          <Badges item={lead} />
        </div>
      </header>

      <KeyNumbers
        budget={lead.budget}
        nextDeadlineAt={lead.nextDeadlineAt}
        nextDeadlineType={lead.nextDeadlineType}
        expectedOrderMonth={lead.expectedOrderMonth}
        keywords={lead.keywords}
        today={today}
      />

      <StageBar stage={lead.stage} />

      <section className="flex flex-col gap-2">
        <h3 className={heading}>제안할 제품</h3>
        {lead.products.length === 0 ? (
          <p className="text-sm text-[var(--sos-text-hint)]">연결된 제품이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lead.products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--sos-text)]">
                <span className="text-[var(--sos-text-strong)]">{p.name}</span>
                {p.vendor && <span className="text-xs font-medium text-[var(--sos-text-sub)]">{p.vendor}</span>}
                <span className="text-xs font-medium text-[var(--sos-text-hint)]">← {p.terms.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className={heading}>근거 시그널</h3>
        {lead.signals.length === 0 ? (
          <p className="text-sm text-[var(--sos-text-hint)]">근거 시그널이 없습니다.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--sos-divider-lite)]">
            {lead.signals.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 py-2">
                <p className="sos-num text-xs font-medium text-[var(--sos-text-sub)]">
                  {s.sourceLabel} · {s.publishedAt ? day.format(new Date(s.publishedAt)) : "날짜 미상"}
                </p>
                <p className="text-sm text-[var(--sos-text)]">
                  {s.title}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs font-medium text-[var(--sos-text-sub)] transition-colors duration-200 hover:text-[var(--sos-accent)]"
                    >
                      나라장터 원문<span className="sr-only"> (새 창)</span> ↗
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 클라이언트로는 버튼에 필요한 값만 넘긴다. 리드가 바뀌면 상태(메모 초안 등)를 새로 시작한다 */}
      <LeadActions
        key={lead.id}
        lead={{ id: lead.id, status: lead.status, assigneeId: lead.assigneeId, memo: lead.memo, updatedAt: lead.updatedAt, members: lead.members }}
        markSeen={lead.status === "on_hold" && lead.hasNewProgress}
        team={team}
        convertSlot={convertSlot}
      />
    </article>
  );
}

function SummaryBlock({ summary, source }: { summary: string | null; source: LeadDetail["summarySource"] }) {
  const ai = source === "ai";
  return (
    <div className={`relative flex items-start gap-3 ${ai ? "pl-4" : ""}`}>
      {/* AI 요약이면 왼쪽 4px 그라디언트 띠 */}
      {ai && <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-full" style={{ background: "var(--sos-ai-gradient)" }} />}
      <p className="min-w-0 flex-1 whitespace-pre-line text-lg font-semibold leading-[1.45] text-[var(--sos-text-strong)]">
        {summary ?? <span className="text-sm font-normal text-[var(--sos-text-hint)]">요약이 아직 없습니다.</span>}
      </p>
      {summary &&
        (ai ? (
          <span className="shrink-0 rounded-[4px] bg-[var(--sos-ai-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--sos-ai)]">AI 요약</span>
        ) : (
          <span className="shrink-0 text-xs font-medium text-[var(--sos-text-hint)]">기본 요약</span>
        ))}
    </div>
  );
}
