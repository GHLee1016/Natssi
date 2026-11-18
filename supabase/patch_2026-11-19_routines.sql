-- 내 루틴(제품 등록) 저장용 표를 추가합니다. 이미 운영 중인 DB에서 실행해도 사용자 기록은 지워지지 않고, 여러 번 실행해도 안전합니다.
-- Supabase SQL Editor에 붙여 넣고 실행하세요. (코드를 먼저 배포해도 이 표가 없으면 루틴 저장만 실패하고 다른 기능은 그대로 동작해요.)

begin;

create table if not exists public.routines (
  user_id uuid primary key references auth.users(id) on delete cascade,   -- 탈퇴하면 함께 삭제
  data jsonb not null,                                                     -- {"versions": [{id, start, change, items:[…]}]}
  updated_at timestamptz not null default now()
);

alter table public.routines enable row level security;

-- 서버는 service_role 키로 접근하므로 RLS를 건너뜁니다. 아래 정책은 '이중 안전장치'입니다(checkins 와 같은 방식).
drop policy if exists "routines_select_own" on public.routines;
drop policy if exists "routines_insert_own" on public.routines;
drop policy if exists "routines_update_own" on public.routines;
drop policy if exists "routines_delete_own" on public.routines;
create policy "routines_select_own" on public.routines for select to authenticated using ((select auth.uid()) = user_id);
create policy "routines_insert_own" on public.routines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "routines_update_own" on public.routines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "routines_delete_own" on public.routines for delete to authenticated using ((select auth.uid()) = user_id);

commit;

-- 확인(선택): 정책 4개가 보이면 됩니다.
-- select policyname from pg_policies where tablename = 'routines';
