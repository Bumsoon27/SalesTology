// 사업 목록 엑셀(CSV) 내려받기 — /api/export/deals?scope=team&owner=<id>
// 사용자 권한(RLS)으로 읽어 같은 부문 사업만. 조회 범위 규칙은 화면과 같다 (resolveScope: 요청값을 믿지 않는다)
import { requireUser } from "@/shared/auth/current-user";
import { getMyDeals, getTeamDealsFull, getTeamMembers } from "@/features/deals/queries";
import { resolveScope } from "@/features/deals/scope";
import { seoulDay, todayInSeoul } from "@/features/deals/status";
import { isFromSos, type DealRow } from "@/features/deals/types";
import { dealsToCsv, type ExportDeal } from "@/features/export/csv";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const params = { scope: url.searchParams.get("scope") ?? undefined, owner: url.searchParams.get("owner") ?? undefined };

  const [myDeals, teamDeals, members] = await Promise.all([
    getMyDeals(user.id),
    user.teamId ? getTeamDealsFull(user.teamId) : Promise.resolve(null),
    user.teamId ? getTeamMembers(user.teamId) : Promise.resolve([]),
  ]);
  const scope = resolveScope(params, user, members);
  const deals: (DealRow & { owner?: string })[] =
    scope.kind === "mine" || !teamDeals
      ? myDeals.map((d) => ({ ...d, owner: user.name }))
      : scope.kind === "member"
        ? teamDeals.filter((d) => d.owner_id === scope.id)
        : teamDeals;

  const rows: ExportDeal[] = deals.map((d) => ({
    name: d.name,
    customer: d.customer.name,
    owner: d.owner ?? "-",
    stage: d.stage,
    status: d.status,
    contractType: d.contract_type ?? "negotiated",
    amount: d.amount == null ? null : Number(d.amount),
    gp: d.gp == null ? null : Number(d.gp),
    periodStart: d.period_start ?? null,
    periodEnd: d.period_end ?? null,
    si: d.deal_parties.filter((p) => p.role === "si").map((p) => p.company.name),
    suppliers: d.deal_parties.filter((p) => p.role === "supplier").map((p) => p.company.name),
    lastActivityOn: seoulDay(d.last_activity_at),
    fromSos: isFromSos(d.source_ref),
  }));

  const who = scope.kind === "mine" ? user.name : scope.kind === "member" ? scope.name : (user.teamName ?? "부문");
  const filename = `SalesTology_사업목록_${who}_${todayInSeoul()}.csv`.replace(/[\\/:*?"<>|]/g, "_");
  return new Response(dealsToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="deals.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
