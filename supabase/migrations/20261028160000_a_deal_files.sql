-- A 영역: 사업 첨부 파일 (견적서·제안서·계약서 등)
-- 파일 본문은 비공개 저장소 버킷 deal-files 에 <deal_id>/<file_id> 로 둔다. 버킷에는 정책을 두지 않는다 →
-- 사용자는 저장소에 직접 접근할 수 없고, 서버가 이 표의 RLS 로 권한을 확인한 뒤 서비스 키로
-- 짧은 서명 URL(올리기·받기)을 만들어 준다. 버킷이 크기·형식을 한 번 더 강제한다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-files', 'deal-files', false, 10485760,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/x-hwp', 'application/hwp+zip', 'application/zip'
  ]
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.deal_files (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.deals (id),
  uploader_id  uuid not null default auth.uid() references public.profiles (id),
  name         text not null check (length(trim(name)) between 1 and 150),
  size         bigint not null check (size > 0 and size <= 10485760),
  mime         text not null check (length(mime) between 1 and 120),
  uploaded_at  timestamptz,                -- 올리기 확인 전에는 null (목록에 안 보인다)
  created_at   timestamptz not null default now()
);
create index deal_files_deal_idx on public.deal_files (deal_id, created_at desc);

alter table public.deal_files enable row level security;
revoke all on public.deal_files from anon, authenticated;
grant select, insert, delete on public.deal_files to authenticated;
grant all on public.deal_files to service_role;

-- 사업을 볼 수 있는 사람만 (같은 부문, 관리자는 전체)
create policy deal_files_select on public.deal_files for select to authenticated
  using (public.can_access_deal(deal_id));
-- 올린 사람은 본인으로만, 확인 표시는 서버(서비스 키)만 한다
create policy deal_files_insert on public.deal_files for insert to authenticated
  with check (public.can_access_deal(deal_id) and uploader_id = (select auth.uid()) and uploaded_at is null);
-- 지우기는 올린 사람·관리자
create policy deal_files_delete on public.deal_files for delete to authenticated
  using (public.can_access_deal(deal_id) and (uploader_id = (select auth.uid()) or public.is_admin()));
