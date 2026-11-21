-- 사는 구(선택)와 서울 25개 구 일별 환경 값 표를 추가합니다. 이미 운영 중인 DB에서 실행해도 기존 기록은 지워지지 않고,
-- 여러 번 실행해도 안전합니다. Supabase SQL Editor에 붙여 넣고 실행하세요.
-- (출처: juhee 브랜치 data_pipeline/supabase_env.sql 과 같은 내용. 코드를 먼저 배포해도 표가 없으면 사는 구 저장만 실패하고 다른 기능은 동작)

begin;

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

commit;
