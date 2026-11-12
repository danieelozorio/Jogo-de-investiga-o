-- ============================================================
-- Noite na Vila — banco de dados (Supabase)
-- Cole tudo no SQL Editor do Supabase e aperte "Run".
-- Pode rodar de novo sem problema (recria as funções).
--
-- Segurança: as tabelas ficam fechadas (RLS sem políticas).
-- Os celulares só falam com o banco pelas funções abaixo,
-- e cada um só recebe o que pode ver.
-- ============================================================

create table if not exists public.salas (
  code        text primary key,
  host_token  uuid not null,
  fase        text not null default 'lobby',      -- lobby | noite | dia | veredito | fim
  dia         int  not null default 0,
  versao      int  not null default 0,
  vencedor    text,
  anuncio     jsonb not null default '{}'::jsonb,
  atualizada  timestamptz not null default now()
);

create table if not exists public.jogadores (
  id       bigserial primary key,
  sala     text not null references public.salas(code) on delete cascade,
  token    uuid not null unique default gen_random_uuid(),
  nome     text not null,
  ordem    int  not null,
  papel    text,
  vivo     boolean not null default true,
  alvo     bigint,
  palavra  text,
  agiu     boolean not null default false,
  voto     bigint,
  votou    boolean not null default false,
  info     jsonb not null default '[]'::jsonb,
  unique (sala, nome)
);
create index if not exists jogadores_sala_idx on public.jogadores(sala);
alter table public.jogadores add column if not exists bot boolean not null default false;
alter table public.jogadores add column if not exists visto jsonb;

alter table public.salas enable row level security;
alter table public.jogadores enable row level security;
revoke all on public.salas, public.jogadores from anon, authenticated;

-- ---------- utilidades internas ----------

-- onde a pessoa passa a noite: quem visita vai até a casa escolhida;
-- vigia, bêbado e fofoqueira observam de casa.
create or replace function public._jg_loc(p public.jogadores) returns bigint
language sql immutable as $$
  select case when p.papel in ('morador','assassino','benzedeira') then coalesce(p.alvo, p.id) else p.id end
$$;

create or replace function public._jg_me(p_code text, p_token uuid) returns public.jogadores
language plpgsql security definer set search_path = public as $$
declare r public.jogadores;
begin
  select * into r from jogadores where sala = upper(trim(p_code)) and token = p_token;
  if not found then raise exception 'Você não está nesta sala.'; end if;
  return r;
end $$;

create or replace function public._jg_bump(p_code text) returns void
language sql security definer set search_path = public as $$
  update salas set versao = versao + 1, atualizada = now() where code = p_code;
$$;

create or replace function public._jg_nomes(p_ids bigint[]) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(nome, ', ' order by ordem), '') from jogadores where id = any(p_ids);
$$;

-- confere se alguém venceu; se sim, encerra a partida
create or replace function public._jg_checar(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare a int; o int; v text;
begin
  select count(*) filter (where papel = 'assassino'), count(*) filter (where papel <> 'assassino')
    into a, o from jogadores where sala = p_code and vivo;
  if a = 0 then v := 'vila';
  elsif a >= o then v := 'assassinos';
  end if;
  if v is not null then
    update salas set fase = 'fim', vencedor = v where code = p_code;
    return true;
  end if;
  return false;
end $$;

-- ---------- resolve a noite ----------
create or replace function public._jg_resolver_noite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s salas;
  j jogadores;
  dono jogadores;
  h bigint;
  ids bigint[];
  ids_casa bigint[];
  mortos bigint[] := '{}';
  casas_ataque bigint[] := '{}';
  salvos int := 0;
  msgs jsonb;
  palavras jsonb := '[]'::jsonb;
  mortos_json jsonb := '[]'::jsonb;
  armas text[] := array['uma Cuia','um Xis','uma Espora','uma Bomba de chimarrão','um Laço',
                        'uma Boleadeira','um Espeto','uma Garrafa térmica','uma Gaita'];
  info_map jsonb := '{}'::jsonb;
begin
  select * into s from salas where code = p_code for update;

  -- 1) ataques
  for h in
    select distinct a.alvo from jogadores a
    where a.sala = p_code and a.vivo and a.papel = 'assassino' and a.alvo is not null and a.alvo <> a.id
  loop
    select * into dono from jogadores where id = h;
    if dono.vivo and dono.papel <> 'assassino' and _jg_loc(dono) = dono.id then
      if exists (select 1 from jogadores b where b.sala = p_code and b.vivo and b.papel = 'benzedeira' and _jg_loc(b) = h) then
        salvos := salvos + 1;
        info_map := jsonb_set(info_map, array['salvo_' || h], to_jsonb(dono.nome));
      else
        mortos := mortos || h;
        casas_ataque := casas_ataque || h;
      end if;
    end if;
  end loop;

  -- 2) o que cada vivo viu
  for j in select * from jogadores where sala = p_code and vivo order by ordem loop
    msgs := '[]'::jsonb;
    h := _jg_loc(j);
    select array_agg(q.id) into ids from jogadores q
      where q.sala = p_code and q.vivo and q.id <> j.id and _jg_loc(q) = h;
    ids_casa := ids;
    if h = j.id then
      if ids is null then msgs := msgs || to_jsonb('🏠 Você passou a noite em casa. Ninguém apareceu por aqui.'::text);
      else msgs := msgs || to_jsonb('🏠 Você passou a noite em casa. Passaram por aqui: ' || _jg_nomes(ids) || '.'); end if;
    else
      select * into dono from jogadores where id = h;
      if ids is null then msgs := msgs || to_jsonb('🚶 Você foi até a casa de ' || dono.nome || '. Não tinha ninguém lá.');
      else msgs := msgs || to_jsonb('🚶 Você foi até a casa de ' || dono.nome || '. Estavam lá: ' || _jg_nomes(ids) || '.'); end if;
    end if;
    if h = any(casas_ataque) and h <> j.id and j.papel <> 'assassino' then
      select * into dono from jogadores where id = h;
      msgs := msgs || to_jsonb('⚠️ Enquanto você estava lá, ' || dono.nome || ' foi atacado(a)!');
    end if;

    if j.papel = 'vigia' then
      if j.alvo is null then msgs := msgs || to_jsonb('👁️ Você não vigiou ninguém.'::text);
      else
        select * into dono from jogadores where id = j.alvo;
        select array_agg(q.id) into ids from jogadores q
          where q.sala = p_code and q.vivo and q.id <> j.alvo and q.id <> j.id and _jg_loc(q) = j.alvo;
        msgs := msgs || to_jsonb('👁️ De olho na casa de ' || dono.nome || ', você viu entrar: ' ||
                 coalesce(nullif(_jg_nomes(ids), ''), 'ninguém') || '.');
      end if;
    elsif j.papel = 'bebado' then
      -- acha que é vigia, mas vê coisa errada
      if j.alvo is null then msgs := msgs || to_jsonb('👁️ Você não vigiou ninguém.'::text);
      else
        select * into dono from jogadores where id = j.alvo;
        select array_agg(x.id) into ids from (
          select q.id from jogadores q where q.sala = p_code and q.vivo and q.id <> j.id and q.id <> j.alvo
          order by random() limit floor(random() * 3)::int) x;
        msgs := msgs || to_jsonb('👁️ De olho na casa de ' || dono.nome || ', você viu entrar: ' ||
                 coalesce(nullif(_jg_nomes(ids), ''), 'ninguém') || '.');
      end if;
    elsif j.papel = 'fofoqueira' then
      if j.alvo is null then msgs := msgs || to_jsonb('🗣️ Você não seguiu ninguém.'::text);
      else
        select * into dono from jogadores where id = j.alvo;
        h := _jg_loc(dono);
        if h = dono.id then msgs := msgs || to_jsonb('🗣️ Você seguiu ' || dono.nome || ': passou a noite em casa.');
        else msgs := msgs || to_jsonb('🗣️ Você seguiu ' || dono.nome || ': foi até a casa de ' || (select nome from jogadores where id = h) || '.'); end if;
      end if;
    elsif j.papel = 'benzedeira' then
      if info_map ? ('salvo_' || _jg_loc(j)) then
        msgs := msgs || to_jsonb('🌿 Você espantou um ataque contra ' || (info_map ->> ('salvo_' || _jg_loc(j))) || '!');
      end if;
    elsif j.papel = 'assassino' and j.alvo is not null and j.alvo <> j.id then
      select * into dono from jogadores where id = j.alvo;
      if dono.id = any(mortos) then msgs := msgs || to_jsonb('🔪 Serviço feito: ' || dono.nome || ' não acorda mais.');
      elsif dono.papel = 'assassino' then msgs := msgs || to_jsonb('🔪 Essa casa é de um parceiro seu. Nada feito.'::text);
      elsif _jg_loc(dono) <> dono.id then msgs := msgs || to_jsonb('🔪 ' || dono.nome || ' não estava em casa.');
      elsif info_map ? ('salvo_' || dono.id) then msgs := msgs || to_jsonb('🔪 Alguém protegeu ' || dono.nome || '! O ataque falhou.');
      end if;
    end if;

    if j.id = any(mortos) then
      msgs := msgs || to_jsonb('💀 Você foi atacado(a) esta noite. Agora é alma penada: não pode falar, mas de noite pode deixar uma palavra numa casa.'::text);
    end if;
    update jogadores set info = msgs,
      visto = jsonb_build_object('casa', _jg_loc(j), 'ids', coalesce(to_jsonb(ids_casa), '[]'::jsonb))
      where id = j.id;
  end loop;

  -- 3) recados das almas penadas
  for j in select * from jogadores where sala = p_code and not vivo and agiu and alvo is not null and coalesce(palavra, '') <> '' loop
    palavras := palavras || jsonb_build_object('casa', (select nome from jogadores where id = j.alvo), 'palavra', j.palavra);
  end loop;

  -- 4) mortes
  for j in select * from jogadores where id = any(mortos) order by ordem loop
    mortos_json := mortos_json || jsonb_build_object('nome', j.nome, 'arma', armas[1 + floor(random() * array_length(armas, 1))::int]);
  end loop;
  update jogadores set vivo = false, visto = null where id = any(mortos);
  update jogadores set visto = null where sala = p_code and not vivo;
  update jogadores set agiu = false, alvo = null, palavra = null, voto = null, votou = false where sala = p_code;
  update jogadores set info = '[]'::jsonb where sala = p_code and not vivo and not (id = any(mortos));

  update salas set fase = 'dia',
    anuncio = jsonb_build_object('tipo', 'manha', 'dia', s.dia, 'mortos', mortos_json, 'salvos', salvos, 'palavras', palavras)
    where code = p_code;
  if not _jg_checar(p_code) then perform _jg_bots_votar(p_code); end if;
end $$;

-- ---------- apura a votação ----------
create or replace function public._jg_apurar(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s salas; topo bigint; topn int; empate int; fora jogadores;
  votos jsonb;
begin
  select * into s from salas where code = p_code for update;
  select coalesce(jsonb_agg(jsonb_build_object('de', j.nome, 'em', coalesce(a.nome, 'Pular')) order by j.ordem), '[]'::jsonb)
    into votos from jogadores j left join jogadores a on a.id = j.voto
    where j.sala = p_code and j.vivo;
  select voto, count(*) into topo, topn from jogadores
    where sala = p_code and vivo and votou group by voto order by count(*) desc limit 1;
  select count(*) into empate from (
    select voto from jogadores where sala = p_code and vivo and votou group by voto having count(*) = topn) x;
  if topo is not null and empate = 1 and topn >= 2 then
    select * into fora from jogadores where id = topo;
    update jogadores set vivo = false,
      info = jsonb_build_array('⚖️ A vila votou e você foi expulso(a). Agora é alma penada: não pode falar, mas de noite pode deixar uma palavra numa casa.')
      where id = topo;
    update salas set fase = 'veredito', anuncio = jsonb_build_object('tipo', 'veredito', 'dia', s.dia, 'votos', votos,
      'expulso', jsonb_build_object('nome', fora.nome, 'papel', fora.papel), 'manha', s.anuncio) where code = p_code;
  else
    update salas set fase = 'veredito', anuncio = jsonb_build_object('tipo', 'veredito', 'dia', s.dia, 'votos', votos,
      'expulso', null, 'manha', s.anuncio) where code = p_code;
  end if;
  update jogadores set voto = null, votou = false where sala = p_code;
  perform _jg_checar(p_code);
end $$;

-- ============================================================
-- Funções que o app chama
-- ============================================================

create or replace function public.jg_criar_sala(p_nome text) returns json
language plpgsql security definer set search_path = public as $$
declare
  palavras text[] := array['CUIA','GAITA','LACO','ESPORA','XIS','MATE','BOTA','PALA','ERVA','FOGO','CHULA','TROPA','POTRO','SELA','RELHO'];
  c text; t uuid := gen_random_uuid(); n text := trim(p_nome);
begin
  if length(n) < 1 or length(n) > 20 then raise exception 'Nome deve ter de 1 a 20 letras.'; end if;
  loop
    c := palavras[1 + floor(random() * array_length(palavras, 1))::int] || '-' || (10 + floor(random() * 90)::int);
    exit when not exists (select 1 from salas where code = c);
  end loop;
  insert into salas(code, host_token) values (c, t);
  insert into jogadores(sala, token, nome, ordem) values (c, t, n, 1);
  return json_build_object('code', c, 'token', t);
end $$;

create or replace function public.jg_entrar(p_code text, p_nome text) returns json
language plpgsql security definer set search_path = public as $$
declare s salas; n text := trim(p_nome); t uuid; k int;
begin
  select * into s from salas where code = upper(trim(p_code));
  if not found then raise exception 'Sala não encontrada. Confere o código.'; end if;
  if s.fase <> 'lobby' then raise exception 'Essa partida já começou.'; end if;
  if length(n) < 1 or length(n) > 20 then raise exception 'Nome deve ter de 1 a 20 letras.'; end if;
  if exists (select 1 from jogadores where sala = s.code and lower(nome) = lower(n)) then
    raise exception 'Já tem alguém com esse nome na sala.'; end if;
  select count(*) into k from jogadores where sala = s.code;
  if k >= 12 then raise exception 'A sala está cheia (máximo 12).'; end if;
  insert into jogadores(sala, nome, ordem) values (s.code, n, k + 1) returning token into t;
  perform _jg_bump(s.code);
  return json_build_object('code', s.code, 'token', t);
end $$;

create or replace function public.jg_versao(p_code text) returns int
language sql security definer set search_path = public as $$
  select versao from salas where code = upper(trim(p_code));
$$;

create or replace function public.jg_estado(p_code text, p_token uuid) returns json
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas; lista json;
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala;
  select json_agg(json_build_object(
      'id', j.id, 'nome', j.nome, 'vivo', j.vivo, 'bot', j.bot,
      'pronto', case when s.fase = 'noite' then j.agiu when s.fase = 'dia' then j.votou else false end,
      'papel', case
        when s.fase = 'fim' then j.papel
        when not j.vivo then j.papel
        when j.id = me.id then case when j.papel = 'bebado' then 'vigia' else j.papel end
        when not me.vivo then j.papel
        when me.papel = 'assassino' and j.papel = 'assassino' then 'assassino'
        else null end
    ) order by j.ordem) into lista
  from jogadores j where j.sala = me.sala;
  return json_build_object(
    'sala', json_build_object('code', s.code, 'fase', s.fase, 'dia', s.dia, 'versao', s.versao,
                              'anuncio', s.anuncio, 'vencedor', s.vencedor),
    'me', json_build_object('id', me.id, 'nome', me.nome, 'vivo', me.vivo, 'host', s.host_token = me.token,
                            'papel', case when me.papel = 'bebado' and s.fase <> 'fim' then 'vigia' else me.papel end,
                            'alvo', me.alvo, 'palavra', me.palavra, 'agiu', me.agiu, 'voto', me.voto, 'votou', me.votou,
                            'info', me.info, 'visto', me.visto),
    'jogadores', lista);
end $$;

create or replace function public.jg_remover(p_code text, p_token uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas;
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala;
  if s.host_token <> me.token then raise exception 'Só quem criou a sala pode fazer isso.'; end if;
  if s.fase <> 'lobby' then raise exception 'Só dá pra remover antes de começar.'; end if;
  if p_id = me.id then raise exception 'Você não pode se remover.'; end if;
  delete from jogadores where id = p_id and sala = me.sala;
  perform _jg_bump(me.sala);
end $$;

create or replace function public.jg_comecar(p_code text, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas; n int; papeis text[] := '{}';
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala for update;
  if s.host_token <> me.token then raise exception 'Só quem criou a sala pode começar.'; end if;
  if s.fase not in ('lobby', 'fim') then raise exception 'A partida já está rolando.'; end if;
  select count(*) into n from jogadores where sala = me.sala;
  if n < 5 then raise exception 'Precisa de pelo menos 5 jogadores.'; end if;
  papeis := papeis || 'assassino'::text;
  if n >= 8 then papeis := papeis || 'assassino'::text; end if;
  papeis := papeis || array['vigia', 'benzedeira'];
  if n >= 6 then papeis := papeis || 'fofoqueira'::text; end if;
  if n >= 7 then papeis := papeis || 'bebado'::text; end if;
  while array_length(papeis, 1) < n loop papeis := papeis || 'morador'::text; end loop;
  with p as (select id, row_number() over (order by random()) rn from jogadores where sala = me.sala)
  update jogadores j set papel = papeis[p.rn], vivo = true, alvo = null, palavra = null, agiu = false,
    voto = null, votou = false, info = '[]'::jsonb, visto = null
  from p where j.id = p.id;
  update salas set fase = 'noite', dia = 1, vencedor = null, anuncio = jsonb_build_object('tipo', 'inicio') where code = me.sala;
  perform _jg_bots_noite(me.sala);
  perform _jg_bump(me.sala);
end $$;

create or replace function public.jg_agir(p_code text, p_token uuid, p_alvo bigint, p_palavra text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas; alvo jogadores;
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala for update;
  if s.fase <> 'noite' then raise exception 'Agora não é noite.'; end if;
  select * into alvo from jogadores where id = p_alvo and sala = me.sala;
  if not found then raise exception 'Casa inválida.'; end if;
  if me.vivo then
    if not alvo.vivo then raise exception 'Essa casa está vazia (a pessoa morreu).'; end if;
    if me.papel = 'fofoqueira' and alvo.id = me.id then raise exception 'Escolha outra pessoa pra seguir.'; end if;
    update jogadores set alvo = p_alvo, agiu = true where id = me.id;
  else
    update jogadores set alvo = p_alvo, palavra = left(nullif(trim(coalesce(p_palavra, '')), ''), 20), agiu = true where id = me.id;
  end if;
  if not exists (select 1 from jogadores where sala = me.sala and vivo and not agiu) then
    perform _jg_resolver_noite(me.sala);
  end if;
  perform _jg_bump(me.sala);
end $$;

create or replace function public.jg_votar(p_code text, p_token uuid, p_alvo bigint) returns void
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas;
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala for update;
  if s.fase <> 'dia' then raise exception 'Agora não é hora de votar.'; end if;
  if not me.vivo then raise exception 'Alma penada não vota.'; end if;
  if p_alvo is not null and not exists (select 1 from jogadores where id = p_alvo and sala = me.sala and vivo and id <> me.id) then
    raise exception 'Voto inválido.'; end if;
  update jogadores set voto = p_alvo, votou = true where id = me.id;
  if not exists (select 1 from jogadores where sala = me.sala and vivo and not votou) then
    perform _jg_apurar(me.sala);
  end if;
  perform _jg_bump(me.sala);
end $$;

-- anfitrião: passa de fase (ou força quando alguém travou)
create or replace function public.jg_avancar(p_code text, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas;
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala for update;
  if s.host_token <> me.token then raise exception 'Só quem criou a sala pode fazer isso.'; end if;
  if s.fase = 'veredito' then
    update salas set fase = 'noite', dia = dia + 1 where code = me.sala;
    update jogadores set agiu = false, alvo = null, palavra = null where sala = me.sala;
    perform _jg_bots_noite(me.sala);
  elsif s.fase = 'noite' then
    perform _jg_resolver_noite(me.sala);
  elsif s.fase = 'dia' then
    perform _jg_apurar(me.sala);
  end if;
  perform _jg_bump(me.sala);
end $$;

create or replace function public.jg_reiniciar(p_code text, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me jogadores; s salas;
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala for update;
  if s.host_token <> me.token then raise exception 'Só quem criou a sala pode fazer isso.'; end if;
  update jogadores set papel = null, vivo = true, alvo = null, palavra = null, agiu = false, voto = null, votou = false, info = '[]'::jsonb
    where sala = me.sala;
  update salas set fase = 'lobby', dia = 0, vencedor = null, anuncio = '{}'::jsonb where code = me.sala;
  perform _jg_bump(me.sala);
end $$;

-- ============================================================
-- Bots (pra testar com pouca gente). Jogam sozinhos e no aleatório.
-- ============================================================
create or replace function public._jg_bots_noite(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare b jogadores; a bigint;
begin
  for b in select * from jogadores where sala = p_code and bot and vivo loop
    if b.papel = 'assassino' then
      -- ataca a casa de alguém que não é parceiro
      select id into a from jogadores where sala = p_code and vivo and papel <> 'assassino' order by random() limit 1;
    elsif b.papel = 'fofoqueira' then
      select id into a from jogadores where sala = p_code and vivo and id <> b.id order by random() limit 1;
    else
      select id into a from jogadores where sala = p_code and vivo order by random() limit 1;
    end if;
    update jogadores set alvo = coalesce(a, b.id), agiu = true where id = b.id;
  end loop;
  -- se só sobraram bots vivos, a noite resolve na hora
  if exists (select 1 from jogadores where sala = p_code and vivo)
     and not exists (select 1 from jogadores where sala = p_code and vivo and not agiu) then
    perform _jg_resolver_noite(p_code);
  end if;
end $$;

create or replace function public._jg_bots_votar(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare b jogadores; a bigint; suspeito bigint;
begin
  -- a "fofoca da roda": os bots tendem a votar todos no mesmo suspeito
  select id into suspeito from jogadores where sala = p_code and vivo order by random() limit 1;
  for b in select * from jogadores where sala = p_code and bot and vivo loop
    a := suspeito;
    if b.papel = 'assassino' and exists (select 1 from jogadores where id = a and papel = 'assassino') then
      select id into a from jogadores where sala = p_code and vivo and papel <> 'assassino' order by random() limit 1;
    end if;
    if a = b.id or random() < 0.2 then a := null; end if;
    update jogadores set voto = a, votou = true where id = b.id;
  end loop;
  if not exists (select 1 from jogadores where sala = p_code and vivo and not votou) then
    perform _jg_apurar(p_code);
  end if;
end $$;

create or replace function public.jg_add_bot(p_code text, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me jogadores; s salas; k int; n text;
  nomes text[] := array['Bot Tchê','Bot Bah','Bot Guri','Bot Prenda','Bot Peão','Bot Xiru',
                        'Bot Chinoca','Bot Piá','Bot Gaudério','Bot Vivente','Bot Changueiro'];
begin
  me := _jg_me(p_code, p_token);
  select * into s from salas where code = me.sala for update;
  if s.host_token <> me.token then raise exception 'Só quem criou a sala pode adicionar bots.'; end if;
  if s.fase <> 'lobby' then raise exception 'Só dá pra adicionar bots antes de começar.'; end if;
  select count(*) into k from jogadores where sala = me.sala;
  if k >= 12 then raise exception 'A sala está cheia (máximo 12).'; end if;
  select x into n from unnest(nomes) x
    where not exists (select 1 from jogadores where sala = me.sala and nome = x) limit 1;
  if n is null then n := 'Bot ' || (k + 1); end if;
  insert into jogadores(sala, nome, ordem, bot) values (me.sala, n, k + 1, true);
  perform _jg_bump(me.sala);
end $$;

-- permissões: só as funções jg_* ficam abertas pro app
revoke all on all functions in schema public from public;
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like '\_jg\_%' loop
    execute 'revoke all on function ' || f || ' from public, anon, authenticated';
  end loop;
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'jg\_%' loop
    execute 'grant execute on function ' || f || ' to anon, authenticated';
  end loop;
end $$;

-- limpeza: apaga salas paradas há mais de 2 dias (roda sempre que alguém cria sala)
create or replace function public._jg_limpar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from salas where atualizada < now() - interval '2 days';
  return new;
end $$;
drop trigger if exists jg_limpar on public.salas;
create trigger jg_limpar after insert on public.salas for each statement execute function public._jg_limpar();
