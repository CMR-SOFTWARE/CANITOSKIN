-- ============================================================
-- CMR TURNOS — ESQUEMA MULTI-TENANT
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Planes de plataforma
create table if not exists platform_plans (
  id text primary key,
  nombre text not null,
  limite_profesionales integer, -- null = ilimitado
  max_professionals integer,    -- alias legado (mismo valor)
  precio numeric not null default 0
);

alter table platform_plans add column if not exists limite_profesionales integer;

insert into platform_plans (id, nombre, limite_profesionales, max_professionals, precio) values
  ('inicial',     'Inicial',     1,    1,    20000),
  ('profesional', 'Profesional', 3,    3,    35000),
  ('max',         'Max',         null, null, 50000)
on conflict (id) do update set
  nombre = excluded.nombre,
  limite_profesionales = excluded.limite_profesionales,
  max_professionals = excluded.max_professionals,
  precio = excluded.precio;

delete from platform_plans where id = 'estandar';

-- Trigger: no superar limite_profesionales del plan del negocio
create or replace function enforce_professional_plan_limit()
returns trigger
language plpgsql
as $$
declare
  plan_limite integer;
  activos integer;
begin
  if new.activo is distinct from true then
    return new;
  end if;

  select pp.limite_profesionales into plan_limite
  from businesses b
  join platform_plans pp on pp.id = b.plan
  where b.id = new.business_id;

  if plan_limite is null then
    return new; -- ilimitado
  end if;

  select count(*) into activos
  from professionals
  where business_id = new.business_id
    and activo = true
    and (TG_OP = 'INSERT' or id is distinct from new.id);

  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and (old.activo is distinct from true)) then
    if activos >= plan_limite then
      raise exception 'Límite de profesionales del plan alcanzado (%).', plan_limite
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_professional_plan_limit on professionals;
create trigger trg_professional_plan_limit
  before insert or update of activo on professionals
  for each row
  execute function enforce_professional_plan_limit();

-- Negocios (antes clubs)
create table if not exists businesses (
  id bigserial primary key,
  slug text not null unique,
  nombre text not null,
  categoria text not null default 'otro',
  ciudad text,
  barrio text,
  color_marca text default '#6366F1',
  logo_url text,
  whatsapp text not null default '',
  transfer_alias text not null default '',
  transfer_cbu text not null default '',
  transfer_titular text not null default '',
  hora_inicio integer not null default 9,
  hora_fin integer not null default 20,
  precio text not null default '0',
  plan text not null default 'inicial' references platform_plans(id),
  estado text not null default 'activo',
  estado_motivo text,
  creado_en text not null
);

-- Profesionales
create table if not exists professionals (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true
);

-- Servicios del negocio
create table if not exists services (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  descripcion text default '',
  duracion_min integer not null default 30,
  precio text not null default '0',
  categoria text,
  activo boolean not null default true,
  professional_id bigint references professionals(id) on delete set null
);

-- Planes de cliente del negocio (paquetes de sesiones)
create table if not exists plans (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  nombre text not null,
  sesiones integer not null default 1,
  precio text not null default '0',
  descripcion text default '',
  activo boolean not null default true
);

-- Admin por negocio
create table if not exists business_admins (
  id bigserial primary key,
  business_id bigint not null unique references businesses(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  password_salt_b text,
  password_hash_b text,
  actualizado_en text not null
);

create table if not exists admin_users (
  id bigserial primary key,
  username text not null unique,
  password_salt text not null,
  password_hash text not null,
  role text not null default 'super_admin',
  creado_en text not null
);

create table if not exists appointments (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  service_id bigint references services(id) on delete set null,
  professional_id bigint references professionals(id) on delete set null,
  nombre text not null,
  telefono text not null,
  fecha text not null,
  hora_inicio text not null,
  hora_fin text not null,
  duracion_min integer not null default 30,
  estado text not null default 'pendiente',
  cancel_token text not null unique,
  comprobante_nombre_original text not null,
  comprobante_archivo text not null,
  comprobante_mimetype text not null,
  comprobante_size integer not null,
  creado_en text not null
);

create index if not exists idx_appointments_business_fecha
  on appointments (business_id, fecha);

create table if not exists bloqueos (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  professional_id bigint references professionals(id) on delete cascade,
  fecha text not null,
  horario text,
  horario_desde text,
  horario_hasta text,
  dia_completo boolean not null default false,
  motivo text not null default '',
  creado_en text not null
);

create table if not exists bloqueos_recurrentes (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  professional_id bigint references professionals(id) on delete cascade,
  dia_semana integer not null,
  horario_desde text,
  horario_hasta text,
  dia_completo boolean not null default false,
  motivo text not null default '',
  activo boolean not null default true,
  creado_en text not null
);

create table if not exists platform_payments (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  plan_id text not null references platform_plans(id),
  monto numeric not null default 0,
  comprobante_url text,
  creado_en text not null
);

create table if not exists solicitudes (
  id bigserial primary key,
  nombre text not null,
  slug text not null,
  categoria text not null default 'otro',
  ciudad text,
  barrio text,
  whatsapp text not null,
  email text not null,
  comprobante_url text,
  plan text not null default 'inicial',
  estado text not null default 'pendiente',
  creado_en text not null
);

alter table platform_plans disable row level security;
alter table businesses disable row level security;
alter table professionals disable row level security;
alter table services disable row level security;
alter table plans disable row level security;
alter table business_admins disable row level security;
alter table admin_users disable row level security;
alter table appointments disable row level security;
alter table bloqueos disable row level security;
alter table bloqueos_recurrentes disable row level security;
alter table platform_payments disable row level security;
alter table solicitudes disable row level security;
