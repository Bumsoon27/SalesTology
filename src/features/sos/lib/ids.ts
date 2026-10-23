// id 형식 검사 (순수 — I/O 없음). 서버 액션·주소 값은 누구나 바꿔 보낼 수 있으니 모양부터 본다
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
