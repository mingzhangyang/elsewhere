import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { memorialMessages } from './i18n/memorial';
import { useI18n } from './i18n';
import type { MemorialTime } from './lib/memorialTime';
import type { SkyCreatorDraft } from './lib/skyCreatorDraft';
import type { AppProps } from './App';

const Creator = lazy(() => import('./components/SkyArtworkCreator'));

// Neither App, Three.js, the renderer, the HYG catalog, nor weather enters #create's
// static import graph. Preserve the dev scenarios for existing explorer browser tests.
const Explorer = lazy(async () => {
  const [module, dev] = await Promise.all([
    import('./App'),
    import.meta.env.DEV ? import('./dev/scenarios') : Promise.resolve(null),
  ]);
  const scenario = dev?.scenarioProps(new URLSearchParams(window.location.search).get('scenario')) ?? {};
  return {
    default: (props: AppProps) => <module.default {...scenario} {...props} />,
  };
});

type Route = 'create' | 'explore';
type ExplorerHandoff = Pick<MemorialTime, 'location' | 'utc'>;

export function routeForHash(hash: string): Route {
  return hash === '#create' ? 'create' : 'explore';
}

export default function RouteShell({ diagnostics = false }: { diagnostics?: boolean }) {
  const { locale } = useI18n();
  const t = memorialMessages(locale);
  const [route, setRoute] = useState<Route>(() => routeForHash(window.location.hash));
  const [handoff, setHandoff] = useState<ExplorerHandoff | null>(null);
  const savedDraft = useRef<SkyCreatorDraft | null>(null);
  const [explorerVisit, setExplorerVisit] = useState(0);

  useEffect(() => {
    const navigate = () => {
      setRoute(routeForHash(window.location.hash));
      setExplorerVisit((value) => value + 1);
    };
    window.addEventListener('popstate', navigate);
    window.addEventListener('hashchange', navigate);
    return () => {
      window.removeEventListener('popstate', navigate);
      window.removeEventListener('hashchange', navigate);
    };
  }, []);

  const openCreator = useCallback(() => {
    if (window.location.hash !== '#create') {
      window.history.pushState({ elsewhereCreator: true }, '', '#create');
    }
    setRoute('create');
  }, []);

  const openExplorer = useCallback((event?: MemorialTime) => {
    if (event) setHandoff({ location: event.location, utc: event.utc });
    else setHandoff(null);
    // History may retain a return path, but neither URL nor history.state stores
    // the event's location, time, title or phrase.
    window.history.pushState(
      { elsewhereCreatorExplorer: Boolean(event) },
      '',
      window.location.pathname + window.location.search,
    );
    setExplorerVisit((value) => value + 1);
    setRoute('explore');
  }, []);

  const activeHandoff =
    window.history.state?.elsewhereCreatorExplorer === true &&
    !window.location.hash.startsWith('#sky=')
      ? handoff
      : null;

  return (
    <Suspense
      fallback={
        <main className="creator-loading" role="status">
          {t.loadingPage}
        </main>
      }
    >
      {route === 'create' ? (
        <Creator
          initialDraft={savedDraft.current}
          onDraftChange={(next) => {
            savedDraft.current = next;
          }}
          onExplore={openExplorer}
        />
      ) : (
        <Explorer
          key={activeHandoff ? `creator-${explorerVisit}` : `explorer-${explorerVisit}`}
          initialLocation={activeHandoff?.location}
          initialTime={activeHandoff ? new Date(activeHandoff.utc) : undefined}
          diagnostics={diagnostics}
          onCreate={openCreator}
          onReturnToCreator={savedDraft.current ? openCreator : undefined}
        />
      )}
    </Suspense>
  );
}
