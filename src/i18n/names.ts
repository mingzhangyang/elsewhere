import type { LocationInfo } from '../types';
import type { SkyObject } from '../lib/exploration';
import { isDeviceLocation } from '../lib/locations';
import type { I18n } from './index';

type Named = Pick<SkyObject, 'kind' | 'id' | 'name'>;

/**
 * An object's name in the interface language. The Sun, Moon and planets are always translated;
 * a star takes the language's common name where it has one, else its catalog name.
 */
export function objectName(object: Named, { m }: I18n): string {
  if (object.kind !== 'star') return m.bodies[object.id as keyof typeof m.bodies];
  return m.starNames[object.name] ?? object.name;
}

/**
 * The `lang` of a name shown in another language's text: a catalog proper name kept in Latin script
 * inside a Chinese interface. Screen readers then pronounce it as written.
 */
export function objectNameLang(object: Named, i18n: I18n): 'en' | undefined {
  if (i18n.locale === 'en' || object.kind !== 'star' || i18n.m.starNames[object.name]) return undefined;
  // Unnamed stars show their HYG identifier, which reads the same in any language.
  return /^HYG-\d+$/.test(object.name) ? undefined : 'en';
}

/** Every name an object can be found by: its name in this language and its catalog (English) name. */
export function searchNames(object: Named, i18n: I18n): string[] {
  return [objectName(object, i18n), object.name, object.id];
}

/**
 * How a place is labelled. Presets and the device location have names in each language; places
 * from search or a shared link keep the name they came with.
 */
export function placeLabel(place: LocationInfo, { m }: I18n): { name: string; country: string } {
  if (isDeviceLocation(place)) return { name: m.device.name, country: m.device.country };
  return m.places[place.id] ?? { name: place.name, country: place.country };
}
