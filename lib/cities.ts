/**
 * City list for the kiosk autocomplete.
 *
 * PLACEHOLDER. Phase 2 replaces this with GeoNames cities15000 (~26k cities,
 * CC-BY 4.0) bundled into the kiosk, per PLAN.md 1.4. This curated set exists
 * so the input UI is real and testable now; the shape matches what the GeoNames
 * import will produce, so the swap is a drop-in.
 */
export type City = {
  /** Stable key for grouping repeat submissions from the same city. */
  cityKey: string;
  cityName: string;
  country: string;
  lat: number;
  lng: number;
};

export type Origin = City & {
  /** Epoch ms. In production this is the server clock, never the client's. */
  submittedAt: number;
};

const raw: [name: string, country: string, lat: number, lng: number][] = [
  ['London', 'United Kingdom', 51.5072, -0.1276],
  ['Manchester', 'United Kingdom', 53.4808, -2.2426],
  ['Dublin', 'Ireland', 53.3498, -6.2603],
  ['Paris', 'France', 48.8566, 2.3522],
  ['Berlin', 'Germany', 52.52, 13.405],
  ['Munich', 'Germany', 48.1351, 11.582],
  ['Frankfurt', 'Germany', 50.1109, 8.6821],
  ['Amsterdam', 'Netherlands', 52.3676, 4.9041],
  ['Brussels', 'Belgium', 50.8476, 4.3572],
  ['Zurich', 'Switzerland', 47.3769, 8.5417],
  ['Vienna', 'Austria', 48.2082, 16.3738],
  ['Prague', 'Czechia', 50.0755, 14.4378],
  ['Warsaw', 'Poland', 52.2297, 21.0122],
  ['Stockholm', 'Sweden', 59.3293, 18.0686],
  ['Copenhagen', 'Denmark', 55.6761, 12.5683],
  ['Oslo', 'Norway', 59.9139, 10.7522],
  ['Helsinki', 'Finland', 60.1699, 24.9384],
  ['Madrid', 'Spain', 40.4168, -3.7038],
  ['Barcelona', 'Spain', 41.3874, 2.1686],
  ['Lisbon', 'Portugal', 38.7223, -9.1393],
  ['Rome', 'Italy', 41.9028, 12.4964],
  ['Milan', 'Italy', 45.4642, 9.19],
  ['Athens', 'Greece', 37.9838, 23.7275],
  ['Istanbul', 'Turkey', 41.0082, 28.9784],
  ['Moscow', 'Russia', 55.7558, 37.6173],
  ['Tel Aviv', 'Israel', 32.0853, 34.7818],
  ['Dubai', 'United Arab Emirates', 25.2048, 55.2708],
  ['Doha', 'Qatar', 25.2854, 51.531],
  ['Riyadh', 'Saudi Arabia', 24.7136, 46.6753],
  ['Cairo', 'Egypt', 30.0444, 31.2357],
  ['Casablanca', 'Morocco', 33.5731, -7.5898],
  ['Lagos', 'Nigeria', 6.5244, 3.3792],
  ['Nairobi', 'Kenya', -1.2921, 36.8219],
  ['Johannesburg', 'South Africa', -26.2041, 28.0473],
  ['Cape Town', 'South Africa', -33.9249, 18.4241],
  ['Mumbai', 'India', 19.076, 72.8777],
  ['Delhi', 'India', 28.6139, 77.209],
  ['Bengaluru', 'India', 12.9716, 77.5946],
  ['Bangkok', 'Thailand', 13.7563, 100.5018],
  ['Singapore', 'Singapore', 1.3521, 103.8198],
  ['Jakarta', 'Indonesia', -6.2088, 106.8456],
  ['Manila', 'Philippines', 14.5995, 120.9842],
  ['Hong Kong', 'Hong Kong', 22.3193, 114.1694],
  ['Shanghai', 'China', 31.2304, 121.4737],
  ['Beijing', 'China', 39.9042, 116.4074],
  ['Taipei', 'Taiwan', 25.033, 121.5654],
  ['Seoul', 'South Korea', 37.5665, 126.978],
  ['Tokyo', 'Japan', 35.6762, 139.6503],
  ['Osaka', 'Japan', 34.6937, 135.5023],
  ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Melbourne', 'Australia', -37.8136, 144.9631],
  ['Brisbane', 'Australia', -27.4698, 153.0251],
  ['Perth', 'Australia', -31.9523, 115.8613],
  ['Auckland', 'New Zealand', -36.8485, 174.7633],
  ['Toronto', 'Canada', 43.6532, -79.3832],
  ['Montreal', 'Canada', 45.5019, -73.5674],
  ['Vancouver', 'Canada', 49.2827, -123.1207],
  ['New York', 'United States', 40.7128, -74.006],
  ['Boston', 'United States', 42.3601, -71.0589],
  ['Washington', 'United States', 38.9072, -77.0369],
  ['Atlanta', 'United States', 33.749, -84.388],
  ['Miami', 'United States', 25.7617, -80.1918],
  ['Dallas', 'United States', 32.7767, -96.797],
  ['Denver', 'United States', 39.7392, -104.9903],
  ['Seattle', 'United States', 47.6062, -122.3321],
  ['San Francisco', 'United States', 37.7749, -122.4194],
  ['Los Angeles', 'United States', 34.0522, -118.2437],
  ['Mexico City', 'Mexico', 19.4326, -99.1332],
  ['Bogota', 'Colombia', 4.711, -74.0721],
  ['Lima', 'Peru', -12.0464, -77.0428],
  ['Santiago', 'Chile', -33.4489, -70.6693],
  ['Buenos Aires', 'Argentina', -34.6037, -58.3816],
  ['Sao Paulo', 'Brazil', -23.5558, -46.6396],
  ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729],
];

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-');

export const CITIES: City[] = raw.map(([cityName, country, lat, lng]) => ({
  cityKey: `${slug(cityName)}-${slug(country)}`,
  cityName,
  country,
  lat,
  lng,
}));

const byKey = new Map(CITIES.map((c) => [c.cityKey, c]));

export const LONDON = byKey.get('london-united-kingdom')!;

/**
 * Prefix-first search. Matches on city name, falling back to country so
 * "japan" still finds Tokyo. Capped short because a kiosk dropdown that needs
 * scrolling is a kiosk dropdown nobody reads.
 */
export function searchCities(
  query: string,
  options?: { exclude?: string; limit?: number }
): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = options?.limit ?? 6;

  const scored: { city: City; score: number }[] = [];
  for (const city of CITIES) {
    if (city.cityKey === options?.exclude) continue;
    const name = city.cityName.toLowerCase();
    const country = city.country.toLowerCase();

    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.includes(q)) score = 1;
    else if (country.startsWith(q)) score = 2;
    else if (country.includes(q)) score = 3;

    if (score >= 0) scored.push({ city, score });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score || a.city.cityName.localeCompare(b.city.cityName)
    )
    .slice(0, limit)
    .map((entry) => entry.city);
}
