export type ProviderErrorKind =
  | 'not_configured'
  | 'quota_exceeded'
  | 'auth'
  | 'blocked'
  | 'parse'
  | 'network'
  | 'bad_request'
  | 'empty';

export class ProviderError extends Error {
  readonly provider: string;
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;

  constructor(
    provider: string,
    kind: ProviderErrorKind,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
    this.retryable = retryable;
  }
}

export type PlaceRef = {
  label: string;
  city: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
  airports: string[];
};

// ----- Normalized provider result types (used by later phases) -----

export type FlightSegment = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  from: { code: string; name?: string };
  to: { code: string; name?: string };
  departLocal: string;
  arriveLocal: string;
  durationMin: number;
  aircraft?: string;
  legroom?: string;
  overnight?: boolean;
  oftenDelayed?: boolean;
};

export type Layover = {
  airportCode: string;
  airportName?: string;
  durationMin: number;
  overnight?: boolean;
};

export type FlightLeg = {
  segments: FlightSegment[];
  layovers: Layover[];
  from: { code: string; name?: string };
  to: { code: string; name?: string };
  departLocal: string;
  arriveLocal: string;
  fromTz: string;
  toTz: string;
  durationMin: number;
  stops: number;
  airlines: string[];
};

export type FlightItinerary = {
  id: string;
  outbound: FlightLeg;
  return?: FlightLeg;
  price: {
    total: number | null;
    perPerson: number | null;
    currency: string;
    isFrom: boolean;
  };
  bookingUrl: string;
  isBest: boolean;
  emissionsKg?: number;
  fetchedAt: string;
};

export type FlightSearchRequest = {
  originAirports: string[];
  destinationAirports: string[];
  outboundDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infantsInSeat: number;
  infantsOnLap: number;
  cabin: 'economy' | 'premium_economy' | 'business' | 'first';
  maxStops: 'any' | 'nonstop' | 'one' | 'two';
  currency: string;
};

export type LodgingResult = {
  id: string;
  name: string;
  kind: 'hotel' | 'vacation_rental';
  description?: string;
  lat?: number;
  lon?: number;
  pricePerNight?: number;
  totalPrice?: number;
  currency?: string;
  rating?: number;
  reviews?: number;
  hotelClass?: number;
  locationRating?: number;
  amenities: string[];
  nearbyPlaces: string[];
  checkInTime?: string;
  checkOutTime?: string;
  images: string[];
  link?: string;
  isHostel?: boolean;
};

export type PlaceResult = {
  id: string;
  title: string;
  type?: string;
  types: string[];
  rating?: number;
  reviews?: number;
  priceLevel?: number;
  address?: string;
  lat?: number;
  lon?: number;
  hours?: Record<string, unknown>;
  website?: string;
  phone?: string;
  thumbnail?: string;
  description?: string;
};
