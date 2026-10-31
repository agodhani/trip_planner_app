// SerpApi Google Hotels filter id tables — pure constants, safe for client use.

export const PROPERTY_TYPES = {
  beach: 12, boutique: 13, hostel: 14, inn: 15, motel: 16, resort: 17,
  spa: 18, bnb: 19, other: 20, apartmentHotel: 21, minshuku: 22,
  japaneseBusiness: 23, ryokan: 24,
} as const;
export const ALL_PROPERTY_TYPE_IDS = Object.values(PROPERTY_TYPES) as number[];
export const NON_HOSTEL_TYPE_IDS = ALL_PROPERTY_TYPE_IDS.filter((id) => id !== PROPERTY_TYPES.hostel);

export const AMENITY_IDS = {
  freeParking: 1, parking: 3, indoorPool: 4, outdoorPool: 5, pool: 6,
  fitness: 7, restaurant: 8, freeBreakfast: 9, spa: 10, beachAccess: 11,
  childFriendly: 12, bar: 15, petFriendly: 19, roomService: 22,
  freeWifi: 35, airConditioned: 40, allInclusive: 52,
  wheelchairAccessible: 53, evCharger: 61,
} as const;

export const HOTEL_SORT = { price: 3, rating: 8, mostReviewed: 13 } as const;
export const HOTEL_RATING = { '3.5+': 7, '4.0+': 8, '4.5+': 9 } as const;
