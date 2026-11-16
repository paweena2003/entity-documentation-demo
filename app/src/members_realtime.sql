-- =====================================================================
-- Entity Portal: Members / Roles / Realtime
-- รันทั้งไฟล์ใน Supabase → SQL Editor (รันซ้ำได้ ไม่พัง)
-- ต้องมีตาราง projects ที่มีคอลัมน์ id, user_id, version อยู่แล้ว
-- หมายเหตุ: ส่วนที่ 3 จะลบ policy เดิมทั้งหมดของตาราง projects แล้วสร้างใหม่
-- =====================================================================

-- 0) ให้ user_id เติมค่าอัตโนมัติ (กัน insert ไม่ผ่าน RLS)
alter table public.projects alter column user_id set default auth.uid();

-- 1) ตาราง project_members + ฟังก์ชันตรวจสิทธิ์
--    (ใช้ DO block เพื่อให้ชนิดของ project_id ตรงกับ projects.id ไม่ว่าจะเป็น uuid หรือ bigint)
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
  from pg_attribute a
  where a.attrelid = 'public.projects'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.project_members (
      id uuid primary key default gen_random_uuid(),
      project_id %s not null references public.projects(id) on delete cascade,
      user_id uuid references auth.users(id) on delete cascade,
      email text not null,
      role text not null default 'viewer' check (role in ('admin','editor','viewer')),
      invited_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  $f$, t);

  -- บทบาทของผู้ใช้ปัจจุบันในโปรเจกต์ (security definer เพื่อไม่ให้ RLS วนซ้ำ)
  execute format($f$
    create or replace function public.project_role(pid %1$s) returns text
    language sql stable security definer set search_path = public as $b$
      select coalesce(
        (select 'admin'::text from public.projects p where p.id = pid and p.user_id = auth.uid()),
        (select m.role from public.project_members m
          where m.project_id = pid
            and (m.user_id = auth.uid()
                 or lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
          limit 1)
      )
    $b$
  $f$, t);

  execute 'grant execute on function public.project_role(' || t || ') to authenticated';
end $$;

create unique index if not exists project_members_unique
  on public.project_members (project_id, lower(email));
create index if not exists project_members_email_idx
  on public.project_members (lower(email));

-- 2) เจ้าของโปรเจกต์ = Admin ในตารางสมาชิกอัตโนมัติ
create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, email, role, invited_by)
  select new.id, new.user_id, u.email, 'admin', new.user_id
  from auth.users u where u.id = new.user_id
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner
  after insert on public.projects
  for each row execute function public.add_owner_member();

-- เติมเจ้าของให้โปรเจกต์ที่มีอยู่แล้ว
insert into public.project_members (project_id, user_id, email, role, invited_by)
select p.id, p.user_id, u.email, 'admin', p.user_id
from public.projects p
join auth.users u on u.id = p.user_id
on conflict do nothing;

-- ผู้ถูกเชิญเมื่อล็อกอินครั้งแรก ผูก user_id เข้ากับแถวคำเชิญ (เรียกจากแอป)
create or replace function public.claim_project_invites() returns void
language sql security definer set search_path = public as $$
  update public.project_members
  set user_id = auth.uid()
  where user_id is null
    and auth.uid() is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
grant execute on function public.claim_project_invites() to authenticated;

-- 3) RLS
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('projects', 'project_members')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- projects: เจ้าของหรือสมาชิกเห็นได้ / Admin+Editor แก้ได้ / เจ้าของลบได้
-- (user_id = auth.uid() ใส่ไว้ตรง ๆ เพื่อให้ INSERT ... RETURNING ผ่าน)
create policy projects_select on public.projects for select to authenticated
  using (user_id = auth.uid() or public.project_role(id) is not null);

create policy projects_insert on public.projects for insert to authenticated
  with check (user_id = auth.uid());

create policy projects_update on public.projects for update to authenticated
  using (user_id = auth.uid() or public.project_role(id) in ('admin', 'editor'))
  with check (user_id = auth.uid() or public.project_role(id) in ('admin', 'editor'));

create policy projects_delete on public.projects for delete to authenticated
  using (user_id = auth.uid());

-- project_members: สมาชิกเห็นรายชื่อ / Admin จัดการ / ออกจากโปรเจกต์เองได้ / แตะแถวเจ้าของไม่ได้
create policy pm_select on public.project_members for select to authenticated
  using (public.project_role(project_id) is not null);

create policy pm_insert on public.project_members for insert to authenticated
  with check (public.project_role(project_id) = 'admin');

create policy pm_update on public.project_members for update to authenticated
  using (
    public.project_role(project_id) = 'admin'
    and not exists (select 1 from public.projects p
                    where p.id = project_members.project_id and p.user_id = project_members.user_id)
  )
  with check (public.project_role(project_id) = 'admin');

create policy pm_delete on public.project_members for delete to authenticated
  using (
    (public.project_role(project_id) = 'admin'
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and not exists (select 1 from public.projects p
                    where p.id = project_members.project_id and p.user_id = project_members.user_id)
  );

-- 4) Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.projects;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.project_members;
  exception when duplicate_object then null;
  end;
end $$;

-- ตรวจผล
-- select id, email, role, user_id from public.project_members order by created_at;
-- select tablename, rowsecurity from pg_tables where tablename in ('projects','project_members');
