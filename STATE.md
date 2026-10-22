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
  - Hierarchical project progress list (`#projectItemsList`) displaying parent and nested sub-project completion bars.
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
  - Project Category Chip Selector (`#taskCategoryChipsRow`): Selects parent project tag.
  - Sub-project Chip Selector (`#taskSubprojectChipsRow`): Conditionally rendered when selected parent project contains sub-projects.
  - Task input (`#taskInput`, max 255 chars) and Submit button (`#submitBtn`) with loading spinner.

### Slide 2: Settings & Project Categories (`#settingsPage`)
- **Header:** Title ("Settings"), subtitle, and session lock trigger (`#settingsLockBtn`).
- **Project Categories Management:**
  - Header actions: Reorder toggle (`#toggleReorderBtn`) and Add Project (`#openAddProjectBtn`).
  - Project Editor Card (`#projectFormCard`): Supports creating/editing groups, parent projects, and nested sub-projects.
  - Grouped Project List (`#settingsProjectsList`): Shows grouped projects with sub-project trees and reorder controls.
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

### Table: `todos`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique task identifier |
| `title` | TEXT | NOT NULL | Task description (includes project tag prefix e.g. `[Project / Subproject]`) |
| `completed` | INTEGER | NOT NULL DEFAULT 0 | Completion status (`0` = active, `1` = completed) |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | Task creation timestamp |

### Indexes
- `idx_todos_created_at` ON `todos (created_at DESC)`

### Critical Data Protection Assurance
- `functions/api/todos.js` strictly contains NO mock data seeding, NO table drops, and NO schema modification statements.
- Records are read, created, updated, and deleted strictly via explicit user actions in the interface.
- Projects hierarchy and preferences are managed client-side in `localStorage` under `app_custom_projects`.

---

## 3. Active API Endpoints & Headers

### Base Endpoint
`https://tasks.jagratara.com/api/todos` (Cloudflare Pages Functions: [functions/api/todos.js](file:///A:/jagratara.com/tasks/functions/api/todos.js))

### Required Headers
| Header | Value | Description |
|---|---|---|
| `Content-Type` | `application/json` | Request/response MIME type |
| `X-App-Password` | `<env.APP_PASSWORD>` | Application passcode authentication |

### Endpoints
| Method | Endpoint | Request Body / Params | Response | Description |
|---|---|---|---|---|
| `GET` | `/api/todos` | None | `{ todos: [...] }` | Retrieves all tasks ordered by `created_at DESC, id DESC`. |
| `POST` | `/api/todos` | `{ "title": "string" }` | `{ "todo": { id, title, completed, created_at } }` (201) | Creates a new task. |
| `PUT` | `/api/todos` | `{ "id": number, "title"?: string, "completed"?: boolean\|number }` | `{ "todo": { id, title, completed, created_at } }` (200) | Updates task title or completion status. Also accepts `?id=` param. |
| `DELETE` | `/api/todos` | Query `?id=` or body `{ "id": number }` | `{ "success": true, "id": number }` (200) | Deletes a task by ID. |
| `OPTIONS`| `/api/todos` | None | Empty (204) | CORS preflight handling. |
