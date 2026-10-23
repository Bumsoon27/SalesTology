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

/** 파트너사 보기 범위: 부문 전체 | 내 사업에 연결된 회사 | SOS 리드에서 전환된 사업(인바운드)에 연결된 회사 */
export type PartnerScope = "all" | "mine" | "sos";
export const PARTNER_SCOPES: PartnerScope[] = ["all", "mine", "sos"];

export const toScope = (v: string | null | undefined): PartnerScope => (v === "mine" || v === "sos" ? v : "all");

export function inScope(p: DealCounts, scope: PartnerScope): boolean {
  if (scope === "mine") return p.myDealCount > 0;
  if (scope === "sos") return p.sosDealCount > 0;
  return true;
}

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
