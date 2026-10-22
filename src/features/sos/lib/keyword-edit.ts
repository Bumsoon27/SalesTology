// 설정 화면 입력 검증·변경 이력 계산 (순수 — I/O 없음). 서버 액션은 누구나 POST 할 수 있으니 모양부터 엄격히 본다.
import { parseKeywordInput } from "../analysis/keywords";
import type { Tier } from "../types";
import { normalizeKeywordTerm, parseTier, TERM_MAX } from "./lead-input";

export const WEIGHT_MAX = 10;
// 한 번에 붙여넣을 수 있는 키워드 수
export const ADD_MAX = 100;
export const PRODUCT_LINK_MAX = 50;
export const PRODUCT_NAME_MAX = 100;
export const VENDOR_MAX = 100;
export const ALERT_DAYS = { min: 1, max: 14 };
export const SUMMARY_TOP_N = { min: 0, max: 10 };

// 부문 설정 행이 없을 때 (시드는 이미 있던 부문만 넣었다)
export const DEFAULT_TEAM_SETTINGS = { prespecAlertDays: 3, aiSummaryTopN: 5, firstRunDays: 30 };

export const TIER_LABEL: Record<Tier, string> = { core: "핵심", extended: "확장", exclude: "제외" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD = { ok: false as const, error: "잘못된 요청입니다." };

type Fail = { ok: false; error: string };

export type KeywordPatch = { tier?: Tier; weight?: number | null; active?: boolean; productIds?: string[] };
export type KeywordSnapshot = { term: string; tier: Tier; weight: number | null; active: boolean; productIds: string[] };
// 이력에 남기는 칸 (before/after 는 바뀐 칸만)
export type ChangeFields = Partial<KeywordSnapshot>;
export type ChangeAction = "create" | "update" | "delete" | "restore";
export type ChangeRecord = { action: ChangeAction; before: unknown; after: unknown };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const sortedIds = (ids: string[]) => [...new Set(ids.map((s) => s.toLowerCase()))].sort();

/** 칩 팝오버 patch. 아는 칸만 받고(term 은 바꾸지 않는다), 모르는 칸이 있으면 거절 */
export function parseKeywordPatch(raw: unknown): { ok: true; patch: KeywordPatch } | Fail {
  if (!isObj(raw)) return BAD;
  const allowed = new Set(["tier", "weight", "active", "productIds"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) return BAD;
  const patch: KeywordPatch = {};

  if ("tier" in raw) {
    const t = parseTier(raw.tier);
    if (!t) return BAD;
    patch.tier = t;
  }
  if ("weight" in raw) {
    if (raw.weight !== null && !isInt(raw.weight, 0, WEIGHT_MAX)) return { ok: false, error: `가중치는 0~${WEIGHT_MAX} 사이 정수로 넣어 주세요.` };
    patch.weight = raw.weight as number | null;
  }
  if ("active" in raw) {
    if (typeof raw.active !== "boolean") return BAD;
    patch.active = raw.active;
  }
  if ("productIds" in raw) {
    const ids = raw.productIds;
    if (!Array.isArray(ids) || ids.length > PRODUCT_LINK_MAX || ids.some((id) => typeof id !== "string" || !UUID.test(id))) return BAD;
    patch.productIds = sortedIds(ids as string[]);
  }
  if (Object.keys(patch).length === 0) return BAD;
  return { ok: true, patch };
}

/** 지금 값과 patch 를 비교해 바뀐 칸만 before/after 로. 바뀐 것이 없으면 null */
export function diffKeyword(cur: KeywordSnapshot, patch: KeywordPatch): { before: ChangeFields; after: ChangeFields } | null {
  const before: ChangeFields = {};
  const after: ChangeFields = {};
  if (patch.tier !== undefined && patch.tier !== cur.tier) {
    before.tier = cur.tier;
    after.tier = patch.tier;
  }
  if (patch.weight !== undefined && patch.weight !== cur.weight) {
    before.weight = cur.weight;
    after.weight = patch.weight;
  }
  if (patch.active !== undefined && patch.active !== cur.active) {
    before.active = cur.active;
    after.active = patch.active;
  }
  if (patch.productIds !== undefined) {
    const a = sortedIds(cur.productIds);
    const b = sortedIds(patch.productIds);
    if (a.join() !== b.join()) {
      before.productIds = a;
      after.productIds = b;
    }
  }
  return Object.keys(after).length === 0 ? null : { before, after };
}

/** 입력창 값 → 새로 넣을 키워드와 이미 있는 키워드 (대소문자 무시) */
export function planAddKeywords(raw: unknown, existingTerms: string[]): { ok: true; fresh: string[]; duplicates: string[] } | Fail {
  if (typeof raw !== "string") return BAD;
  const terms = parseKeywordInput(raw);
  if (terms.length === 0) return { ok: false, error: "키워드를 입력해 주세요." };
  if (terms.length > ADD_MAX) return { ok: false, error: `한 번에 ${ADD_MAX}개까지 넣을 수 있습니다.` };
  const long = terms.find((t) => !normalizeKeywordTerm(t).ok);
  if (long) return { ok: false, error: `키워드는 ${TERM_MAX}자까지 쓸 수 있습니다: ${long.slice(0, 20)}…` };
  const have = new Set(existingTerms.map((t) => t.toLowerCase()));
  return {
    ok: true,
    fresh: terms.filter((t) => !have.has(t.toLowerCase())),
    duplicates: terms.filter((t) => have.has(t.toLowerCase())),
  };
}

export type RevertPlan = { kind: "delete" } | { kind: "restore" } | { kind: "update"; patch: KeywordPatch } | { kind: "error"; error: string };

/** 이력 한 줄을 되돌리는 방법. keyword 는 그 이력의 키워드 지금 상태 (없으면 null) */
export function planRevert(change: ChangeRecord, keyword: { deleted: boolean } | null): RevertPlan {
  if (!keyword) return { kind: "error", error: "키워드를 찾을 수 없습니다." };
  switch (change.action) {
    case "create":
    case "restore":
      return keyword.deleted ? { kind: "error", error: "이미 삭제된 키워드입니다." } : { kind: "delete" };
    case "delete":
      return keyword.deleted ? { kind: "restore" } : { kind: "error", error: "이미 복구된 키워드입니다." };
    case "update": {
      if (keyword.deleted) return { kind: "error", error: "삭제된 키워드의 변경은 되돌릴 수 없습니다. 먼저 복구해 주세요." };
      if (!isObj(change.before)) return { kind: "error", error: "되돌릴 내용이 없습니다." };
      // 이력의 before 도 검증을 다시 거친다 (오래된 이력의 모르는 칸은 버린다)
      const b = change.before;
      const pick = Object.fromEntries(["tier", "weight", "active", "productIds"].filter((k) => k in b).map((k) => [k, b[k]]));
      const p = parseKeywordPatch(pick);
      return p.ok ? { kind: "update", patch: p.patch } : { kind: "error", error: "되돌릴 내용이 없습니다." };
    }
    default:
      return { kind: "error", error: "되돌릴 수 없는 이력입니다." };
  }
}

const weightText = (w: unknown) => (typeof w === "number" ? String(w) : "기본");
const tierText = (t: unknown) => (typeof t === "string" && t in TIER_LABEL ? TIER_LABEL[t as Tier] : "?");

/** 변경 이력 한 줄 문구 — 키워드 이름은 화면이 따로 붙인다 */
export function describeChange(change: ChangeRecord): string {
  const b = isObj(change.before) ? change.before : {};
  const a = isObj(change.after) ? change.after : {};
  switch (change.action) {
    case "create":
      return `추가 · ${tierText(a.tier)}`;
    case "delete":
      return `삭제 · ${tierText(b.tier)}`;
    case "restore":
      return `복구 · ${tierText(a.tier)}`;
    case "update": {
      const parts: string[] = [];
      if ("tier" in a) parts.push(`칸 ${tierText(b.tier)} → ${tierText(a.tier)}`);
      if ("weight" in a) parts.push(`가중치 ${weightText(b.weight)} → ${weightText(a.weight)}`);
      if ("active" in a) parts.push(a.active ? "켬" : "끔");
      if ("productIds" in a) {
        const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
        parts.push(`연결 제품 ${n(b.productIds)}개 → ${n(a.productIds)}개`);
      }
      return parts.length ? parts.join(" · ") : "수정";
    }
    default:
      return "변경";
  }
}

export type TeamSettingsDbPatch = { prespec_alert_days?: number; ai_summary_top_n?: number };

/** 부문 설정 patch → DB 칸. D-n 1~14, AI 요약 건수 0~10 */
export function parseTeamSettingsPatch(raw: unknown): { ok: true; patch: TeamSettingsDbPatch } | Fail {
  if (!isObj(raw)) return BAD;
  const patch: TeamSettingsDbPatch = {};
  if ("prespecAlertDays" in raw) {
    if (!isInt(raw.prespecAlertDays, ALERT_DAYS.min, ALERT_DAYS.max))
      return { ok: false, error: `사전규격 알림은 D-${ALERT_DAYS.min}~D-${ALERT_DAYS.max} 사이로 정해 주세요.` };
    patch.prespec_alert_days = raw.prespecAlertDays;
  }
  if ("aiSummaryTopN" in raw) {
    if (!isInt(raw.aiSummaryTopN, SUMMARY_TOP_N.min, SUMMARY_TOP_N.max))
      return { ok: false, error: `AI 요약 건수는 ${SUMMARY_TOP_N.min}~${SUMMARY_TOP_N.max}건 사이로 정해 주세요.` };
    patch.ai_summary_top_n = raw.aiSummaryTopN;
  }
  if (Object.keys(patch).length === 0) return BAD;
  return { ok: true, patch };
}

/** 제품 이름(필수)·공급사(비우면 null) */
export function parseProductInput(raw: unknown): { ok: true; value: { name: string; vendor: string | null } } | Fail {
  if (!isObj(raw) || typeof raw.name !== "string") return BAD;
  if (raw.vendor !== undefined && raw.vendor !== null && typeof raw.vendor !== "string") return BAD;
  const name = raw.name.trim().replace(/\s+/g, " ");
  const vendor = typeof raw.vendor === "string" ? raw.vendor.trim().replace(/\s+/g, " ") : "";
  if (name === "") return { ok: false, error: "제품 이름을 넣어 주세요." };
  if (name.length > PRODUCT_NAME_MAX) return { ok: false, error: `제품 이름은 ${PRODUCT_NAME_MAX}자까지 쓸 수 있습니다.` };
  if (vendor.length > VENDOR_MAX) return { ok: false, error: `공급사는 ${VENDOR_MAX}자까지 쓸 수 있습니다.` };
  return { ok: true, value: { name, vendor: vendor === "" ? null : vendor } };
}

/** 이력 id (bigint identity) — 양의 정수만 */
export function parseChangeId(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null;
}
