// PostgREST 관계 칸(embed)은 설정에 따라 객체·배열·null 로 온다. 하나로 좁힌다 (순수 — I/O 없음)
export type One<T> = T | T[] | null;

export function one<T>(v: One<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
