import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import LocationPicker from './LocationPicker';
import './memorialTimeForm.css';
import { useI18n } from '../i18n';
import { memorialMessages } from '../i18n/memorial';
import {
  changeMemorialLocation,
  createReferenceDraft,
  DEFAULT_REFERENCE_TIME,
  resolveMemorialTime,
  setReferenceTime,
  type MemorialTime,
  type MemorialTimeDraft,
  type MemorialTimeResult,
  type ReferenceClock,
} from '../lib/memorialTime';
import type { LocationInfo } from '../types';

/**
 * This form is deliberately not wired into the explorer or a route yet (SM3).
 * In particular, there is no default city or device time zone: a city must be selected.
 */
type Fields = {
  location: LocationInfo | null;
  localDate: string;
  kind: 'exact' | 'reference';
  exactTime: string;
  reference: ReferenceClock;
  choiceUtc?: string;
};

type Feedback =
  | { type: 'missing-city' | 'loading' | 'unexpected' }
  | { type: 'result'; result: MemorialTimeResult }
  | null;

function initialFields(initialDraft?: MemorialTimeDraft): Fields {
  return {
    location: initialDraft?.location ?? null,
    localDate: initialDraft?.localDate ?? '',
    kind: initialDraft?.kind ?? 'exact',
    exactTime: initialDraft?.kind === 'exact' ? initialDraft.localTime : '',
    reference:
      initialDraft?.kind === 'reference'
        ? { ...initialDraft.reference }
        : { localTime: DEFAULT_REFERENCE_TIME, source: 'default' },
    choiceUtc: initialDraft?.choiceUtc,
  };
}

/** Only a selected place can produce an SM1-A draft. Unselected form fields stay in the UI. */
function toDraft(fields: Fields): MemorialTimeDraft | null {
  if (!fields.location) return null;
  if (fields.kind === 'exact') {
    return {
      state: 'draft',
      kind: 'exact',
      location: fields.location,
      localDate: fields.localDate,
      localTime: fields.exactTime,
      choiceUtc: fields.choiceUtc,
    };
  }
  const defaultDraft = createReferenceDraft(fields.location, fields.localDate);
  const referenceDraft =
    fields.reference.source === 'user'
      ? setReferenceTime(defaultDraft, fields.reference.localTime)
      : { ...defaultDraft, reference: { ...fields.reference } };
  return { ...referenceDraft, choiceUtc: fields.choiceUtc };
}

export default function MemorialTimeForm({
  initialDraft,
  onResolved,
}: {
  /** Restoring an in-progress draft is separate from restoring a saved artwork/link (SM5). */
  initialDraft?: MemorialTimeDraft;
  /** A resolved event, not an artwork; the creator/astronomy handoff is a later batch. */
  onResolved: (value: MemorialTime) => void;
}) {
  const { locale } = useI18n();
  const t = memorialMessages(locale);
  const radioName = useId();
  const [fields, setFields] = useState<Fields>(() => initialFields(initialDraft));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const generation = useRef(0);

  // A slow time-zone/polyfill load must not publish a result after edits or unmount.
  useEffect(() => () => void (generation.current += 1), []);

  const invalidate = () => {
    generation.current += 1;
    setFeedback(null);
  };

  const edit = (partial: Partial<Fields>) => {
    invalidate();
    setFields((previous) => ({ ...previous, ...partial, choiceUtc: undefined }));
  };

  const selectCity = (location: LocationInfo) => {
    invalidate();
    setFields((previous) => {
      const currentDraft = toDraft(previous);
      // SM1-B preserves the event's civil clock, not the explorer's UTC instant.
      const moved = currentDraft ? changeMemorialLocation(currentDraft, location) : null;
      return {
        ...previous,
        location: moved?.location ?? location,
        localDate: moved?.localDate ?? previous.localDate,
        choiceUtc: undefined,
      };
    });
  };

  const validate = async (draft: MemorialTimeDraft | null) => {
    const ticket = ++generation.current;
    if (!draft) {
      setFeedback({ type: 'missing-city' });
      return;
    }
    setFeedback({ type: 'loading' });
    let result: MemorialTimeResult;
    try {
      result = await resolveMemorialTime(draft);
    } catch {
      if (ticket === generation.current) setFeedback({ type: 'unexpected' });
      return;
    }
    if (ticket !== generation.current) return;
    setFeedback({ type: 'result', result });
    if (result.status === 'resolved') onResolved(result.value);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void validate(toDraft(fields));
  };

  const chooseOffset = (utc: string) => {
    const draft = toDraft(fields);
    if (!draft) return;
    setFields((previous) => ({ ...previous, choiceUtc: utc }));
    void validate({ ...draft, choiceUtc: utc });
  };

  const result = feedback?.type === 'result' ? feedback.result : null;

  return (
    <section className="memorial-time-form" aria-labelledby="memorial-time-title">
      <h2 id="memorial-time-title">{t.title}</h2>
      <p className="memorial-intro">{t.intro}</p>
      <form onSubmit={submit} noValidate>
        <div className="memorial-city">
          <p className="memorial-label">{t.city}</p>
          <LocationPicker
            location={fields.location}
            saved={[]}
            recent={[]}
            onSelect={selectCity}
            allowDeviceLocation={false}
          />
          <p className="memorial-zone">
            {fields.location ? t.zone({ timeZone: fields.location.timezone }) : t.chooseCityHint}
          </p>
        </div>
        <label className="memorial-field">
          <span>{t.date}</span>
          <input
            type="date"
            value={fields.localDate}
            onChange={(event) => edit({ localDate: event.target.value })}
            required
          />
        </label>
        <fieldset className="memorial-precision">
          <legend>{t.precision}</legend>
          <label>
            <input
              type="radio"
              name={radioName}
              checked={fields.kind === 'exact'}
              onChange={() => edit({ kind: 'exact' })}
            />
            {t.exact}
          </label>
          <label>
            <input
              type="radio"
              name={radioName}
              checked={fields.kind === 'reference'}
              onChange={() => edit({ kind: 'reference' })}
            />
            {t.unknown}
          </label>
        </fieldset>
        {fields.kind === 'exact' ? (
          <label className="memorial-field">
            <span>{t.localTime}</span>
            <input
              type="time"
              step={60}
              value={fields.exactTime}
              onChange={(event) => edit({ exactTime: event.target.value })}
              required
            />
            <small>{t.exactNote}</small>
          </label>
        ) : (
          <label className="memorial-field">
            <span>{t.referenceTime}</span>
            <input
              type="time"
              step={60}
              value={fields.reference.localTime}
              onChange={(event) => edit({ reference: { localTime: event.target.value, source: 'user' } })}
              required
            />
            <small>{t.referenceNote}</small>
          </label>
        )}
        {feedback?.type === 'missing-city' && (
          <p className="memorial-error" role="alert">
            {t.cityRequired}
          </p>
        )}
        {feedback?.type === 'unexpected' && (
          <p className="memorial-error" role="alert">
            {t.unexpected}
          </p>
        )}
        {result?.status === 'error' && (
          <p className="memorial-error" role="alert">
            {t.errors[result.code]}
          </p>
        )}
        {result?.status === 'ambiguous' && (
          <fieldset className="memorial-candidates">
            <legend>{t.ambiguous}</legend>
            {result.candidates.map((candidate) => (
              <button type="button" key={candidate.utc} onClick={() => chooseOffset(candidate.utc)}>
                {t.candidate(candidate)}
              </button>
            ))}
          </fieldset>
        )}
        {result?.status === 'resolved' && (
          <p className="memorial-ready" role="status">
            {t.ready({ utc: result.value.utc, offset: result.value.offset })}
          </p>
        )}
        {feedback?.type === 'loading' && (
          <p className="memorial-loading" role="status">
            {t.checking}
          </p>
        )}
        <button
          type="submit"
          className="primary-button memorial-submit"
          disabled={feedback?.type === 'loading'}
        >
          {t.submit}
        </button>
      </form>
    </section>
  );
}
