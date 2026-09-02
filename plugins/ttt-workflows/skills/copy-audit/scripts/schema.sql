CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  file TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  char_start INTEGER NOT NULL,   -- offset into the file of the editable text payload (inclusive)
  char_end INTEGER NOT NULL,     -- offset one past the payload (exclusive)
  syntax TEXT NOT NULL,          -- md-heading | md-prose | md-listitem | md-blockquote | md-alt |
                                 -- frontmatter | json-copy | yaml-copy | jsx-text | attr-copy |
                                 -- js-string | text-line
  block_text TEXT NOT NULL,      -- exact in-file payload (what char_start..char_end spans)
  file_full_text_b64 TEXT NOT NULL,
  file_sha TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT 'pending',  -- pending | keep | rewrite | flag
  rewrite TEXT,                  -- replacement text (verdict='rewrite' only)
  category TEXT,                 -- plain-language | inclusive | microcopy | voice-grammar
  severity TEXT,                 -- blocker | high | medium | low
  note TEXT,                     -- reviewer rationale (required for rewrite + flag)
  applied INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_units_file ON units(file);
CREATE INDEX IF NOT EXISTS idx_units_verdict ON units(verdict);
