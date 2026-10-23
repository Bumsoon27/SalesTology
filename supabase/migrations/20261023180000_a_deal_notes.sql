-- A 영역: 사업 활동 기록 (통화·미팅·메일·메모) — Salesforce 활동 타임라인 참고
-- 기록하면 사업의 마지막 활동 시각이 갱신된다 (정체 판단·AI 디렉션에 반영).
-- 기록은 고치지 않는다(수정 권한 없음). 잘못 쓴 기록은 쓴 사람만 지울 수 있다.

create table public.deal_notes (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.deals (id),
  author_id    uuid not null default auth.uid() references public.profiles (id),
  kind         text not null check (kind in ('call', 'meeting', 'email', 'note')),
  body         text not null check (length(trim(body)) between 1 and 2000),
  occurred_on  date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at   timestamptz not null default now()
);
create index deal_notes_deal_idx on public.deal_notes (deal_id, occurred_on desc, created_at desc);

alter table public.deal_notes enable row level security;
revoke all on public.deal_notes from anon, authenticated;
grant select, insert, delete on public.deal_notes to authenticated;
grant all on public.deal_notes to service_role;

-- 사업을 볼 수 있는 사람만 (같은 부문, 관리자는 전체)
create policy deal_notes_select on public.deal_notes for select to authenticated
  using (public.can_access_deal(deal_id));
-- 기록자는 본인으로만
create policy deal_notes_insert on public.deal_notes for insert to authenticated
  with check (public.can_access_deal(deal_id) and author_id = (select auth.uid()));
-- 지우기는 쓴 사람만
create policy deal_notes_delete on public.deal_notes for delete to authenticated
  using (author_id = (select auth.uid()) and public.can_access_deal(deal_id));

create trigger deal_notes_touch after insert on public.deal_notes
  for each row execute function public.touch_deal_activity();
