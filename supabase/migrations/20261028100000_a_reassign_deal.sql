-- A 영역: 사업 담당자(영업대표) 넘기기
-- owner_id 는 사용자가 직접 바꿀 수 없다(20261026150000). 이 함수만 검사 후 바꾼다.
--   누가: 현재 담당자 또는 관리자   누구에게: 그 사업 부문의 활성 사용자
--   동시 수정: updated_at 이 다르면 false. 끝나지 않은 업무 중 이전 담당자 몫도 새 담당자에게 넘긴다.
create function public.reassign_deal(p_deal_id uuid, p_new_owner uuid, p_expected_updated_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_deal record;
  v_rows int;
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  select id, team_id, owner_id, updated_at, deleted_at into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null or not public.can_access_deal(p_deal_id) then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '42501';
  end if;
  if not (public.is_admin() or v_deal.owner_id = v_me) then
    raise exception '담당자 변경은 현재 담당자 또는 관리자만 할 수 있습니다.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_new_owner and team_id = v_deal.team_id and is_active) then
    raise exception '같은 부문의 활성 사용자에게만 넘길 수 있습니다.' using errcode = '22023';
  end if;
  if p_new_owner = v_deal.owner_id then
    return true;
  end if;

  update public.deals set owner_id = p_new_owner
   where id = p_deal_id and updated_at = p_expected_updated_at;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false; -- 다른 사람이 먼저 고침
  end if;

  update public.deal_tasks set assignee_id = p_new_owner
   where deal_id = p_deal_id and assignee_id = v_deal.owner_id and done_at is null and excluded_reason is null and deleted_at is null;
  return true;
end;
$$;
revoke execute on function public.reassign_deal(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.reassign_deal(uuid, uuid, timestamptz) to authenticated;
