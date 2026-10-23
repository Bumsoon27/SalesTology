import "server-only";

import { planNoByTitle, type PlanCandidate } from "../../analysis/chain";
import { isKeywordHit } from "../../analysis/keywords";
import { normalizeOrgName } from "../../analysis/org";
import { linkBizOrder } from "../../collectors/g2b-link";
import { fetchPlanNoForPrespec } from "../../collectors/g2b-link-fetch";
import { continueWith } from "../../run/steps";
import { loadKeywords, must, type Admin } from "../db";
import { cursorRange, type StepContext, type StepResult } from "./types";

// 한 단계에서 연결 API 를 부를 최대 횟수와 시간 예산 (함수 60초 제한 안에서)
const MAX_PER_STEP = 50;
const BUDGET_MS = 40_000;
const SCAN_ROWS = 500;
// 실행당 최대 호출 수 — 나라장터 일일 한도를 연결(보조 정보)에 다 쓰지 않게. 남은 건은 다음 실행에서
const MAX_CALLS_PER_RUN = 200;

// biz·ordr: 원본의 업무구분(bsnsDivNm)·발주기관명만 꺼낸다 — payload 전체를 받지 않게
type Candidate = {
  id: string;
  external_id: string;
  match_text: string | null;
  title: string;
  org_name: string | null;
  biz: string | null;
  ordr: string | null;
};
// byTitle: 연결 API 로 못 찾아 같은 기관·같은 사업명 규칙으로 묶은 수 (linked 에 포함)
type LinkStats = { tried?: number; linked?: number; byTitle?: number; failed?: number; calls?: number };
// 한 기관의 발주계획 후보 상한
const PLAN_ROWS = 500;

/**
 * 이번 범위의 사전규격 중 부문 키워드에 맞고 발주계획 번호를 모르는 건만 연결 API 로 채운다.
 * API 가 번호를 못 주면 같은 기관·같은 사업명인 발주계획이 하나뿐일 때 그 번호로 묶는다 (planNoByTitle)
 */
export async function linkStep(ctx: StepContext, after?: string): Promise<StepResult> {
  const { admin, teamId } = ctx;
  const started = Date.now();
  const range = cursorRange(ctx);
  const keywords = await loadKeywords(admin, teamId);
  const prev = (ctx.stats.link ?? {}) as LinkStats;
  const stats = { tried: prev.tried ?? 0, linked: prev.linked ?? 0, byTitle: prev.byTitle ?? 0, failed: prev.failed ?? 0, calls: prev.calls ?? 0 };

  let cursor = ctx.cursor;
  let last = after;
  let calls = 0;
  for (;;) {
    if (stats.calls >= MAX_CALLS_PER_RUN) break;
    let q = admin
      .from("sos_raw_items")
      .select("id, external_id, match_text, title, org_name, biz:payload->>bsnsDivNm, ordr:payload->>orderInsttNm")
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
      if (!isKeywordHit(r.match_text ?? r.title, keywords)) continue;

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
      const byTitle = planNo ? null : await planNoBySameTitle(admin, r);
      if (byTitle) {
        planNo = byTitle;
        stats.byTitle++;
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

/** 사전규격과 같은 기관(표준화 기관명)의 발주계획 원본을 읽어 planNoByTitle 로 고른다 */
async function planNoBySameTitle(admin: Admin, r: Candidate): Promise<string | null> {
  const orgNames = [r.org_name, r.ordr].filter((n): n is string => !!n);
  const normalized = [...new Set(orgNames.map(normalizeOrgName).filter((n) => n !== ""))];
  if (normalized.length === 0) return null;
  // 발주계획 기관은 코드로, 사전규격 기관은 이름으로 저장돼 sos_orgs 행이 다를 수 있다 — 표준화 이름이 같은 행을 모두 본다
  const orgs = must<{ id: string }[]>("기관 조회", await admin.from("sos_orgs").select("id").in("normalized_name", normalized)) ?? [];
  if (orgs.length === 0) return null;
  const plans =
    must<{ external_id: string; title: string; org_name: string | null; org_code: string | null }[]>(
      "발주계획 조회",
      await admin
        .from("sos_raw_items")
        .select("external_id, title, org_name, org_code")
        .eq("source", "g2b_plan")
        .in("org_id", orgs.map((o) => o.id))
        .limit(PLAN_ROWS),
    ) ?? [];
  const candidates: PlanCandidate[] = plans.map((p) => ({ planNo: p.external_id, title: p.title, orgName: p.org_name ?? "", orgCode: p.org_code }));
  // 사전규격 원본엔 기관 코드가 없다 — 이름으로만 비교
  return planNoByTitle({ title: r.title, orgNames, orgCode: null }, candidates);
}
