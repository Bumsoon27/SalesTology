// 활동 기록 입력 검증 — 순수 함수 (테스트: notes.test.ts). DB 체크 제약과 같은 규칙
export type NoteKind = "call" | "meeting" | "email" | "note";
export const NOTE_KINDS: NoteKind[] = ["call", "meeting", "email", "note"];
export const NOTE_LABEL: Record<NoteKind, string> = { call: "통화", meeting: "미팅", email: "메일", note: "메모" };
export const NOTE_MAX = 2000;

export type NoteInput = { kind: string; body: string; occurredOn: string };
export type NoteRow = { kind: NoteKind; body: string; occurred_on: string };

export function toNoteRow(input: NoteInput, today: string): { ok: true; row: NoteRow } | { ok: false; error: string } {
  if (!NOTE_KINDS.includes(input.kind as NoteKind)) return { ok: false, error: "기록 종류를 고르세요." };
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "내용을 입력하세요." };
  if (body.length > NOTE_MAX) return { ok: false, error: `내용은 ${NOTE_MAX}자 이하로 입력하세요.` };
  const on = (input.occurredOn ?? "").trim() || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(`${on}T00:00:00Z`))) return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  if (on > today) return { ok: false, error: "앞으로의 일정은 '추적 업무'로 등록하세요. 활동 기록은 오늘까지입니다." };
  return { ok: true, row: { kind: input.kind as NoteKind, body, occurred_on: on } };
}
