# Production preview evidence

Captured November 13, 2026 in the Codex in-app Chromium browser on Windows. Browser engine version and physical GPU/device identity were not exposed by the inspection surface, so these captures are UI evidence rather than a named-device qualification.

- [Desktop](desktop.jpg): 1280 × 720; New York, November 12, 2026, 23:00 local; custom clear atmosphere, default north-facing camera; controls visible and first-use hint dismissed.
- [Mobile](mobile.jpg): 390 × 844 viewport emulation; the same shared exploration with the weather inspector open. Its content scrolls independently of the close control and bottom timeline.

The preview serves the production build on loopback port 4173. No deployment or external publication occurred. The scenario was prepared through the development UI and restored in production with the app's own share-link format; production does not include development fixtures or diagnostics.

## Refinement follow-up

The subsequent product review led to a compact time dock, discovery-first Objects inspector, persistent calculated-position marker, reversible clear-sky preview, and revised atmospheric rendering. These additional production captures use New York on November 12, 2026 at 12:00 local, facing the calculated crescent Moon at approximately azimuth 148.2°, altitude 13.4°:

- [Refined desktop](refined-desktop.jpg): 1280 × 720, centered Moon with its daytime visibility explanation. Clear-sky preview is active; the original custom 100% cloud cover remains available through Restore.
- [Refined mobile](refined-mobile.jpg): 390 × 844, Objects opens with search and above-horizon browsing. The time dock is 130 px high, compared with 275 px in the reviewed preview.

These are the rebuilt production app on port 4173, restored from a link created through the development interface. No development fixture or diagnostic controls ship in the production app. All prior physical-device, browser-version, and qualification limitations still apply.

## Illustration repaint

Captured November 16, 2026 in Chromium (software GL) on Linux from the development server, through the share dialog's **Make an image** → **Illustrated**. Each pair shows the illustrated image before (left) and after (right) the repaint, for the same moment and view over New York; only the sky area is shown, without the text panel.

- [Sunset, ridge](illustration-sunset-ridge.jpg): November 12, 2026, 16:35, 30% cloud, facing southwest.
- [Night, city](illustration-night-city.jpg): November 12, 2026, 23:00, clear, facing southeast.
- [Day, mountains](illustration-day-mountains.jpg): November 12, 2026, 12:00, 15% cloud, facing south.
- [Dusk, sea](illustration-venus-sea.jpg): August 14, 2026, 20:30, clear, facing Venus and a thin Moon in the west.
- [Day, 60% cloud, ridge](illustration-windy-ridge.jpg): November 12, 2026, 12:00.
- [Phone, Chinese](illustration-phone-zh.jpg): whole postcards at 390 × 844: the dusk image before and after, and the night city.
- [The sunset through the rounds](illustration-rounds.jpg): the baseline and each round of revision, left to right.

The Chinese and Latin lettering shows this machine's fallback fonts; devices with a brush-written Chinese face or an italic book face use those.
