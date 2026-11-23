import { useCallback, useEffect, useRef, useState } from 'react';
import MemorialTimeForm, { type MemorialTimeFields } from './MemorialTimeForm';
import { currentLanguage, setLanguage, useI18n } from '../i18n';
import { memorialMessages } from '../i18n/memorial';
import type { MemorialTime } from '../lib/memorialTime';
import type { SkyChartSnapshot } from '../domain/skyChartSnapshot';
import type { SkyArtwork } from '../lib/skyArtwork';
import type { SkyArtworkPng, SkyArtworkExportCoordinator } from '../lib/skyArtworkExport';
import type { SkyArtworkShareCapability } from '../lib/skyArtworkDelivery';
import type { SkyChartSnapshotStatus } from '../services/skyChartSnapshot';
import type { SkyCreatorDraft } from '../lib/skyCreatorDraft';
import { limitArtworkText } from '../lib/skyCreatorDraft';
import { loadPreferences, savePreferences } from '../lib/persistence';
import './skyArtworkCreator.css';

type Stage = 'editing' | 'invalid' | 'loading' | 'generating' | 'exporting' | 'ready' | 'error';
type Science = { event: MemorialTime; snapshot: SkyChartSnapshot; revision: number };
type Ready = {
  revision: number;
  artwork: SkyArtwork;
  png: SkyArtworkPng;
  share: SkyArtworkShareCapability;
};
type Delivery = typeof import('../lib/skyArtworkDelivery');
type SnapshotCoordinator = ReturnType<typeof import('../services/skyChartSnapshot').createSkyChartSnapshotCoordinator>;

const EMPTY: SkyCreatorDraft = { title: '', phrase: '', theme: 'midnight' };

export default function SkyArtworkCreator({
  initialDraft,
  onDraftChange,
  onExplore,
}: {
  initialDraft: SkyCreatorDraft | null;
  onDraftChange: (value: SkyCreatorDraft) => void;
  onExplore: (event?: MemorialTime) => void;
}) {
  const { locale } = useI18n();
  const t = memorialMessages(locale);
  const [draft, setDraft] = useState<SkyCreatorDraft>(() => initialDraft ?? EMPTY);
  const [stage, setStage] = useState<Stage>('editing');
  const [science, setScience] = useState<Science | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const [errorKind, setErrorKind] = useState<'catalog' | 'generation'>('generation');
  const [notice, setNotice] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const revision = useRef(0);
  const snapshotCoordinator = useRef<SnapshotCoordinator | null>(null);
  const exportCoordinator = useRef<SkyArtworkExportCoordinator | null>(null);
  const delivery = useRef<Delivery | null>(null);
  const fontPromise = useRef<ReturnType<typeof import('../moment/skyChart').prepareSkyChartFonts> | null>(
    null,
  );
  const lastResolved = useRef<MemorialTime | null>(null);

  // The shell owns the only surviving copy across route changes; not localStorage or history.state.
  useEffect(() => {
    onDraftChange(draft);
  }, [draft, onDraftChange]);

  useEffect(
    () => () => {
      revision.current += 1;
      snapshotCoordinator.current?.invalidate();
      exportCoordinator.current?.dispose();
    },
    [],
  );

  const revoke = useCallback((timeChanged: boolean) => {
    revision.current += 1;
    exportCoordinator.current?.cancel();
    setReady(null);
    setPreviewRevision(null);
    setNotice(null);
    if (timeChanged) {
      snapshotCoordinator.current?.invalidate();
      lastResolved.current = null;
      setScience(null);
      setStage('invalid');
    } else {
      setStage('generating');
    }
  }, []);

  const handleDraftChange = useCallback((time: MemorialTimeFields) => {
    setDraft((previous) => ({ ...previous, time }));
  }, []);

  const updateText = (key: 'title' | 'phrase', value: string) => {
    const next = limitArtworkText(value, key === 'title' ? 40 : 80);
    if (next === draft[key]) return;
    revoke(false);
    setDraft((previous) => ({ ...previous, [key]: next }));
  };

  const changeTheme = (theme: SkyCreatorDraft['theme']) => {
    if (theme === draft.theme) return;
    revoke(false);
    setDraft((previous) => ({ ...previous, theme }));
  };

  const generate = useCallback(async (event: MemorialTime) => {
    const ticket = ++revision.current;
    lastResolved.current = event;
    snapshotCoordinator.current?.invalidate();
    exportCoordinator.current?.cancel();
    setReady(null);
    setScience(null);
    setPreviewRevision(null);
    setNotice(null);
    setStage('loading');
    try {
      // SM2-C imports the astronomy engine only after the user submits valid civil time.
      const { createSkyChartSnapshotCoordinator } = await import('../services/skyChartSnapshot');
      if (ticket !== revision.current) return;
      const coordinator = snapshotCoordinator.current ?? createSkyChartSnapshotCoordinator();
      snapshotCoordinator.current = coordinator;
      const result = await coordinator.generate({ time: event }, (status: SkyChartSnapshotStatus) => {
        if (ticket === revision.current && status.status === 'loading') setStage('loading');
      });
      if (ticket !== revision.current || result.status === 'stale') return;
      if (result.status !== 'ready') {
        setErrorKind(
          result.status === 'error' && (result.code === 'catalog-load' || result.code === 'catalog-data')
            ? 'catalog'
            : 'generation',
        );
        setStage('error');
        return;
      }
      setScience({ event, snapshot: result.snapshot, revision: ticket });
      setStage('generating');
    } catch {
      if (ticket === revision.current) {
        setErrorKind('generation');
        setStage('error');
      }
    }
  }, []);

  // The same frozen SM2-C snapshot is kept when changing words, palette or locale.
  // Preview and PNG use the *same* SM3-A layout, painter and prepared font object.
  useEffect(() => {
    if (!science) return;
    const ticket = revision.current;
    let cancelled = false;
    exportCoordinator.current?.cancel();
    setReady(null);
    setPreviewRevision(null);
    setStage('generating');
    const work = async () => {
      const [model, painter, encoder, deliveryModule] = await Promise.all([
        import('../lib/skyArtwork'),
        import('../moment/skyChart'),
        import('../lib/skyArtworkExport'),
        import('../lib/skyArtworkDelivery'),
      ]);
      if (cancelled || ticket !== revision.current) return;
      const artwork = model.createSkyArtwork({
        snapshot: science.snapshot,
        event: science.event,
        locale,
        theme: draft.theme,
        title: draft.title,
        phrase: draft.phrase,
      });
      if (!fontPromise.current) fontPromise.current = painter.prepareSkyChartFonts();
      const fonts = await fontPromise.current;
      if (cancelled || ticket !== revision.current) return;
      const context = canvas.current?.getContext('2d');
      if (!context) throw new Error('Canvas 2D unavailable');
      const layout = painter.layoutSkyChartArtwork(
        artwork,
        painter.canvasSkyChartTextMetrics(context),
        fonts,
      );
      painter.drawSkyChartArtwork(context, layout, fonts);
      if (cancelled || ticket !== revision.current) return;
      setPreviewRevision(ticket);
      setStage('exporting');
      const coordinator = exportCoordinator.current ?? encoder.createSkyArtworkExportCoordinator();
      exportCoordinator.current = coordinator;
      const png = await coordinator.export(artwork, { prepareFonts: async () => fonts });
      if (cancelled || ticket !== revision.current) {
        encoder.releaseSkyArtworkExport(png);
        return;
      }
      // Prepare the File before exposing share: navigator.share must run in a later *real click*.
      // Browsers without File support can still use downloadSkyArtwork.
      try {
        encoder.createSkyArtworkFile(png);
      } catch {
        // skyArtworkShareCapability reports file-unsupported without disabling PNG download.
      }
      delivery.current = deliveryModule;
      setReady({ revision: ticket, artwork, png, share: deliveryModule.skyArtworkShareCapability(png) });
      setStage('ready');
    };
    void work().catch(() => {
      if (cancelled || ticket !== revision.current) return;
      setErrorKind('generation');
      setStage('error');
    });
    return () => {
      cancelled = true;
      exportCoordinator.current?.cancel();
    };
  }, [science, draft.title, draft.phrase, draft.theme, locale]);

  const currentReady =
    ready &&
    stage === 'ready' &&
    ready.revision === revision.current &&
    ready.artwork.locale === locale &&
    ready.artwork.theme === draft.theme
      ? ready
      : null;
  const showPreview = previewRevision === revision.current && science !== null;
  const statusText =
    stage === 'loading'
      ? t.loadingCatalog
      : stage === 'generating'
        ? t.rendering
        : stage === 'exporting'
          ? t.preparingPng
          : stage === 'ready'
            ? t.readyForDownload
            : stage === 'error'
              ? errorKind === 'catalog'
                ? t.catalogError
                : t.generationError
              : t.previewEmpty;

  const download = () => {
    if (!currentReady || !delivery.current) return;
    try {
      const result = delivery.current.downloadSkyArtwork(currentReady.png);
      setNotice(result.status === 'download-requested' ? t.downloadRequested : t.imageOpened);
    } catch {
      setNotice(t.downloadError);
    }
  };

  const share = () => {
    if (!currentReady || currentReady.share !== 'files' || !delivery.current) return;
    const ticket = currentReady.revision;
    setNotice(null);
    // No await/import/encode before navigator.share: the active gesture is preserved.
    try {
      void delivery.current.shareSkyArtwork(currentReady.png).then(
        (result) => {
          if (ticket === revision.current && result === 'shared') setNotice(t.shareCompleted);
        },
        () => {
          if (ticket === revision.current) setNotice(t.shareError);
        },
      );
    } catch {
      if (ticket === revision.current) setNotice(t.shareError);
    }
  };

  const toggleLanguage = () => {
    const next = locale === 'en' ? 'zh-Hans' : 'en';
    void setLanguage(next).then(
      () => {
        if (currentLanguage().locale === next) {
          const preferences = loadPreferences().value;
          savePreferences({ ...preferences, language: next });
        }
      },
      () => setNotice(t.generationError),
    );
  };

  return (
    <div className="creator-shell">
      <header className="creator-header">
        <a
          href="#"
          className="creator-brand"
          onClick={(event) => {
            event.preventDefault();
            onExplore();
          }}
        >
          elsewhere<span>.</span>
        </a>
        <div className="creator-navigation">
          <button type="button" className="creator-quiet" onClick={toggleLanguage} aria-label={t.languageSwitchLabel}>
            {t.languageToggle}
          </button>
          <button type="button" className="creator-quiet" onClick={() => onExplore()}>
            {t.backToSky}
          </button>
        </div>
      </header>
      <div className="creator-hero">
        <p className="eyebrow">Elsewhere · Sky moments</p>
        <h1>{t.creatorHeading}</h1>
        <p>{t.creatorIntro}</p>
      </div>
      <main className="creator-grid">
        <div className="creator-event creator-card">
          <MemorialTimeForm
            initialInput={initialDraft?.time}
            submitMode="create"
            onDraftChange={handleDraftChange}
            onInvalidated={() => revoke(true)}
            onResolved={(event) => {
              void generate(event);
            }}
          />
        </div>
        <section className="creator-preview creator-card" aria-labelledby="creator-preview-title">
          <h2 id="creator-preview-title">{t.previewHeading}</h2>
          <div className="creator-art-frame" data-creator-status={stage}>
            <canvas
              ref={canvas}
              width={1200}
              height={1500}
              role="img"
              aria-label={t.previewHeading}
              className="creator-art-canvas"
              style={{ visibility: showPreview ? 'visible' : 'hidden' }}
              data-testid="sky-chart-preview"
            />
            {!showPreview && <p className="creator-art-placeholder">{t.previewEmpty}</p>}
          </div>
          <p role="status" aria-live="polite" className="creator-status">
            {statusText}
          </p>
          {stage === 'error' && (
            <button
              type="button"
              className="secondary-button creator-retry"
              onClick={() => {
                if (lastResolved.current) void generate(lastResolved.current);
              }}
            >
              {t.retry}
            </button>
          )}
        </section>
        <section className="creator-customization creator-card" aria-labelledby="creator-edit-title">
          <h2 id="creator-edit-title">{t.editingHeading}</h2>
          <label className="creator-field">
            <span>{t.titleLabel}</span>
            <input type="text" value={draft.title} onChange={(event) => updateText('title', event.target.value)} />
          </label>
          <label className="creator-field">
            <span>{t.phraseLabel}</span>
            <textarea rows={3} value={draft.phrase} onChange={(event) => updateText('phrase', event.target.value)} />
          </label>
          <fieldset className="creator-themes">
            <legend>{t.themeLabel}</legend>
            <label className="creator-theme-option">
              <input
                type="radio"
                name="sky-artwork-theme"
                checked={draft.theme === 'midnight'}
                onChange={() => changeTheme('midnight')}
              />
              <span className="creator-theme-swatch midnight" />
              {t.midnight}
            </label>
            <label className="creator-theme-option">
              <input
                type="radio"
                name="sky-artwork-theme"
                checked={draft.theme === 'paper'}
                onChange={() => changeTheme('paper')}
              />
              <span className="creator-theme-swatch paper" />
              {t.paper}
            </label>
          </fieldset>
        </section>
        <section className="creator-actions creator-card" aria-label={t.previewHeading}>
          <div className="creator-action-buttons">
            <button type="button" className="primary-button" onClick={download} disabled={!currentReady}>
              {t.downloadPng}
            </button>
            {currentReady?.share === 'files' && (
              <button type="button" className="secondary-button" onClick={share}>
                {t.shareImage}
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (currentReady && science) onExplore(science.event);
              }}
              disabled={!currentReady}
            >
              {t.exploreThisSky}
            </button>
          </div>
          {notice && <p role="status" aria-live="polite" className="creator-status">{notice}</p>}
          <p className="creator-disclaimer">
            {science?.event.kind === 'reference' && <span>{t.referenceNotice} </span>}
            {t.scienceNotice}
          </p>
        </section>
      </main>
    </div>
  );
}
