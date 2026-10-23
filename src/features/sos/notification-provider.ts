import "server-only";

import type { NotificationProvider } from "@/shared/notifications/providers";
import { createClient } from "@/shared/supabase/server";
import { DEFAULT_TEAM_SETTINGS } from "./lib/keyword-edit";
import { deadlineWindow } from "./lib/date";
import { buildPrespecNotifications, type PrespecLead } from "./notifications";

// A 티커·종에 사전규격 의견 마감 임박을 띄운다 (설계서 §6.2). 등록은 공용 providers.ts (별도 PR).
// A 가 1.5초 안에 끝나기를 기다리므로 조회는 리드 한 번 + 설정 한 번, 필요한 칸만. 실패하면 [] (절대 던지지 않는다).

// 조회 범위: 알림 일수 설정 상한(30)과 무관하게 넉넉히 14일. 실제 D-n 거르기는 buildPrespecNotifications
const WINDOW_DAYS = 14;
const ROW_LIMIT = 200;

type Row = {
  id: string;
  title: string;
  budget: number | string | null;
  next_deadline_at: string;
  assignee_id: string | null;
  sos_orgs: { name: string } | { name: string }[] | null;
};

export const sosNotificationProvider: NotificationProvider = {
  id: "sos",
  async load(ctx) {
    if (!ctx.teamId) return [];
    try {
      const supabase = await createClient();
      const { from, before } = deadlineWindow(ctx.today, WINDOW_DAYS);
      let q = supabase
        .from("sos_leads")
        .select("id, title, budget, next_deadline_at, assignee_id, sos_orgs(name)")
        .eq("team_id", ctx.teamId)
        .eq("kind", "deal")
        .is("merged_into_id", null)
        .eq("stage", "prespec")
        .not("status", "in", "(dismissed,on_hold,converted)")
        .eq("hidden", false)
        .eq("next_deadline_type", "prespec_opinion")
        .gte("next_deadline_at", from)
        .lt("next_deadline_at", before);
      // 내 알림이면 DB 에서 먼저 줄인다 (같은 조건을 순수 함수도 다시 본다)
      if (ctx.view === "mine") q = q.eq("assignee_id", ctx.userId);
      const [leads, settings] = await Promise.all([
        q.order("next_deadline_at").limit(ROW_LIMIT),
        supabase.from("sos_team_settings").select("prespec_alert_days").eq("team_id", ctx.teamId).maybeSingle(),
      ]);
      if (leads.error) {
        console.error(`[sos] 알림 리드 조회: ${leads.error.code ?? ""} ${leads.error.message}`);
        return [];
      }
      // 설정 행이 없거나 읽지 못하면 기본값(3)
      const alertDays =
        !settings.error && settings.data ? (settings.data as { prespec_alert_days: number }).prespec_alert_days : DEFAULT_TEAM_SETTINGS.prespecAlertDays;
      const rows = (leads.data ?? []) as unknown as Row[];
      const list: PrespecLead[] = rows.map((r) => {
        const org = Array.isArray(r.sos_orgs) ? r.sos_orgs[0] : r.sos_orgs;
        return {
          id: r.id,
          orgName: org?.name ?? "",
          title: r.title,
          budget: r.budget === null ? null : Number(r.budget),
          nextDeadlineAt: r.next_deadline_at,
          assigneeId: r.assignee_id,
        };
      });
      return buildPrespecNotifications(list, ctx, alertDays);
    } catch (e) {
      console.error(`[sos] 알림 불러오기 실패: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  },
};
