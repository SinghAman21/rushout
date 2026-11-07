# Rushout Design Specification — review draft

> Candidate direction based on the implemented screens. This draft records the current product choices; it is not a claim of user signoff.
> Style family: playful, with Rushout's existing arcade palette and chunky game surfaces.

## 1. Design direction

- **Product**: Browser party chase game for solo practice, local crews, and online rooms.
- **Style family**: `playful`; friendly characters, bright controls, fast visual feedback.
- **References**: Existing Rushout arcade identity; no external reference products selected.
- **Tone**: Mischievous, energetic, welcoming.
- **Hard constraints**: Keyboard and touch input; reduced motion; clear IT state without color alone; 44px controls; responsive landscape play; persistent mute preference.
- **Locale**: primary `en`, secondary none.

## 2. Color

### Brand
- `--color-primary`: `#FFD13B` — primary action and time urgency.
- `--color-primary-hover`: `#FFE066`.
- `--color-primary-subtle`: `rgba(255,209,59,.12)`.
- `--color-secondary`: `#70D8ED` — secondary highlights and online play.

### Neutrals (tinted toward indigo)
- `--color-bg`: `#121026`.
- `--color-surface`: `#201D40`.
- `--color-border`: `#453C69`.
- `--color-text`: `#FFF7DE`.
- `--color-text-secondary`: `#C3BFDF`.
- `--color-text-muted`: `#AAA6CD`.

### Semantic
- `--color-success`: `#2ED573`.
- `--color-warning`: `#FFD13B`.
- `--color-error`: `#FF4757`.
- `--color-info`: `#70D8ED`.

### Dark mode
The shipped interface is dark by default. Arena backgrounds switch to daylight sky, neon night, and desert sunset palettes while preserving character contrast.

## 3. Typography

| Role | Font | Weights | Source |
|---|---|---|---|
| Heading | Outfit | 700, 900 | Self-hosted Google Fonts OFL files |
| Body | Fredoka | 400, 500, 600, 700 | Self-hosted Google Fonts OFL files |
| Mono | JetBrains Mono | 700 | System fallback where available |

### Type scale (px)
12 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 48 / 64 / 96.

### Body measure
- Target: 50–65 characters per line for explanatory copy.
- Line-height: 1.5 for UI; 1.6 for longer instructions.

## 4. Spacing

- Base unit: `4px`.
- Allowed scale: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.
- Density: balanced, with compact game HUDs and spacious entry/setup screens.
- Off-scale values remain in legacy canvas and touch-control dimensions and should be normalized during later component cleanup.

## 5. Radius

- `--radius-sm`: 10px.
- `--radius-md`: 16px.
- `--radius-lg`: 24px.
- `--radius-full`: 9999px for pills and circular controls.

## 6. Elevation / shadow

- `--shadow-sm`: `0 4px 0 #0D0B1C`.
- `--shadow-md`: `0 8px 0 #0D0B1C, 0 16px 24px rgba(0,0,0,.25)`.
- `--shadow-lg`: `0 10px 0 #0D0B1C, 0 20px 30px rgba(0,0,0,.5)`.
- Use inked arcade shadows on controls and grouped cards; avoid stacking shadows inside cards.

## 7. Motion

- Vocabulary: `expressive` for characters and pickups; restrained for navigation.
- Default duration: 100ms micro interaction, 200ms state change, 300ms overlay.
- Easing: `cubic-bezier(.2,.8,.2,1)` for UI; deterministic fixed-step timing for play.
- Allowed: squash/stretch, small idle bob, pickup float, short tag pulse, countdown scale.
- Forbidden: long input-blocking transitions, persistent camera shake, effects obscuring players.
- Reduced motion disables ambient particles, bobbing, and transitions.

## 7a. Container strategy

- **Strategy**: `tinted-surface` with a deliberate chunky arcade outline/shadow treatment on primary menu and setup panels.
- **Per-surface overrides**:
  - Menu: tinted panels, 2px soft border, ink shadow.
  - Lobby and forms: tinted panels and dashed invite-code border.
  - Game HUD: translucent compact labels over the canvas.
  - Results: one focused tinted card with clear next actions.

## 7b. Icon system

- **Set**: `brand-custom` for the bean characters and canvas symbols; semantic labels accompany all important states.
- **Weight**: bold.
- **Treatment**: two-tone for illustrated characters; monochrome text/glyphs for compact controls.
- **Sizes**: 16 / 20 / 24px UI baseline; larger character and pickup art is canvas-specific.
- **Primary use color**: current text color or semantic pickup color.
- **Mixing**: no icon-only critical action; use labeled controls. Existing pickup emoji remain identifiable gameplay art.

## 7c. Decoration

| Surface | Gradients | Textures | Motifs |
|---|---|---|---|
| Menu hero | subtle | dot-grid | illustration |
| Setup and lobby | subtle | dot-grid | geometric map previews |
| Gameplay arenas | expressive environmental gradients | none | illustrated landmarks |
| Results | subtle | dot-grid | player character tokens |

## 8. Component conventions

### Buttons
- Primary: semantic yellow, green, or blue fill; dark ink outline; tactile bottom shadow; minimum 44px target.
- Secondary: indigo surface with muted text and the same focus ring.
- Ghost: underlined text links for navigation within copy.
- Destructive: red only when an action is truly destructive; leaving a round is secondary and remains clearly labeled.
- Sizes: sm 36–44px, md 48px, lg 56px minimum height.

### Inputs
- Dark inset surface, 3px ink border, white text; visible yellow focus outline; inline labels and errors; disabled actions explain missing room-code requirements.

### Cards
- Use only to group related choices or states. 16–24px radius, 20–28px padding, tinted indigo surface, restrained border and ink shadow.

## 9. Surfaces

- **Menu**: one playful brand hero and three obvious play modes; room joining remains a separate invitation path.
- **Setup**: player names/controls, round length, and real map preview before the primary start action.
- **Lobby**: room code, invite link, host marker, guest readiness, rules, and start availability in one view.
- **Gameplay**: proportional canvas, readable identity/IT markers, timer, ability duration, local roster, touch controls, mute, and leave/setup actions.
- **Results**: name the runner caught at zero; offer rematch, setup/lobby, and leave according to their labels.

## 10. Anti-patterns

- Do not use generic dashboard grids or add ornamental panels around gameplay.
- Do not use color alone for IT, player identity, readiness, or errors.
- Do not place scenery with the same contrast and edges as collision geometry.
- Do not allow a full-screen legacy style rule to override component spacing or focus states.
- Do not display a start action while online guests are unready.

## 11. Open questions

- This is an implementation draft; the user has not reviewed the final in-product business mockup or signed off on the token direction.
- Sound set beyond the current synthesized short cues remains a future product choice.
