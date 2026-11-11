CREATE TABLE IF NOT EXISTS cashflow_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT OR IGNORE INTO cashflow_revision VALUES(1,1);
CREATE TABLE IF NOT EXISTS cashflow_curation (
 transaction_id TEXT PRIMARY KEY REFERENCES transactions(id), deleted_at TEXT NOT NULL,
 deleted_by TEXT NOT NULL, operation_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cashflow_write_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
CREATE TRIGGER IF NOT EXISTS cashflow_tx_insert AFTER INSERT ON transactions BEGIN UPDATE cashflow_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS cashflow_tx_update AFTER UPDATE ON transactions BEGIN UPDATE cashflow_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS cashflow_tx_delete AFTER DELETE ON transactions BEGIN UPDATE cashflow_revision SET revision=revision+1 WHERE id=1; END;
