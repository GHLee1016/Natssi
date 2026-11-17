-- 이미 운영 중인 Supabase DB용 조치(점검: Performance·Security Advisor, 2026-11-17).
-- SQL Editor에 붙여 넣고 실행하세요. 사용자 기록은 지우지 않고, 여러 번 실행해도 안전합니다.

begin;

-- 1) RLS 정책 성능(0003 auth_rls_initplan): auth.uid() 를 (select auth.uid()) 로 감싸 행마다 다시 계산하지 않게 합니다.
drop policy if exists "checkins_select_own" on public.checkins;
drop policy if exists "checkins_insert_own" on public.checkins;
drop policy if exists "checkins_update_own" on public.checkins;
drop policy if exists "checkins_delete_own" on public.checkins;
create policy "checkins_select_own" on public.checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "checkins_insert_own" on public.checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "checkins_update_own" on public.checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "checkins_delete_own" on public.checkins for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) 보안(0028·0029): rls_auto_enable() 은 'RLS 자동 켜기'용 이벤트 트리거 함수입니다.
--    브라우저에서 /rest/v1/rpc/rls_auto_enable 로 부를 일이 없으므로 실행 권한을 거둡니다.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

commit;

-- 확인(선택): 아래 두 줄의 결과가 (1) 정책 4개에 'SELECT auth.uid()' 가 들어 있고 (2) 세 역할 모두 false 이면 됩니다.
-- select policyname, qual, with_check from pg_policies where tablename = 'checkins';
-- select r, has_function_privilege(r, 'public.rls_auto_enable()', 'execute') from unnest(array['anon','authenticated']) r;
