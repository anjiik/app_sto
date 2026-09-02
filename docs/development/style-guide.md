# UI style guide

The visual patterns actually used across `frontend/src` — pulled from the real
Tailwind classes in the code, not a separate design system. There's no central
theme file beyond `tailwind.config.js`; consistency comes from reusing these
patterns page to page. Useful as a reference if you're building a new page in this
app, or bootstrapping a different app with a similar look.

## Color

`tailwind.config.js` extends Tailwind's default palette with one custom color:

```js
colors: {
  brand: { 50: '#eff6ff', 500: '#3b82f6', 700: '#1d4ed8', 900: '#1e3a8a' },
},
```

In practice, most of the UI uses Tailwind's stock `blue` scale directly rather than
`brand` — `blue-700`/`blue-800`/`blue-900` are the colors that actually show up on
screen (nav bar, primary buttons). Treat `blue-700` as the effective brand color.

| Role | Class | Used for |
|------|-------|----------|
| Primary action | `bg-blue-700` → `hover:bg-blue-800` | Buttons: Submit, Save, Approve, Open User Guide |
| Nav bar / header | `bg-blue-900` | Top nav background |
| Nav active link | `bg-blue-700` on `bg-blue-900` | Current page highlight in nav |
| Page background | `bg-gray-50` | `<body>`-level background behind cards |
| Card background | `bg-white` with `border-gray-200` | Every content card/section |
| Muted text | `text-gray-500` / `text-gray-600` | Secondary/help text |
| Danger | `bg-red-700` / `text-red-800` on `bg-red-100` | Reject actions, error states |

### Status & role colors

Every status/role/priority badge is a `{ bg-X-100, text-X-800 }` pair (light fill,
dark text, same hue) — this is the one repeated visual convention worth copying
exactly if extending the palette:

```tsx
// StatusBadge.tsx — STOStatus → Tailwind classes
DRAFT:                 'bg-gray-100 text-gray-700'
PLANNING_REVIEW:       'bg-yellow-100 text-yellow-800'
SHIPPING_LOGISTICS:    'bg-teal-100 text-teal-800'
MANAGEMENT_REVIEW:     'bg-orange-100 text-orange-800'
RECEIVING_MGMT_REVIEW: 'bg-purple-100 text-purple-800'
RECEIVING_LOGISTICS:   'bg-cyan-100 text-cyan-800'
CLOSED:                'bg-gray-200 text-gray-600'
REJECTED:              'bg-red-100 text-red-800'

// PriorityBadge — priority 1/2/3
1 (Urgent):    'bg-red-100 text-red-800'
2 (Expedited): 'bg-orange-100 text-orange-800'
3 (Standard):  'bg-green-100 text-green-800'
```

Role badges in the nav bar (`Layout.tsx`) use a different, saturated style —
solid `-600`/`-700` fill with white text, one hue per role:

```tsx
shipping_planning:    'bg-amber-600'
shipping_logistics:   'bg-teal-600'
management:           'bg-purple-700'
receiving_management: 'bg-fuchsia-700'
receiving_logistics:  'bg-orange-600'
admin:                'bg-red-700'
```

## Typography

No custom font is loaded — the system font stack, set once in `index.css`:

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

Sizes follow Tailwind's default scale directly (`text-xs` for badges/labels,
`text-sm` for body copy and buttons, `text-lg`/`text-2xl` for page and nav
titles) — no custom type scale.

## Core patterns

### Card / section container

The single most-repeated container across every page:

```tsx
<section className="bg-white border border-gray-200 rounded-xl p-6">
```

(`rounded-lg` shows up on smaller nested cards; `rounded-xl` on top-level page
sections.)

### Primary button

```tsx
className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 font-medium text-sm disabled:opacity-50"
```

Smaller inline actions drop to `px-3 py-1.5 text-xs`; everything else about the
pattern (color, hover, rounding) stays the same.

### Secondary / outline button

```tsx
className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-sm transition-colors border border-white/20"
```

(Used on dark backgrounds, e.g. the "Sign Out" button in the nav bar.)

### Form input

One shared constant, reused across every field in `STOForm.tsx`:

```tsx
const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
```

### Badge (status / priority / role)

```tsx
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-X-100 text-X-800">
```

### Page shell

Every page renders inside the shared `Layout` component:

```tsx
<div className="min-h-screen bg-gray-50">
  <nav className="bg-blue-900 text-white shadow-lg"> ... </nav>
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
</div>
```

`max-w-7xl` is the standard page content width; narrower pages (like App Info) use
`max-w-3xl` on an inner wrapper instead.

## Icons

No icon library — the app uses plain emoji and Unicode characters inline (↓, ↗, →,
🔥) rather than an icon component set.

## Reusing this elsewhere

If bootstrapping a different app with this look: copy the `brand` color extension
and the system-font stack from `tailwind.config.js`/`index.css`, then rebuild the
card/button/input/badge patterns above as real components (`Button`, `Card`,
`Badge`) instead of repeating the class strings by hand — this app doesn't do that
today (see `components/StatusBadge.tsx` for the one place it does), which is why
these patterns are documented here rather than centralized in code.
