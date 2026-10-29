import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

// Integration tests use only rollback transactions: no delivery worker or provider calls.
const url = process.env['SUPABASE_DB_URL'];
const db = url ? postgres(url, { max: 1 }) : undefined;
afterAll(async () => { if (db) await db.end(); });
// Execute the deployed SQL bodies in a session-private temporary schema. The
// diagnostics role cannot execute protected public functions; do not widen grants.
beforeAll(async () => {
  if (!db) return;
  await db`create temporary table bulk_test_session (id integer)`;
  const functions = await db`select proname, pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and proname in ('can_bulk_message','has_org_role','is_platform_admin','bulk_render','bulk_next_text_time') order by case proname when 'is_platform_admin' then 0 when 'has_org_role' then 1 else 2 end`;
  for (const fn of functions) {
    let definition = String(fn.definition).replace(/FUNCTION public\./, 'FUNCTION pg_temp.').replace('SECURITY DEFINER', 'SECURITY INVOKER');
    definition = definition.replaceAll('public.has_org_role(', 'pg_temp.has_org_role(').replaceAll('public.is_platform_admin(', 'pg_temp.is_platform_admin(');
    await db.unsafe(definition);
  }
});
describe.skipIf(!db)('Bulk messaging database safeguards', () => {
  it('keeps every existing group disabled and the new setting defaults to false', async () => {
    if (!db) return;
    const [row] = await db`select count(*) filter(where bulk_messaging_enabled) as enabled from public.messaging_settings`;
    expect(Number(row?.enabled)).toBe(0);
    const [column] = await db`select column_default from information_schema.columns where table_schema='public' and table_name='messaging_settings' and column_name='bulk_messaging_enabled'`;
    expect(column?.column_default).toBe('false');
  });

  async function rollbackScenario(role: string, assigned: boolean, expected: boolean) {
    if (!db) return;
    try {
      await db.begin(async tx => {
        const [store] = await tx`select d.id,d.org_id from public.dealerships d join public.organizations o on o.id=d.org_id where o.slug='abc-motors' order by d.id limit 1`;
        if (!store) throw new Error('Missing test store');
        const uid = crypto.randomUUID();
        const [member] = await tx`insert into public.org_members(org_id,user_id,role) values(${store.org_id},${uid},${role}) returning id`;
        if (assigned && member) await tx`insert into public.org_member_scopes(org_id,member_id,dealership_id) values(${store.org_id},${member.id},${store.id})`;
        const [access] = await tx`select pg_temp.can_bulk_message(${store.org_id},${store.id},${uid}) as allowed`;
        expect(access?.allowed).toBe(expected);
        const [other] = await tx`select d.id,d.org_id from public.dealerships d join public.organizations o on o.id=d.org_id where o.slug='lg-automotive-group' limit 1`;
        if (!other) throw new Error('Missing second org fixture');
        const [cross] = await tx`select pg_temp.can_bulk_message(${other.org_id},${other.id},${uid}) as allowed`;
        expect(cross?.allowed).toBe(false);
        throw new Error('ROLLBACK_TEST');
      });
    } catch (e) { if (!(e instanceof Error) || e.message !== 'ROLLBACK_TEST') throw e; }
  }
  it('allows recruiters across their org only', () => rollbackScenario('recruiter', false, true));
  it('allows group admins across their org only', () => rollbackScenario('group_admin', false, true));
  it('allows an assigned GM', () => rollbackScenario('dealer_manager', true, true));
  it('denies an unassigned GM', () => rollbackScenario('dealer_manager', false, false));
  it('allows an assigned hiring manager', () => rollbackScenario('hiring_manager', true, true));
  it('denies an unassigned hiring manager', () => rollbackScenario('hiring_manager', false, false));
  it('denies regional leaders even with store assignment', () => rollbackScenario('regional_leader', true, false));

  it('fills first name, job and store merge fields', async () => {
    if (!db) return;
    const [row] = await db`select pg_temp.bulk_render('Hi {first_name}: {job} at {store}', 'Test Applicant', 'Sales Consultant', 'ABC Motors Dallas') as body`;
    expect(row?.body).toBe('Hi Test: Sales Consultant at ABC Motors Dallas');
  });
  it('queues after-hours texts for the next store-local morning', async () => {
    if (!db) return;
    const [row] = await db`select pg_temp.bulk_next_text_time('2026-10-29T01:00:00Z','America/Chicago','08:00','18:00',array[1,2,3,4,5,6]) as at`;
    expect(new Date(row?.at).toISOString()).toBe('2026-10-29T13:00:00.000Z');
  });
  it('queues across DST and skips Sunday', async () => {
    if (!db) return;
    const [row] = await db`select pg_temp.bulk_next_text_time('2026-11-01T01:00:00Z','America/Chicago','08:00','18:00',array[1,2,3,4,5,6]) as at`;
    expect(new Date(row?.at).toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });
});