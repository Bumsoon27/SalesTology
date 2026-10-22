import "server-only";

import { matchKeywords } from "../../analysis/keywords";
import { linkBizOrder } from "../../collectors/g2b-link";
import { fetchPlanNoForPrespec } from "../../collectors/g2b-link-fetch";
import { continueWith } from "../../run/steps";
import { loadKeywords, must } from "../db";
import { cursorRange, type StepContext, type StepResult } from "./types";

// 한 단계에서 연결 API 를 부를 최대 횟수와 시간 예산 (함수 60초 제한 안에서)
const MAX_PER_STEP = 50;
const BUDGET_MS = 40_000;
const SCAN_ROWS = 500;
// 실행당 최대 호출 수 — 나라장터 일일 한도를 연결(보조 정보)에 다 쓰지 않게. 남은 건은 다음 실행에서
const MAX_CALLS_PER_RUN = 200;

// biz: 원본의 업무구분(bsnsDivNm)만 꺼낸다 — payload 전체를 받지 않게
type Candidate = { id: string; external_id: string; match_text: string | null; title: string; biz: string | null };
type LinkStats = { tried?: number; linked?: number; failed?: number; calls?: number };

/** 이번 범위의 사전규격 중 부문 키워드에 맞고 발주계획 번호를 모르는 건만 연결 API 로 채운다 */
export async function linkStep(ctx: StepContext, after?: string): Promise<StepResult> {
  const { admin, teamId } = ctx;
  const started = Date.now();
  const range = cursorRange(ctx);
  const keywords = await loadKeywords(admin, teamId);
  const prev = (ctx.stats.link ?? {}) as LinkStats;
  const stats = { tried: prev.tried ?? 0, linked: prev.linked ?? 0, failed: prev.failed ?? 0, calls: prev.calls ?? 0 };

  let cursor = ctx.cursor;
  let last = after;
  let calls = 0;
  for (;;) {
    if (stats.calls >= MAX_CALLS_PER_RUN) break;
    let q = admin
      .from("sos_raw_items")
      .select("id, external_id, match_text, title, biz:payload->>bsnsDivNm")
      .eq("source", "g2b_prespec")
      .is("chain_plan_no", null)
      .gte("fetched_at", range.from.toISOString())
      .order("external_id")
      .limit(SCAN_ROWS);
    if (last) q = q.gt("external_id", last);
    const rows = must<Candidate[]>("연결 대상 조회", await q) ?? [];
    if (rows.length === 0) break;

    let stopped = false;
    for (const r of rows) {
      if (stats.calls >= MAX_CALLS_PER_RUN) break;
      if (calls >= MAX_PER_STEP || Date.now() - started > BUDGET_MS) {
        stopped = true;
        break;
      }
      last = r.external_id;
      const m = matchKeywords(r.match_text ?? r.title, keywords);
      if (m.matched.length === 0 || m.excluded) continue;

      stats.tried++;
      let planNo: string | null = null;
      let failed = false;
      for (const biz of linkBizOrder(r.biz ? { bsnsDivNm: r.biz } : null)) {
        calls++;
        stats.calls++;
        const res = await fetchPlanNoForPrespec(biz, r.external_id);
        if (!res.ok) failed = true;
        else if (res.planNo) {
          planNo = res.planNo;
          break;
        }
      }
      if (planNo) {
        must("연결 저장", await admin.from("sos_raw_items").update({ chain_plan_no: planNo }).eq("id", r.id).is("chain_plan_no", null));
        stats.linked++;
      } else if (failed) stats.failed++;
    }
    if (stopped) {
      // 남은 건은 같은 단계를 다시 넣어 이어서 (last 는 아직 처리하지 않은 건의 바로 앞)
      cursor = continueWith(cursor, { kind: "link", after: last });
      break;
    }
    if (rows.length < SCAN_ROWS) break;
  }

  // 연결 실패는 보조 정보라 실행을 partial 로 만들지 않는다 ('error' 키를 쓰지 않음)
  return { cursor, stats: { ...ctx.stats, link: stats } };
}
