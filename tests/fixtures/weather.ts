/** Synthetic API contract fixture: known values, missing values, and different current/hourly samples. */
export function weatherPayload(start = Date.parse('2026-11-12T05:00:00Z')) {
  const time = Array.from({ length: 26 }, (_, i) => start / 1000 + i * 3600);
  return {
    hourly: {
      time, temperature_2m: time.map(() => 10), relative_humidity_2m: time.map(() => 50),
      precipitation: time.map(() => 0), weather_code: time.map(() => 0),
      cloud_cover: time.map(() => 20), cloud_cover_low: time.map(() => 5),
      cloud_cover_mid: time.map(() => 10), cloud_cover_high: time.map(() => 5),
      visibility: time.map(() => 30000 as number | null), wind_speed_10m: time.map(() => 12),
      wind_direction_10m: time.map((_, i) => i === 0 ? 350 : 10), pressure_msl: time.map(() => 1013),
    },
    current: { time: start / 1000 + 7 * 3600, temperature_2m: 17, cloud_cover: 85 },
  };
}
