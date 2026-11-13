import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { calculateSky, calculateDailyEvents } = await server.ssrLoadModule('/src/lib/astronomy.ts');
  const { PRESETS } = await server.ssrLoadModule('/src/lib/locations.ts');
  const date = new Date('2026-11-24T02:00Z'),
    events = calculateDailyEvents(PRESETS[0], date),
    samples = [];
  for (let i = 0; i < 110; i++) {
    const start = performance.now();
    calculateSky(PRESETS[0], new Date(+date + i * 60000), events);
    if (i >= 10) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      runtime: process.version,
      stars: 5070,
      samples: samples.length,
      medianMs: samples[50],
      p95Ms: samples[95],
    }),
  );
} finally {
  await server.close();
}
