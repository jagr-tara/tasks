# Application State & Architecture

**Last Updated:** 2026-10-22  
**Target Domain:** https://tasks.jagratara.com  
**Runtime:** Cloudflare Pages + Cloudflare D1 Database  

---

## 1. UI & Menu Structure

The user interface follows a single-page, 3-slide horizontal viewport design with a curved bottom navigation dock.

### Authentication Overlay (`#authOverlay`)
- **Status:** Fast-path check via `localStorage.getItem('app_password')` applying `.is-authenticated`.
- **Elements:**
  - Passcode Modal Card (`.auth-card`)
  - Input field: `#authPassword` (`type="password"`)
  - Submit Button: `#authSubmitBtn` with dynamic loading spinner
  - Error banner: `#authAlert` (triggers on HTTP 401 response)

### Slide 0: Performance Dashboard (`#performancePage`)
- **Header:** Title ("Performance") with Notifications (`#notifBtn`) and Calendar (`#calBtn`) action triggers.
- **Period Filter:** Segmented tabs (`#periodTabs`) for `Week`, `Month`, and `Year`.
- **Productivity Card:**
  - Trend badge (`#trendBadge`) displaying completion trend percentage.
  - Large stat display (`#focusedTimeValue`) with comparison subtext (`#comparisonSubtext`).
  - Activity Matrix / Heatmap Grid (`#heatmapGrid`) rendering dynamic daily task activity.
- **Projects & Sub-projects Progress:**
  - Header with navigation shortcut to project manager (`#seeAllProjectsBtn`).
  - Hierarchical project progress list (`#projectItemsList`) displaying parent and nested sub-project completion bars dynamically queried via D1 relational data.
- **Metrics Grid:**
  - Tasks Done card (`#cardTasksDone`) with clickable navigation to task list.
  - Completion Rate card (`#avgDailyFocusValue`).

### Slide 1: Task Management (`#tasksPage`)
- **Header:** Title ("Tasks") with session lock button (`#lockBtn`).
- **Filter Segmented Control:**
  - Tabs: `All` (`#countAll`), `Active` (`#countActive`), `Done` (`#countCompleted`).
- **Task List Card (`.list-card`):**
  - Animated skeleton loader (`#loadingSkeleton`).
  - Task list (`#todoList`) rendering tasks with completion toggles, project badges, inline editing, and deletion.
  - Empty state container (`#emptyState`).
  - List footer: Remaining counter (`#itemsLeft`), "Clear completed" action (`#clearCompletedBtn`), and sync indicator (`#syncStatus`).
- **Add Task Card (`.add-task-card`):**
  - Project Category Chip Selector (`#taskCategoryChipsRow`): Dynamically renders parent project chips clustered by `group_name` fetched from `/api/projects`.
  - Sub-project Chip Selector (`#taskSubprojectChipsRow`): Dynamically renders sub-project chips (mapped by `parent_id`) for the currently selected parent project.
  - Task input (`#taskInput`, max 255 chars) and Submit button (`#submitBtn`) with loading spinner. Saves tasks with relational `project_id`.

### Slide 2: Settings & Project Categories (`#settingsPage`)
- **Header:** Title ("Settings"), subtitle, and session lock trigger (`#settingsLockBtn`).
- **Project Categories Management:**
  - Header actions: Reorder toggle (`#toggleReorderBtn`) and Add Project (`#openAddProjectBtn`).
  - Project Editor Card (`#projectFormCard`): Form modal for creating/editing parent projects and nested sub-projects backed directly by Cloudflare D1 via `/api/projects`.
  - Grouped Project List (`#settingsProjectsList`): Shows grouped projects dynamically aggregated by `group_name`, sub-project trees mapped via `parent_id`, task counts, edit triggers, and deletion actions.
- **Preferences:**
  - Database Storage connection status (`Cloudflare D1 • Active Connection`).

### Bottom Navigation Dock (`.bottom-floating-bar`)
- Curved SVG dock wrapper cradling a raised central floating action button (FAB).
- **Navigation Controls:**
  - Left Item: Performance Dashboard (`#navPerformanceBtn`, slide 0).
  - Center FAB: Tasks Management (`#fabAddBtn`, slide 1).
  - Right Item: Settings & Projects (`#navSettingsBtn`, slide 2).

---

## 2. Database Schema (Cloudflare D1)

The database schema is defined in [schema.sql](file:///A:/jagratara.com/tasks/schema.sql) and runs on SQLite-based Cloudflare D1.

### Table: `projects`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique project identifier |
| `name` | TEXT | NOT NULL | Project or sub-project name |
| `group_name` | TEXT | NULL | Project group category name (e.g. `Management`, `Product`) |
| `parent_id` | INTEGER | NULL, REFERENCES `projects(id)` | Parent project ID (`NULL` for parent projects, non-null for sub-projects) |

### Table: `todos`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique task identifier |
| `title` | TEXT | NOT NULL | Task description (supports bracket tag prefix e.g. `[Project / Subproject]`) |
| `completed` | INTEGER | NOT NULL DEFAULT 0 | Completion status (`0` = active, `1` = completed) |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Task creation timestamp |
| `project_id` | INTEGER | NULL, REFERENCES `projects(id)` | Foreign key referencing associated project or sub-project |

### Indexes
- `idx_todos_created_at` ON `todos (created_at DESC)`
- `idx_todos_project_id` ON `todos (project_id)`
- `idx_projects_parent_id` ON `projects (parent_id)`

### Critical Data Protection Assurance
- `functions/api/todos.js` and `functions/api/projects.js` strictly contain NO mock data seeding, NO table drops, and NO schema modification statements.
- Records are read, created, updated, and deleted strictly via explicit user actions in the interface.
- Client-side storage `localStorage` is used solely for session authentication tokens (`app_password`) and temporary offline caching. All projects, groups, and sub-projects are stored exclusively in the Cloudflare D1 database.

---

## 3. Active API Endpoints & Headers

### Base Endpoints
- `https://tasks.jagratara.com/api/todos` (Cloudflare Pages Functions: [functions/api/todos.js](file:///A:/jagratara.com/tasks/functions/api/todos.js))
- `https://tasks.jagratara.com/api/projects` (Cloudflare Pages Functions: [functions/api/projects.js](file:///A:/jagratara.com/tasks/functions/api/projects.js))

### Required Headers
| Header | Value | Description |
|---|---|---|
| `Content-Type` | `application/json` | Request/response MIME type |
| `X-App-Password` | `<env.APP_PASSWORD>` | Application passcode authentication |

### Endpoints: `/api/todos`
| Method | Endpoint | Request Body / Params | Response | Description |
|---|---|---|---|---|
| `GET` | `/api/todos` | None | `{ todos: [...] }` | Retrieves all tasks with `id, title, completed, created_at, project_id` ordered by `created_at DESC, id DESC`. |
| `POST` | `/api/todos` | `{ "title": "string", "project_id"?: number\|null }` | `{ "todo": { id, title, completed, created_at, project_id } }` (201) | Creates a new task with associated `project_id`. |
| `PUT` | `/api/todos` | `{ "id": number, "title"?: string, "completed"?: boolean\|number, "project_id"?: number\|null }` | `{ "todo": { id, title, completed, created_at, project_id } }` (200) | Updates task title, completion status, or project association. |
| `DELETE` | `/api/todos` | Query `?id=` or body `{ "id": number }` | `{ "success": true, "id": number }` (200) | Deletes a task by ID. |
| `OPTIONS`| `/api/todos` | None | Empty (204) | CORS preflight handling. |

### Endpoints: `/api/projects`
| Method | Endpoint | Request Body / Params | Response | Description |
|---|---|---|---|---|
| `GET` | `/api/projects` | None | `{ projects: [...] }` | Retrieves all projects (`id, name, group_name, parent_id`) ordered by `id ASC`. |
| `POST` | `/api/projects` | `{ "name": "string", "group_name"?: string, "parent_id"?: number\|null }` | `{ "project": { id, name, group_name, parent_id } }` (201) | Creates a new parent project or sub-project. |
| `PUT` | `/api/projects` | `{ "id": number, "name"?: string, "group_name"?: string, "parent_id"?: number\|null }` | `{ "project": { id, name, group_name, parent_id } }` (200) | Updates an existing project or sub-project. Also accepts `?id=` param. |
| `DELETE` | `/api/projects` | Query `?id=` or body `{ "id": number }` | `{ "success": true, "id": number }` (200) | Deletes a project by ID, cascades sub-projects, and detaches associated tasks (`project_id = NULL`). |
| `OPTIONS`| `/api/projects` | None | Empty (204) | CORS preflight handling. |
