import type { BodyId, MoonPhaseKey, NetworkFailure, WeatherSource } from '../types';
import type { MomentProvenance } from '../lib/moment';
import type { PatternId } from '../domain/stars';
import type { Visibility } from '../lib/exploration';
import type { NetworkService } from '../lib/networkErrors';
import { formatters } from './format';

/**
 * The English message catalog: the source language and the shape every other catalog must match
 * (`Messages`). Messages are whole sentences. Where a sentence depends on values, it is a function of
 * them, so each language can order the words its own way, choose plural forms with Intl.PluralRules
 * (`f.plural`) and pick between variants without the interface assembling fragments.
 */
const f = formatters('en-US', 'id');

const PHASES: Record<MoonPhaseKey, string> = {
  new: 'New Moon',
  'waxing-crescent': 'Waxing Crescent',
  'first-quarter': 'First Quarter',
  'waxing-gibbous': 'Waxing Gibbous',
  full: 'Full Moon',
  'waning-gibbous': 'Waning Gibbous',
  'last-quarter': 'Last Quarter',
  'waning-crescent': 'Waning Crescent',
};

const SERVICE: Record<NetworkService, { name: string; Name: string; retry: string; what: string }> = {
  weather: {
    name: 'the weather service',
    Name: 'The weather service',
    retry: 'Try refreshing.',
    what: 'weather',
  },
  search: { name: 'place search', Name: 'Place search', retry: 'Try again.', what: 'places' },
};

const en = {
  f,
  document: {
    title: 'Elsewhere — An Interactive Sky Simulator',
    description:
      'An immersive, interactive simulator for exploring the sky from any place and time on Earth.',
  },
  brand: {
    home: 'Elsewhere home',
    tagline: 'A LITTLE PERSPECTIVE',
    footer: 'THE SKY, FROM HERE',
  },
  /** Names of the Sun, the Moon and the planets. */
  bodies: {
    sun: 'Sun',
    moon: 'Moon',
    mercury: 'Mercury',
    venus: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturn',
  } satisfies Record<BodyId, string>,
  /**
   * Catalog proper names (as in the HYG catalog) mapped to this language's name. Stars without an
   * entry keep their catalog name.
   */
  starNames: {} as Readonly<Record<string, string>>,
  patterns: {
    'big-dipper': 'Big Dipper · asterism',
    orion: 'Orion',
    crux: 'Crux',
    'summer-triangle': 'Summer Triangle · asterism',
  } satisfies Record<PatternId, string>,
  phases: PHASES,
  /** Preset places by id, where this language names them differently from the data. */
  places: {} as Readonly<Record<string, { name: string; country: string }>>,
  device: {
    name: 'Your location',
    country: 'Device coordinates · sea-level estimate',
  },
  /** Compass points, clockwise from north. */
  directions: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  facing: ({ direction, degrees }: { direction: string; degrees: number }) =>
    `Facing ${direction}, ${degrees} degrees`,
  sky: {
    mood: {
      day: 'A moment under the Sun',
      changing: 'The light is changing',
      twilight: 'Between day and night',
      night: 'A sky full of possibility',
    },
    exploration: 'Sky exploration',
    scene: 'Interactive three-dimensional sky',
    canvas:
      'Sky view. Arrow keys look around, plus and minus zoom, Home resets the view. Use the object list to select objects.',
    targetLabel: ({ name }: { name: string }) => `${name} · position`,
    startFailed: 'The 3D sky could not start. Your sky calculations remain available below.',
    loadFailed: 'The 3D sky could not load. Check your connection and retry.',
    contextLost:
      'The graphics connection was interrupted. Retry the sky; your place, time, and view are preserved.',
    retry: 'Retry sky',
    summaryRegion: 'Sky summary',
    summary: ({
      place,
      time,
      sunAltitude,
      phase,
      illumination,
      planets,
      source,
    }: {
      place: string;
      time: string;
      sunAltitude: number;
      phase: string;
      illumination: number;
      planets: string[];
      source: string;
    }) =>
      `${place}. Local time ${time}. Sun altitude ${f.number(sunAltitude)} degrees. Moon ${phase}, ${f.number(illumination)} percent illuminated. ` +
      (planets.length ? `Planets above the horizon: ${planets.join(', ')}. ` : '') +
      `${source}.`,
    footerReadout: ({ sunAltitude, illumination }: { sunAltitude: number; illumination: number }) =>
      `Sun ${f.number(sunAltitude, 1)}° · Moon ${f.number(illumination)}% lit`,
    weatherCredit: 'Weather by Open-Meteo',
  },
  controls: {
    share: 'Share this sky',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetView: 'Reset view',
    showControls: 'Show controls',
    hideControls: 'Hide controls',
    showViewTools: 'Show view tools',
    hideViewTools: 'Hide view tools',
    explore: 'Explore controls',
    objects: 'Objects',
    weather: 'Weather',
    layers: 'Layers',
    objectsTooltip: 'Find and explore celestial objects',
    weatherTooltip: 'View or customize the weather',
    layersTooltip: 'Customize sky layers and settings',
    dismissNotice: 'Dismiss notice',
  },
  hint: {
    title: 'Where will you look?',
    gestures: 'Drag to explore · arrows to look · pinch or + / − to zoom',
    findMoon: 'Find the Moon',
    dismiss: 'Dismiss viewing hint',
  },
  inspector: {
    /** Accessible names of the panels, which browser tests find them by. */
    region: { objects: 'objects inspector', weather: 'weather inspector', settings: 'settings inspector' },
    title: { objects: 'Explore the sky', weather: 'Weather & atmosphere', settings: 'Make it your view' },
    close: 'Close inspector',
  },
  atmosphere: {
    restore: 'Restore atmosphere',
    restoreCustom: 'Restore custom atmosphere',
    restoreWeather: 'Restore weather atmosphere',
    previewClear: 'Preview a clear sky',
    clearPreview: 'Clear-sky preview',
    custom: 'Custom simulation',
    neutral: ' · neutral sky',
    previewNotice: 'The sky is temporarily clear for exploration. Original weather values are shown below.',
  },
  notices: {
    'stars-unavailable':
      'The star catalog could not load. The Sun and Moon remain available; try again from Objects.',
    'offline-unavailable':
      'Offline caching could not be enabled. This open sky remains usable; reloading offline may require a connection.',
    'preferences-not-saved': 'Changes are active, but this browser could not save your preferences.',
    'preferences-unreadable': 'Saved settings could not be read. Default settings are active.',
    'invalid-link': 'This sky link is invalid or unsupported. A fresh exploration is open.',
    'no-rise': 'No rise was found within the supported dates. Try another place or date.',
    'rise-failed': 'This rise could not be calculated. Choose another date or place.',
    'copy-manually': 'Select the link and copy it with your keyboard.',
    'moon-map-unavailable': 'The Moon surface map could not load. Positions and phase remain available.',
    'language-unavailable': 'That language could not load. Check your connection and try again.',
  },
  focus: {
    region: 'Selected object',
    clear: 'Clear object selection',
    recenter: 'Recenter',
    enableStars: 'Enable stars',
    jumpToRise: 'Jump to next rise',
  },
  objects: {
    back: 'All objects',
    kind: { star: 'Star', planet: 'Planet', solar: 'Solar system' },
    center: 'Center in view',
    starTimeline: 'Use the timeline to explore when this star is above the horizon.',
    altitude: 'Altitude',
    azimuth: 'Azimuth',
    moonPhase: ({ phase, illumination }: { phase: string; illumination: number }) =>
      `${phase} · ${f.number(illumination)}% illuminated`,
    /** Brightness, and the phase for Mercury and Venus. */
    planetBrightness: ({
      magnitude,
      phase,
    }: {
      magnitude: number;
      phase?: { shape: PlanetShape; illumination: number };
    }) =>
      `Magnitude ${f.number(magnitude, 1)}` +
      (phase ? ` · ${PLANET_SHAPES[phase.shape]}, ${f.number(phase.illumination)}% illuminated` : ''),
    /** The phase icon's accessible name. */
    planetPhaseLabel: ({
      name,
      shape,
      illumination,
    }: {
      name: string;
      shape: PlanetShape;
      illumination: number;
    }) => `${name}: ${PLANET_SHAPES[shape]}, ${f.number(illumination)}% illuminated`,
    apparition: ({
      apparition,
      elongation,
    }: {
      apparition: 'morning' | 'evening' | 'opposition';
      elongation: number;
    }) =>
      apparition === 'opposition'
        ? `Opposite the Sun, ${f.number(elongation)}° from it: up most of the night.`
        : apparition === 'evening'
          ? `Evening sky: ${f.number(elongation)}° east of the Sun.`
          : `Morning sky: ${f.number(elongation)}° west of the Sun.`,
    rises: 'Rises today',
    sets: 'Sets today',
    noRise: 'No rise today',
    noSet: 'No set today',
    solarNoon: 'Solar noon',
    noTransit: 'No transit today',
    daylight: 'Daylight',
    daylightHours: ({ hours }: { hours: number }) => `${f.number(hours, 1)} hours`,
    polarDay: 'The Sun stays above the horizon today.',
    polarNight: 'The Sun stays below the horizon today.',
    partialDay: 'Today begins or ends during daylight.',
    facts: 'About this object & coordinates',
    coordinatesExplained:
      'Altitude is height above the mathematical horizon. Azimuth is the direction clockwise from north: east is 90°, south 180°, west 270°.',
    moonFacts: ({ distanceKm }: { distanceKm: number }) =>
      `The Moon reflects sunlight. Its phase depends on which part of the sunlit half we see. It is approximately ${f.number(distanceKm)} km from this observer.`,
    planetFacts: ({
      name,
      distanceKm,
      distanceAu,
      diameterArcsec,
      phase,
    }: {
      name: string;
      distanceKm: number;
      distanceAu: number;
      diameterArcsec: number;
      /** For Mercury and Venus, which show phases. */
      phase?: { shape: PlanetShape; illumination: number };
    }) =>
      `${name} shines by reflected sunlight and drifts slowly against the stars. It is approximately ${f.number(distanceKm / 1e6)} million km (${f.number(distanceAu, 2)} AU) from this observer; its disc is ${f.number(diameterArcsec, 1)}″ across, too small to see as a disc without binoculars or a telescope.` +
      (phase
        ? ` Like the Moon, ${name} shows phases, visible in binoculars or a small telescope; now it is ${f.number(phase.illumination)}% lit (${PLANET_SHAPES[phase.shape]}).`
        : ''),
    starFacts: ({ magnitude, ra, dec }: { magnitude: number; ra: number; dec: number }) =>
      `Magnitude ${f.number(magnitude, 2)} (smaller numbers are brighter). Catalog coordinates: J2000 RA ${f.number(ra, 3)}h, Dec ${f.number(dec, 2)}°.`,
    find: 'Find an object',
    searchPlaceholder: 'Sun, Moon, planet, or star name',
    aboveHorizon: 'Above horizon',
    all: 'All objects',
    noteSearch: 'Search includes objects below the horizon.',
    noteUp: 'Calculated positions above the horizon, brightest stars first.',
    noteAll: 'Explore the Sun, Moon, planets, and stars, including those below the horizon.',
    clearPreviewActive: 'Clear-sky preview is active.',
    heavyClouds: 'Heavy clouds may obscure this view.',
    list: 'Celestial objects',
    nearestStar: 'Our nearest star',
    below: 'Below',
    count: ({ count, shown }: { count: number; shown: number }) =>
      count > shown
        ? `Showing ${f.number(shown)} of ${f.number(count, 0, false)}. Search by name or HYG ID for more.`
        : f.plural(count, {
            one: `${f.number(count, 0, false)} matching object.`,
            other: `${f.number(count, 0, false)} matching objects.`,
          }),
    starsLoading: 'Stars are still loading…',
    starsFailed: 'The star catalog could not load. The Sun and Moon remain available.',
    tryAgain: 'Try again',
    /** Words that, typed into search, list all five planets. */
    planetSearchWords: ['planets'],
  },
  visibility: (visibility: Visibility, name: string): { label: string; detail: string } => {
    switch (visibility.reason) {
      case 'horizon':
        return {
          label: 'Below the horizon',
          detail: 'Earth blocks this direction. Choose another time to bring it into view.',
        };
      case 'near-sun':
        return {
          label: 'Close to the Sun',
          detail: `${name} is only ${f.number(visibility.elongation)}° from the Sun. Never look toward the Sun, and never point binoculars or a telescope near it.`,
        };
      case 'layer':
        return { label: 'Stars are switched off', detail: 'Enable the stars layer to see this object.' };
      case 'ridge':
        return {
          label: 'Near the illustrated ridge',
          detail:
            'The ridge may cover this low position. Choose an unobstructed horizon in Layers for a clear view.',
        };
      case 'daylight':
        return {
          label: 'Hidden by daylight',
          detail:
            visibility.subject === 'star'
              ? 'The position is above the horizon, but the bright sky hides this star.'
              : visibility.glare
                ? `${name} is only ${f.number(visibility.elongation)}° from the Sun, lost in its glare. Never search near the Sun.`
                : `The position is above the horizon, but the bright sky hides ${name}. It appears as the sky darkens.`,
        };
      case 'cloud':
        return {
          label: 'Heavy cloud cover',
          detail: `${f.number(visibility.cloudCover)}% cloud cover may obscure this object. The marker shows its calculated position.`,
        };
      case 'haze':
        return {
          label: 'Poor atmospheric visibility',
          detail: 'Haze reduces contrast in this view. The marker shows the calculated position.',
        };
      case 'twilight':
        return {
          label: 'Washed out by twilight',
          detail: `Twilight still brightens the sky too much for ${visibility.subject === 'planet' ? name : 'this star'}. It appears as the sky darkens.`,
        };
      case 'faint':
        return {
          label: 'Faint in this sky',
          detail:
            'Its brightness, elevation, moonlight, and the selected light pollution reduce its visibility.',
        };
      case 'phase':
        return {
          label: 'A very thin crescent',
          detail:
            'Very little of the Moon is illuminated. Look near the position marker; daylight can make it difficult to distinguish.',
        };
      case 'daylight-moon':
        return {
          label: 'A pale daytime Moon',
          detail:
            'The Moon has low contrast against the daytime sky. The optional wide-view size aid changes only its drawn disc, not its calculated size.',
        };
      case 'partial-cloud':
        return {
          label: 'Clouds may cross this view',
          detail:
            'The position is above the horizon. The cloud pattern is illustrative, not a measured local sky.',
        };
      case 'clear':
        return {
          label: 'Above the horizon',
          detail:
            visibility.subject === 'star'
              ? 'Look inside the position marker. Stars are drawn as points of light, brighter for brighter stars.'
              : visibility.subject === 'planet'
                ? `Look inside the position marker. ${name} shines as a steady point${visibility.brighterThanAnyStar ? ', brighter than any star' : ''}.`
                : `Centering frames the ${name} at true scale; zoom out to see it among the sky.`,
        };
    }
  },
  time: {
    region: 'Time controls',
    following: 'Following real time',
    playing: ({ speed }: { speed: number }) => `Playing at ${f.number(speed)}×`,
    paused: 'Paused',
    change: 'Change date and time',
    now: 'Now',
    nowTooltip: 'Return to real time',
    tonight: 'Tonight',
    tonightTitle: 'Explore one hour after civil dusk',
    noDusk: 'No civil dusk on this date',
    editor: 'Choose a moment',
    closeEditor: 'Close time editor',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    date: 'Date',
    localTime: 'Local time',
    gap: 'This time does not exist because the clock moves forward. Choose another time.',
    fold: 'This time occurs twice. Choose the offset you want.',
    invalidDate: 'Choose a valid date from 1900 through 2100.',
    outOfRange: 'Choose a date from 1900 through 2100.',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    done: 'Done',
    play: 'Play time',
    pause: 'Pause time',
    slider: 'Time of day',
    speed: 'Playback speed',
    speedOption: ({ speed }: { speed: number }) => `${f.number(speed)}×`,
  },
  weather: {
    sourceData: 'Weather data',
    partial: 'Some fields are unavailable. Missing fields use neutral atmosphere assumptions in the view.',
    temperature: 'Temperature',
    wind: 'Wind',
    cloudCover: 'Cloud cover',
    visibility: 'Visibility',
    haze: 'Atmospheric haze',
    windSpeed: 'Wind speed',
    windDirection: 'Wind direction',
    precipitation: 'Precipitation',
    refresh: 'Refresh weather',
    returnToData: 'Return to weather data',
    humidityPressure: ({ humidity, pressure }: { humidity: string; pressure: string }) =>
      `${humidity}% humidity · ${pressure} hPa`,
    sample: ({
      sampled,
      fetchedDate,
      fetchedTime,
    }: {
      sampled: string;
      fetchedDate: string;
      fetchedTime: string;
    }) =>
      `Sample ${sampled} · fetched ${fetchedDate} at ${fetchedTime}. Weather is a model estimate; the cloud pattern is simulated.`,
    /** WMO weather interpretation codes, grouped as the panel shows them. */
    condition: {
      unavailable: 'Condition unavailable',
      clear: 'Clear sky',
      partlyCloudy: 'Partly cloudy',
      overcast: 'Overcast',
      fog: 'Fog',
      drizzle: 'Drizzle',
      rain: 'Rain',
      snow: 'Snow',
      rainShowers: 'Rain showers',
      snowShowers: 'Snow showers',
      thunderstorm: 'Thunderstorm',
    },
    loading: 'Loading weather',
    unavailable: 'Weather unavailable',
    source: ({ source, cache }: { source: WeatherSource; cache?: 'cached' | 'stale' }) =>
      (cache === 'stale' ? 'Stale cached · ' : cache === 'cached' ? 'Cached · ' : '') +
      {
        current: 'Current model estimate',
        forecast: 'Forecast',
        recent: 'Recent weather model',
        historical: 'Historical reanalysis',
      }[source],
    issue: {
      loading: 'Loading weather for this place and day…',
      'no-coverage': 'No weather coverage for this instant.',
      'no-sample': 'No weather sample close to this instant.',
      'date-unsupported': 'Weather data does not cover this date. Choose custom weather to explore this sky.',
      'beyond-coverage': 'This local day falls beyond the weather provider’s UTC coverage.',
      'no-samples': 'No weather samples are available for this date.',
      busy: 'Weather service is busy. Try refreshing in a moment.',
      'no-timeline': 'Weather service returned no hourly timeline.',
      'bad-timestamp': 'Weather service returned an invalid timestamp.',
      unordered: 'Weather timeline is not ordered.',
      'refresh-failed': 'Refresh failed. Showing cached weather; its fetch time is shown below.',
      provider: ({ reason }: { reason: string }) => `Weather service: ${reason}`,
    },
  },
  network: (failure: NetworkFailure, service: NetworkService): string => {
    const { name, Name, retry, what } = SERVICE[service];
    switch (failure.kind) {
      case 'timeout':
        return `${Name} took too long to respond. ${retry}`;
      case 'offline':
        return `You appear to be offline. Reconnect, then ${retry.toLowerCase()}`;
      case 'unreachable':
        return `Couldn’t reach ${name}. Check your connection. ${retry}`;
      case 'unreadable':
        return `${Name} sent a response that couldn’t be read. ${retry}`;
      case 'invalid':
        return `${service === 'search' ? 'Place search' : 'Weather service'} returned an invalid response.`;
      case 'http':
        return service === 'search'
          ? `Place search failed (${failure.status}). Try again.`
          : `Weather service: HTTP ${failure.status}`;
      case 'failed':
        return `Couldn’t load ${what}. ${retry}`;
    }
  },
  settings: {
    intro: 'A clear view, with just the details you want.',
    layers: 'Sky layers',
    clearSky: 'Clear-sky preview',
    clearSkyNote:
      'Hide clouds, haze and precipitation. Time, moonlight and light pollution still apply. Turn off to restore weather.',
    layerNames: { stars: 'Stars', lines: 'Constellation lines', labels: 'Object labels' },
    moonDisplayAid: 'Enlarge Moon in wide views',
    moonDisplayAidNote:
      'Display aid only: makes a small Moon easier to see and tap. Turn off for physical screen size. Calculated positions, phases and angular sizes are unchanged.',
    comfort: 'Comfort & performance',
    reduceMotion: 'Reduce atmosphere motion',
    systemMotion: 'Following your system’s reduced-motion preference.',
    quality: 'Rendering quality',
    qualityOptions: { auto: 'Automatic', low: 'Battery saver', high: 'High' },
    appearance: 'Sky appearance',
    lightPollution: 'Light pollution',
    brightnessOptions: { dark: 'Dark sky', suburban: 'Suburban sky', city: 'City sky' },
    horizon: 'Horizon',
    horizonOptions: { flat: 'Unobstructed', ridge: 'Illustrative ridge' },
    appearanceNote:
      'Appearance settings are illustrative. They do not measure local light pollution or terrain. Patterns include the Big Dipper and Summer Triangle asterisms.',
    language: 'Language',
    languageLabel: 'Interface language',
    languageAuto: 'Automatic (browser language)',
    places: 'Your places',
    removeSaved: 'Remove saved place',
    savePlace: 'Save this place',
    aboutTitle: 'A calculated sky',
    about:
      'Positions use Astronomy Engine. The landscape and clouds are illustrative; local obstructions and actual cloud shapes can differ. Explore dates from 1900 through 2100.',
    credits: 'Sources, privacy & limitations',
    /** The static credits page in this language. */
    creditsPage: 'credits.html',
  },
  location: {
    trigger: ({ name }: { name: string }) => `Change location, ${name}`,
    change: 'Change place',
    choose: 'Choose a city',
    eyebrow: 'A different perspective',
    title: 'Choose your place',
    close: 'Close locations',
    search: 'Search for a location',
    placeholder: 'City, town, or a place you love',
    locating: 'Finding your location…',
    useMine: 'Use my location',
    removeSaved: 'Remove saved place',
    saveCurrent: 'Save current place',
    results: 'Search results',
    suggestions: 'Saved, recent & suggested',
    searching: 'Searching…',
    noMatches: 'No matching places. Try a nearby city.',
    options: 'Locations',
    unavailable: 'Location is unavailable. Search for a place instead.',
    denied: 'Location permission was denied. Search for a place instead.',
    timedOut: 'Location lookup timed out. Try again or search.',
    noTimeZone: 'Could not resolve the time zone. Search for a nearby place.',
    /** Open-Meteo geocoding `language`. */
    searchLanguage: 'en',
  },
  share: {
    eyebrow: 'Keep a moment',
    title: 'Share this sky',
    close: 'Close sharing',
    includes: ({ focus, customWeather }: { focus?: string; customWeather: boolean }) =>
      `This link includes the place, exact time, camera view${focus ? ` centered on ${focus}` : ''}, layers${customWeather ? ', and custom weather' : ''}.`,
    device: ({ latitude, longitude }: { latitude: number; longitude: number }) =>
      `It includes your exact device coordinates: ${f.number(latitude, 5)}, ${f.number(longitude, 5)}. Share only if you want the recipient to see this location.`,
    /** Device locations are shared rounded unless the person chooses otherwise. */
    deviceRounded: ({ latitude, longitude }: { latitude: number; longitude: number }) =>
      `Your location is rounded to about 10 km in this link (${f.number(latitude, 1)}, ${f.number(longitude, 1)}).`,
    precise: 'Share my exact location',
    arrival: ({ subject }: { subject: string }) => `When opened, the view turns to ${subject}.`,
    field: 'Sky link',
    copied: 'Copied',
    copy: 'Copy link',
  },
  /** The keepsake image of a moment (ROADMAP phase 3 prototype). */
  moment: {
    drawing: 'Drawing the image…',
    failed: 'The image could not be drawn. Try another style.',
    style: 'Style',
    styles: { realistic: 'Realistic', illustrated: 'Illustrated' },
    horizon: 'Horizon',
    horizons: { ridge: 'Ridge', mountains: 'Mountains', sea: 'Sea', city: 'City' },
    alt: ({ place }: { place: string }) => `Keepsake image of the sky over ${place}`,
    save: 'Save image',
    send: 'Send image',
    // On the image itself, in the sender's language.
    devicePlace: 'My location',
    illustration: 'Illustration',
    when: ({ date, time, zone }: { date: string; time: string; zone: string }) =>
      `${date} · ${time} · ${zone}`,
    subject: ({ name, direction, degrees }: { name: string; direction: string; degrees: number }) =>
      `Looking at ${name}, facing ${direction} ${f.number(degrees)}°`,
    facing: ({ direction, degrees }: { direction: string; degrees: number }) =>
      `Facing ${direction} ${f.number(degrees)}°`,
    moon: ({ phase, illumination, up }: { phase: string; illumination: number; up: boolean }) =>
      `Moon: ${phase}, ${f.number(illumination)}% lit${up ? '' : ', below the horizon'}`,
    conditions: ({ condition, cloud }: { condition: string; cloud: number }) =>
      `${condition}, ${f.number(cloud)}% cloud cover`,
    noWeather: 'No weather data for this moment',
    provenance: (provenance: MomentProvenance) => {
      switch (provenance.kind) {
        case 'source':
          return {
            current: 'Clouds based on the current model estimate for this area.',
            forecast: 'Clouds based on the forecast for this area.',
            recent: 'Clouds based on a recent weather model for this area.',
            historical: 'Clouds based on reanalysis for this area.',
          }[provenance.source];
        case 'custom':
          return 'Weather chosen by the sender, not measured.';
        case 'clear':
          return 'Clear-sky preview: the sender removed the clouds.';
        case 'none':
          return 'No weather data: a neutral sky.';
      }
    },
    method: ({ illustrated }: { illustrated: boolean }) =>
      'Positions calculated with Astronomy Engine; the horizon and cloud shapes are illustrative.' +
      (illustrated ? ' Drawn as an illustration, with the Moon and planets enlarged.' : ''),
    attribution: 'Weather: Open-Meteo (CC BY 4.0) · Star catalog: HYG (CC BY-SA 4.0)',
    /** Joins whole sentences into one paragraph. */
    sentences: (parts: string[]) => parts.join(' '),
  },
  recovery: {
    title: 'The sky needs a fresh start',
    body: 'Something interrupted this exploration. Reload to try again, or open a fresh view. Your saved places remain in this browser.',
    reload: 'Reload app',
    fresh: 'Open a fresh view',
  },
};

/** How lit a planet with phases looks, from its illuminated fraction. */
export type PlanetShape = 'thin-crescent' | 'crescent' | 'half' | 'gibbous' | 'full';
const PLANET_SHAPES: Record<PlanetShape, string> = {
  'thin-crescent': 'thin crescent',
  crescent: 'crescent',
  half: 'half lit',
  gibbous: 'gibbous',
  full: 'nearly full',
};

export type Messages = typeof en;
export default en;
