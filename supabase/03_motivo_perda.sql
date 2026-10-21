-- =====================================================================
-- CRM Comercial — motivo da perda (21/10/2026)
-- Rodar UMA vez no SQL Editor do Supabase do CRM.
-- Pode rodar de novo sem problema.
--
-- Guarda, no card, por que a incorporadora foi perdida:
--   {"motivo": "sem_abertura" | "socios" | "modelo" | "outro_jeito" | "outro",
--    "detalhe": "texto livre", "data": "AAAA-MM-DD"}
-- =====================================================================

alter table public.incorporadora
  add column if not exists perda jsonb;

alter table public.incorporadora
  drop constraint if exists incorporadora_perda_objeto;
alter table public.incorporadora
  add constraint incorporadora_perda_objeto
  check (perda is null or jsonb_typeof(perda) = 'object');

-- Conferência: quantos perdidos já têm motivo
select count(*) filter (where etapa = 'perdido')                      as perdidos,
       count(*) filter (where etapa = 'perdido' and perda is not null) as com_motivo
from public.incorporadora;
