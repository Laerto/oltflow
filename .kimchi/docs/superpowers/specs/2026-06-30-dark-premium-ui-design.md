# OLTFlow Dark-Premium UI/UX Refresh — Design Spec

**Date:** 2026-06-30  
**Scope:** UI/UX modernization of the OLTFlow Next.js web app (Albanian NOC UI).  
**Approach:** Adopt shadcn/ui + Tailwind CSS v4 + Lucide React icons, dark-first premium theme, mobile/tablet responsive layout.  

---

## 1. Goal

Transform the existing functional-but-plain OLTFlow UI into a modern, premium-looking network operations dashboard that:

1. Looks professional and “high-end” on desktop.
2. Works fully on tablets and mobile phones without broken tables or clipped modals.
3. Uses consistent, meaningful iconography instead of emoji.
4. Maintains all existing functionality (pages, modals, actions) — this is a **visual/structural refactor**, not a feature change.

---

## 2. Visual Direction

### 2.1 Theme
- **Dark-first / always-dark** for this phase. No light-mode toggle in scope.
- Deep navy/black backgrounds, elevated surface cards, subtle borders, cyan/blue gradient accents.

### 2.2 Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `oklch(0.145 0.02 270)` | Page background |
| `--foreground` | `oklch(0.92 0.01 270)` | Primary text |
| `--card` | `oklch(0.205 0.02 270)` | Card/panel surfaces |
| `--card-foreground` | `oklch(0.92 0.01 270)` | Text on cards |
| `--popover` | `oklch(0.22 0.02 270)` | Dropdowns, popovers |
| `--primary` | `oklch(0.68 0.15 240)` | Primary accent (cyan/blue) |
| `--primary-foreground` | `oklch(0.12 0.02 270)` | Text on primary buttons |
| `--secondary` | `oklch(0.27 0.02 270)` | Secondary buttons/chips |
| `--muted` | `oklch(0.3 0.02 270)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.65 0.01 270)` | Secondary/muted text |
| `--border` | `oklch(0.3 0.02 270)` | Borders/dividers |
| `--ring` | `oklch(0.68 0.15 240)` | Focus rings |
| `--success` | `#10b981` | Online / good signal |
| `--warning` | `#f59e0b` | Warning signal |
| `--danger` | `#f43f5e` | Offline / critical / errors |
| `--info` | `#3b82f6` | Info / processing |

### 2.3 Typography
- Font stack: Tailwind default sans (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`).
- Headings: `font-semibold tracking-tight`.
- Data/metrics: `font-mono tabular-nums` for RX/TX dBm, counts, IPs.
- Base size: `14px` body, `13px` labels, `12px` badges/meta.

### 2.4 Effects
- Card hover: subtle lift (`translate-y-[-1px]`) + soft glow shadow.
- Focus: cyan/blue ring (`ring-2 ring-primary/30`).
- Transitions: `transition-all duration-200` on interactive elements.
- Backdrop blur on modals/sheets.

---

## 3. Iconography

Replace every emoji with a Lucide icon. Mapping:

| Concept | Emoji now | Lucide icon |
|---------|-----------|-------------|
| OLT / server | — | `Server` |
| ONU / router | — | `Router` |
| Online | 🟢 | `Wifi` (green) or `CheckCircle2` |
| Offline | 🔴 | `WifiOff` (red) |
| Warning signal | 🟡 | `AlertTriangle` |
| Signal / optical | — | `Activity` |
| Dashboard | — | `LayoutDashboard` |
| ONU list | — | `List` or `Router` |
| Unconfigured | — | `Plug` |
| Provisioning | — | `Settings2` |
| OLT management | — | `Server` |
| Add | + | `Plus` |
| Edit | — | `Pencil` |
| Delete / danger | — | `Trash2` |
| Close | — | `X` |
| Refresh | — | `RefreshCw` |
| Search | — | `Search` |
| Menu / mobile nav | — | `Menu` |
| Logout | — | `LogOut` |
| Empty state | 📭 | `Inbox` |
| Signal good | 🟢 | `SignalHigh` |
| Signal warning | 🟡 | `SignalMedium` |
| Signal critical | 🔴 | `SignalLow` |

---

## 4. Layout & Responsiveness

### 4.1 App Shell (`components/shell.tsx`)

**Desktop (≥1024px)**
- Fixed left sidebar, `w-64`, dark surface, vertical nav links.
- Top header inside main area with page title + current OLT selector as a dropdown.
- Main content scrolls independently.

**Tablet (768–1023px)**
- Sidebar collapses to icon-only rail, `w-16`.
- Nav labels shown as tooltips on hover.
- Main area retains header.

**Mobile (<768px)**
- Sidebar hidden entirely.
- Top bar shows logo + hamburger menu.
- Navigation slides in from left as a `Sheet` when hamburger tapped.
- OLT selector becomes a compact `Select` / dropdown in the top bar.
- Main content full-width with `px-4` padding.

### 4.2 Navigation Items
Keep existing labels in Albanian:
- Dashboard
- ONU-të
- Unconfigured
- Provizionim
- OLT-et

### 4.3 Tables (ONU list, OLT list)

**Desktop / Tablet**
- Full data table with shadcn `Table`, sticky header, row hover, action dropdown per row.

**Mobile**
- Table wrapper allows horizontal swipe-scroll (`overflow-x-auto`).
- Optional: render rows as cards on the smallest screens, showing the most important columns (name, state, signal) and an actions button.

### 4.4 Modals

- Use shadcn `Dialog` on desktop.
- On mobile (<640px), use shadcn `Sheet` sliding up from bottom for add/edit/provision/PPPoE/WiFi forms.
- Current modals to convert:
  - `edit-olt-modal.tsx`
  - `pppoe-modal.tsx`
  - `provision-modal.tsx`
  - `replace-onu-modal.tsx`
  - `wifi-modal.tsx`
  - Add-OLT modal inside `shell.tsx`

### 4.5 Stat Cards / Dashboard

- Four metric cards in a 4-column grid on desktop.
- 2-column on tablet.
- 1-column stack on mobile.
- Each card shows an icon, label, large number, and small trend/chip.

---

## 5. Component Refactor Plan

### 5.1 shadcn components to install
Install via the project’s shadcn-compatible setup (Tailwind v4). Components:
- `button`
- `card`
- `dialog`
- `sheet`
- `input`
- `label`
- `select`
- `badge`
- `table`
- `dropdown-menu`
- `tabs`
- `separator`
- `skeleton`
- `tooltip`
- `scroll-area`
- `avatar` (for user menu)
- `switch` / `checkbox` (future-ready)

### 5.2 Custom domain components
Create/update:
- `components/shell.tsx` → responsive app shell.
- `components/app-sidebar.tsx` → sidebar content (extracted from shell).
- `components/mobile-nav.tsx` → hamburger + sheet nav.
- `components/olt-selector.tsx` → OLT dropdown for header.
- `components/stat-card.tsx` → dashboard metric card.
- `components/signal-pill.tsx` → premium signal badge.
- `components/status-badge.tsx` → online/offline badge.
- `components/data-table.tsx` → reusable responsive table wrapper.
- `components/empty-state.tsx` → premium empty illustration.

### 5.3 Legacy component cleanup
- Deprecate `components/ui.tsx` monolith.
- Move its primitives into shadcn components.
- Keep domain helpers (`stateBadgeColor`, `stateLabel`) in a small `lib/ui-helpers.ts`.

---

## 6. Page-Level Changes

Each page under `app/(app)/` will be updated to use the new components and responsive grids:

1. **Dashboard (`app/(app)/page.tsx`)**
   - Stat cards grid.
   - Chart container with consistent dark chart theme.
   - Recent activity / OLT status list.

2. **ONU-të (`app/(app)/onus/`)**
   - Responsive table.
   - Search + filter bar.
   - Row actions in dropdown.

3. **Unconfigured (`app/(app)/unconfigured/`)**
   - Cards or table with provision action.

4. **Provizionim (`app/(app)/provision/`)**
   - Form card layout.

5. **OLT-et (`app/(app)/olts/`)**
   - Table with status + actions.

6. **Login (`app/login/page.tsx`)**
   - Centered dark card, subtle gradient backdrop.

---

## 7. Technical Constraints

- Keep **Next.js 16.2.9** and **Tailwind CSS v4** already in use.
- No new runtime dependencies beyond shadcn component code and `lucide-react`.
- Maintain Albanian labels; only visual structure changes.
- Preserve all existing API calls and data flow.
- Do not change authentication or backend logic.
- Use existing `globals.css` as the entry point for CSS variables.

---

## 8. Verification

Before shipping, verify:
1. `npm run build` passes in `apps/web` with no type or lint errors.
2. All five nav pages render without layout breakage at:
   - 375px (mobile)
   - 768px (tablet)
   - 1440px (desktop)
3. No emoji remain in UI code (grep for common emoji ranges).
4. Login page and all six modals/sheets open/close correctly.
5. Dashboard chart and signal pills use the new dark theme colors.

---

## 9. Out of Scope

- Light mode toggle.
- New features (real-time SSE, new adapters, etc.).
- Backend or worker changes.
- Auth logic changes.
- New pages beyond the existing five nav pages + login.

---

## 10. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual style | Dark premium, always-on | Chosen by user; fits NOC/monitoring use case. |
| Component base | shadcn/ui primitives | Maintainable, accessible, premium defaults. |
| Icon library | Lucide React | Standard pairing with shadcn, premium line icons. |
| Mobile nav | Hamburger sheet + bottom-friendly forms | Tables and modals do not work on phones without this. |
| Color system | OKLCH-based CSS variables | Perceptually uniform, easy to tweak, Tailwind v4 friendly. |
| Chart library | Keep Recharts | Already installed; will theme via `recharts` styling. |

---

*Spec approved by user on 2026-06-30.*
