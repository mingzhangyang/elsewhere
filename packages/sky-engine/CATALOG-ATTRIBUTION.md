# HYG star catalog attribution

`stars.json` is a derivative of **HYG v4.1**, David Nash / Astronexus, compiled from Hipparcos,
Yale Bright Star and Gliese catalogs.

- Source: https://github.com/astronexus/HYG-Database
- License: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
  (see also `HYG.txt`).
- Changes: selected 5,070 stars with magnitude ≤ 6, excluded Sol, retained HYG ID, proper name,
  J2000 RA hours, Dec degrees, V magnitude, B−V, and proper motion, sorted by magnitude and ID,
  encoded losslessly in eight columns.
- Reproduce using `scripts/import-stars.mjs` in the Elsewhere source repository. Original CSV SHA-256:
  `d9f69fd86bbf90a4e4d52b4c5c53eacfa6dfc0bfdef85bfd94f095e0bebe4ebd`.

The filtered catalog remains CC BY-SA 4.0, separately from the MIT-licensed engine. Preserve this
attribution and license when redistributing the catalog. The painting is an illustrative depiction,
not a survey map or navigation instrument.
