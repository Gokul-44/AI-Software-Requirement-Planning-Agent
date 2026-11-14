# Design system (one page)

The web app (`apps/web`) uses three brand colours, neutrals made from them, and separate status colours. Every colour is defined once, as a token in `apps/web/src/index.css` (Tailwind 4 `@theme`). Components use token classes (`bg-brand-green-900`, `text-accent-700`, `border-border`) and never hex values. The exceptions are the favicon SVG file, the comments in `lib/buttonClass.ts` and `lib/colors.ts`, and two epic chart colours defined directly in `index.css`.

## Brand colours and tokens

| Colour | Hex | Token family | Role |
| --- | --- | --- | --- |
| Forest Green | `#1F3D2B` | `brand-green-50 ... 950` (900 is the brand value) | Brand and dark surfaces: top bar, hero, trust strip, footer; primary text on light (`brand-green-950`) |
| Sand Beige | `#E8DCC4` | `sand-50 ... 900` (300 is the brand value) | Warm light surfaces: page background (`sand-100`), cards (`surface`), sections, borders (`sand-300`) |
| Electric Purple | `#8B5CF6` | `accent-50 ... 900` (500 is the brand value) | The only accent: primary buttons (a darker shade, see contrast rules), active tab, links, focus rings, highlights, the critical path |

Semantic tokens: `surface` (card, a near-white sand), `page` (sand-100), `border` (sand-300), `text` (brand-green-950), `muted` (`#4A6354`, a desaturated green). Epic colours (`epic-1 ... 8`) are mid and dark shades of green and sand for charts; they never use purple.

## 60-30-10

- About 60 percent neutral and sand: page background, cards, tables, text.
- About 30 percent forest green: the top bar, the hero, the "Why you can trust it" strip, the footer, dark badges and bars.
- About 10 percent purple: primary buttons, the active tab, links, focus rings, and the critical path in the graph, the Gantt chart and the task tables. Purple is deliberately rare, so it draws the eye to the one thing that matters: what is on the critical path.

## Status colours (separate from the brand)

Red is for high risk and errors, amber for medium risk, warnings and "needs your decision", green for low risk and success. Purple is never used for status. Priority badges (must, should, could) are not a status, so they use brand neutrals.

## Contrast rules (WCAG AA)

- Body text is at least 4.5:1: `text` on sand/surface is about 13:1, `muted` is 5.7:1 on sand-100 and 4.8:1 on sand-300, `sand-100` on forest green is about 8:1.
- Purple text on light backgrounds uses `accent-700` (6.2:1 on sand-100, 6.9:1 on surface). `accent-500` is never used for text.
- White text on the accent uses `accent-600` or darker at every size and weight: white on `accent-600` is 5.7:1 and on `accent-700` 7.1:1. White on the brand value `#8B5CF6` (`accent-500`) is only 4.2:1 and fails AA for 16 px bold text (large text starts at 18.66 px bold), so `accent-500` is never a fill behind text. The large primary button uses `accent-700` with `accent-800` on hover; the other sizes use `accent-600` with `accent-700` on hover.
- The critical path in the graph and the Gantt chart is drawn in `accent-600` (not `accent-500`), so the task ids on the bars reach 5.5:1. Non-text purple (the focus ring) uses `accent-500` (3.7:1 on sand-100; AA asks 3:1 for non-text).
- Chart labels on epic colours: every `epic-*` colour gives at least 4.5:1 with the light label text drawn on it (`epic-3` and `epic-6` were darkened for this; Gantt bars are drawn fully opaque).
- On forest green, purple text uses `accent-200` (8.6:1).
- Status badges pair a tinted background with the 800/900 text shade (for example `bg-red-50 text-red-800`).
- Focus: every interactive element shows a 2 px `accent-500` ring on keyboard focus (`:focus-visible`).
- Motion respects `prefers-reduced-motion` (animations and transitions are reduced to near zero).

## Style

Inter (self-hosted through `@fontsource-variable/inter`, no CDN), tight tracking on headings, rounded cards (16 to 24 px), soft shadows (`shadow-card`, `shadow-lift`), a forest-green hero with a soft purple radial glow and a dot texture, glass panels on dark sections, pill buttons and a pill top navigation. Icons are `lucide-react` only. Motion is limited to hover lifts, fade-ins and skeleton shimmers.

## Components

- Layout: `AppShell` (sticky top bar, pill nav, skip link, footer with team and institute), plan sticky sub-header in `PlanPage` (title, run status badge, export buttons, tabs), `Logo` and `LogoMark` (original artwork, also the favicon).
- Primitives (`components/ui.tsx`): `Card`, `SectionTitle`, `Badge` (+ `LayerBadge`, `PriorityBadge`, `SeverityBadge`, `CriticalBadge`), `Stat` (KPI tile), `Button` and `buttonClass`, `Skeleton`, `SkeletonCard`, `PageLoading`, `EmptyState`, `ErrorState`, `GoldenDemoButton`, `IdChip`, `ProgressBar` (coverage meter), `Select`, `Legend`, `StatusBadge`.
- Feedback: `ToastProvider` and `useToast` (exports, re-runs, errors), friendly error wording for every API error code (`lib/friendlyError.ts`), 404 page.
- Flow: `CycleResolver` (cycle graph plus edge checkboxes), `ExportButtons`, `WhatIfPanel` (instant preview plus "Re-plan with new team settings"), `Gantt` (zoom and fit), `GraphTab` (React Flow with controls and legend).
- Pages: Home (landing: hero with the idea box, how it works, features, sample plans, trust strip), Run progress (vertical stepper, elapsed time, skeleton preview), Plan (nine tabs), History, 404.

## Responsive

Checked at 375, 768 and 1440 px with no horizontal page scroll. Tables, the Gantt chart and the tab bar scroll inside their own boxes on phones.
