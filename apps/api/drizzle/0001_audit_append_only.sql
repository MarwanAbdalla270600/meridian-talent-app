-- audit_log is append-only. The only permitted UPDATE is the GDPR redaction of
-- the diff payload (Art. 17), which replaces `diff` with {"redacted": true}
-- while keeping every other column unchanged. DELETE and TRUNCATE are rejected.
CREATE OR REPLACE FUNCTION audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.diff = '{"redacted": true}'::jsonb
     AND NEW.id = OLD.id AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     AND NEW.action = OLD.action AND NEW.entity = OLD.entity
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.ip IS NOT DISTINCT FROM OLD.ip AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();
