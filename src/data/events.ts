export interface EventItem {
  id: string;
  title: string;
  category: 'Family' | 'Kids' | 'Night Life Entertainments' | 'Sporting Events';
  date: string;
  rawDate: Date;
  isoDate?: string;
  description: string;
  ticketUrl: string;
  venue: string;
  distance: string;
  distanceMiles?: number;
  source?: string;
}

export function formatEventDate(date: Date, customTime?: string): string {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (customTime) {
    return `${dateStr} • ${customTime}`;
  }
  const timeFormatted = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateStr} • ${timeFormatted}`;
}

export const VENUE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Mercedes-Benz Stadium': { lat: 33.7554, lng: -84.4009 },
  'Fox Theatre Atlanta': { lat: 33.7725, lng: -84.3857 },
  'Fox Theatre': { lat: 33.7725, lng: -84.3857 },
  'State Farm Arena': { lat: 33.7573, lng: -84.3963 },
  'Zoo Atlanta': { lat: 33.7331, lng: -84.3725 },
  "Children's Museum of Atlanta": { lat: 33.7628, lng: -84.3897 },
  'Center for Puppetry Arts': { lat: 33.7915, lng: -84.3895 },
  'Stone Mountain Park': { lat: 33.8053, lng: -84.1456 },
  'Bobby Dodd Stadium at Historic Grant Field': { lat: 33.7724, lng: -84.3928 },
  'Atlanta Botanical Garden': { lat: 33.7905, lng: -84.3732 },
  'Georgia Aquarium': { lat: 33.7634, lng: -84.3951 },
  'St. James Live': { lat: 33.6558, lng: -84.5020 },
  'Wolf Creek Amphitheater': { lat: 33.6420, lng: -84.5610 },
  'Phipps Plaza LEGO Discovery Center': { lat: 33.8530, lng: -84.3620 },
  'Bobby Jones Golf Course': { lat: 33.8115, lng: -84.4075 },
  'Atlanta Symphony Hall at Woodruff Arts Center': { lat: 33.7892, lng: -84.3849 },
  'Atlanta Symphony Hall': { lat: 33.7892, lng: -84.3849 },
  'Atlantic Station': { lat: 33.7915, lng: -84.3980 },
  'Fernbank Museum of Natural History': { lat: 33.7743, lng: -84.3289 },
  'Center Parc Stadium': { lat: 33.7353, lng: -84.3895 },
  'Historic Cabbagetown Park': { lat: 33.7495, lng: -84.3648 },
  'OTE Arena at Atlantic Station': { lat: 33.7890, lng: -84.3985 },
  'Tellus Science Museum': { lat: 34.2370, lng: -84.8150 },
  'Southside Park Trailhead': { lat: 33.6812, lng: -84.3792 },
  'Truist Park': { lat: 33.8907, lng: -84.4678 },
  'Gateway Center Arena @ College Park': { lat: 33.6495, lng: -84.4590 },
  'Gateway Center Arena': { lat: 33.6495, lng: -84.4590 },
};

export interface EventOriginOptions {
  propertyId?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  propertyName?: string;
  forceRefresh?: boolean;
}

export interface LiveEventsFetchResult {
  events: EventItem[];
  windowStart: Date;
  windowEnd: Date;
  refreshedAt: Date;
  sourcesChecked: string[];
}

/**
 * Fetches genuine, real-time upcoming events occurring strictly between today and 30 days in the future
 * from the backend /api/local-events aggregator (ESPN official schedules + local venue calendars).
 */
export async function fetchLiveEventsForProperty(
  origin: EventOriginOptions = {}
): Promise<LiveEventsFetchResult> {
  const params = new URLSearchParams();
  if (origin.propertyId) params.set('propertyId', origin.propertyId);
  if (origin.propertyName) params.set('propertyName', origin.propertyName);
  if (origin.city) params.set('city', origin.city);
  if (origin.state) params.set('state', origin.state);
  if (typeof origin.lat === 'number') params.set('lat', String(origin.lat));
  if (typeof origin.lng === 'number') params.set('lng', String(origin.lng));
  if (origin.forceRefresh) params.set('refresh', 'true');

  const res = await fetch(`/api/local-events?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch live local events (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.success || !Array.isArray(data.events)) {
    throw new Error(data.error || 'Invalid response from live events service');
  }

  const events: EventItem[] = data.events.map((ev: any) => ({
    id: ev.id,
    title: ev.title,
    category: ev.category,
    date: ev.date,
    rawDate: new Date(ev.isoDate || ev.date),
    isoDate: ev.isoDate,
    description: ev.description,
    ticketUrl: ev.ticketUrl,
    venue: ev.venue,
    distance: ev.distance,
    distanceMiles: typeof ev.distanceMiles === 'number' ? ev.distanceMiles : undefined,
    source: ev.source,
  }));

  return {
    events,
    windowStart: new Date(data.windowStart || Date.now()),
    windowEnd: new Date(data.windowEnd || Date.now() + 30 * 24 * 60 * 60 * 1000),
    refreshedAt: new Date(data.refreshedAt || Date.now()),
    sourcesChecked: Array.isArray(data.sourcesChecked) ? data.sourcesChecked : [],
  };
}
