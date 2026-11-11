// DESTRUCTIVE STAGING-ONLY D1 Time Travel rehearsal.
// Uses only fixed synthetic records, with fail-closed resource checks.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const STAGING_DB_ID = '5dab001b-e703-49bf-974a-35251d630328';
export const STAGING_DB_NAME = 'reddit-editor-staging-db';
export const PRODUCTION_DB_NAME = 'tet-dinh-mui-cashflow-db';
export const PRODUCTION_DB_ID = 'cccc9d27-6260-4f80-85af-dfe5d69a8bb7';

const synthetic = {
  update: -2026111101,
  id: '00000000-0000-4000-8000-000000000010',
  amount: 777
};

export function assertStagingResourceIdentity(databases) {
  if (!Array.isArray(databases) || STAGING_DB_ID === PRODUCTION_DB_ID) {
    throw Error('STAGING_IDENTITY_UNVERIFIED');
  }
  const stage = databases.find(row => row.uuid === STAGING_DB_ID);
  const prod = databases.find(row => row.uuid === PRODUCTION_DB_ID);
  if (!stage || stage.name !== STAGING_DB_NAME || !prod ||
      prod.name !== PRODUCTION_DB_NAME || stage.uuid === prod.uuid) {
    throw Error('STAGING_IDENTITY_UNVERIFIED');
  }
  return true;
}

export async function rehearsal({ accountId, token, fetcher = fetch } = {}) {
  if (!/^[0-9a-f]{32}$/.test(accountId || '') || !token) {
    throw Error('Cloudflare credentials missing; rehearsal NOT started');
  }
  const api = 'https://api.cloudflare.com/client/v4/accounts/' + accountId;
  const headers = { Authorization: 'Bearer ' + token };
  const call = async (path, method = 'GET', body, query = '') => {
    if (!path.startsWith(api + '/d1/database')) {
      throw Error('Unexpected Cloudflare endpoint');
    }
    const response = await fetcher(path + query, {
      method, headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw Error('Staging D1 API HTTP ' + response.status);
    const data = await response.json();
    if (data.success !== true) throw Error('Staging D1 API rejected operation');
    return data.result;
  };

  // Read and verify both identities before any potentially destructive request.
  const databases = await call(api + '/d1/database');
  assertStagingResourceIdentity(databases);
  const url = api + '/d1/database/' + STAGING_DB_ID;

  const sql = async statement => {
    const result = await call(url + '/query', 'POST', { sql: statement });
    return (result || []).flatMap(r => r.results || []);
  };
  const count = async () => {
    const rows = await sql(
      'SELECT (SELECT COUNT(*) FROM transactions) tx,' +
      '(SELECT COUNT(*) FROM telegram_inbox) messages,' +
      '(SELECT COUNT(*) FROM audit_events) audits,' +
      '(SELECT revision FROM cashflow_revision WHERE id=1) revision'
    );
    return rows[0];
  };

  const initial = await count();
  if (initial?.tx !== 0 || initial?.messages !== 0 || initial?.audits !== 0 ||
      !Number.isInteger(initial.revision)) throw Error('Staging D1 must be empty; abort');

  const bookmark = (await call(url + '/time_travel/bookmark'))?.bookmark;
  if (typeof bookmark !== 'string' || bookmark.length < 10) {
    throw Error('Staging bookmark unavailable; abort');
  }

  let dirty = false;
  let restored = false;
  try {
    await sql("INSERT INTO telegram_inbox(update_id,chat_id,telegram_user_id,message_id,kind,received_at) VALUES(" +
      synthetic.update + ",'STAGING_RESTORE_TEST','STAGING_RESTORE_TEST','synthetic','message','2026-11-11T00:00:00Z')");
    dirty = true;
    await sql("INSERT INTO transactions(id,telegram_update_id,telegram_user_id,chat_id,amount_minor,currency,description,status,source_type,created_at,updated_at) VALUES('" +
      synthetic.id + "'," + synthetic.update + ",'STAGING_RESTORE_TEST','STAGING_RESTORE_TEST'," +
      synthetic.amount + ",'VND','SYNTHETIC RESTORE DRILL ONLY','REVIEW','test','2026-11-11T00:00:00Z','2026-11-11T00:00:00Z')");
    const found = await sql("SELECT amount_minor FROM transactions WHERE id='" + synthetic.id + "'");
    if (found.length !== 1 || found[0].amount_minor !== synthetic.amount) {
      throw Error('Synthetic write-readback failed');
    }
    // Destructive restore is allowed ONLY for the positively identified staging ID.
    await call(url + '/time_travel/restore', 'POST', undefined,
      '?bookmark=' + encodeURIComponent(bookmark));
    restored = true;
    const final = await count();
    if (final.tx !== 0 || final.messages !== 0 || final.audits !== 0 ||
        final.revision !== initial.revision) {
      throw Error('Staging Time Travel restore verification failed');
    }
    return { staging: true, syntheticReadback: true, restored: true,
      revisionRestored: true, rowsAfterRestore: final.tx, secretOrBookmarkLogged: false };
  } finally {
    // Never touch production. If restoration fails, remove synthetic rows only
    // and preserve a failing status for operator investigation.
    if (dirty && !restored) {
      await sql("DELETE FROM transactions WHERE id='" + synthetic.id + "'").catch(() => {});
      await sql('DELETE FROM telegram_inbox WHERE update_id=' + synthetic.update).catch(() => {});
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--staging-only-restore-drill')) {
    console.error('Explicit --staging-only-restore-drill required; nothing changed.');
    process.exitCode = 2;
  } else {
    rehearsal({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_STAGING_API_TOKEN })
      .then(result => console.log('STAGING_RESTORE_DRILL_OK', JSON.stringify(result)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
