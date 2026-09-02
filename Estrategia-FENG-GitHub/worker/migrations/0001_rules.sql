CREATE TABLE rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL CHECK (version > 0),
  clubs_json TEXT NOT NULL CHECK (json_valid(clubs_json)),
  updated_at TEXT,
  change_note TEXT NOT NULL
);
CREATE TABLE rules_history (
  version INTEGER PRIMARY KEY,
  clubs_json TEXT NOT NULL,
  updated_at TEXT,
  change_note TEXT NOT NULL
);
CREATE TRIGGER rules_insert_history AFTER INSERT ON rules BEGIN
  INSERT INTO rules_history(version,clubs_json,updated_at,change_note)
  VALUES(NEW.version,NEW.clubs_json,NEW.updated_at,NEW.change_note);
END;
CREATE TRIGGER rules_update_history AFTER UPDATE ON rules BEGIN
  INSERT INTO rules_history(version,clubs_json,updated_at,change_note)
  VALUES(NEW.version,NEW.clubs_json,NEW.updated_at,NEW.change_note);
END;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  password_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_expires ON login_attempts(expires_at);
