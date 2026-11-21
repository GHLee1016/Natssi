-- Supabase SQL Editor에 붙여 넣고 실행하세요. (v2: 사용자별 분리)
-- 주의: 이 파일은 checkins 표를 지우고 새로 만듭니다. 새로 설치할 때만 쓰세요.
--       이미 운영 중인 DB(사용자 기록이 있는)에는 patch_2026-11-17_advisor.sql 을 쓰세요.
drop table if exists public.checkins;

create table public.checkins (
  user_id uuid not null references auth.users(id) on delete cascade,   -- 탈퇴하면 함께 삭제
  day date not null,
  symptoms jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.checkins enable row level security;

-- 서버는 service_role 키로 접근하므로 RLS를 건너뜁니다. 아래 정책은 '이중 안전장치'로,
-- 혹시 브라우저에서 anon/로그인 키로 직접 접근하더라도 자기 행만 보이게 합니다.
-- auth.uid() 는 (select auth.uid()) 로 감싸 행마다 다시 계산하지 않게 합니다(Supabase 성능 점검 0003).
create policy "checkins_select_own" on public.checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "checkins_insert_own" on public.checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "checkins_update_own" on public.checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "checkins_delete_own" on public.checkins for delete to authenticated using ((select auth.uid()) = user_id);

-- 내 루틴(제품 등록): 사용자당 한 행. 자세한 설명은 patch_2026-11-19_routines.sql 참고.
drop table if exists public.routines;
create table public.routines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.routines enable row level security;
create policy "routines_select_own" on public.routines for select to authenticated using ((select auth.uid()) = user_id);
create policy "routines_insert_own" on public.routines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "routines_update_own" on public.routines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "routines_delete_own" on public.routines for delete to authenticated using ((select auth.uid()) = user_id);

-- 사는 구(선택)와 서울 구별 환경 값. 자세한 설명은 patch_2026-11-21_profiles_env.sql 참고.
-- 1) 서울 25개 구 일별 환경 값(공공데이터라 개인정보 없음). data_pipeline/scripts/update_env.py 가 채운다.
create table if not exists public.env_daily (
  district  text not null,
  date      date not null,
  pm10      real,
  pm25      real,
  temp_avg  real,
  humid_avg real,
  pm_source text,
  primary key (district, date)
);
alter table public.env_daily enable row level security;
drop policy if exists "env_daily_read" on public.env_daily;
create policy "env_daily_read" on public.env_daily for select to anon, authenticated using (true);

-- 2) 사용자가 사는 구(선택 사항). 탈퇴하면 함께 삭제.
create table if not exists public.profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  district text check (district in (
    '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구',
    '동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구',
    '용산구','은평구','종로구','중구','중랑구')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_upsert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_upsert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);


-- Supabase 보안 점검(0028·0029): 'RLS 자동 켜기' 기능이 만든 rls_auto_enable() 은 이벤트 트리거용 함수라
-- 브라우저(anon·로그인 사용자)가 /rest/v1/rpc 로 부를 일이 없습니다. 실행 권한을 거둡니다.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
