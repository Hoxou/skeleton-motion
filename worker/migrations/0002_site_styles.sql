-- One measured style profile per host, so repeat generations never spend
-- browser time. status: 'ok' (probe JSON stored) or 'empty' (retry later).
CREATE TABLE site_styles (
  host TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  probe TEXT,
  via TEXT,
  browser_ms INTEGER NOT NULL DEFAULT 0,
  measured_at TEXT NOT NULL
);
