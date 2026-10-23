-- A 영역: 활동 기록에 '누구와'(고객 쪽 상대) — 단일 접점 경고(Clari single-threading)와 관계 강도에 쓴다
-- 선택 입력. 예: "김과장(전산팀)". 이름·직책 정도만 (연락처는 회사 정보에)
alter table public.deal_notes
  add column counterpart text check (counterpart is null or length(trim(counterpart)) between 1 and 100);
