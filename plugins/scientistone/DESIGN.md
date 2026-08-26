---
name: ScientistOne
description: An editorial research briefing that becomes a precise laboratory whiteboard.
colors:
  page: "#f5f7f3"
  paper: "#ffffff"
  paper-soft: "#eef2ed"
  ink: "#17201d"
  muted: "#53615c"
  quiet: "#66726c"
  line: "#cfd8d2"
  line-strong: "#a8b7ae"
  brand: "#315c55"
  brand-strong: "#24463f"
  brand-soft: "#dfeae5"
  danger: "#9a352d"
  danger-soft: "#fae9e6"
  focus: "#0f6f61"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(34px, 5vw, 58px)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 680
    lineHeight: 1.2
rounded:
  small: "9px"
  controls: "10px"
  icon: "11px"
  inspector: "13px"
  default: "14px"
  team: "15px"
  circle: "50%"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "11px 18px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "11px 18px"
  input-answer:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.default}"
    padding: "18px 19px"
  help-disclosure:
    backgroundColor: "{colors.page}"
    textColor: "{colors.quiet}"
    rounded: "{rounded.circle}"
    collapsedWidth: "18px"
    collapsedHeight: "18px"
    expandedWidth: "min(340px, calc(100vw - 24px))"
  team-node:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.team}"
    padding: "14px 38px 14px 16px"
    width: "224px"
  specialist-node:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.brand-strong}"
    rounded: "{rounded.circle}"
    width: "54px"
    height: "54px"
  detail-inspector:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.inspector}"
    padding: "17px 42px 18px 18px"
    width: "310px"
  canvas-controls:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    rounded: "{rounded.controls}"
    height: "38px"
---

# Design System: ScientistOne

## Overview

**Creative North Star: "The Editorial Research Briefing and Laboratory Whiteboard"**

ScientistOne begins like a carefully edited research briefing: one consequential question at a time, generous reading space, quiet rules, and a serif voice reserved for the question itself. It should feel calm, literate, and direct. The interface explains the study in the researcher's language rather than exposing software setup or agent machinery.

Once a study begins, that briefing opens into a precise laboratory whiteboard. The monitor is an orthogonal, pannable study map made from rounded team rectangles, straight connectors, a faint dot grid, and plain-language actions. Selecting a team centers and isolates it; specialists occupy a reserved arc with mild orbital motion; the explanation stays beside the selected node. Backward paths appear only when the saved record contains an actual invalidation or return.

**Key Characteristics:**

- Light mode only, with warm green paper surfaces and high-contrast ink.
- Editorial hierarchy for intake; measured whiteboard geometry for monitoring.
- One decision per intake view, never a setup sidebar.
- Context appears locally beside the selected team, not in a permanent dashboard panel.
- Motion explains focus and activity, and disappears under reduced-motion preferences.

## Colors

The palette is a low-chroma laboratory green system: dark ink, cool paper, fine green-gray rules, and a single binding ScientistOne green.

### Primary

- **ScientistOne Green** (`brand`): Primary actions, active paths, step counts, integrity state, and selected objects.
- **Deep Bench Green** (`brand-strong`): Hovered actions, icons, and compact emphasis that needs more contrast.
- **Washed Glass Green** (`brand-soft`): Selected, explanatory, and icon backgrounds without adding another surface family.

### Neutral

- **Laboratory Page** (`page`): The intake work surface.
- **Clean Paper** (`paper`): Fields, nodes, controls, and inspectors.
- **Soft Paper** (`paper-soft`): Quiet hover states, loading bands, and scrollbar tracks.
- **Research Ink** (`ink`): Primary text and decisive labels.
- **Muted Annotation** (`muted`) and **Quiet Note** (`quiet`): Supporting copy and secondary node labels.
- **Fine Rule** (`line`) and **Strong Rule** (`line-strong`): Structure, field edges, dividers, and control boundaries.

### Functional

- **Correction Red** (`danger`) and **Correction Wash** (`danger-soft`): Destructive actions, attention states, and errors only.
- **Accessible Focus Green** (`focus`): The universal visible focus outline.

**The One Green Voice Rule.** Brand green carries action, state, and selection; do not introduce a second accent hue.

**The One Wash Rule.** A quiet radial brand wash may soften the intake page, but never use a generic AI gradient or multicolor glow.

## Typography

**Display Font:** Newsreader (with Georgia and serif fallbacks)

**Body Font:** Native UI sans-serif stack
**Character:** Newsreader gives research questions the authority of an editorial brief. The native sans keeps controls, status, team labels, and explanations immediate and operational.

### Hierarchy

- **Display** (600, fluid 34–58px, 1.05): Intake questions and major waiting or review statements; mobile intake resolves to 30px.
- **Title** (700, 16px, 1.2): Team names and compact section headings.
- **Body** (400, 16px, 1.55): Explanations and answer text; longer guidance stays near 64–68 characters wide.
- **Label** (680, 14px, 1.2): Field labels, steps, buttons, and compact decisions.
- **Monitor context** (620–700, 12–15px): The study state and question in the fixed monitor bar.

**The Serif Question Rule.** Use Newsreader for consequential research prompts and review statements, never for map nodes, controls, or status chrome.

**The Plain Language Rule.** Use sentence case, active voice, and concrete research terms; avoid jargon, promotional copy, decorative emoji, and em dashes.

## Layout

Intake uses a centered shell capped at 1240px, then narrows the active question to 760px. Vertical space is generous: the question begins 44–76px below the brand bar, the answer field follows after 30px, and actions settle at the bottom of a minimum 560px stage. The sequence is Typeform-like: one question, one answer area, one clear next action, and no setup sidebar.

The monitor replaces document flow with a full-viewport canvas below a 76px context bar. Its 24px dot grid pans and scales with the camera. Team nodes are fixed 224 × 88px rectangles arranged in an alternating three-column orthogonal path; connectors stop outside node boundaries. At desktop widths the whole study fits first. On mobile, the 104px context bar preserves the question and integrity state while the canvas focuses the current team.

At 900px, review layouts collapse to one column. At 620px, outer gutters become 12px, primary and secondary intake actions become full-width, monitor controls move to the top-right, and contextual details place above or below their selected node. Selecting a team recenters it, fades unrelated teams and paths, and opens a reserved specialist arc around it; deselection returns to the fitted study.

**The Local Context Rule.** Keep explanations adjacent to the selected map object; do not introduce a persistent inspector rail or dashboard sidebar.

## Elevation & Depth

The system is flat by default and uses thin borders plus paper tone for most structure. Soft green-tinted shadows appear only where a surface must lift from the page: active buttons, team nodes, the selected team, floating specialists, canvas controls, review actions, and the contextual inspector.

### Shadow Vocabulary

- **Elevated surface** (`0 18px 42px rgba(34, 60, 52, 0.09)`): Review actions and other rare anchored surfaces.
- **Action lift** (`0 8px 18px rgba(49, 92, 85, 0.18)`): Primary actions.
- **Team rest** (`0 8px 22px rgba(34, 60, 52, 0.06)`): Map teams at rest.
- **Selected team** (`0 0 0 2px rgba(49, 92, 85, 0.14), 0 18px 42px rgba(34, 60, 52, 0.14)`): The centered team under examination.
- **Context lift** (`0 16px 38px rgba(34, 60, 52, 0.14)`): The detail inspector beside the active node.

**The Flat Until Relevant Rule.** Do not shadow every container. Elevation marks action, selection, or genuinely floating context.

## Shapes

The form language is precise but humane. Standard fields and containers use the 14px default curve; compact buttons use 9px; team nodes use 15px; inspectors use 13px; map controls use 10px. Icons sit in softly rounded 11px squares. The intake help control begins as an 18px circle immediately after its example and expands into its own low-contrast explanation rectangle without moving the form. Status and specialist objects remain circular. Fine one-pixel borders establish geometry before shadow does.

Orthogonal study lines use rounded stroke ends and joins, but they remain straight and economical. Forward flow is solid. Saved backward flow is dashed and labeled. Specialists are the only freely rounded nodes, because they are temporary actors around a stable team.

**The Honest Path Rule.** Draw a backward connector only for an actual saved invalidation; never add decorative returns or wavy paths.

## Components

### Buttons

- **Primary:** Compact green action with white label, 9px corners, 11px × 18px padding, and a soft action shadow. Hover deepens to `brand-strong`; active moves down 1px.
- **Secondary:** White paper, ink label, and strong rule border with the same dimensions. Hover shifts to the soft green wash.
- **Quiet / destructive:** Transparent compact control for removal and discard actions. Danger red is reserved for the destructive label.
- **Focus / disabled:** All actionable controls receive a 3px focus outline with a 3px offset. Disabled actions become gray-green, lose their shadow, and keep readable labels.

### Inputs / Fields

- **Style:** White paper field, strong rule border, 14px corners, inset hairline shadow, and 18px × 19px padding. The primary answer textarea is at least 178px tall and remains vertically resizable.
- **Focus:** Border and 3px outline both change to the focus green; placeholders stay visibly muted.
- **Drop zones:** Use the same 14px silhouette with a dashed strong rule and translucent paper. Drag and hover states use the soft brand wash.
- **Error:** Correction wash with a red edge and plain-language recovery copy.

### Team Nodes

Rounded 224 × 88px paper rectangles are the monitor's primary objects. A 38px soft-green icon tile anchors the left edge; a small circular status sits at the top-right; title and plain-language action form the only text. Hover raises the node slightly. Selection adds the green ring, recenters the camera, and fades all unrelated study geometry.

### Specialist Nodes

Specialists appear only for the selected team. Each is a 54px circular paper mark with a short label, connected by a dashed straight line and arranged on a reserved semicircular arc. A very mild 4.8-second drift signals live work; hover or focus lifts the mark 3px. Reduced-motion mode removes the drift.

### Contextual Inspector

A 310px paper popover sits beside the selected team or specialist and points back with a small border-matched notch. It names the current state, uses a short heading, and explains the assignment in plain language. On narrow screens it moves above or below the node. It is contextual, dismissible, and never permanent chrome.

### Canvas Controls

Zoom out, current percentage, zoom in, and Fit study share one quiet paper control at the canvas edge. One-pixel separators carry the structure. Mobile hides the percentage but keeps both zoom actions and Fit study.

## Do's and Don'ts

### Do:

- **Do** lead intake with one consequential research question and one clear action.
- **Do** use the complete orthogonal study path as the monitor's first view.
- **Do** center and isolate a selected team, then place its specialists on the reserved arc.
- **Do** keep contextual details beside the selected node and label actions in plain research language.
- **Do** honor keyboard navigation, visible focus, touch panning, pinch zoom, and reduced motion.

### Don't:

- **Don't** turn intake into chat, a settings form, or a setup-sidebar workflow.
- **Don't** turn the monitor into a card dashboard or Codex-like application chrome.
- **Don't** draw decorative wavy paths or backward paths without a saved invalidation.
- **Don't** use generic AI gradients, decorative glow, Lucide, or mismatched icon families.
- **Don't** expose agent jargon when a researcher-facing team or action label will do.
