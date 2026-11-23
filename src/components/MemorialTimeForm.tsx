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
  restoreMemorialDraft,
  setReferenceTime,
  type MemorialTime,
  type MemorialTimeDraft,
  type MemorialTimeErrorCode,
  type MemorialTimeResult,
  type ReferenceClock,
} from '../lib/memorialTime';
import type { LocationInfo } from '../types';

/** No default city or device time zone: a city must be selected. */
export type MemorialTimeFields = {
  location: LocationInfo | null;
  localDate: string;
  kind: 'exact' | 'reference';
  exactTime: string;
  reference: ReferenceClock;
  choiceUtc?: string;
};

type Feedback =
  | { type: 'missing-city' | 'loading' | 'unexpected' }
  | { type: 'restore-error'; code: MemorialTimeErrorCode }
  | { type: 'result'; result: MemorialTimeResult }
  | null;

function initialFields(initialDraft?: MemorialTimeDraft): MemorialTimeFields {
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
export function memorialFieldsToDraft(fields: MemorialTimeFields): MemorialTimeDraft | null {
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
  initialInput,
  onDraftChange,
  onResolved,
  onInvalidated,
  submitMode = 'check',
}: {
  /** Existing SM1 restoration API (also used outside the creator). */
  initialDraft?: MemorialTimeDraft;
  /** Preserve even incomplete form values when returning from the explorer. */
  initialInput?: MemorialTimeFields;
  onDraftChange?: (fields: MemorialTimeFields) => void;
  onResolved: (value: MemorialTime) => void;
  onInvalidated?: () => void;
  submitMode?: 'check' | 'create';
}) {
  const { locale } = useI18n();
  const t = memorialMessages(locale);
  const radioName = useId();
  const [fields, setFields] = useState<MemorialTimeFields>(() => initialInput ?? initialFields(initialDraft));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const generation = useRef(0);
  const previousInitialDraft = useRef(initialDraft);
  const initialInputOnce = useRef(initialInput);
  const onInvalidatedRef = useRef(onInvalidated);

  useEffect(() => {
    onInvalidatedRef.current = onInvalidated;
  }, [onInvalidated]);

  // A slow time-zone/polyfill load must not publish a result after edits or unmount.
  useEffect(() => () => void (generation.current += 1), []);

  useEffect(() => {
    onDraftChange?.(fields);
  }, [fields, onDraftChange]);

  // A saved draft is untrusted until its candidate is rechecked against today's IANA rules.
  // The ticket also protects newer user edits from an older restoration response.
  useEffect(() => {
    const replaced = previousInitialDraft.current !== initialDraft;
    previousInitialDraft.current = initialDraft;
    if (replaced) {
      // Never leave a parent's resolved artwork pointing at the previous inputs.
      onInvalidatedRef.current?.();
      setFeedback(null);
    }
    const draft = initialDraft ?? (initialInputOnce.current ? memorialFieldsToDraft(initialInputOnce.current) : null);
    if (!draft) {
      if (replaced) setFields(initialFields());
      return;
    }
    const ticket = ++generation.current;
    void restoreMemorialDraft(draft)
      .then((restoration) => {
        if (ticket !== generation.current) return;
        if (restoration.status === 'error') {
          if (initialDraft) setFields(initialFields());
          else setFields((previous) => ({ ...previous, choiceUtc: undefined }));
          setFeedback({ type: 'restore-error', code: restoration.code });
          return;
        }
        if (initialDraft) setFields(initialFields(restoration.draft));
        else setFields((previous) => ({ ...previous, choiceUtc: restoration.draft.choiceUtc }));
        setFeedback(
          restoration.status === 'needs-confirmation'
            ? { type: 'restore-error', code: restoration.code }
            : null,
        );
      })
      .catch(() => {
        if (ticket === generation.current) setFeedback({ type: 'unexpected' });
      });
    return () => {
      generation.current += 1;
    };
  }, [initialDraft]);

  const invalidate = () => {
    generation.current += 1;
    setFeedback(null);
    onInvalidated?.();
  };

  const edit = (partial: Partial<MemorialTimeFields>) => {
    invalidate();
    setFields((previous) => ({ ...previous, ...partial, choiceUtc: undefined }));
  };

  const selectCity = (location: LocationInfo) => {
    invalidate();
    setFields((previous) => {
      const currentDraft = memorialFieldsToDraft(previous);
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
    void validate(memorialFieldsToDraft(fields));
  };

  const chooseOffset = (utc: string) => {
    const draft = memorialFieldsToDraft(fields);
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
        {feedback?.type === 'restore-error' && (
          <p className="memorial-error" role="alert">
            {t.errors[feedback.code]}
          </p>
        )}
        {result?.status === 'error' && (
          <p className="memorial-error" role="alert">
            {t.errors[result.code]}
          </p>
        )}
        {result?.status === 'ambiguous' && (
          <fieldset className="memorial-candidates">
            <legend>{result.hasOutOfRangeCandidate ? t.ambiguousRestricted : t.ambiguous}</legend>
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
          {submitMode === 'create' ? t.createSubmit : t.submit}
        </button>
      </form>
    </section>
  );
}
