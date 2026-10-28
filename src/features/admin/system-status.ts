// 관리자 '시스템 상태' 판정 — 순수 함수 (테스트: system-status.test.ts)
// 비밀값은 다루지 않는다: 환경변수는 '있음/없음'만, 토큰은 만료일만.
import { daysUntil } from "@/features/deals/status";

export type CheckState = "ok" | "warn" | "error" | "off";
export type Check = { id: string; label: string; state: CheckState; detail: string };

/** 토큰 만료 며칠 전부터 경고 */
export const TOKEN_WARN_DAYS = 14;

export type StatusInput = {
  today: string;
  buildMigration: string;
  dbMigration: string | null;
  tokenExpiresOn: string | null;
  env: { secretKey: boolean; naver: boolean; aiCoach: string | null; gemini: boolean; dataGoKr: boolean };
};

export function tokenCheck(tokenExpiresOn: string | null, today: string): Check {
  const base = { id: "token", label: "Supabase 토큰 (DB 자동 반영용)" };
  if (!tokenExpiresOn) return { ...base, state: "warn", detail: "만료일이 기록되지 않았습니다. 아래에 입력해 두면 만료 전에 알려 드립니다." };
  const left = daysUntil(tokenExpiresOn, today);
  if (left < 0) return { ...base, state: "error", detail: `${-left}일 전에 만료됐습니다 (${tokenExpiresOn}). 새 토큰으로 바꿔야 DB 변경이 반영됩니다.` };
  if (left <= TOKEN_WARN_DAYS) return { ...base, state: "warn", detail: `${left === 0 ? "오늘" : `${left}일 뒤`} 만료됩니다 (${tokenExpiresOn}). 미리 새 토큰으로 바꿔 주세요.` };
  return { ...base, state: "ok", detail: `${tokenExpiresOn} 만료 (${left}일 남음)` };
}

export function evaluateStatus(s: StatusInput): Check[] {
  const migration: Check =
    !s.buildMigration || !s.dbMigration
      ? { id: "migration", label: "DB 자동 반영", state: "warn", detail: "비교할 수 없습니다 (버전 정보를 읽지 못함)." }
      : s.dbMigration >= s.buildMigration
        ? { id: "migration", label: "DB 자동 반영", state: "ok", detail: `최신 변경까지 반영됨 (${s.dbMigration})` }
        : {
            id: "migration",
            label: "DB 자동 반영",
            state: "error",
            detail: `운영 DB 가 코드보다 뒤처져 있습니다 (DB ${s.dbMigration} < 코드 ${s.buildMigration}). GitHub Actions 'DB 마이그레이션 적용'을 확인하세요 — 보통 토큰 만료입니다.`,
          };

  return [
    migration,
    tokenCheck(s.tokenExpiresOn, s.today),
    { id: "secret", label: "서버 전용 키 (가입·AI 코칭 기록)", state: s.env.secretKey ? "ok" : "error", detail: s.env.secretKey ? "설정됨" : "없음 — 가입·코칭 저장이 실패합니다" },
    { id: "naver", label: "관련 뉴스 (네이버 검색)", state: s.env.naver ? "ok" : "off", detail: s.env.naver ? "설정됨" : "꺼짐 (선택 기능)" },
    {
      id: "coach",
      label: "AI 코칭 모델",
      state: s.env.aiCoach ? "ok" : "off",
      detail: s.env.aiCoach ? `연결됨 (${s.env.aiCoach})` : "규칙 기반으로 동작 중 (AI_COACH_* 를 넣으면 sLLM)",
    },
    {
      id: "sos",
      label: "SOS 수집 (공공데이터·Gemini)",
      state: s.env.dataGoKr ? "ok" : "warn",
      detail: `${s.env.dataGoKr ? "공공데이터 키 있음" : "공공데이터 키 없음"} · ${s.env.gemini ? "Gemini 키 있음" : "Gemini 키 없음 (요약은 템플릿)"}`,
    },
  ];
}
