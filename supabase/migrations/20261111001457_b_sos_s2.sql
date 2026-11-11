-- B 영역: SOS S2 — 유지보수 계약 갱신 예측 (S2 계획 docs/superpowers/plans/2026-10-25-sos-s2.md Task 1)
-- A 공용 테이블(teams, profiles, companies, deals)은 읽기·FK 참조만 한다.
-- 규칙: 한 번 main 에 합쳐진 마이그레이션 파일은 수정하지 않는다. 고칠 땐 새 파일을 만든다.
-- 권한 원칙: 테이블마다 anon·authenticated 권한을 모두 회수한 뒤 필요한 것만 다시 준다.
--           서버(secret key)는 service_role 로 RLS 를 우회하므로 service_role 에는 전부 준다.
-- 기존 데이터는 바꾸지 않는다: 표·칸 추가와 check 확장만 한다.

-- ═══ 공용 (부문 무관, 서버만 쓴다) ═══════════════════════════════

-- ─── sos_contracts (나라장터 계약. 어느 부문 키워드에든 맞은 것만 3년 보관) ─
-- 14일 보관 원본(sos_raw_items)과 따로 둔다 — 갱신 예측 근거는 1년 넘게 필요하다.
create table public.sos_contracts (
  id              uuid primary key default gen_random_uuid(),
  external_id     text not null unique,                -- 계약 번호 (차수 규칙은 계약정보 API 실측대로)
  version         int not null default 0,              -- 변경계약 차수. 더 큰 값이 오면 갱신
  title           text not null,                       -- 계약명
  org_name        text,                                -- 수요기관 이름
  org_code        text,                                -- 수요기관 코드
  org_id          uuid references public.sos_orgs (id) on delete set null,
  vendor_name     text,                                -- 현재 업체 (계약업체)
  amount          numeric(15, 0) check (amount is null or amount >= 0),
  method          text,                                -- 계약방법 원문 (예: 수의계약, 제한경쟁)
  signed_at       date,                                -- 계약체결일
  contract_start  date,
  contract_end    date,                                -- 못 읽으면 null → 예측하지 않는다
  bid_no          text,                                -- 입찰공고 번호
  url             text,
  fetched_at      timestamptz not null default now(),
  check (contract_end is null or contract_start is null or contract_end >= contract_start)
);
create index sos_contracts_contract_end_idx on public.sos_contracts (contract_end);
create index sos_contracts_org_id_idx on public.sos_contracts (org_id);
create index sos_contracts_signed_at_idx on public.sos_contracts (signed_at);

alter table public.sos_contracts enable row level security;
revoke all on public.sos_contracts from anon, authenticated;
grant all on public.sos_contracts to service_role;
-- 로그인 사용자는 읽기만 (카드의 현재 업체·계약금액·종료일). 쓰기는 서버 전용.
grant select on public.sos_contracts to authenticated;
create policy sos_contracts_select on public.sos_contracts for select to authenticated using (true);

-- ═══ 부문별 ═════════════════════════════════════════════════════

-- ─── sos_leads: 갱신 예측 근거 계약·계약방법 ─────────────────────
-- 사용자 update 권한 목록(status, assignee_id, memo, touched_at, has_new_progress, converted_deal_id)은 그대로 둔다.
alter table public.sos_leads
  add column basis_contract_id uuid references public.sos_contracts (id) on delete set null,
  add column procurement text check (procurement is null or procurement in ('bid', 'negotiated'));

create index sos_leads_predicted_org_idx on public.sos_leads (team_id, org_id)
  where kind = 'predicted' and merged_into_id is null;
create index sos_leads_basis_contract_idx on public.sos_leads (basis_contract_id);

-- ─── sos_leads.next_deadline_type 에 '계약 종료' 추가 ─────────────
-- S1 에서 칸 안에 쓴 check 라 이름이 자동으로 붙었다. 이름에 기대지 않고 정의로 찾아 지운다.
do $$
declare
  c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.sos_leads'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%next_deadline_type%'
  loop
    execute format('alter table public.sos_leads drop constraint %I', c);
  end loop;
end $$;

alter table public.sos_leads
  add constraint sos_leads_next_deadline_type_check
  check (next_deadline_type in ('prespec_opinion', 'bid_close', 'contract_end'));

-- ─── sos_team_settings: 갱신 예측 개월 수 (계약 종료 n개월 전부터 리드) ─
alter table public.sos_team_settings
  add column reorder_lead_months int not null default 3 check (reorder_lead_months between 1 and 12);
