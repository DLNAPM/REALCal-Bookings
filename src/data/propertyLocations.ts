/**
 * Property location profiles, coordinates, telecom providers, and utility information
 * Used for area-specific weather alerts, mobile/internet outage monitoring, and venue proximity.
 */

export interface PropertyLocationProfile {
  id: string;
  name: string;
  shortName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  serviceArea: string;
  lat: number;
  lng: number;
  imageUrl: string;
  isFlagship?: boolean;
  isTestProperty?: boolean;
  powerUtility: {
    name: string;
    phone: string;
    mapUrl: string;
  };
  isps: {
    name: string;
    type: string;
    speed: string;
    outageUrl: string;
    supportPhone: string;
  }[];
  mobileCarriers: {
    name: string;
    tech: string;
    outageUrl: string;
    supportPhone: string;
  }[];
}

export const KNOWN_PROPERTY_PROFILES: PropertyLocationProfile[] = [
  {
    id: 'stonewall-villa',
    name: 'Stonewall Villa',
    shortName: 'Stonewall Villa',
    address: '2844 Stonewall Tell Rd, Atlanta, GA 30331',
    city: 'Atlanta',
    state: 'GA',
    zip: '30331',
    county: 'Fulton County (South Fulton)',
    serviceArea: 'South Fulton / Camp Creek / Metro Atlanta',
    lat: 33.6823,
    lng: -84.5262,
    imageUrl: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&q=80&w=2000',
    isFlagship: true,
    powerUtility: {
      name: 'Georgia Power',
      phone: '1-888-891-0938',
      mapUrl: 'https://outagemap.georgiapower.com/',
    },
    isps: [
      {
        name: 'AT&T Fiber',
        type: 'Gigabit Symmetrical Fiber',
        speed: 'Up to 1,000 Mbps',
        outageUrl: 'https://www.att.com/outages/',
        supportPhone: '1-800-288-2020',
      },
      {
        name: 'Comcast Xfinity',
        type: 'Cable / Gigabit Hybrid Fiber',
        speed: 'Up to 1,200 Mbps',
        outageUrl: 'https://www.xfinity.com/support/status',
        supportPhone: '1-800-934-6489',
      },
      {
        name: 'Spectrum / Charter',
        type: 'Regional Broadband',
        speed: 'Up to 500 Mbps',
        outageUrl: 'https://www.spectrum.net/page/outage-monitor',
        supportPhone: '1-833-267-6094',
      },
      {
        name: 'Google Fiber',
        type: 'Metro Atlanta Core Fiber',
        speed: 'Up to 2,000 Mbps',
        outageUrl: 'https://fiber.google.com/support/',
        supportPhone: '1-866-777-7550',
      },
    ],
    mobileCarriers: [
      {
        name: 'Verizon Wireless',
        tech: '5G Ultra Wideband & LTE Advanced',
        outageUrl: 'https://www.verizon.com/support/check-network-status/',
        supportPhone: '1-800-922-0204',
      },
      {
        name: 'AT&T Mobility',
        tech: '5G+ & Low-Band 5G',
        outageUrl: 'https://www.att.com/outages/',
        supportPhone: '1-800-331-0500',
      },
      {
        name: 'T-Mobile',
        tech: '5G Ultra Capacity (Mid-Band & mmWave)',
        outageUrl: 'https://www.t-mobile.com/support/coverage/check-network-status',
        supportPhone: '1-800-937-8997',
      },
    ],
  },
  {
    id: 'oceanview-paradise-villa',
    name: 'Oceanview Paradise Villa',
    shortName: 'Oceanview Villa',
    address: 'Ocean Drive, Miami Beach, FL 33139',
    city: 'Miami Beach',
    state: 'FL',
    zip: '33139',
    county: 'Miami-Dade County',
    serviceArea: 'South Beach / Greater Miami',
    lat: 25.7825,
    lng: -80.1340,
    imageUrl: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&q=80&w=2000',
    isTestProperty: true,
    powerUtility: {
      name: 'Florida Power & Light (FPL)',
      phone: '1-800-468-8243',
      mapUrl: 'https://www.fpl.com/storm/outage-map.html',
    },
    isps: [
      {
        name: 'AT&T Fiber',
        type: 'Gigabit Fiber',
        speed: 'Up to 1,000 Mbps',
        outageUrl: 'https://www.att.com/outages/',
        supportPhone: '1-800-288-2020',
      },
      {
        name: 'Xfinity by Comcast',
        type: 'Gigabit Cable',
        speed: 'Up to 1,200 Mbps',
        outageUrl: 'https://www.xfinity.com/support/status',
        supportPhone: '1-800-934-6489',
      },
      {
        name: 'Breezeline',
        type: 'Coastal Fiber',
        speed: 'Up to 1,000 Mbps',
        outageUrl: 'https://www.breezeline.com/',
        supportPhone: '1-888-536-9600',
      },
    ],
    mobileCarriers: [
      {
        name: 'Verizon Wireless',
        tech: '5G Ultra Wideband',
        outageUrl: 'https://www.verizon.com/support/check-network-status/',
        supportPhone: '1-800-922-0204',
      },
      {
        name: 'AT&T Mobility',
        tech: '5G+',
        outageUrl: 'https://www.att.com/outages/',
        supportPhone: '1-800-331-0500',
      },
      {
        name: 'T-Mobile',
        tech: '5G Ultra Capacity',
        outageUrl: 'https://www.t-mobile.com/support/coverage/check-network-status',
        supportPhone: '1-800-937-8997',
      },
    ],
  },
  {
    id: 'mountain-retreat-cabin',
    name: 'Mountain Retreat Cabin',
    shortName: 'Mountain Retreat',
    address: 'Aska Adventure Area, Blue Ridge, GA 30513',
    city: 'Blue Ridge',
    state: 'GA',
    zip: '30513',
    county: 'Fannin County',
    serviceArea: 'North Georgia Mountains / Blue Ridge',
    lat: 34.8640,
    lng: -84.3240,
    imageUrl: 'https://images.unsplash.com/photo-1542314831-c6a4d14effca?auto=format&fit=crop&q=80&w=2000',
    isTestProperty: true,
    powerUtility: {
      name: 'Blue Ridge Mountain EMC',
      phone: '1-706-379-3121',
      mapUrl: 'https://www.brmemc.com/outage-map',
    },
    isps: [
      {
        name: 'ETC Communications',
        type: 'Mountain Fiber',
        speed: 'Up to 1,000 Mbps',
        outageUrl: 'https://www.etcnow.com/',
        supportPhone: '1-706-632-2256',
      },
      {
        name: 'Kinetic by Windstream',
        type: 'Gigabit Fiber',
        speed: 'Up to 1,000 Mbps',
        outageUrl: 'https://www.windstream.com/outage-map',
        supportPhone: '1-800-347-1991',
      },
      {
        name: 'Starlink Satellite',
        type: 'Low-Earth Orbit Satellite',
        speed: '150 - 250 Mbps',
        outageUrl: 'https://www.starlink.com/',
        supportPhone: 'Via App',
      },
    ],
    mobileCarriers: [
      {
        name: 'Verizon Wireless',
        tech: '4G LTE / 5G Extended Range',
        outageUrl: 'https://www.verizon.com/support/check-network-status/',
        supportPhone: '1-800-922-0204',
      },
      {
        name: 'AT&T Mobility',
        tech: '4G LTE / 5G Extended',
        outageUrl: 'https://www.att.com/outages/',
        supportPhone: '1-800-331-0500',
      },
      {
        name: 'T-Mobile',
        tech: '5G Extended Range',
        outageUrl: 'https://www.t-mobile.com/support/coverage/check-network-status',
        supportPhone: '1-800-937-8997',
      },
    ],
  },
];

/**
 * Calculates Haversine distance in statute miles between two geographical coordinates.
 */
export function calculateDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Resolves a full location profile for any given property object or property name.
 */
export function resolvePropertyProfile(property?: { id?: string; name?: string; location?: string; images?: any[] }): PropertyLocationProfile {
  if (!property) return KNOWN_PROPERTY_PROFILES[0];

  const nameLower = (property.name || '').toLowerCase();
  const locLower = (property.location || '').toLowerCase();
  const idLower = (property.id || '').toLowerCase();

  // Match Stonewall Villa
  if (nameLower.includes('stonewall') || idLower.includes('stonewall')) {
    return {
      ...KNOWN_PROPERTY_PROFILES[0],
      id: property.id || KNOWN_PROPERTY_PROFILES[0].id,
      name: property.name || KNOWN_PROPERTY_PROFILES[0].name,
    };
  }

  // Match Oceanview Villa
  if (nameLower.includes('ocean') || locLower.includes('miami') || locLower.includes('beach')) {
    return {
      ...KNOWN_PROPERTY_PROFILES[1],
      id: property.id || KNOWN_PROPERTY_PROFILES[1].id,
      name: property.name || KNOWN_PROPERTY_PROFILES[1].name,
    };
  }

  // Match Mountain Retreat Cabin
  if (nameLower.includes('mountain') || nameLower.includes('cabin') || locLower.includes('blue ridge')) {
    return {
      ...KNOWN_PROPERTY_PROFILES[2],
      id: property.id || KNOWN_PROPERTY_PROFILES[2].id,
      name: property.name || KNOWN_PROPERTY_PROFILES[2].name,
    };
  }

  // Fallback: Custom Atlanta or regional property
  return {
    id: property.id || 'custom-property',
    name: property.name || 'Featured Property',
    shortName: property.name || 'Property',
    address: property.location || 'Atlanta, GA 30331',
    city: 'Atlanta',
    state: 'GA',
    zip: '30331',
    county: 'Fulton County',
    serviceArea: 'Metro Atlanta',
    lat: 33.6823,
    lng: -84.5262,
    imageUrl: property.images && property.images[0] ? (typeof property.images[0] === 'string' ? property.images[0] : property.images[0].url) : KNOWN_PROPERTY_PROFILES[0].imageUrl,
    powerUtility: KNOWN_PROPERTY_PROFILES[0].powerUtility,
    isps: KNOWN_PROPERTY_PROFILES[0].isps,
    mobileCarriers: KNOWN_PROPERTY_PROFILES[0].mobileCarriers,
  };
}
