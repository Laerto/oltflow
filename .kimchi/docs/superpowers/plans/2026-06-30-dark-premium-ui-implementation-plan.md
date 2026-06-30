# Dark-Premium UI/UX Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the OLTFlow Next.js web app into a dark-premium, responsive dashboard using shadcn/ui primitives, Tailwind CSS v4, and Lucide React icons.

**Architecture:** Replace the hand-rolled `components/ui.tsx` monolith with typed shadcn/ui components, introduce a reusable dark-themed CSS variable system, rebuild the app shell into a responsive sidebar/mobile-nav layout, and convert every page + modal to the new component library while preserving all existing Albanian labels and data flows.

**Tech Stack:** Next.js 16.2.9, React 19, Tailwind CSS v4, shadcn/ui (manual or CLI install), `lucide-react`, Recharts.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/app/globals.css` | Tailwind v4 import + dark-theme CSS variables. |
| `apps/web/components/ui/*` | shadcn/ui primitives (button, card, dialog, sheet, input, label, select, badge, table, dropdown-menu, separator, skeleton, tooltip, scroll-area). |
| `apps/web/lib/ui-helpers.ts` | Domain helpers: `stateBadgeColor`, `stateLabel`, signal-level logic. |
| `apps/web/components/signal-pill.tsx` | Premium signal-strength badge. |
| `apps/web/components/status-badge.tsx` | Online/offline/unknown badge. |
| `apps/web/components/stat-card.tsx` | Dashboard metric card. |
| `apps/web/components/empty-state.tsx` | Empty-state illustration block. |
| `apps/web/components/app-sidebar.tsx` | Sidebar nav content. |
| `apps/web/components/mobile-nav.tsx` | Hamburger sheet for mobile. |
| `apps/web/components/olt-selector.tsx` | Compact OLT selector dropdown. |
| `apps/web/components/shell.tsx` | Responsive app shell composing the above. |
| `apps/web/app/(app)/page.tsx` | Dashboard. |
| `apps/web/app/(app)/onus/page.tsx` | ONU list. |
| `apps/web/app/(app)/unconfigured/page.tsx` | Unconfigured ONU scan. |
| `apps/web/app/(app)/provision/page.tsx` | Provisioning forms. |
| `apps/web/app/(app)/olts/page.tsx` | OLT management. |
| `apps/web/app/login/page.tsx` | Login screen. |
| `apps/web/components/*-modal.tsx` | Existing modals converted to shadcn Dialog/Sheet. |
| `apps/web/components/ui.tsx` | To be deleted after migration. |

---

## Task 1: Initialize shadcn/ui and add Lucide icons

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/components.json` (shadcn config)
- Create: `apps/web/lib/utils.ts` (cn helper)

- [ ] **Step 1: Add `lucide-react` dependency**

```bash
cd /srv/oltflow/apps/web
npm install lucide-react
```

Expected: `package.json` now lists `lucide-react` under `dependencies`.

- [ ] **Step 2: Add `clsx` / `tailwind-merge` cn helper if not present**

```bash
cd /srv/oltflow/apps/web
npm install clsx tailwind-merge
```

- [ ] **Step 3: Create `apps/web/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create minimal `apps/web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 5: Add dark CSS variables to `apps/web/app/globals.css`**

Replace the file contents with:

```css
@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.145 0.02 270);
  --color-foreground: oklch(0.92 0.01 270);
  --color-card: oklch(0.205 0.02 270);
  --color-card-foreground: oklch(0.92 0.01 270);
  --color-popover: oklch(0.22 0.02 270);
  --color-popover-foreground: oklch(0.92 0.01 270);
  --color-primary: oklch(0.68 0.15 240);
  --color-primary-foreground: oklch(0.12 0.02 270);
  --color-secondary: oklch(0.27 0.02 270);
  --color-secondary-foreground: oklch(0.92 0.01 270);
  --color-muted: oklch(0.27 0.02 270);
  --color-muted-foreground: oklch(0.65 0.01 270);
  --color-accent: oklch(0.27 0.02 270);
  --color-accent-foreground: oklch(0.92 0.01 270);
  --color-destructive: #f43f5e;
  --color-destructive-foreground: oklch(0.99 0 0);
  --color-border: oklch(0.3 0.02 270);
  --color-input: oklch(0.27 0.02 270);
  --color-ring: oklch(0.68 0.15 240);
  --radius: 0.625rem;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-info: #3b82f6;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

- [ ] **Step 6: Verify install**

```bash
cd /srv/oltflow/apps/web
npm install
```

Expected: `node_modules/lucide-react` exists and install exits 0.

- [ ] **Step 7: Commit**

```bash
cd /srv/oltflow
git add apps/web/package.json apps/web/package-lock.json apps/web/app/globals.css apps/web/lib/utils.ts apps/web/components.json
git commit -m "chore(web): add lucide-react, clsx, tailwind-merge and dark CSS variables"
```

---

## Task 2: Install shadcn/ui primitives

**Files:**
- Create: `apps/web/components/ui/button.tsx`
- Create: `apps/web/components/ui/card.tsx`
- Create: `apps/web/components/ui/dialog.tsx`
- Create: `apps/web/components/ui/sheet.tsx`
- Create: `apps/web/components/ui/input.tsx`
- Create: `apps/web/components/ui/label.tsx`
- Create: `apps/web/components/ui/select.tsx`
- Create: `apps/web/components/ui/badge.tsx`
- Create: `apps/web/components/ui/table.tsx`
- Create: `apps/web/components/ui/dropdown-menu.tsx`
- Create: `apps/web/components/ui/separator.tsx`
- Create: `apps/web/components/ui/skeleton.tsx`
- Create: `apps/web/components/ui/tooltip.tsx`
- Create: `apps/web/components/ui/scroll-area.tsx`

- [ ] **Step 1: Pull shadcn components via CLI (preferred)**

```bash
cd /srv/oltflow/apps/web
npx shadcn@latest add button card dialog sheet input label select badge table dropdown-menu separator skeleton tooltip scroll-area --yes --overwrite
```

Expected: files appear under `components/ui/`.

- [ ] **Step 2: If CLI fails, copy compatible Tailwind v4 variants manually**

Use the shadcn/ui registry for each component, but replace any `@import "tailwindcss"` duplication and keep only the component code. Place each in `apps/web/components/ui/<name>.tsx`.

- [ ] **Step 3: Verify types**

```bash
cd /srv/oltflow/apps/web
npx tsc --noEmit
```

Expected: no type errors from new components.

- [ ] **Step 4: Commit**

```bash
cd /srv/oltflow
git add apps/web/components/ui
git commit -m "chore(web): install shadcn/ui primitives"
```

---

## Task 3: Create domain UI helpers

**Files:**
- Create: `apps/web/lib/ui-helpers.ts`
- Create: `apps/web/components/signal-pill.tsx`
- Create: `apps/web/components/status-badge.tsx`
- Create: `apps/web/components/stat-card.tsx`
- Create: `apps/web/components/empty-state.tsx`

- [ ] **Step 1: Write `apps/web/lib/ui-helpers.ts`**

```typescript
import { type BadgeProps } from "@/components/ui/badge";

export function stateBadgeColor(state: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (state === "working") return "default"; // maps to green via variant override
  if (!state) return "secondary";
  return "destructive";
}

export function stateLabel(state: string | null | undefined): string {
  if (state === "working") return "online";
  return state || "–";
}

export function signalLevel(rx: number): "good" | "warn" | "crit" {
  if (rx >= -25) return "good";
  if (rx >= -27) return "warn";
  return "crit";
}

export const statusColor = {
  good: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  crit: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};
```

- [ ] **Step 2: Write `apps/web/components/signal-pill.tsx`**

```typescript
"use client";

import { Activity } from "lucide-react";

export function SignalPill({ rx }: { rx: number | null | undefined }) {
  if (rx === null || rx === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" /> N/A
      </span>
    );
  }
  const level = rx >= -25 ? "good" : rx >= -27 ? "warn" : "crit";
  const styles =
    level === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : level === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : "border-rose-500/30 bg-rose-500/10 text-rose-400";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs font-semibold ${styles}`}>
      <Activity className="h-3.5 w-3.5" /> {rx} dBm
    </span>
  );
}
```

- [ ] **Step 3: Write `apps/web/components/status-badge.tsx`**

```typescript
"use client";

import { Wifi, WifiOff, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { stateBadgeColor, stateLabel } from "@/lib/ui-helpers";

export function StatusBadge({ state }: { state: string | null | undefined }) {
  const color = stateBadgeColor(state);
  const label = stateLabel(state);
  const icon = state === "working" ? <Wifi className="h-3 w-3" /> : state ? <WifiOff className="h-3 w-3" /> : <HelpCircle className="h-3 w-3" />;
  return (
    <Badge variant={color} className="gap-1">
      {icon} {label}
    </Badge>
  );
}
```

- [ ] **Step 4: Write `apps/web/components/stat-card.tsx`**

```typescript
"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  href,
  icon: Icon,
  label,
  value,
  sub,
  gradient,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number | string;
  sub?: string;
  gradient: string;
}) {
  return (
    <Link href={href}>
      <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${gradient} p-5 text-white transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20`}>
        <Icon className="absolute right-4 top-1/2 h-16 w-16 -translate-y-1/2 opacity-20" />
        <div className="relative z-10 text-3xl font-bold tracking-tight">{value}</div>
        <div className="relative z-10 mt-1 text-sm font-medium opacity-90">{label}</div>
        {sub && <div className="relative z-10 mt-1.5 text-xs opacity-70">{sub}</div>}
      </Card>
    </Link>
  );
}
```

- [ ] **Step 5: Write `apps/web/components/empty-state.tsx`**

```typescript
import { Inbox } from "lucide-react";

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-muted-foreground">
      <Inbox className="h-10 w-10 text-muted-foreground/50" />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /srv/oltflow
git add apps/web/lib/ui-helpers.ts apps/web/components/signal-pill.tsx apps/web/components/status-badge.tsx apps/web/components/stat-card.tsx apps/web/components/empty-state.tsx
git commit -m "feat(web): add domain UI helpers and premium badges"
```

---

## Task 4: Build responsive app shell

**Files:**
- Modify: `apps/web/components/shell.tsx`
- Create: `apps/web/components/app-sidebar.tsx`
- Create: `apps/web/components/mobile-nav.tsx`
- Create: `apps/web/components/olt-selector.tsx`

- [ ] **Step 1: Write `apps/web/components/app-sidebar.tsx`**

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Router, Plug, Settings2, Server, LogOut } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/onus", label: "ONU-të", icon: Router },
  { href: "/unconfigured", label: "Unconfigured", icon: Plug },
  { href: "/provision", label: "Provizionim", icon: Settings2 },
  { href: "/olts", label: "OLT-et", icon: Server },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Server className="h-5 w-5" />
        </div>
        <span className="text-lg font-extrabold tracking-tight">
          <span className="text-primary">neWave</span> OLT
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <LogOut className="h-4 w-4" /> Dilni
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `apps/web/components/mobile-nav.tsx`**

```typescript
"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AppSidebar } from "./app-sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <AppSidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Write `apps/web/components/olt-selector.tsx`**

```typescript
"use client";

import { Check, Server } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type OltSummary } from "@/lib/api";

export function OltSelector({
  olts,
  current,
  onChange,
}: {
  olts: OltSummary[];
  current: OltSummary | null;
  onChange: (id: number) => void;
}) {
  return (
    <Select value={current?.id ? String(current.id) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-8 w-[220px] gap-2 text-xs">
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="Zgjidh OLT" />
      </SelectTrigger>
      <SelectContent>
        {olts.map((olt) => (
          <SelectItem key={olt.id} value={String(olt.id)} className="text-xs">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${olt.status === "online" ? "bg-emerald-500" : olt.status === "offline" ? "bg-rose-500" : "bg-muted-foreground"}`} />
              {olt.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 4: Rewrite `apps/web/components/shell.tsx`**

Keep the `parseSlots` export. Replace the JSX with the new responsive shell using `AppSidebar`, `MobileNav`, `OltSelector`, and shadcn `Button`. Move the Add OLT modal invocation into the new header area. Preserve the `logout` API call and `useOlts` usage.

Key JSX shape:

```tsx
<div className="flex min-h-screen bg-background">
  <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
    <AppSidebar />
  </aside>
  <div className="flex flex-1 flex-col">
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <MobileNav />
        <span className="text-sm font-semibold lg:hidden">OLTFlow</span>
      </div>
      <div className="flex items-center gap-3">
        <OltSelector olts={olts} current={currentOlt} onChange={setCurrentOltId} />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Shto OLT
        </Button>
      </div>
    </header>
    <main className="flex-1 p-4 lg:p-6">{children}</main>
  </div>
  <AddOltModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={refresh} />
</div>
```

Replace emoji in Add OLT modal title with `Server` icon.

- [ ] **Step 5: Verify layout renders**

```bash
cd /srv/oltflow/apps/web
npm run build
```

Expected: build passes (errors from unchanged pages are OK at this stage; only shell must not crash).

- [ ] **Step 6: Commit**

```bash
cd /srv/oltflow
git add apps/web/components/shell.tsx apps/web/components/app-sidebar.tsx apps/web/components/mobile-nav.tsx apps/web/components/olt-selector.tsx
git commit -m "feat(web): responsive app shell with sidebar and mobile nav"
```

---

## Task 5: Refactor Dashboard page

**Files:**
- Modify: `apps/web/app/(app)/page.tsx`

- [ ] **Step 1: Replace imports**

```typescript
import { Activity, Cable, Plug, Router, Server, SignalHigh, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
```

Remove imports from `@/components/ui`.

- [ ] **Step 2: Replace `ACTION_LABELS` emoji with Lucide icons**

```typescript
const ACTION_LABELS: Record<string, { label: string; icon: LucideIcon }> = {
  add_olt: { label: "OLT u shtua", icon: Server },
  delete_olt: { label: "OLT u fshi", icon: Trash2 },
  "olt-connect-test": { label: "Test lidhjeje OLT", icon: Server },
  provision: { label: "ONU u autorizua", icon: Router },
  pppoe: { label: "PPPoE u konfigurua", icon: Lock },
  "authorize-pppoe": { label: "Autorizim + PPPoE", icon: Zap },
  wifi: { label: "WiFi u modifikua", icon: Wifi },
  "scan-unconfigured": { label: "Skanim ONU", icon: Search },
  "refresh-onu": { label: "ONU u rifreskua", icon: RefreshCw },
};
```

- [ ] **Step 3: Update stat cards grid**

```tsx
<div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <StatCard href="/unconfigured" icon={Plug} label="Waiting authorization" value={waiting} gradient="from-blue-600 to-blue-800" />
  <StatCard href="/onus?filter=online" icon={Wifi} label="Online" value={stats?.online ?? "–"} sub={`Total: ${stats?.total ?? 0}`} gradient="from-emerald-600 to-emerald-800" />
  <StatCard href="/onus?filter=offline" icon={WifiOff} label="Offline" value={stats?.offline ?? "–"} gradient="from-slate-700 to-slate-900" />
  <StatCard href="/onus?filter=low-signal" icon={SignalHigh} label="Low signals" value={(stats?.warningSignal ?? 0) + (stats?.criticalSignal ?? 0)} sub={`Warn: ${stats?.warningSignal ?? 0} · Crit: ${stats?.criticalSignal ?? 0}`} gradient="from-amber-600 to-amber-800" />
</div>
```

- [ ] **Step 4: Update page title, empty state, loading, and chart colors**

Page title uses `text-foreground`. Empty state uses `EmptyState`. Loading uses `Skeleton`. Chart line stroke uses `hsl(var(--primary))` or `#06b6d4`. Activity items use Lucide icon.

- [ ] **Step 5: Build check**

```bash
cd /srv/oltflow/apps/web
npm run build
```

Expected: no errors from `page.tsx`.

- [ ] **Step 6: Commit**

```bash
cd /srv/oltflow
git add apps/web/app/(app)/page.tsx
git commit -m "feat(web): dark-premium dashboard with Lucide icons"
```

---

## Task 6: Refactor ONU-të page

**Files:**
- Modify: `apps/web/app/(app)/onus/page.tsx`

- [ ] **Step 1: Replace imports**

```typescript
import { RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignalPill } from "@/components/signal-pill";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
```

- [ ] **Step 2: Update search/filter bar**

Use shadcn `Input` with `Search` icon and shadcn `Button` with `RefreshCw`.

- [ ] **Step 3: Update table markup**

Replace `<table>` with shadcn `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`. Keep existing data columns.

- [ ] **Step 4: Update row actions and badges**

Use `StatusBadge` for state, `SignalPill` for signal, `Badge` for type/EPON/Bridge/Route. Replace "🔍 Detaje" and "🔐 PPPoE" text buttons with compact shadcn `Button` size="sm" with Lucide `Eye` / `Lock` icons + Albanian text.

- [ ] **Step 5: Make table responsive**

Wrap the table in:

```tsx
<div className="overflow-x-auto rounded-md border">
  <Table>...</Table>
</div>
```

- [ ] **Step 6: Build and commit**

```bash
cd /srv/oltflow/apps/web
npm run build
cd /srv/oltflow
git add apps/web/app/(app)/onus/page.tsx
git commit -m "feat(web): refactor ONU list with responsive dark table"
```

---

## Task 7: Refactor Unconfigured page

**Files:**
- Modify: `apps/web/app/(app)/unconfigured/page.tsx`

- [ ] **Step 1: Replace imports**

```typescript
import { Search, Zap, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
```

- [ ] **Step 2: Replace emoji buttons and badges**

Scan button: `<Search className="mr-1 h-4 w-4" /> Skano`
Autorizo button: `<Zap className="mr-1 h-4 w-4" /> Autorizo`
PPPoE button: `<Lock className="mr-1 h-4 w-4" /> PPPoE`
Badge: remove `⏳` emoji, use `Badge variant="secondary"`.

- [ ] **Step 3: Build and commit**

```bash
cd /srv/oltflow/apps/web
npm run build
cd /srv/oltflow
git add apps/web/app/(app)/unconfigured/page.tsx
git commit -m "feat(web): dark theme unconfigured scan page"
```

---

## Task 8: Refactor Provision page

**Files:**
- Modify: `apps/web/app/(app)/provision/page.tsx`

- [ ] **Step 1: Replace imports**

```typescript
import { Router, Lock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
```

- [ ] **Step 2: Replace `Field` helper**

Replace each `<Field label="...">` with:

```tsx
<div className="space-y-1.5">
  <Label className="text-xs font-semibold uppercase text-muted-foreground">Label</Label>
  <Input ... />
</div>
```

Use shadcn `Select` for ONU type/TCONT profile dropdowns.

- [ ] **Step 3: Update card titles and submit buttons**

Use Lucide icons in card titles:
- Autorizim ONU: `<Router className="h-4 w-4" />`
- PPPoE via OMCI: `<Lock className="h-4 w-4" />`
- Autorizim + PPPoE Bashkë: `<Zap className="h-4 w-4" />`

- [ ] **Step 4: Build and commit**

```bash
cd /srv/oltflow/apps/web
npm run build
cd /srv/oltflow
git add apps/web/app/(app)/provision/page.tsx
git commit -m "feat(web): dark theme provision forms with shadcn inputs"
```

---

## Task 9: Refactor OLT-et page

**Files:**
- Modify: `apps/web/app/(app)/olts/page.tsx`

- [ ] **Step 1: Replace imports**

```typescript
import { Pencil, Trash2, LayoutDashboard, Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
```

- [ ] **Step 2: Update table and actions**

Use `StatusBadge` for OLT status. Use icon-only action buttons (`LayoutDashboard`, `Pencil`, `Trash2`) on small screens and icon+text on larger screens via `hidden sm:inline`.

- [ ] **Step 3: Build and commit**

```bash
cd /srv/oltflow/apps/web
npm run build
cd /srv/oltflow
git add apps/web/app/(app)/olts/page.tsx
git commit -m "feat(web): dark theme OLT management table"
```

---

## Task 10: Refactor Login page

**Files:**
- Modify: `apps/web/app/login/page.tsx`

- [ ] **Step 1: Update page background and card**

```tsx
<div className="flex min-h-screen items-center justify-center bg-background p-4">
  <Card className="w-full max-w-sm border-border/50 bg-card/95 p-8 shadow-2xl shadow-primary/10 backdrop-blur">
    ...
  </Card>
</div>
```

- [ ] **Step 2: Replace inputs with shadcn `Input` and `Label`**

- [ ] **Step 3: Update error alert**

Use shadcn `Alert` variant="destructive".

- [ ] **Step 4: Update submit button**

Use shadcn `Button` with `type="submit" className="w-full"`.

- [ ] **Step 5: Build and commit**

```bash
cd /srv/oltflow/apps/web
npm run build
cd /srv/oltflow
git add apps/web/app/login/page.tsx
git commit -m "feat(web): dark premium login screen"
```

---

## Task 11: Convert modals to shadcn Dialog/Sheet

**Files:**
- Modify: `apps/web/components/edit-olt-modal.tsx`
- Modify: `apps/web/components/pppoe-modal.tsx`
- Modify: `apps/web/components/provision-modal.tsx`
- Modify: `apps/web/components/replace-onu-modal.tsx`
- Modify: `apps/web/components/wifi-modal.tsx`
- Modify: `apps/web/components/shell.tsx` (Add OLT modal)

- [ ] **Step 1: Read each modal to capture fields and state**

For each file, open and note the form fields, validation, and submit flow.

- [ ] **Step 2: Apply conversion pattern**

Replace the internal `Modal` from `@/components/ui` with:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
```

Use `Dialog open={open} onOpenChange={onClose}`. Move form JSX into `DialogContent`.

Replace `Field` with `Label` + `Input` / `Select`. Replace `Button` with shadcn `Button`. Replace `Alert` with shadcn `Alert`.

- [ ] **Step 3: Mobile sheets (optional enhancement)**

If a modal is long, additionally wrap the dialog body in a `Sheet` for viewports below `640px`. Otherwise keep `Dialog` — `DialogContent` is already responsive with `max-w-lg`.

- [ ] **Step 4: Remove emoji from titles**

Use Lucide icon + text, e.g.:

```tsx
<DialogTitle className="flex items-center gap-2">
  <Server className="h-5 w-5 text-primary" /> Shto OLT të ri
</DialogTitle>
```

- [ ] **Step 5: Build and commit**

```bash
cd /srv/oltflow/apps/web
npm run build
cd /srv/oltflow
git add apps/web/components/edit-olt-modal.tsx apps/web/components/pppoe-modal.tsx apps/web/components/provision-modal.tsx apps/web/components/replace-onu-modal.tsx apps/web/components/wifi-modal.tsx apps/web/components/shell.tsx
git commit -m "feat(web): convert modals to shadcn Dialog and Lucide icons"
```

---

## Task 12: Cleanup and final verification

**Files:**
- Delete: `apps/web/components/ui.tsx`
- Modify: any remaining files importing from `@/components/ui`

- [ ] **Step 1: Delete legacy `components/ui.tsx`**

```bash
rm /srv/oltflow/apps/web/components/ui.tsx
```

- [ ] **Step 2: Fix remaining imports**

Run:

```bash
cd /srv/oltflow
grep -R "from '@/components/ui'" apps/web --include='*.tsx' --include='*.ts'
```

For each hit, replace with the appropriate shadcn component import or domain helper import.

- [ ] **Step 3: Remove emoji from UI**

Run:

```bash
cd /srv/oltflow
grep -R -P '[\x{1F300}-\x{1F9FF}]' apps/web --include='*.tsx' --include='*.ts' || echo "No emoji found"
```

Expected: no matches in UI source (emoji in user-facing strings are acceptable if intentional; remove decorative status icons).

- [ ] **Step 4: Full build**

```bash
cd /srv/oltflow/apps/web
npm run build
```

Expected: build completes with exit code 0.

- [ ] **Step 5: Lint**

```bash
cd /srv/oltflow/apps/web
npm run lint
```

Expected: lint passes (or only pre-existing issues remain).

- [ ] **Step 6: Responsive smoke check**

Start dev server in background or use a static export, then open at 375px, 768px, and 1440px viewports. Verify:
- Sidebar appears on desktop, hamburger menu on mobile.
- Dashboard stat cards stack on mobile.
- Tables scroll horizontally on mobile without clipping.
- Modals are usable at 375px.

- [ ] **Step 7: Commit**

```bash
cd /srv/oltflow
git add -A
git commit -m "feat(web): complete dark-premium UI/UX refresh"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Dark color tokens → Task 1.
   - Lucide icons → Tasks 1, 3, 5, 6, 7, 8, 9, 11.
   - Responsive shell → Task 4.
   - Mobile tables → Tasks 6, 7, 9.
   - Premium stat cards → Tasks 3, 5.
   - shadcn components → Tasks 1, 2.
   - Login redesign → Task 10.
   - No new features/backend changes → constrained in every task.

2. **Placeholder scan:**
   - No “TBD” or “implement later” strings.
   - Modal conversion includes a concrete pattern (Dialog + Label/Input/Select/Button).
   - Remaining modal-specific code is read at execution time; the pattern is fully specified.

3. **Type consistency:**
   - `stateBadgeColor` returns shadcn `Badge` variant names.
   - `StatCard` accepts `LucideIcon` type consistently.
   - `OltSummary` import path matches existing `lib/api` types.

---

## Execution Options

Plan saved to `/srv/oltflow/.kimchi/docs/superpowers/plans/2026-06-30-dark-premium-ui-implementation-plan.md`.

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach would you like?
