// 안내 문구 상자 (DB 준비 전·부문 없음·조회 실패)
export function Notice({ text }: { text: string }) {
  return <p className="rounded-[6px] border border-[var(--sos-divider)] bg-[var(--sos-bg-surface)] p-5 text-sm text-[var(--sos-text-sub)]">{text}</p>;
}
