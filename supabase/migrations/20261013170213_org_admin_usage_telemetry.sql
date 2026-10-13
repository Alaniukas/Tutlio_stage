-- Compact, private admin activity. No raw click stream, form values or request bodies.
CREATE TABLE public.org_admin_telemetry_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_cleanup_at timestamptz
);
INSERT INTO public.org_admin_telemetry_config(id) VALUES (true);

CREATE TABLE public.org_admin_usage_state (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz,
  last_active_at timestamptz,
  last_action_at timestamptz,
  last_action text,
  last_module text,
  last_login_at timestamptz,
  first_actions jsonb NOT NULL DEFAULT '{}',
  module_last_used jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE public.org_admin_usage_daily (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day date NOT NULL,
  active boolean NOT NULL DEFAULT false,
  modules jsonb NOT NULL DEFAULT '{}',
  actions jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (organization_id, user_id, day),
  FOREIGN KEY (organization_id, user_id) REFERENCES public.org_admin_usage_state ON DELETE CASCADE
);
CREATE INDEX org_admin_usage_daily_retention_idx ON public.org_admin_usage_daily(day);

-- One sequence cursor per tab, expiring after 48 hours. Retries cannot increment counters twice.
CREATE TABLE public.org_admin_telemetry_cursors (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, client_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES public.org_admin_usage_state ON DELETE CASCADE
);
CREATE INDEX org_admin_telemetry_cursors_retention_idx ON public.org_admin_telemetry_cursors(updated_at);

-- One error group per admin/day. Samples expire at 14 days, counters at 90 days.
CREATE TABLE public.org_admin_error_daily (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day date NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('javascript', 'api', 'supabase', 'operation')),
  module text NOT NULL CHECK (char_length(module) BETWEEN 1 AND 32),
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 40),
  endpoint text NOT NULL CHECK (char_length(endpoint) <= 100),
  operation text,
  occurrences integer NOT NULL CHECK (occurrences > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  sample jsonb CHECK (sample IS NULL OR octet_length(sample::text) <= 8000),
  PRIMARY KEY (organization_id, user_id, day, fingerprint),
  FOREIGN KEY (organization_id, user_id) REFERENCES public.org_admin_usage_state ON DELETE CASCADE
);
CREATE INDEX org_admin_error_daily_retention_idx ON public.org_admin_error_daily(day);

ALTER TABLE public.org_admin_telemetry_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_admin_usage_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_admin_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_admin_telemetry_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_admin_error_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_admin_telemetry_config, public.org_admin_usage_state, public.org_admin_usage_daily,
  public.org_admin_telemetry_cursors, public.org_admin_error_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_admin_telemetry_config, public.org_admin_usage_state,
  public.org_admin_usage_daily, public.org_admin_telemetry_cursors, public.org_admin_error_daily TO service_role;

CREATE FUNCTION public.org_admin_sum_counters(p_values jsonb[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_object_agg(key, total), '{}'::jsonb) FROM (
    SELECT entry.key, sum(entry.value::bigint) total
    FROM unnest(p_values) value CROSS JOIN LATERAL jsonb_each_text(value) entry GROUP BY entry.key
  ) totals;
$$;

CREATE FUNCTION public.record_org_admin_telemetry(
  p_organization_id uuid, p_user_id uuid, p_client_id uuid, p_sequence integer,
  p_active_at timestamptz, p_last_module text, p_last_action text, p_modules jsonb, p_actions jsonb,
  p_errors jsonb, p_release text, p_login_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_day date := (v_now AT TIME ZONE 'UTC')::date;
  v_received timestamptz;
  v_error jsonb;
  v_key text;
  v_first jsonb := '{}';
  v_modules jsonb := '{}';
  v_action text;
BEGIN
  -- Recheck membership inside the transaction, including revocations after HTTP auth.
  IF NOT EXISTS (SELECT 1 FROM public.organization_admins WHERE organization_id=p_organization_id AND user_id=p_user_id AND status='active') THEN
    RAISE EXCEPTION 'Inactive organization membership' USING ERRCODE='42501';
  END IF;
  IF p_sequence < 1 OR jsonb_typeof(p_modules) <> 'object' OR jsonb_typeof(p_actions) <> 'object'
    OR jsonb_typeof(p_errors) <> 'array' OR jsonb_array_length(p_errors) > 10
    OR octet_length(p_modules::text) > 2000 OR octet_length(p_actions::text) > 4000
    OR octet_length(p_errors::text) > 16000 OR char_length(p_release) > 80 THEN
    RAISE EXCEPTION 'Invalid telemetry batch' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.org_admin_telemetry_cursors WHERE organization_id=p_organization_id AND user_id=p_user_id AND client_id=p_client_id AND sequence >= p_sequence) THEN
    RETURN jsonb_build_object('accepted', true, 'duplicate', true);
  END IF;
  SELECT last_received_at INTO v_received FROM public.org_admin_usage_state WHERE organization_id=p_organization_id AND user_id=p_user_id;
  IF v_received > v_now - interval '15 seconds' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_errors) e WHERE NOT EXISTS (
      SELECT 1 FROM public.org_admin_error_daily d WHERE d.organization_id=p_organization_id AND d.user_id=p_user_id AND d.day=v_day AND d.fingerprint=e->>'fingerprint'
    ) AND (SELECT count(*) FROM public.org_admin_error_daily d WHERE d.organization_id=p_organization_id AND d.user_id=p_user_id AND d.day=v_day) < 100
  ) THEN
    RETURN jsonb_build_object('accepted', false, 'retry_after', 15);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.org_admin_telemetry_cursors WHERE organization_id=p_organization_id AND user_id=p_user_id AND client_id=p_client_id)
    AND (SELECT count(*) FROM public.org_admin_telemetry_cursors WHERE organization_id=p_organization_id AND user_id=p_user_id AND updated_at > v_now - interval '48 hours') >= 32 THEN
    RETURN jsonb_build_object('accepted', false, 'retry_after', 300);
  END IF;
  IF p_active_at < v_now - interval '6 minutes' OR p_active_at > v_now + interval '1 minute' THEN p_active_at := NULL; END IF;
  IF p_active_at IS NOT NULL THEN p_active_at := least(p_active_at, v_now); END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_modules) LOOP
    v_modules := v_modules || jsonb_build_object(v_key, v_now);
  END LOOP;
  IF p_active_at IS NOT NULL AND p_last_module IS NOT NULL THEN
    v_modules := v_modules || jsonb_build_object(p_last_module, p_active_at);
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_actions) LOOP
    IF v_key LIKE '%.success' THEN v_first := v_first || jsonb_build_object(regexp_replace(v_key, '\.success$', ''), v_now); END IF;
  END LOOP;
  v_action := CASE WHEN coalesce((p_actions->>(p_last_action || '.success'))::integer, 0) > 0 THEN p_last_action END;
  INSERT INTO public.org_admin_usage_state(organization_id,user_id,last_received_at,last_active_at,last_module,last_action,last_action_at,last_login_at,first_actions,module_last_used)
  VALUES(p_organization_id,p_user_id,v_now,p_active_at,CASE WHEN p_active_at IS NOT NULL OR p_modules <> '{}'::jsonb THEN p_last_module END,v_action,CASE WHEN v_action IS NOT NULL THEN v_now END,p_login_at,v_first,v_modules)
  ON CONFLICT(organization_id,user_id) DO UPDATE SET
    last_received_at=v_now,
    last_active_at=greatest(public.org_admin_usage_state.last_active_at,p_active_at),
    last_module=CASE WHEN p_active_at IS NOT NULL OR p_modules <> '{}'::jsonb THEN coalesce(p_last_module,public.org_admin_usage_state.last_module) ELSE public.org_admin_usage_state.last_module END,
    last_action=coalesce(v_action,public.org_admin_usage_state.last_action),
    last_action_at=CASE WHEN v_action IS NOT NULL THEN v_now ELSE public.org_admin_usage_state.last_action_at END,
    last_login_at=greatest(public.org_admin_usage_state.last_login_at,p_login_at),
    first_actions=v_first || public.org_admin_usage_state.first_actions,
    module_last_used=public.org_admin_usage_state.module_last_used || v_modules;
  INSERT INTO public.org_admin_telemetry_cursors VALUES(p_organization_id,p_user_id,p_client_id,p_sequence,v_now)
    ON CONFLICT(organization_id,user_id,client_id) DO UPDATE SET sequence=p_sequence,updated_at=v_now;
  INSERT INTO public.org_admin_usage_daily VALUES(p_organization_id,p_user_id,v_day,p_active_at IS NOT NULL,p_modules,p_actions)
    ON CONFLICT(organization_id,user_id,day) DO UPDATE SET
      active=public.org_admin_usage_daily.active OR excluded.active,
      modules=public.org_admin_sum_counters(ARRAY[public.org_admin_usage_daily.modules,p_modules]),
      actions=public.org_admin_sum_counters(ARRAY[public.org_admin_usage_daily.actions,p_actions]);
  FOR v_error IN SELECT value FROM jsonb_array_elements(p_errors) LOOP
    -- Bound new fingerprints during error storms while continuing existing counters.
    IF EXISTS (SELECT 1 FROM public.org_admin_error_daily WHERE organization_id=p_organization_id AND user_id=p_user_id AND day=v_day AND fingerprint=v_error->>'fingerprint')
      OR (SELECT count(*) FROM public.org_admin_error_daily WHERE organization_id=p_organization_id AND user_id=p_user_id AND day=v_day) < 100 THEN
      INSERT INTO public.org_admin_error_daily(organization_id,user_id,day,fingerprint,kind,module,code,endpoint,operation,occurrences,sample)
      VALUES(p_organization_id,p_user_id,v_day,v_error->>'fingerprint',v_error->>'kind',v_error->>'module',v_error->>'code',v_error->>'endpoint',v_error->>'operation',least(100,greatest(1,(v_error->>'count')::integer)),(v_error-'fingerprint') || jsonb_build_object('release',p_release))
      ON CONFLICT(organization_id,user_id,day,fingerprint) DO UPDATE SET occurrences=public.org_admin_error_daily.occurrences+excluded.occurrences,last_seen_at=v_now,sample=excluded.sample;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('accepted',true);
END;
$$;

CREATE FUNCTION public.org_admin_usage_report(p_organization_id uuid DEFAULT NULL, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0, p_search text DEFAULT '', p_include_demo boolean DEFAULT false, p_project_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
WITH filtered AS (
  SELECT o.*, (o.name ~* '(^demo[[:space:]]|(^|[[:space:]])qa([[:space:]]|$))' OR o.features->>'is_demo'='true') IS TRUE AS is_demo
  FROM public.organizations o WHERE (p_organization_id IS NULL OR o.id=p_organization_id)
    AND (p_search='' OR o.name ILIKE '%' || left(p_search,100) || '%')
), scoped AS (
  SELECT * FROM filtered WHERE p_include_demo OR NOT is_demo ORDER BY name,id LIMIT least(50,greatest(1,p_limit)) OFFSET greatest(0,p_offset)
), daily AS (
  SELECT d.* FROM public.org_admin_usage_daily d JOIN scoped s ON s.id=d.organization_id
  WHERE d.day >= (now() AT TIME ZONE 'UTC')::date-29
), errors AS (
  SELECT e.* FROM public.org_admin_error_daily e JOIN scoped s ON s.id=e.organization_id
  WHERE e.day >= (now() AT TIME ZONE 'UTC')::date-CASE WHEN p_organization_id IS NULL THEN 6 ELSE 89 END
), org_rows AS (
  SELECT s.id,s.name,s.entity_type,s.status,s.created_at,s.features,s.is_demo,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'user_id',a.user_id,'role',a.role,'status',a.status,'permissions',coalesce(a.permissions,'{}'),
      'full_name',p.full_name,'email',p.email,'first_observed_at',u.first_observed_at,'last_active_at',u.last_active_at,
      'last_action_at',u.last_action_at,'last_action',u.last_action,'last_module',u.last_module,'last_login_at',u.last_login_at,
      'first_actions',coalesce(u.first_actions,'{}'),'module_last_used',coalesce(u.module_last_used,'{}'),
      'active_days_7',(SELECT count(*) FROM daily d WHERE d.organization_id=s.id AND d.user_id=a.user_id AND d.active AND d.day >= (now() AT TIME ZONE 'UTC')::date-6),
      'active_days_30',(SELECT count(*) FROM daily d WHERE d.organization_id=s.id AND d.user_id=a.user_id AND d.active),
      'actions_7',(SELECT coalesce(sum(entry.value::bigint),0) FROM daily d CROSS JOIN LATERAL jsonb_each_text(d.actions) entry WHERE d.organization_id=s.id AND d.user_id=a.user_id AND d.day >= (now() AT TIME ZONE 'UTC')::date-6 AND entry.key LIKE '%.success'),
      'actions_30',(SELECT coalesce(sum(entry.value::bigint),0) FROM daily d CROSS JOIN LATERAL jsonb_each_text(d.actions) entry WHERE d.organization_id=s.id AND d.user_id=a.user_id AND entry.key LIKE '%.success')
    ) ORDER BY a.user_id) FROM public.organization_admins a LEFT JOIN public.profiles p ON p.id=a.user_id LEFT JOIN public.org_admin_usage_state u ON u.organization_id=a.organization_id AND u.user_id=a.user_id WHERE a.organization_id=s.id),'[]') admins,
    (SELECT count(DISTINCT day) FROM daily d WHERE d.organization_id=s.id AND d.active AND d.day >= (now() AT TIME ZONE 'UTC')::date-6) active_days_7,
    (SELECT count(DISTINCT day) FROM daily d WHERE d.organization_id=s.id AND d.active) active_days_30,
    (SELECT coalesce(sum(entry.value::bigint),0) FROM daily d CROSS JOIN LATERAL jsonb_each_text(d.actions) entry WHERE d.organization_id=s.id AND d.day >= (now() AT TIME ZONE 'UTC')::date-7 AND d.day < (now() AT TIME ZONE 'UTC')::date AND entry.key LIKE '%.success') current_week_actions,
    (SELECT coalesce(sum(entry.value::bigint),0) FROM daily d CROSS JOIN LATERAL jsonb_each_text(d.actions) entry WHERE d.organization_id=s.id AND d.day >= (now() AT TIME ZONE 'UTC')::date-14 AND d.day < (now() AT TIME ZONE 'UTC')::date-7 AND entry.key LIKE '%.success') previous_week_actions,
    public.org_admin_sum_counters(ARRAY(SELECT modules FROM daily d WHERE d.organization_id=s.id)) modules_30,
    public.org_admin_sum_counters(ARRAY(SELECT actions FROM daily d WHERE d.organization_id=s.id)) actions_30,
    (SELECT coalesce(sum(occurrences),0) FROM errors e WHERE e.organization_id=s.id AND e.day >= (now() AT TIME ZONE 'UTC')::date-6) errors_7,
    (SELECT coalesce(sum(occurrences),0) FROM errors e WHERE e.organization_id=s.id AND e.day = (now() AT TIME ZONE 'UTC')::date) errors_today,
    (SELECT coalesce(max(total),0) FROM (SELECT sum(occurrences) total FROM errors e WHERE e.organization_id=s.id AND e.day=(now() AT TIME ZONE 'UTC')::date GROUP BY fingerprint) repeated) repeated_errors_today
  FROM scoped s
), error_groups AS (
  SELECT fingerprint,min(module) module,min(kind) kind,min(code) code,min(endpoint) endpoint,min(operation) operation,
    sum(occurrences) occurrences,count(DISTINCT user_id) affected_admins,min(first_seen_at) first_seen_at,max(last_seen_at) last_seen_at,
    (array_agg(sample ORDER BY last_seen_at DESC) FILTER (WHERE sample IS NOT NULL AND last_seen_at >= now()-interval '14 days'))[1] sample
  FROM errors WHERE p_organization_id IS NOT NULL GROUP BY fingerprint ORDER BY max(last_seen_at) DESC LIMIT 50
), chart AS (
  SELECT d.day,count(DISTINCT d.user_id) FILTER (WHERE d.active) active_admins,
    coalesce(sum((SELECT sum(entry.value::bigint) FROM jsonb_each_text(d.actions) entry WHERE entry.key LIKE '%.success')),0) actions,
    (SELECT coalesce(sum(occurrences),0) FROM errors e WHERE e.day=d.day) errors
  FROM daily d WHERE p_organization_id IS NOT NULL GROUP BY d.day ORDER BY d.day
), server_counts AS (
  SELECT path,status_code,count(*) occurrences,max(occurred_at) last_seen_at
  FROM public.support_vercel_log_events WHERE project_id=p_project_id AND occurred_at>=now()-interval '14 days'
    AND (status_code>=500 OR level='fatal' OR (level='error' AND coalesce(message,'') NOT LIKE '%DEP0169%'))
  GROUP BY path,status_code ORDER BY max(occurred_at) DESC LIMIT 20
), server_errors AS (
  SELECT c.*,sample.message,sample.vercel_id FROM server_counts c CROSS JOIN LATERAL (
    SELECT l.message,l.vercel_id FROM public.support_vercel_log_events l
    WHERE l.project_id=p_project_id AND l.path IS NOT DISTINCT FROM c.path AND l.status_code IS NOT DISTINCT FROM c.status_code
      AND l.occurred_at=c.last_seen_at ORDER BY l.vercel_id LIMIT 1
  ) sample
)
SELECT jsonb_build_object('started_at',c.started_at,'last_cleanup_at',c.last_cleanup_at,
  'last_ingested_at',(SELECT max(last_received_at) FROM public.org_admin_usage_state),
  'total',(SELECT count(*) FROM filtered WHERE p_include_demo OR NOT is_demo),
  'organizations',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.name,o.id) FROM org_rows o),'[]'),
  'errors',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM error_groups e),'[]'),
  'daily',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM chart d),'[]'),
  'server_errors',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM server_errors e),'[]')) FROM public.org_admin_telemetry_config c;
$$;

CREATE FUNCTION public.cleanup_org_admin_telemetry() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_daily integer; v_errors integer; v_cursors integer; v_logs integer;
BEGIN
  DELETE FROM public.org_admin_usage_daily WHERE day < (now() AT TIME ZONE 'UTC')::date-364; GET DIAGNOSTICS v_daily=ROW_COUNT;
  UPDATE public.org_admin_error_daily SET sample=NULL WHERE last_seen_at < now()-interval '14 days' AND sample IS NOT NULL;
  DELETE FROM public.org_admin_error_daily WHERE day < (now() AT TIME ZONE 'UTC')::date-89; GET DIAGNOSTICS v_errors=ROW_COUNT;
  DELETE FROM public.org_admin_telemetry_cursors WHERE updated_at < now()-interval '48 hours'; GET DIAGNOSTICS v_cursors=ROW_COUNT;
  DELETE FROM public.support_vercel_log_events WHERE occurred_at < now()-interval '14 days'; GET DIAGNOSTICS v_logs=ROW_COUNT;
  DELETE FROM public.org_admin_usage_state s WHERE NOT EXISTS (SELECT 1 FROM public.organization_admins a WHERE a.organization_id=s.organization_id AND a.user_id=s.user_id);
  UPDATE public.org_admin_telemetry_config SET last_cleanup_at=now();
  RETURN jsonb_build_object('daily_deleted',v_daily,'errors_deleted',v_errors,'cursors_deleted',v_cursors,'logs_deleted',v_logs);
END;
$$;
REVOKE ALL ON FUNCTION public.org_admin_sum_counters(jsonb[]), public.record_org_admin_telemetry(uuid,uuid,uuid,integer,timestamptz,text,text,jsonb,jsonb,jsonb,text,timestamptz),
  public.org_admin_usage_report(uuid,integer,integer,text,boolean,text), public.cleanup_org_admin_telemetry() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.org_admin_sum_counters(jsonb[]), public.record_org_admin_telemetry(uuid,uuid,uuid,integer,timestamptz,text,text,jsonb,jsonb,jsonb,text,timestamptz),
  public.org_admin_usage_report(uuid,integer,integer,text,boolean,text), public.cleanup_org_admin_telemetry() TO service_role;
