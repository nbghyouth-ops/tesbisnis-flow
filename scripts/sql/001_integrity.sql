-- Integritas akuntansi (dijalankan eksplisit setelah migrasi; bukan saat startup aplikasi).
-- Jurnal posted immutable: baris jurnal tidak boleh diubah/dihapus; entry hanya boleh berubah status -> reversed.
CREATE OR REPLACE FUNCTION bf_block_journal_line_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'journal_lines is append-only (posted journal immutable)'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bf_jl_immutable ON journal_lines;
CREATE TRIGGER bf_jl_immutable BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION bf_block_journal_line_change();

CREATE OR REPLACE FUNCTION bf_guard_journal_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'journal_entries cannot be deleted'; END IF;
  IF NEW.entry_date <> OLD.entry_date OR NEW.number <> OLD.number OR NEW.workspace_id <> OLD.workspace_id OR NEW.memo IS DISTINCT FROM OLD.memo THEN
    RAISE EXCEPTION 'posted journal entry is immutable (use reversal)'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bf_je_guard ON journal_entries;
CREATE TRIGGER bf_je_guard BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION bf_guard_journal_entry();

-- Stock movements append-only.
CREATE OR REPLACE FUNCTION bf_block_stock_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'stock_movements is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bf_sm_immutable ON stock_movements;
CREATE TRIGGER bf_sm_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION bf_block_stock_change();
