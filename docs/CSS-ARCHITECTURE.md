# CSS architecture

The application imports `src/styles.css` once from `src/main.tsx`. It is an ordered native CSS entry point, not a place for feature rules. Vite resolves the imports; no CSS framework, runtime dependency, CSS Modules transformation, or cascade layers are needed.

## Cascade order and ownership

| Module          | Responsibility                                                                               |
| --------------- | -------------------------------------------------------------------------------------------- |
| tokens          | Root theme, shared colors, surfaces, text scale and radius                                   |
| base            | Element defaults, language fonts, headings, links and focus                                  |
| controls        | Shared buttons, segmented controls, status, range input, dialog primitives and small helpers |
| layout          | Explorer shell, header, brand, footer, notice and immersive shell                            |
| sky-stage       | Renderer host, vignette, diagnostics, target ring and scene errors                           |
| sky-chrome      | Context, compass, shared dock, view tools, hint, focus summary and tooltip                   |
| inspector       | Object, weather and settings content, side panel and touch drawer                            |
| time-console    | Time readout, editor, timeline, event jumps and dock                                         |
| location-picker | Location trigger, search dialog and results                                                  |
| share           | Share dialog, image controls, preview and transition                                         |
| accessibility   | Screen-reader helper, touch input font floor and reduced-motion overrides                    |

The creator and memorial form retain their component-local CSS imports and lazy loading. The global styles are shared with those routes; do not move creator-only CSS into the global entry.

## Rules for changes

- Keep responsive declarations with their owner. Start with the base rules; group feature overrides by width and height, and keep touch drawer overrides after short viewport rules.
- Phone sky chrome owns the shared dock. Its grid geometry is in sky-stage. Preserve the stage isolation, panel-open stacking, tool popover offset and immersive exit. The focus summary short-screen bottom offset is desktop-only because phones use grid placement.
- The accessibility module must remain last. Its coarse-pointer font-size rule and reduced-motion important declarations are deliberate. Don't add competing global overrides or new important declarations to solve local conflicts.
- Reuse the existing theme tokens. Add a token only for a genuinely shared design value. The common location/time control background is one such token.
- Prefer a single selector definition per scope. Remove an override only after checking all overlapping media queries, specificity, shorthand/longhand order and actual component usage. Keep vendor-prefixed mask fallback, dynamic state selectors, hidden states and the renderer's data-occludes-sky contract.
- Add component-local rules to the relevant feature module, or keep route-specific CSS alongside its lazy component. Do not add a second global entry or a catch-all mobile stylesheet.

## Refactor audit

Baseline: main `8f9bcc6246fe6ce2f4e424e70d21d38020060078` (PR #39, successful CI).

The refactor preserves the DOM and JavaScript, the three existing important declarations and existing design colors. It merges the duplicated button baseline and object-list selector, drops the overwritten object-detail border, removes the phone inspector geometry superseded by the later drawer, removes repeated time control dimensions and font declarations, combines identical share checkbox styles, centralizes the reduced-motion rule and shares intermediate-width chrome geometry across heights. The global h1 phone rule stays global. Ambiguous or vendor-dependent selectors remain.

| Source metric                           | Before | After |
| --------------------------------------- | -----: | ----: |
| Project CSS files                       |      3 |    14 |
| Project CSS lines                       |   2908 |  2871 |
| Largest CSS file lines                  |   2440 |   587 |
| Project CSS source bytes                |  57779 | 57365 |
| Global leaf rules (including keyframes) |    401 |   386 |
| Global important declarations           |      3 |     3 |

Line counts exclude the trailing newline. Rule count includes media-query contents, counts comma-separated selectors as a single rule, and counts a keyframes block as one; it is not a count of provably unused selectors. Production CSS and JS/data budgets must be checked using the normal build, not estimated from source size. The previous successful CI logged global CSS 38.76 kB (8.90 kB gzip), total JS/data gzip 480072 bytes, startup gzip 67781 bytes and largest JS chunk 480520 bytes.

## Verification

Run `npm ci`, `npm run validate`, `npm run format:check` and `npm run test:browser` with installed Playwright browsers. Existing browser tests cover focus, occlusion, mobile controls, drawers, location, share, creator, languages and accessibility. The CSS refactor evidence test uses an original monolithic stylesheet from a Git baseline and takes before/after screenshots in the same deterministic dev scenario while comparing computed style and geometry. For this migration, use:

```sh
CSS_BASELINE_REF=8f9bcc6246fe6ce2f4e424e70d21d38020060078 npx playwright test tests/browser/css-refactor-evidence.spec.ts --project=chromium
```

The browser CI job supplies the PR base commit automatically; the evidence test skips when no monolithic baseline is available (normal subsequent PRs). Screenshots are attached to the existing browser-evidence artifact. Reduced motion and fixed scenario parameters limit drift; images are actual screenshots, not a guarantee of pixel identity of the animated WebGL canvas. The computed-style comparison is the automated regression check.
