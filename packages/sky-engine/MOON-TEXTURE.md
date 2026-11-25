# Optional NASA lunar texture

This optional archive contains the unchanged `moon-lroc.jpg` (2048 × 1024, 457,942 bytes).
The core SDK and its three sky image types do not contain or load it.

- Origin: NASA Scientific Visualization Studio, CGI Moon Kit, [lroc_color_2k.jpg](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg).
- Credit: NASA SVS, Ernie Wright, Noah Petro; LRO/LROC/LOLA.
- License: NASA public-domain imagery; see [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- Documented unchanged mirror: [COSMOS](https://raw.githubusercontent.com/sudoaanish/COSMOS/master/assets/textures/moon-lroc-2k.jpg).
- SHA-256: `f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170`.

The asset is copied from Elsewhere's existing `src/assets/moon-lroc.jpg`. Its checksum is verified
during every SDK build, included in the release manifest and verified after offline installation.
Byte equality against the current NASA download host has not independently been established.

The image is equirectangular: north at the top, longitude zero at the center, east increasing to
the right. It is an albedo/color map, not an elevation or terrain-shadow model. Host the image
locally or cache it in your own service worker; call `loadMoonTexture` with its URL.
