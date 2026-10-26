-- A 영역: 코드 리뷰(2026-10-26) 반영 — 권한·동시 수정·삭제된 사업·AI 코칭 기록

-- 1) deals: 사용자가 바꿀 수 있는 칸만 허용 (owner_id·team_id·source_ref·last_activity_at·created_at 은 직접 못 바꾼다)
--    마지막 활동 시각은 트리거(보안 정의자)가 갱신하고, 담당자 변경은 아직 화면이 없다
revoke update on public.deals from authenticated;
grant update (name, stage, status, contract_type, amount, gp, expected_contract_month, period_start, period_end, items, customer_id, deleted_at)
  on public.deals to authenticated;

-- 2) 동시 수정 감지(updated_at)가 '활동 시각만 바뀐 갱신'에는 움직이지 않게
--    (다른 사람이 메모·업무를 남길 때마다 내 단계 변경이 '먼저 수정됨'으로 실패하던 문제)
create or replace function public.deals_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'last_activity_at' - 'updated_at') = (to_jsonb(old) - 'last_activity_at' - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger deals_set_updated_at on public.deals;
create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.deals_set_updated_at();

-- 3) 삭제된 사업에는 관리자만 접근 (메모·코칭·업무·이슈·관계사 정책이 모두 이 함수를 쓴다)
create or replace function public.can_access_deal(p_deal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deals d
    where d.id = p_deal_id
      and (public.is_admin() or (d.team_id = public.current_team_id() and d.deleted_at is null))
  );
$$;

-- 4) 고객사 바꾸기: 동시 수정이면 회사를 새로 만들지 않는다 (먼저 updated_at 확인)
create or replace function public.set_deal_customer(p_deal_id uuid, p_name text, p_expected_updated_at timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_rows int;
begin
  if v_name = '' then
    raise exception '고객사명을 입력하세요.' using errcode = '22023';
  end if;
  select team_id into v_team from public.deals where id = p_deal_id and updated_at = p_expected_updated_at;
  if v_team is null then
    if exists (select 1 from public.deals where id = p_deal_id) then
      return false; -- 다른 사람이 먼저 고침
    end if;
    raise exception '사업을 찾을 수 없습니다.' using errcode = '42501';
  end if;

  update public.deals
     set customer_id = public.ensure_company(v_team, v_name)
   where id = p_deal_id and updated_at = p_expected_updated_at;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 5) AI 코칭 기록은 서버만 쓴다 — 사용자가 직접 넣으면 동료에게 'sLLM 결과'로 보이는 가짜 조언을 만들 수 있었다
revoke insert on public.deal_coaching from authenticated;
drop policy deal_coaching_insert on public.deal_coaching;

-- 하루 모델 호출 상한을 한 번에 확인·예약한다 (동시에 여러 번 눌러도 상한을 넘지 않게). 서버(service_role)만 호출
create function public.coach_reserve_call(p_user uuid, p_deal uuid, p_signals_key text, p_limit int, p_day_start timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('coach:' || p_user::text));
  select count(*) into v_used from public.deal_coaching
   where user_id = p_user and source = 'llm' and created_at >= p_day_start;
  if v_used >= p_limit then
    return null;
  end if;
  -- 결과가 나오기 전에는 캐시로 보이지 않게 임시 키로 넣고, 서버가 결과와 함께 실제 키로 바꾼다
  insert into public.deal_coaching (deal_id, user_id, source, model, signals_key, advice)
  values (p_deal, p_user, 'llm', null, 'pending:' || left(p_signals_key, 64), '{"pending": true}'::jsonb)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.coach_reserve_call(uuid, uuid, text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.coach_reserve_call(uuid, uuid, text, int, timestamptz) to service_role;
