// 파트너사 카드의 사업 수 — 고객사로 맡은 사업 + SI·매입처로 참여한 사업 (같은 사업은 한 번). 순수 함수 (테스트: count.test.ts)
import { isFromSos } from "@/features/deals/types";

export type DealRef = { id: string; deleted_at: string | null; owner_id: string | null; source_ref: string | null };

export type DealCounts = {
  /** 부문 전체 */
  dealCount: number;
  /** 내가 영업대표인 사업 */
  myDealCount: number;
  /** SOS 리드에서 전환된 사업 */
  sosDealCount: number;
};

export function countDeals(asCustomer: DealRef[], asParty: (DealRef | null)[], userId: string): DealCounts {
  const live = new Map<string, DealRef>();
  for (const d of [...asCustomer, ...asParty]) if (d && !d.deleted_at) live.set(d.id, d);
  const deals = [...live.values()];
  return {
    dealCount: deals.length,
    myDealCount: deals.filter((d) => d.owner_id === userId).length,
    sosDealCount: deals.filter((d) => isFromSos(d.source_ref)).length,
  };
}
