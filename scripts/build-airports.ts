/**
 * Builds src/data/airports.json from:
 *  - OurAirports airports.csv (public domain)
 *  - mwgg/Airports airports.json (MIT) for IANA timezones
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const OURAIRPORTS_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';
const MWGG_URL =
  'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json';
const OUT = 'src/data/airports.json';

const ALLOWED_TYPES = new Set([
  'large_airport',
  'medium_airport',
  'small_airport',
]);

type OutAirport = {
  iata: string;
  name: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  size: 'large' | 'medium' | 'small';
};

/** Minimal CSV parser handling quoted fields with embedded commas/quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log('Downloading OurAirports…');
  const csvText = await (await fetch(OURAIRPORTS_URL)).text();
  console.log('Downloading mwgg/Airports…');
  const mwgg = (await (await fetch(MWGG_URL)).json()) as Record<
    string,
    { iata?: string; icao?: string; tz?: string }
  >;

  const tzByIata = new Map<string, string>();
  const tzByIcao = new Map<string, string>();
  for (const [key, entry] of Object.entries(mwgg)) {
    const tz = entry.tz;
    if (!tz) continue;
    if (entry.iata) tzByIata.set(entry.iata, tz);
    else if (key.length === 3) tzByIata.set(key, tz);
    if (entry.icao) tzByIcao.set(entry.icao, tz);
    else if (key.length === 4) tzByIcao.set(key, tz);
  }

  const rows = parseCsv(csvText);
  const header = rows.shift()!;
  const col = (name: string) => header.indexOf(name);

  const out: OutAirport[] = [];
  let droppedNoTz = 0;
  for (const r of rows) {
    const iata = r[col('iata_code')]?.trim();
    const type = r[col('type')]?.trim();
    const scheduled = r[col('scheduled_service')]?.trim();
    if (!iata || iata.length !== 3) continue;
    if (scheduled !== 'yes') continue;
    if (!ALLOWED_TYPES.has(type)) continue;

    const icao = r[col('ident')]?.trim();
    const tz = tzByIata.get(iata) ?? (icao ? tzByIcao.get(icao) : undefined);
    if (!tz) {
      droppedNoTz++;
      continue;
    }

    const size = type.split('_')[0] as OutAirport['size'];
    out.push({
      iata,
      name: r[col('name')].trim(),
      city: r[col('municipality')]?.trim() ?? '',
      region: r[col('iso_region')]?.trim() ?? '',
      country: r[col('iso_country')]?.trim() ?? '',
      lat: Number(r[col('latitude_deg')]),
      lon: Number(r[col('longitude_deg')]),
      tz,
      size,
    });
  }

  out.sort((a, b) => a.iata.localeCompare(b.iata));
  mkdirSync('src/data', { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 0)}\n`);
  console.log(
    `Wrote ${out.length} airports to ${OUT}; dropped ${droppedNoTz} with no timezone.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
