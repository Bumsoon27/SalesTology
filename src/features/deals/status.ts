// 상태(색상) 규칙 (설계서 §4). 저장하지 않고 조회 시 계산한다. 서버·클라이언트 공용 순수 함수.
import { GREY_AFTER_DAYS, YELLOW_WINDOW_DAYS } from "@/shared/config/status";
import type { NodeStatus } from "@/features/topology/types";
import { TASK_LABEL, type DealRow, type DealStage, type TaskRow } from "./types";

export type TaskState = "done" | "excluded" | "open";

export function computeTaskState(t: TaskRow): TaskState {
  if (t.done_at) return "done";
  if (t.excluded_reason) return "excluded";
  return "open";
}

/** 두 날짜(YYYY-MM-DD) 사이 일수: due - today */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

const WON_OR_LATER: DealStage[] = ["won", "fulfillment", "billing"];
const REQUIRED: TaskRow["type"][] = ["delivery", "invoice_out"];

type Reason = { text: string; days: number };

function yellowReasons(tasks: TaskRow[], stage: DealStage | null, today: string): Reason[] {
  const reasons: Reason[] = [];
  for (const t of tasks) {
    if (computeTaskState(t) !== "open" || !t.due_date) continue;
    const d = daysUntil(t.due_date, today);
    if (d <= YELLOW_WINDOW_DAYS) {
      const name = t.type === "custom" ? (t.title ?? "업무") : TASK_LABEL[t.type];
      reasons.push({ text: d < 0 ? `${name} +${-d}일` : d === 0 ? `${name} 오늘` : `${name} D-${d}`, days: d });
    }
  }
  // 필수 업무 일정 미등록 (§3.3): 수주 이후인데 배송·계산서 업무가 없거나, 미완료인데 기한이 없음
  if (stage && WON_OR_LATER.includes(stage)) {
    for (const type of REQUIRED) {
      const ofType = tasks.filter((t) => t.type === type);
      if (ofType.length === 0 || ofType.some((t) => computeTaskState(t) === "open" && !t.due_date)) {
        reasons.push({ text: `${TASK_LABEL[type]} 일정 미등록`, days: -1 });
      }
    }
  }
  return reasons.sort((a, b) => a.days - b.days);
}

export type StatusResult = { status: NodeStatus; reason?: string; count: number };

export function computeDealStatus(deal: Pick<DealRow, "status" | "stage" | "deal_tasks" | "issues">, today: string): StatusResult {
  if (deal.status === "on_hold") return { status: "hold", reason: "보류", count: 0 };
  if (deal.status !== "active") return { status: "grey", reason: deal.status === "lost" ? "실주" : "종결", count: 0 };

  const openIssues = deal.issues.filter((i) => i.status === "open").length;
  if (openIssues > 0) return { status: "red", reason: `이슈 ${openIssues}`, count: openIssues };

  const reasons = yellowReasons(deal.deal_tasks, deal.stage, today);
  if (reasons.length > 0) {
    return { status: "yellow", reason: `확인 ${reasons.length} · ${reasons[0].text}`, count: reasons.length };
  }
  return { status: "green", count: 0 };
}

/** 관계사 노드: 그 회사와 연결된 업무만으로 판단 (§4.2) */
export function computePartyStatus(tasks: TaskRow[], companyId: string, today: string): StatusResult {
  const mine = tasks.filter((t) => t.company_id === companyId);
  const reasons = yellowReasons(mine, null, today);
  return reasons.length ? { status: "yellow", reason: reasons[0].text, count: reasons.length } : { status: "green", count: 0 };
}

const SEVERITY: Record<NodeStatus, number> = { red: 3, yellow: 2, green: 1, hold: 0, grey: 0 };

/** 고객사: 진행 중 사업 중 가장 심각한 상태, 없고 오래되면 소원 (§4.3) */
export function computeCompanyStatus(
  deals: { status: DealRow["status"]; last_activity_at: string; computed: NodeStatus }[],
  today: string,
): NodeStatus {
  const active = deals.filter((d) => d.status === "active");
  if (active.length > 0) {
    return active.reduce<NodeStatus>((worst, d) => (SEVERITY[d.computed] > SEVERITY[worst] ? d.computed : worst), "green");
  }
  const last = deals.reduce((m, d) => (d.last_activity_at > m ? d.last_activity_at : m), "");
  if (last && daysUntil(today, last.slice(0, 10)) >= GREY_AFTER_DAYS) return "grey";
  return deals.length > 0 && deals.every((d) => d.status === "on_hold") ? "hold" : "green";
}

/** 오늘 날짜 (Asia/Seoul, YYYY-MM-DD) */
export function todayInSeoul(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
