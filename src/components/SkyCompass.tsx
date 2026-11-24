import { memo, useMemo, useSyncExternalStore } from 'react';
import { projectSkyChart } from '../domain/skyChartProjection';
import { pickSkyChartDirection, projectViewFootprint, SKY_CHART_CARDINALS } from '../domain/skyViewFootprint';
import type { CameraViewStore } from '../lib/cameraViewStore';
import type { SkyState } from '../types';
import { useI18n } from '../i18n';

const HALF = 1.2;
const HIDDEN_MEDIA = '(max-height: 620px) and (min-width: 681px), (max-height: 480px)';

function subscribeVisibility(listener: () => void) {
  const media = window.matchMedia?.(HIDDEN_MEDIA);
  media?.addEventListener?.('change', listener);
  return () => media?.removeEventListener?.('change', listener);
}

const visible = () => !window.matchMedia?.(HIDDEN_MEDIA).matches;

const SkyPoints = memo(function SkyPoints({ sky, showStars }: { sky: SkyState; showStars: boolean }) {
  const stars = useMemo(
    () =>
      showStars
        ? sky.stars
            .filter((star) => star.altitude >= 0 && star.magnitude <= 4)
            .sort((a, b) => a.magnitude - b.magnitude)
            .slice(0, 160)
        : [],
    [sky.stars, showStars],
  );
  const bodies = [{ id: 'sun', ...sky.sun }, { id: 'moon', ...sky.moon }, ...sky.planets];
  return (
    <g>
      {stars.map((star) => {
        const point = projectSkyChart(star.altitude, star.azimuth);
        if (!point) return null;
        return (
          <circle
            key={star.id}
            cx={point.x}
            cy={point.y}
            r={Math.max(0.008, 0.025 - star.magnitude * 0.004)}
            fill="#d5e4f8"
            opacity={star.magnitude < 1.5 ? 0.95 : 0.65}
          />
        );
      })}
      {bodies.map((body) => {
        const point = projectSkyChart(body.altitude, body.azimuth);
        if (!point) return null;
        return (
          <circle
            key={body.id}
            cx={point.x}
            cy={point.y}
            r={body.id === 'sun' || body.id === 'moon' ? 0.043 : 0.025}
            fill={body.id === 'sun' ? '#ffd487' : body.id === 'moon' ? '#e7edf5' : '#9dd6ef'}
          />
        );
      })}
    </g>
  );
});

interface Props {
  view: CameraViewStore;
  sky: SkyState;
  showStars: boolean;
  onNavigate: (altitude: number, azimuth: number) => void;
}

function SkyNavigation({ view, sky, showStars, onNavigate }: Props) {
  const { m } = useI18n();
  const camera = useSyncExternalStore(view.subscribe, view.get);
  const aspect = useSyncExternalStore(view.subscribe, view.getAspect);
  const heading = Math.round(camera.heading) % 360;
  const direction = m.directions[Math.round(heading / 45) % 8];
  const outline = useMemo(() => {
    if (aspect === null) return '';
    const points = projectViewFootprint(camera, aspect);
    return points.length
      ? 'M' + points.map(({ x, y }) => x.toFixed(5) + ' ' + y.toFixed(5)).join('L') + 'Z'
      : '';
  }, [camera, aspect]);
  const center = projectSkyChart(camera.altitude, camera.heading);
  const label = m.minimap.navigate;
  return (
    <div className="sky-compass" data-occludes-sky>
      <button
        type="button"
        className="sky-minimap"
        aria-label={label}
        data-tooltip={label}
        onClick={(event) => {
          if (event.detail === 0) {
            onNavigate(90, camera.heading);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const point = pickSkyChartDirection({
            x: ((event.clientX - rect.left) / rect.width - 0.5) * 2 * HALF,
            y: ((event.clientY - rect.top) / rect.height - 0.5) * 2 * HALF,
          });
          if (point) onNavigate(point.altitude, point.altitude === 90 ? camera.heading : point.azimuth);
        }}
        onKeyDown={(event) => {
          let { altitude, heading: azimuth } = camera;
          if (event.key === 'ArrowUp') altitude += 10;
          else if (event.key === 'ArrowDown') altitude -= 10;
          else if (event.key === 'ArrowLeft') azimuth -= 10;
          else if (event.key === 'ArrowRight') azimuth += 10;
          else return;
          event.preventDefault();
          onNavigate(Math.max(-90, Math.min(90, altitude)), (azimuth + 360) % 360);
        }}
      >
        <svg viewBox="-1.2 -1.2 2.4 2.4" aria-hidden="true" focusable="false">
          <circle r="1" fill="#0a1628" stroke="#8297b2" strokeWidth=".014" />
          <g fill="none" stroke="#6c849f" strokeWidth=".008" opacity=".5">
            <circle r=".3333" />
            <circle r=".6667" />
            <path d="M-1 0H1 M0 -1V1" />
          </g>
          <SkyPoints sky={sky} showStars={showStars} />
          {outline && (
            <path
              className="sky-minimap-footprint"
              d={outline}
              fill="#f5ce93"
              fillOpacity=".18"
              stroke="#f5ce93"
              strokeWidth=".022"
              strokeLinejoin="round"
            />
          )}
          {center ? (
            <circle cx={center.x} cy={center.y} r=".028" fill="#ffdfaa" />
          ) : (
            <circle
              cx={-Math.sin((camera.heading * Math.PI) / 180)}
              cy={-Math.cos((camera.heading * Math.PI) / 180)}
              r=".035"
              fill="none"
              stroke="#f5ce93"
              strokeWidth=".018"
            />
          )}
          <g fill="#d3dfed" fontSize=".14" textAnchor="middle" dominantBaseline="central">
            {SKY_CHART_CARDINALS.map(({ x, y, azimuth }) => (
              <text key={azimuth} x={x} y={y}>
                {m.directions[azimuth / 45]}
              </text>
            ))}
          </g>
        </svg>
      </button>
      <div className="sky-compass-readout" role="img" aria-label={m.facing({ direction, degrees: heading })}>
        <strong>{direction}</strong>
        <span>{heading}°</span>
      </div>
      <small className="sky-minimap-altitude">
        {m.minimap.altitude({ degrees: Math.round(camera.altitude) })}
      </small>
    </div>
  );
}

/** Keep the subscriptions and star drawing dormant on short screens and while chrome is hidden. */
export default function SkyCompass(props: Props) {
  const show = useSyncExternalStore(subscribeVisibility, visible);
  return show ? <SkyNavigation {...props} /> : null;
}
