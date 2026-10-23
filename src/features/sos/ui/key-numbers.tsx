import { DEADLINE_LABEL } from "../lib/labels";
import { deadlineView, formatOrderMonth, type Tone } from "../lib/lead-view";
import { formatWon } from "../summary/template";
import type { LeadDetail } from "../types";

// 핵심 숫자 4칸 (시각 설계서 §5.3): 칸 이름 12/500, 값 18/600. 좁은 화면에서는 2×2
const TONE: Record<Tone, string> = {
  red: "text-[var(--sos-red)]",
  yellow: "text-[var(--sos-yellow)]",
  normal: "text-[var(--sos-text-strong)]",
  hint: "text-[var(--sos-text-hint)]",
};

type Props = Pick<LeadDetail, "budget" | "nextDeadlineAt" | "nextDeadlineType" | "expectedOrderMonth" | "keywords"> & { today: string };

export function KeyNumbers({ budget, nextDeadlineAt, nextDeadlineType, expectedOrderMonth, keywords, today }: Props) {
  const dl = deadlineView(nextDeadlineAt, today);
  const matched = keywords.filter((k) => k.tier !== "exclude");
  const cells: { name: string; value: string; tone: Tone; note?: string }[] = [
    { name: "예산", value: formatWon(budget), tone: budget === null ? "hint" : "normal" },
    { name: "다음 마감", value: dl.text, tone: dl.tone, note: nextDeadlineAt && nextDeadlineType ? DEADLINE_LABEL[nextDeadlineType] : undefined },
    { name: "발주 시기", value: formatOrderMonth(expectedOrderMonth), tone: expectedOrderMonth ? "normal" : "hint" },
    {
      name: "일치 키워드",
      value: `${matched.length}개`,
      tone: matched.length ? "normal" : "hint",
      note: matched.map((k) => k.term).join(", ") || undefined,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] bg-[var(--sos-divider-lite)] min-[768px]:grid-cols-4">
      {cells.map((c) => (
        <div key={c.name} className="flex min-w-0 flex-col gap-1 bg-[var(--sos-bg-surface)] p-3">
          <dt className="text-xs font-medium text-[var(--sos-text-sub)]">{c.name}</dt>
          <dd className={`sos-num text-lg font-semibold ${TONE[c.tone]}`}>{c.value}</dd>
          {c.note && <dd className="truncate text-xs font-medium text-[var(--sos-text-sub)]" title={c.note}>{c.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
