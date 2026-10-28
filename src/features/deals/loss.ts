// 실주 사유 — 고정 목록 (DB check 와 같다: supabase/migrations/*_a_deal_lost_reason.sql). 순수 함수 (테스트: loss.test.ts)
export const LOSS_REASONS = ["price", "competitor", "budget", "timing", "requirement", "relationship", "other"] as const;
export type LossReason = (typeof LOSS_REASONS)[number];
export const LOSS_LABEL: Record<LossReason, string> = {
  price: "가격",
  competitor: "경쟁사 우위",
  budget: "예산 취소·삭감",
  timing: "사업 연기·보류",
  requirement: "요건·기술 미충족",
  relationship: "관계·영업력",
  other: "기타",
};
export const LOST_NOTE_MAX = 200;

export const isLossReason = (v: unknown): v is LossReason => typeof v === "string" && (LOSS_REASONS as readonly string[]).includes(v);

export type LossRow = { reason: LossReason | "unknown"; count: number; amount: number };

/** 실주 사유별 건수·금액 (사유 미입력은 unknown) — 많은 순 */
export function lossBreakdown(deals: { id: string; status: string; amount: number | null; lost_reason?: string | null }[], lostIds: Set<string>): LossRow[] {
  const map = new Map<LossRow["reason"], LossRow>();
  for (const d of deals) {
    if (d.status !== "lost" || !lostIds.has(d.id)) continue;
    const reason = isLossReason(d.lost_reason) ? d.lost_reason : "unknown";
    const r = map.get(reason) ?? { reason, count: 0, amount: 0 };
    r.count += 1;
    r.amount += Number(d.amount ?? 0);
    map.set(reason, r);
  }
  return [...map.values()].sort((a, b) => (a.reason === "unknown" ? 1 : b.reason === "unknown" ? -1 : b.count - a.count || b.amount - a.amount));
}
