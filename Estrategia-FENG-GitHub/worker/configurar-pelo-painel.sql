-- Configuracao inicial do banco feng-regras.
-- Cria a estrutura e cadastra as regras, sem substituir registros existentes.

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL CHECK (version > 0),
  clubs_json TEXT NOT NULL CHECK (json_valid(clubs_json)),
  updated_at TEXT,
  change_note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules_history (
  version INTEGER PRIMARY KEY,
  clubs_json TEXT NOT NULL,
  updated_at TEXT,
  change_note TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS rules_insert_history AFTER INSERT ON rules BEGIN
  INSERT INTO rules_history(version,clubs_json,updated_at,change_note)
  VALUES(NEW.version,NEW.clubs_json,NEW.updated_at,NEW.change_note);
END;
CREATE TRIGGER IF NOT EXISTS rules_update_history AFTER UPDATE ON rules BEGIN
  INSERT INTO rules_history(version,clubs_json,updated_at,change_note)
  VALUES(NEW.version,NEW.clubs_json,NEW.updated_at,NEW.change_note);
END;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  password_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_expires ON login_attempts(expires_at);

-- Cadastra a primeira versão. Nunca sobrescreve alterações já salvas.
INSERT INTO rules(id,version,clubs_json,updated_at,change_note)
VALUES(1,1,'[{"id": "regras-fluminense", "club": "Fluminense", "arrears_grace": 5, "termination": "95 dias", "renewal_grace": 5, "finalization": 95, "advance_renewal": 30, "effective_from": "", "reference": "Carências e finalização: tabela fornecida, atualizada em 04/04/2025. Desligamento: mesma tabela. Renovação antecipada: informação fornecida nesta revisão.", "notes": ""}, {"id": "regras-flamengo", "club": "Flamengo", "arrears_grace": 30, "termination": "Não existe desligamento. O Sócio fica Inativo Inadimplente com 3 parcelas em aberto até quitar", "renewal_grace": 7, "finalization": 91, "advance_renewal": 45, "effective_from": "", "reference": "Carências e finalização: tabela fornecida, atualizada em 04/04/2025. Desligamento: correção informada nesta revisão. Renovação antecipada: informação fornecida nesta revisão.", "notes": ""}, {"id": "regras-botafogo", "club": "Botafogo", "arrears_grace": 7, "termination": "90 dias", "renewal_grace": 90, "finalization": 180, "advance_renewal": null, "effective_from": "", "reference": "Carências e finalização: tabela fornecida, atualizada em 04/04/2025. Desligamento: mesma tabela.", "notes": ""}, {"id": "regras-sao-paulo", "club": "São Paulo", "arrears_grace": 8, "termination": "90 dias", "renewal_grace": 1, "finalization": 60, "advance_renewal": 60, "effective_from": "", "reference": "Carências e finalização: tabela fornecida, atualizada em 04/04/2025. Desligamento: mesma tabela. Renovação antecipada: informação fornecida nesta revisão.", "notes": ""}, {"id": "regras-vasco", "club": "Vasco", "arrears_grace": 10, "termination": "90 dias", "renewal_grace": 10, "finalization": 60, "advance_renewal": 75, "effective_from": "", "reference": "Carências e finalização: tabela fornecida, atualizada em 04/04/2025. Desligamento: mesma tabela. Renovação antecipada: informação fornecida nesta revisão.", "notes": ""}]',NULL,'Regras fornecidas e correções desta revisão.')
ON CONFLICT(id) DO NOTHING;

SELECT
  json_extract(value, '$.club') AS clube,
  json_extract(value, '$.advance_renewal') AS renovacao_antecipada_dias,
  json_extract(value, '$.termination') AS desligamento,
  json_extract(value, '$.finalization') AS finalizacao_dias
FROM rules, json_each(rules.clubs_json)
WHERE rules.id = 1;
