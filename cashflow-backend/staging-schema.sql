-- Cashflow staging-only schema baseline (2026-11-11).
-- Source: read-only SQLite DDL metadata from production; NO user rows copied.
-- Execute ONLY against the separate reddit-editor-staging-db D1 database.
-- This does not supersede future versioned migrations or back up production data.

-- table: telegram_inbox
CREATE TABLE IF NOT EXISTS telegram_inbox (update_id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, telegram_user_id TEXT NOT NULL, message_id TEXT, kind TEXT NOT NULL, received_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'received', error_code TEXT);

-- table: transactions
CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, identity_key TEXT UNIQUE, telegram_update_id INTEGER NOT NULL UNIQUE, telegram_user_id TEXT NOT NULL, chat_id TEXT NOT NULL, message_id TEXT, occurred_at TEXT, bank TEXT, direction TEXT CHECK(direction IN ('income','expense','transfer','unknown')), amount_minor INTEGER CHECK(amount_minor >= 0), currency TEXT NOT NULL DEFAULT 'VND', description TEXT, counterparty TEXT, bank_reference TEXT, category TEXT, confidence REAL CHECK(confidence BETWEEN 0 AND 1), status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(status IN ('REVIEW','OK','DUPLICATE','ERROR','REJECTED')), source_type TEXT NOT NULL, evidence_r2_key TEXT, evidence_drive_file_id TEXT, raw_redacted_json TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(telegram_update_id) REFERENCES telegram_inbox(update_id));

-- table: app_config
CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

-- table: audit_events
CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, transaction_id TEXT, event_type TEXT NOT NULL, safe_details TEXT, created_at TEXT NOT NULL);

-- table: cashflow_curation
CREATE TABLE IF NOT EXISTS cashflow_curation (
 transaction_id TEXT PRIMARY KEY REFERENCES transactions(id), deleted_at TEXT NOT NULL,
 deleted_by TEXT NOT NULL, operation_id TEXT NOT NULL
);

-- table: cashflow_manual_guards
CREATE TABLE IF NOT EXISTS cashflow_manual_guards (
 id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)
);

-- table: cashflow_manual_sessions
CREATE TABLE IF NOT EXISTS cashflow_manual_sessions (
 chat_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
 revision INTEGER NOT NULL, step INTEGER NOT NULL, draft_json TEXT NOT NULL,
 last_update_id INTEGER NOT NULL, expires_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('draft','saved','cancelled')),
 transaction_id TEXT, PRIMARY KEY(chat_id,user_id)
);

-- table: cashflow_revision
CREATE TABLE IF NOT EXISTS cashflow_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);

-- table: cashflow_write_guards
CREATE TABLE IF NOT EXISTS cashflow_write_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));

-- table: sync_outbox
CREATE TABLE IF NOT EXISTS sync_outbox (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, destination TEXT NOT NULL CHECK(destination IN ('google_sheets','google_drive')), state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','synced','failed')), attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, external_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(transaction_id,destination), FOREIGN KEY(transaction_id) REFERENCES transactions(id));

-- index: idx_transactions_status
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status,created_at DESC);

-- index: idx_transactions_time
CREATE INDEX IF NOT EXISTS idx_transactions_time ON transactions(occurred_at DESC,created_at DESC);

-- trigger: cashflow_tx_delete
CREATE TRIGGER IF NOT EXISTS cashflow_tx_delete AFTER DELETE ON transactions BEGIN UPDATE cashflow_revision SET revision=revision+1 WHERE id=1; END;

-- trigger: cashflow_tx_insert
CREATE TRIGGER IF NOT EXISTS cashflow_tx_insert AFTER INSERT ON transactions BEGIN UPDATE cashflow_revision SET revision=revision+1 WHERE id=1; END;

-- trigger: cashflow_tx_update
CREATE TRIGGER IF NOT EXISTS cashflow_tx_update AFTER UPDATE ON transactions BEGIN UPDATE cashflow_revision SET revision=revision+1 WHERE id=1; END;

-- Empty staging metadata: no transactions or other production rows are inserted.
INSERT OR IGNORE INTO cashflow_revision(id,revision) VALUES(1,1);
