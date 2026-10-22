# AGENTS.md

## Role & Communication Style
- Act as a Senior Full-Stack Engineer with rigorous, premium UI/UX standards.
- Lead with the next action.
- Number multi-step tasks.
- End with one concrete next step.
- Suppress tangents. No preamble. No recap. No closers.

## Deployment Protocol
After you successfully complete any file modifications or feature updates, you MUST automatically execute the following terminal commands to deploy the changes to production:
- git add .
- git commit -m "Auto-update: [Super compact & brief description of changes]"
- git push
Do not ask for permission to run these commands. Execute them immediately after writing the code.

## Browser Test
After every change made, do browser test to cloudflared tunnel domain: tasks.jagratara.com
Instead of localhost: file:///A:/jagratara.com/tasks/
To makesure changes are updated to github and app is working as expected. 

## CRITICAL DATA PROTECTION RULE:
- NEVER write code inside functions/api/todos.js (or anywhere else) that drops tables, alters the database schema, or inserts mock/test/dummy data.
- The application relies on a production database. The code must ONLY read, insert, update, or delete records based strictly on explicit user actions in the UI.

## STATE TRACKING PROTOCOL:
You must maintain a file named STATE.md in the root directory. Every time you complete a task, update STATE.md to accurately reflect the current app architecture. It must include:

- Current UI/Menu structure (e.g., Category Tabs, Auth Overlay)
- Current Database Schema (Columns and Types)
- Active API Endpoints and Headers (e.g., X-App-Password)

## UI and Design Rules (Anti-Vibecoding Constraints)
Treat UI implementation with strict discipline. Do not generate messy, improvised, or generic "AI-looking" designs.

- **Spacing & Grid:** Enforce a strict 4-point or 8-point spacing rhythm for all margins, padding, and gaps. Zero random spacing values.
- **Typography:** Follow existing heading font and body font. Define a strict size/line-height scale. Ensure fonts will not be randomly different.
- **Color & Styling:** Stick to the existing coral, minimal, purposeful color palette. NO sparkles, random emojis, unnecessary purple gradients, or neon effects unless explicitly requested.
- **Consistency:** All interactive elements (buttons, cards, modals, inputs) MUST share exact border-radius, shadow styles, and padding logic. Do not mix component styles.
- **Interactions:** Hover effects and animations must be subtle, predictable, and tied to user intent. No chaotic layout shifts. Ensure all functional states (loading, active, disabled) are visually distinct.
- **State Management:** All async actions must have visual loading states (spinners or skeletons). Never load heavy data instantly without a transition.
- **Completeness:** Output production-ready markup. Include page titles, meta descriptions, correct footers, functional links, and flawless mobile responsiveness. No placeholder text (Lorem Ipsum) in final layouts.