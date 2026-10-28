// 파이프라인 보드(칸반) 모델 — 단계별 열·이동 규칙. 순수 함수 (테스트: board.test.ts)
// 참고: Pipedrive 파이프라인 보드 (단계 열에 카드를 끌어 옮긴다)
import { suggestDirections } from "./direction";
import { DEFAULT_PIPELINE_SETTINGS, STAGES, type PipelineSettings } from "./pipeline-settings";
import { computeDealStatus, daysUntil, seoulDay } from "./status";
import { STAGE_LABEL, type DealRow, type DealStage } from "./types";
import type { NodeStatus } from "@/features/topology/types";

export type BoardCard = {
  id: string;
  name: string;
  customer: string;
  /** 부문 보기에서 영업대표 이름 */
  owner: string | null;
  stage: DealStage;
  onHold: boolean;
  contractType: "competitive" | "negotiated";
  amount: number | null;
  gpRate: number | null;
  status: NodeStatus;
  reason: string | null;
  idleDays: number;
  next: string | null;
  updatedAt: string;
};

export type BoardColumn = { stage: DealStage; label: string; probability: number; cards: BoardCard[]; total: number; weighted: number };

/** 이 사업을 그 단계로 옮길 수 있는지 — 안 되면 이유 (DB 체크 제약과 같은 규칙) */
export function moveError(card: Pick<BoardCard, "stage" | "contractType">, to: DealStage): string | null {
  if (card.stage === to) return null;
  if (to === "bidding" && card.contractType !== "competitive") return "수의계약 사업은 '입찰' 단계로 옮길 수 없습니다.";
  return null;
}

export function buildBoard(
  deals: (DealRow & { owner?: string })[],
  today: string,
  settings: PipelineSettings = DEFAULT_PIPELINE_SETTINGS,
): BoardColumn[] {
  const columns = new Map<DealStage, BoardColumn>(
    STAGES.map((s) => [s, { stage: s, label: STAGE_LABEL[s], probability: settings.probabilities[s], cards: [], total: 0, weighted: 0 }]),
  );
  for (const d of deals) {
    if (d.status !== "active" && d.status !== "on_hold") continue;
    const col = columns.get(d.stage);
    if (!col) continue;
    const amount = d.amount == null ? null : Number(d.amount);
    const gp = d.gp == null ? null : Number(d.gp);
    const st = computeDealStatus(d, today);
    const next = suggestDirections(d, today, 1, settings.staleAfterDays)[0]?.title ?? null;
    col.cards.push({
      id: d.id,
      name: d.name,
      customer: d.customer.name,
      owner: d.owner ?? null,
      stage: d.stage,
      onHold: d.status === "on_hold",
      contractType: d.contract_type ?? "negotiated",
      amount,
      gpRate: amount && gp != null ? Math.round((gp / amount) * 1000) / 10 : null,
      status: st.status,
      reason: st.reason ?? null,
      idleDays: Math.max(0, daysUntil(today, seoulDay(d.last_activity_at))),
      next,
      updatedAt: d.updated_at ?? "",
    });
    if (amount != null && d.status === "active") {
      col.total += amount;
      col.weighted += Math.round((amount * col.probability) / 100);
    }
  }
  // 열 안에서는 급한 것(빨강·노랑)부터, 같으면 규모 큰 순
  const rank: Record<NodeStatus, number> = { red: 0, yellow: 1, green: 2, hold: 3, grey: 4 };
  for (const col of columns.values()) col.cards.sort((a, b) => rank[a.status] - rank[b.status] || (b.amount ?? 0) - (a.amount ?? 0));
  return [...columns.values()];
}
