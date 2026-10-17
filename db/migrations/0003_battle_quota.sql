-- Enforce the per-account cap atomically, including concurrent new saves.
-- Existing battles remain writable; retries of an existing ID do not consume quota.
CREATE TRIGGER battles_user_quota
BEFORE INSERT ON battles
WHEN NOT EXISTS (
  SELECT 1 FROM battles WHERE user_id = NEW.user_id AND id = NEW.id
) AND (SELECT count(*) FROM battles WHERE user_id = NEW.user_id) >= 200
BEGIN
  SELECT RAISE(ABORT, 'casper_battle_quota');
END;
