import { createServer } from 'vite';

// Explicit, optional network check. Deterministic validation never invokes this script.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { fetchWeatherForDate } = await server.ssrLoadModule('/src/services/openMeteo.ts');
  const { selectWeather } = await server.ssrLoadModule('/src/domain/weather.ts');
  const location = {
    id: 'nyc',
    name: 'New York',
    country: 'United States',
    latitude: 40.7128,
    longitude: -74.006,
    elevation: 10,
    timezone: 'America/New_York',
  };
  const now = new Date();
  for (const days of [0, -1, -10, 15]) {
    const instant = new Date(now.getTime() + days * 86400000);
    const result = await fetchWeatherForDate(location, instant, { now });
    const selected = selectWeather(result, location, instant);
    console.log(
      JSON.stringify({
        days,
        status: result.status,
        selected: selected.status,
        source: selected.source,
        message: selected.message,
        samples: result.hourly?.length,
      }),
    );
    if (result.status !== 'ready') process.exitCode = 1;
  }
} finally {
  await server.close();
}
