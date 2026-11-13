# Asset provenance

User-facing attribution is bundled at `public/credits.html` and linked from Settings.

Runtime dependency license texts are bundled in `public/licenses/THIRD-PARTY.txt`, generated from the installed dependency graph with `node scripts/generate-notices.mjs`. Validation checks that this notice file matches the lockfile installation. Regenerate and review it when runtime dependencies change. The UI uses system fonts and includes no remotely hosted font files.

| File                          | Origin                                                                                                                         | License / processing                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/stars.json`         | David Nash / Astronexus HYG v4.1, `https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv` | CC BY-SA 4.0. 5,070 stars, magnitude ≤ 6, Sol excluded. Fields: HYG ID, proper name, RA hours, Dec degrees, magnitude, B−V or null, pmRA\*cosDec and pmDec in mas/year. Filtered derivative remains CC BY-SA 4.0. |
| `public/assets/moon-lroc.jpg` | NASA SVS CGI Moon Kit, `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg`                               | NASA SVS public-domain imagery, no modification. Credit: NASA SVS, Ernie Wright, Noah Petro; LRO/LROC/LOLA.                                                                                                       |

The catalog import is reproducible with `node scripts/import-stars.mjs [path-to-source.csv]`. It verifies the source SHA-256: `d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd`.

The NASA download host repeatedly reset/timed out from this environment on November 13, 2026. The map was retrieved from the documented unmodified mirror `https://raw.githubusercontent.com/sudoaanish/COSMOS/master/assets/textures/moon-lroc-2k.jpg`; its attribution identifies the NASA source above. Download SHA-256: `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170`. Dimensions and the full equirectangular map were inspected. Byte equality against NASA's current host was not independently verified.

The four constellation/asterism line definitions are original simplified connections in this project, not copied from another line-art dataset. Big Dipper and Summer Triangle are labeled as asterisms. Crux uses Acrux–Gacrux and Mimosa–Imai. Orion is intentionally a partial figure. No claim of complete IAU boundaries is made.

Moon geometry uses Astronomy Engine's IAU rotation axis and prime-meridian angle. The texture's center longitude maps to local +X, north to +Y, and east to −Z. The body frame is rotated into the observer's horizon frame. This preserves libration from the changing observer direction; it does not model refraction distortion across the lunar disk.
