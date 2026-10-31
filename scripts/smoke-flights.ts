// Live Google Flights reader check: prints top 5 itineraries. Uses no DB —
// bypasses cachedCall entirely.
try { process.loadEnvFile('.env.local'); } catch { /* ok */ }

async function main() {
  const [from, to, depart, ret] = process.argv.slice(2);
  if (!from || !to || !depart) {
    console.error('usage: tsx scripts/smoke-flights.ts ORIG DEST DEPART [RETURN]');
    process.exit(1);
  }
  process.env.SKIP_DB = '1';
  const { searchOutbounds } = await import('../src/lib/providers/googleFlights');
  const r = await searchOutbounds({
    originAirports: [from.toUpperCase()], destinationAirports: [to.toUpperCase()],
    outboundDate: depart, returnDate: ret, adults: 1, children: 0,
    infantsInSeat: 0, infantsOnLap: 0, cabin: 'economy', maxStops: 'any', currency: 'USD',
  });
  console.log(`${r.itineraries.length} itineraries (raw ${r.rawCount})`);
  for (const it of r.itineraries.slice(0, 5)) {
    const s = it.outbound;
    console.log(
      `${s.airlines.join('/')} ${s.segments.map((x) => x.airlineCode + x.flightNumber).join(',')} | ${s.from.code} ${s.departLocal} -> ${s.to.code} ${s.arriveLocal} | ${s.stops} stops | ${s.durationMin}min | $${it.price.total ?? 'n/a'} ${it.price.isFrom ? '(from)' : ''} | best=${it.isBest}`,
    );
  }
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message ?? e); process.exit(1); });

export {};
