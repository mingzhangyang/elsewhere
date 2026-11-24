# Optional landscape artwork

The city and mountain artwork is shipped separately from the core SDK. It consists of the repository's
existing `src/assets/waterfront/*.webp` and `src/assets/valley/*.webp` renders, with their project
Blender source files `art/waterfront.blend` and `art/valley.blend` retained in the source repository.
See the repository's MIT license. No NASA lunar texture, star data, app UI or third-party artwork
is included in this optional archive.

The 16 images per variant are addressed as `landscapes/waterfront/<season>-<light>.webp` (city)
or `landscapes/valley/<season>-<light>.webp` (mountains). The season is spring, summer, autumn or
winter; the light is day, dusk, dawn or night. The SDK requests the actual variant from the host.
Ridge and sea are procedural and require no artwork download.
