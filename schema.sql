-- Cloudflare D1 Schema for Tasks & Projects

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_name TEXT,
  parent_id INTEGER,
  FOREIGN KEY (parent_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  project_id INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_todos_project_id ON todos (project_id);
CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects (parent_id);
