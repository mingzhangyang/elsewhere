# Illustration asset prompts

Prompts for generating layered painted assets for the illustrated keepsake image with an image model, as a trial before (or instead of) commissioning a painter in phase 4. See [ROADMAP.md](../ROADMAP.md#3-prototype-and-test-a-sky-moment-s) for where procedural painting stops.

These prompts have not yet been run in any generator; expect a few rounds of adjustment. The assets only replace painted shapes. The composing code (`src/moment/`) keeps everything calculated: the sky, the Sun, Moon, planets and stars, cloud amounts and positions, the light direction, and the clip that keeps the ground below the horizon line.

## Hard constraints

1. **No sky and no celestial bodies in any asset.** Assets supply only the ground and cloud shapes.
2. **Light from the upper left** in every asset. The code mirrors assets to match the real light direction.
3. **No studio or artist names**, in prompts or anywhere in the repository. Use descriptive language only, and no real landmarks.

## Common style (append to every prompt)

```
Hand-painted background illustration in gouache and watercolour on cold-press
paper, in the manner of a children's picture book or a hand-painted animated
film background. Soft atmospheric perspective, visible brushwork, slightly
uneven washes, crisp painted edges on lit forms and soft edges in shade.
Warm, gentle, airy. Light comes from the upper left. Original composition,
generic countryside, no real landmarks.
```

## Common negative prompt

```
sky, clouds, sun, moon, stars, text, lettering, signature, watermark, frame,
border, photo, 3D render, vector art, flat design, hard black outlines,
faces, close-up characters, real landmarks, lens flare, light rays
```

## 1. Style reference

Generate this first and use it as the style reference for everything after.

```
A wide rolling pasture seen from a low hill at midday: layered green hills
fading into pale blue haze, a small cottage with a red roof in the middle
distance, one broad-leaved tree in the foreground, meadow grass and small
wildflowers. [common style]
```

## 2. Foreground ground, one per horizon variant

Use the widest aspect available (21:9 or 3:1), cropped later to about 2400 × 800. The content sits at the bottom with empty space above. Add this sentence to all four, for clean cut-outs:

```
Isolated on a flat, solid, pure magenta (#FF00FF) background. The upper third
of the image is empty background. Nothing touches the top edge.
```

**Ridge (pasture)**

```
A foreground strip of meadow on a gentle rise, seen side-on: tufts of long
grass, scattered small wildflowers, a few tall seed heads, a worn footpath
crossing it. No trees, no buildings, no people. [common style]
```

**Mountains (conifers)**

```
A foreground strip of alpine meadow with low rocks, short grass, small
flowers and two or three young fir trees at one end. No buildings, no people.
[common style]
```

**Sea (headland)**

```
A grassy coastal headland rising from the lower left corner and sloping down
to the right, ending before the middle of the image; wind-bent grass, sea
pinks, a weathered wooden fence post. Everything to the right of the headland
is empty background. No water, no boats, no people. [common style]
```

**City (hillside town)**

```
A small hillside town seen from above and slightly to one side: rows of
simple houses with pitched tiled roofs stepping down a slope, garden trees
between them, chimneys, narrow lanes. Generic houses, no towers, no church,
no landmarks, no people, no cars. [common style]
```

## 3. Separate small assets

The code places and mirrors these freely. Same magenta background, square aspect.

```
A single broad-leaved tree with a full, irregular crown painted in three
values (shade, body, light), leafy ragged edges, a few gaps where the
background shows through, a forked trunk. Whole tree visible, centred.
[common style]
```

```
A small cottage seen side-on: cream wall, pitched red-tiled roof, one
chimney, a door and two small windows. Whole building visible, centred.
[common style]
```

```
Two small figures seen from behind, standing on grass: an adult in a red coat
pointing upward with one arm, a child in a yellow coat beside them. Full
figures, no faces visible, simple shapes. [common style]
```

## 4. Dusk and night: edit, don't regenerate

Shapes must line up pixel for pixel with the day version, or the image jumps between lights. Edit each day image from sections 2 and 3 with image-to-image or an edit mode.

**Dusk**

```
Repaint this same image at dusk, keeping every shape exactly where it is.
The forms are in cool violet shade; a warm orange light from the low left
catches only their edges. Windows are lit warm yellow. Keep the magenta
background unchanged.
```

**Night**

```
Repaint this same image at night under moonlight, keeping every shape exactly
where it is. Deep blue and indigo, never black; a pale blue-silver light from
the upper left on the lit sides. Windows glow warm yellow and spill a little
light on the ground. Keep the magenta background unchanged.
```

## 5. Clouds (black background, brightness as opacity)

Cloud edges are translucent and do not cut out cleanly from magenta. Generate on pure black; the compositor uses brightness as opacity and colours the cloud for the time of day.

```
A single white cumulus cloud painted in gouache, isolated on a flat pure
black background. Heaped, cauliflower-like billows of many different sizes,
a flat base, bright lit faces toward the upper left, soft grey shade
underneath and to the right. Soft brushed edges. Greyscale only, no colour.
No sky, no other clouds.
```

Replace the first sentence with each of these, three or four variants each:

- `A small fair-weather cumulus puff`
- `A tall towering cumulus with three stacked tiers`
- `A long thin horizontal bar of stratus cloud, tapered at both ends`
- `A rippled field of small altocumulus puffs in loose rows`
- `A sheaf of long feathered cirrus strokes swept to one side`

## 6. Paper texture

```
A flat scan of blank cold-press watercolour paper, evenly lit, no shadows, no
folds, no stains, no objects. Neutral mid-grey, fine visible tooth and a few
fibres. Seamless, tileable texture.
```

## Before using the assets

- **Transparency.** If the model can output a transparent background directly, replace the magenta sentence with `transparent background` and skip the cut-out step.
- **Horizon silhouettes stay in code.** The ridge, mountain and skyline silhouettes are under 2° and only about twenty pixels tall on the image; drawing them in code keeps them exact.
- **Variety.** Generate three or four different compositions per horizon variant, or repeat visitors will see the same picture.
- **Licence.** Confirm that the generation service's terms allow this use and redistribution, and record the source, terms and processing of each asset in [ASSETS.md](ASSETS.md).
