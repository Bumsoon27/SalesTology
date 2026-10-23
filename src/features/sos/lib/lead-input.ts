// 서버 액션 입력 검증 (순수). 서버 액션은 누구나 POST 할 수 있으니 모양부터 엄격히 본다.
import type { LeadStatus, Tier } from "../types";
import { isUuid } from "./ids";

export const MEMO_MAX = 2000;
export const TERM_MAX = 50;

// 사람이 고를 수 있는 상태 — "사업 전환됨"은 전환 액션만 만든다
const EDITABLE_STATUS: LeadStatus[] = ["new", "reviewing", "on_hold", "dismissed"];
const TIERS: Tier[] = ["core", "extended", "exclude"];

export type EditableStatus = Exclude<LeadStatus, "converted">;
export type LeadDbPatch = { status?: EditableStatus; assignee_id?: string | null; memo?: string | null };

/** 화면 patch → DB 칸. 아는 칸만 옮기고 나머지는 버린다 */
export function parseLeadPatch(raw: unknown): { ok: true; patch: LeadDbPatch } | { ok: false; error: string } {
  const bad = { ok: false as const, error: "잘못된 요청입니다." };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return bad;
  const p = raw as Record<string, unknown>;
  const patch: LeadDbPatch = {};

  if ("status" in p) {
    if (typeof p.status !== "string" || !(EDITABLE_STATUS as string[]).includes(p.status)) return bad;
    patch.status = p.status as EditableStatus;
  }
  if ("assigneeId" in p) {
    if (p.assigneeId !== null && !isUuid(p.assigneeId)) return bad;
    patch.assignee_id = p.assigneeId as string | null;
  }
  if ("memo" in p) {
    if (typeof p.memo !== "string") return bad;
    const memo = p.memo.trim();
    if (memo.length > MEMO_MAX) return { ok: false, error: `메모는 ${MEMO_MAX}자까지 쓸 수 있습니다.` };
    patch.memo = memo === "" ? null : memo;
  }
  if (Object.keys(patch).length === 0) return bad;
  return { ok: true, patch };
}

/** 드래그로 고른 글자 → 키워드. 공백 정리 후 1~50자 */
export function normalizeKeywordTerm(raw: unknown): { ok: true; term: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "잘못된 요청입니다." };
  const term = raw.trim().replace(/\s+/g, " ");
  if (term === "") return { ok: false, error: "키워드로 쓸 글자를 골라 주세요." };
  if (term.length > TERM_MAX) return { ok: false, error: `키워드는 ${TERM_MAX}자까지 쓸 수 있습니다.` };
  return { ok: true, term };
}

export function parseTier(v: unknown): Tier | null {
  return typeof v === "string" && (TIERS as string[]).includes(v) ? (v as Tier) : null;
}
