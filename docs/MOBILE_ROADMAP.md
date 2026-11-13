# Elsewhere mobile app roadmap

Status: proposed implementation plan. Updated November 13, 2026.

Build a mobile sky explorer around the existing React, TypeScript, Three.js, and Astronomy Engine implementation. Start with an installable web app, prove the experience on physical phones, then introduce Android and iOS editions through Capacitor. Keep astronomy, weather, saved explorations, and most interface code shared across platforms.

The first milestone is an installable mobile beta. The distinctive feature for the dedicated mobile edition is pointing the phone toward the sky to locate objects, with clear calibration and visibility feedback. Its usefulness depends on measured sensor behavior, so sensor qualification is a separate milestone from packaging.

This plan extends the [app polish roadmap](../ROADMAP.md). The existing [release gates](RELEASE.md), [scientific conventions](SCIENCE.md), and [validation evidence](VALIDATION.md) continue to apply.

## Current foundation

| Area                    | Current status                                                                         | Mobile work remaining                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sky and time            | Sun, Moon, 5,070 stars, civil-time handling, independent numerical regression fixtures | Preserve the calculation contract across platforms                                         |
| Interaction             | Responsive controls, drag, pinch, keyboard alternatives, object discovery              | Physical touch, screen rotation, system text scaling, VoiceOver and TalkBack qualification |
| Offline operation       | Production reload and fresh-tab shared-link restoration pass in Chromium               | Installed web-app lifecycle on phones; native startup with bundled assets                  |
| Persistence and sharing | Local saved/recent places, versioned preferences and sky links                         | Native storage adapter, migrations, native sharing and link opening                        |
| Device access           | Explicit device-location action                                                        | Orientation, heading reference, calibration, permissions and lifecycle handling            |
| Installation            | Web build and service worker exist                                                     | Web app manifest, installation icons, standalone presentation and installation guidance    |
| Automated checks        | 101 domain/component tests and 25 browser cases pass locally                           | Native builds, device evidence and remote CI                                               |

The application has no Capacitor platform projects or sensor-driven camera input yet. Physical-device performance, sustained GPU use, assistive technology, unfamiliar-user sessions, and remote CI remain open in the release checklist. Passing desktop WebKit or mobile viewport tests does not close those gates.

## Product scope

The installable beta should let someone find tonight's Moon, change the place and time, understand why an object is hidden, save an observing location, and reopen a saved or shared sky offline after installation and caching. Weather and remote place search continue to require connectivity; missing weather remains explicit.

The first dedicated mobile edition adds:

- A deliberate **Point at the sky** mode with calibration guidance and an obvious return to manual exploration.
- A dim red night theme for the app's controls, labels, and panels, with readable focus and selection states.
- Bundled astronomy data and rendering assets for offline use on the first launch after native installation.
- Native sharing, incoming sky links, and saved observing locations that survive app updates.

Camera overlays, AR anchoring, background tracking, observing notifications, accounts, cloud sync, planets, and expanded astronomical catalogs are later investments. Sensor pointing initially drives the rendered sky without a camera feed. Night mode controls the app's presentation; it does not promise control over operating-system dialogs or hardware brightness.

## Delivery sequence

Calendar commitments should follow selection of the test devices, supported OS versions, and build environment. The following milestones define dependencies and completion evidence.

| Phase | Deliverable                        | Depends on                                        | Completion decision                                                         |
| ----- | ---------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 0     | Mobile baseline and support matrix | Current web candidate                             | Target devices, measurements and release responsibilities recorded          |
| 1     | Installable web beta               | Phase 0                                           | Core tasks and installed offline lifecycle pass on Android and iPhone       |
| 2     | Android pointing prototype         | Phase 1                                           | Sensor alignment and usability justify a dedicated mobile edition           |
| 3     | Android beta                       | Phase 2                                           | Bundled offline startup, lifecycle, sharing, storage and device checks pass |
| 4     | iOS beta                           | Stable shared contracts from Phase 3              | iOS-specific sensor, lifecycle, accessibility and installation checks pass  |
| 5     | Public mobile release              | Relevant platform beta and existing release gates | Release evidence, distribution and support procedures are complete          |

All mobile phases are planned. Existing web validation is the starting evidence, not completion of a mobile phase.

## Phase 0 Establish the mobile baseline

Select at least one midrange Android phone, a second Android device with different sensor/GPU characteristics, and an iPhone. Record model, OS version, browser or WebView version, viewport, pixel density, power mode, brightness, and network conditions. Choose the minimum supported OS versions after this baseline and the selected Capacitor release requirements are checked.

Run the current app through Moon discovery, time editing, location selection, custom weather, sharing, pinch zoom, rotation, background/resume, and a 30-minute rendering session. Record startup, frame intervals, input latency, retained resources, battery consumption, and thermal behavior. Compare a quiet sky with rain, dense labels, and accelerated playback.

Choose a beta hosting origin, a release owner, Android build access, and an iOS build route. Capacitor's documented iOS build environment requires macOS and Xcode; a cloud build service is an option when local macOS access is unavailable. [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).

**Exit criteria:** the support matrix and baseline measurements are recorded; repeated crashes or blocked primary interactions have been corrected; target thresholds below are confirmed or revised with reasons.

## Phase 1 Deliver an installable web beta

Add a web app manifest with a stable identity, name, start URL, scope, standalone display mode, theme colors, and appropriate icons. Include an Apple touch icon and platform-appropriate installation guidance. Installation behavior differs across browsers and operating systems, so test the actual installed presentation. [PWA installation documentation](https://web.dev/learn/pwa/installation).

Keep the existing service worker's build-owned cache and waiting lifecycle. Test initial installation, incomplete installation, updates with an older tab still open, offline relaunch, storage loss, and recovery after reconnecting. Describe offline readiness accurately; weather and search are separate from the cached sky. Preserve the regression covering `Vary: Origin` and verify deployment headers at the chosen origin.

Add the night theme and review small-screen viewing space, gesture areas, display cutouts, system bars, text scaling, and on-screen keyboard behavior. Check both portrait and landscape. Saved places already exist; extend their presentation only where device testing shows a need.

**Exit criteria:** someone can install the beta and complete the core tasks on the selected Android phone and iPhone. Offline relaunch works after successful cache installation, updates preserve compatible preferences, and denial of location access leaves place selection usable. VoiceOver/TalkBack and actual touch checks have recorded outcomes. Publish beta instructions and known device limitations with the build identifier.

## Phase 2 Prove sensor pointing on Android

Create a small Capacitor Android prototype using the existing production web build. Capacitor supports integration with an existing JavaScript project and native functionality through plugins. Treat renderer performance as something to measure in the native container. [Capacitor overview](https://capacitorjs.com/docs).

Evaluate the available sensor APIs before selecting a provider. The current Capacitor Motion plugin is implemented using Web APIs; adding it alone does not establish reliable absolute heading or a native sensor implementation. Compare its field behavior with a focused native adapter if necessary. [Capacitor Motion API](https://capacitorjs.com/docs/apis/motion).

Define one orientation contract containing the device attitude, timestamp, reference frame, and available accuracy/calibration information. Convert device and screen coordinates into the renderer's world coordinates in one module. Handle portrait/landscape changes, heading wraparound, near-vertical pointing, roll, magnetic versus true north, and unreliable samples. Android's position-sensor documentation describes magnetic-reference orientation and the relevant coordinate conventions. [Android position sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_position).

Give manual controls and sensor input explicit ownership of the camera. Sensor updates must not fight dragging, recentering, or object selection. Keep raw sensor events out of React's render cadence and stop subscriptions when pointing is disabled or the app is backgrounded.

Entering live pointing should explain and deliberately select the observing location and current time. If the user changes to a remote place or simulated date, leave live pointing and label the view as exploration. Do not imply that a simulated sky is the sky in front of the user. Permission denial, unavailable sensors, stale readings, or poor heading confidence should offer manual exploration with a specific explanation.

**Exit criteria:** recorded outdoor trials on both Android devices meet the agreed alignment and latency targets. Users can enter, calibrate, pause, and exit pointing without coaching. Calibration failures are visible, and the camera remains usable through rotation and background/resume. If the prototype cannot provide useful pointing, improve the measured source of error or retain the installable web beta while the native direction is reconsidered.

## Phase 3 Deliver the Android beta

Package the shell, star catalog, Moon map, and required code inside the native application. Native first-launch offline behavior must depend on those bundled assets. Keep service-worker registration specific to the hosted web edition so cached web releases cannot become a second update authority inside the native package.

Add narrowly scoped adapters for location, lifecycle, preferences, sharing, and incoming links. Preserve the existing exploration schema and coordinate disclosure. Use a canonical web origin when sharing from the native edition; never generate links pointing at the container's internal origin. Validate incoming links with the existing parser and retain a useful error state.

Define Android Back behavior for dialogs, inspectors, and the root screen. Verify system bars, keyboard resizing, screen rotation, interruption/resume, and process restart. Persist explicit user choices in the selected native storage mechanism and test upgrades from the previous beta. Web and native storage are separate installations; use explicit link/import behavior for transfer rather than implying automatic synchronization.

Add reproducible Android builds and a beta distribution procedure with versioned artifacts and retained diagnostics. Recheck provider attribution and API usage for the intended distribution. Keep precise coordinates and raw sensor readings out of routine diagnostics.

**Exit criteria:** a fresh installed build launches and explores offline before any successful weather request. Pointing, manual exploration, saved places, incoming/shared links, denied permissions, and lifecycle recovery pass on the supported Android devices. The 30-minute soak and TalkBack review pass. At least three unfamiliar users complete the primary observing tasks; recurring confusion is resolved before widening the beta.

## Phase 4 Deliver the iOS beta

Add the iOS project after the shared adapter and pointing contracts stabilize. Implement and qualify the iOS orientation provider, permission flow, native preferences, sharing, and incoming links. Retain the existing coordinate conventions and calibration semantics while respecting platform-specific behavior.

Test on an actual iPhone for WebGL rendering, sensor reference frames, safe areas, system dialogs, interruptions, background/resume, storage across upgrades, and offline relaunch. Run VoiceOver and text-scaling checks. Do not inherit Android acceptance results for these behaviors.

Prepare signing, versioning, privacy declarations, beta distribution, and a reproducible macOS build. Confirm current SDK and store requirements when this phase starts; exact versions are implementation inputs rather than permanent roadmap assumptions.

**Exit criteria:** the same product tasks and numerical contracts pass on iOS, with platform-specific evidence for pointing, rendering, accessibility, offline startup, and upgrades. The beta installation and update procedure is repeatable by someone other than its implementer.

## Phase 5 Qualify and release

Complete the applicable [release checklist](RELEASE.md), including remote CI, broader scientific review, device testing, and the sustained renderer checks. Confirm supported device/OS combinations, known limitations, support contact, attribution, and privacy text. Review the current store requirements against the final app and prepare screenshots and descriptions that match delivered functionality.

Separate hosted-web rollback from native recovery. Preserve complete web artifacts for rollback; retain native release artifacts and document distribution pause, staged rollout, and corrective-update procedures. Test schema compatibility so a failed release does not strand saved places or shared explorations.

**Exit criteria:** all release-blocking defects are closed with evidence, the chosen distribution channel accepts the build where required, and monitoring/support procedures are ready. Retain the web edition as a usable entry point and link destination.

## Shared architecture

| Existing area                                 | Planned change                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/lib/astronomy.ts`, `stars.ts`, `time.ts` | Keep platform-independent calculations and reference fixtures                                                           |
| `src/hooks/useSimulation.ts`                  | Preserve clock semantics; make transitions between live pointing and simulated exploration explicit                     |
| `src/renderer/cameraControls.ts`              | Separate manual camera input from a sensor attitude adapter with explicit input ownership                               |
| `src/renderer/createSkyRenderer.ts`           | Reuse retained rendering and quality controls; measure device-specific bottlenecks before changing rendering technology |
| `src/lib/persistence.ts`                      | Retain schema validation; separate serialization from web/native storage and canonical share-link construction          |
| `src/main.tsx`, `scripts/offline-plugin.ts`   | Keep hosted-web caching distinct from native bundled startup                                                            |
| Proposed `src/platform` modules               | Define small interfaces for location, orientation, lifecycle, storage, sharing, and incoming links                      |

Add adapters only as their first platform use is implemented. Avoid a broad framework migration. Reconsider a separate native renderer only when profiles establish a limitation that targeted changes cannot meet within the agreed device budget.

## Acceptance measurements

These are proposed targets, not current device-performance claims. Confirm the hardware and test protocol in Phase 0 and preserve measurements with the build identifier.

| Area                  | Initial acceptance target                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Touch rendering       | At least 30 fps on the selected midrange phone; p95 frame interval at or below 40 ms in demanding scenes                                                                                      |
| Local controls        | p95 response below 100 ms for time scrubbing and ordinary controls                                                                                                                            |
| Startup               | Usable shell within 1.5 s and interactive sky within 3 s under the named cold-start/network profile; measure native and installed-web cases separately                                        |
| Resource stability    | No sustained growth in retained geometries, textures, listeners, or loops during a 30-minute playback/location-switch session                                                                 |
| Sensor responsiveness | Proposed p95 sensor-to-view latency at or below 100 ms; measure the effect of smoothing                                                                                                       |
| Pointing alignment    | Proposed p95 angular separation at or below 5 degrees against independently established sightlines after calibration in suitable outdoor conditions; include multiple headings and elevations |
| Battery and heat      | Record fixed-brightness 30-minute runs and establish a device-specific budget from Phase 0; reject recurring thermal throttling that breaks interaction targets                               |
| Accessibility         | Core tasks complete with VoiceOver/TalkBack, text scaling, and manual controls when sensors are unavailable                                                                                   |
| Offline behavior      | PWA works after successful caching; native app works after installation with connectivity disabled; unavailable remote data is labeled                                                        |

Pointing error is separate from ephemeris accuracy. Report alignment, jitter, drift, and invalid-reading behavior separately. If the alignment target is not credible for a device, revise its supported behavior explicitly; do not hide uncertainty with a smoother animation.

## First implementation batches

1. Record the device/OS matrix and baseline scenarios; assign the release owner and hosting/build prerequisites.
2. Add the manifest, installation icons, standalone metadata, and concise installation guidance. Extend checks for installation assets and deployment scope.
3. Add the night theme and resolve issues found during installed-web touch, lifecycle, offline, and accessibility testing.
4. Produce the PWA beta evidence and a short usability report; decide whether the observing flow is ready for the sensor prototype.
5. Add the Android Capacitor prototype and orientation contract; record the field experiment and the decision on sensor provider before implementing the full native integration.

Keep each batch runnable and independently reviewable. Release readiness should follow observed behavior on the supported devices, with the existing deterministic test suite protecting shared astronomy and exploration behavior.
