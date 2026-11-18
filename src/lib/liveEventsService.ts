import { EventItem, VENUE_COORDINATES } from '../data/events';

export interface LiveEvent extends EventItem {
  isoDate: string;
  city?: string;
  state?: string;
  distanceMiles: number;
  source: string;
}

export interface LiveEventsRequest {
  propertyId?: string;
  propertyName?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  forceRefresh?: boolean;
}

export interface LiveEventsResponse {
  success: boolean;
  region: 'atlanta' | 'miami' | 'blueridge' | 'custom';
  windowStart: string;
  windowEnd: string;
  refreshedAt: string;
  totalCount: number;
  sourcesChecked: string[];
  events: LiveEvent[];
}

const DEFAULT_TIMEZONE = 'America/New_York';

// In-memory cache keyed by region (10 minute TTL unless forceRefresh=true)
const regionCache = new Map<
  string,
  {
    expiresAt: number;
    sourcesChecked: string[];
    rawEvents: Omit<LiveEvent, 'distance' | 'distanceMiles'>[];
  }
>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function decodeHtml(str: string | undefined | null): string {
  if (!str) return '';
  const stripped = str.replace(/<[^>]*>/g, ' ');
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&hellip;': '…',
  };
  return stripped
    .replace(/&[a-z]+;/gi, (m) => named[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeText(text: string, maxLen = 220): string {
  const clean = decodeHtml(text);
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function formatDateInTZ(date: Date, timeZone = DEFAULT_TIMEZONE, customTime?: string): string {
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  if (customTime) {
    return `${datePart} • ${customTime}`;
  }
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date);
  return `${datePart} • ${timePart}`;
}

function getDateYMDInTZ(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Parse a local datetime string from America/New_York (e.g. "2026-11-19 19:30:00")
 * into an accurate UTC Date object.
 */
function parseEasternLocalDateTime(dateTimeStr: string): Date | null {
  if (!dateTimeStr) return null;
  const m = dateTimeStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) {
    const parsed = new Date(dateTimeStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const hour = m[4] ? parseInt(m[4], 10) : 12;
  const minute = m[5] ? parseInt(m[5], 10) : 0;
  const sec = m[6] ? parseInt(m[6], 10) : 0;

  // Approximate offset via Intl for America/New_York (EST -05:00, EDT -04:00)
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, sec));
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    timeZoneName: 'short',
  })
    .formatToParts(utcGuess)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offsetHours = tzName === 'EDT' ? 4 : 5;
  return new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute, sec));
}

function calculateHaversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const EXTRA_VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  ...VENUE_COORDINATES,
  'Gateway Center Arena': { lat: 33.6495, lng: -84.459 },
  'McCamish Pavilion': { lat: 33.7808, lng: -84.3926 },
  'Georgia State Convocation Center': { lat: 33.7399, lng: -84.3885 },
  'GSU Convocation Center': { lat: 33.7399, lng: -84.3885 },
  'KSU Convocation Center': { lat: 34.0383, lng: -84.5815 },
  'Fifth Third Stadium': { lat: 34.0315, lng: -84.5683 },
  'Sanford Stadium': { lat: 33.9498, lng: -83.3733 },
  'Stegeman Coliseum': { lat: 33.9426, lng: -83.3783 },
  'Atlanta History Center': { lat: 33.8421, lng: -84.3858 },
  'McElreath Hall': { lat: 33.8421, lng: -84.3858 },
  'Piedmont Park': { lat: 33.7851, lng: -84.3738 },
  'Community Center': { lat: 33.7858, lng: -84.3728 },
  'Alliance Theatre': { lat: 33.7892, lng: -84.3854 },
  'Coca-Cola Stage': { lat: 33.7892, lng: -84.3854 },
  'Hertz Stage': { lat: 33.7892, lng: -84.3854 },
  'Rialto Center for the Arts': { lat: 33.7556, lng: -84.3887 },
  'Michael C. Carlos Museum': { lat: 33.7905, lng: -84.3237 },
  'Spelman College Museum of Fine Art': { lat: 33.7463, lng: -84.4126 },
  'Earl and Rachel Smith Strand Theatre': { lat: 33.9529, lng: -84.5499 },
  'Marietta Square Market': { lat: 33.9522, lng: -84.5525 },
  'Marietta Cobb Museum of Art': { lat: 33.9519, lng: -84.5468 },
  'Reeves House Visual Arts Center': { lat: 34.1016, lng: -84.5194 },
  'Kaseya Center': { lat: 25.7814, lng: -80.187 },
  'Hard Rock Stadium': { lat: 25.958, lng: -80.2389 },
  'Amerant Bank Arena': { lat: 26.1584, lng: -80.3256 },
  'loanDepot park': { lat: 25.7781, lng: -80.2196 },
  'Chase Stadium': { lat: 26.1931, lng: -80.1611 },
  'Watsco Center': { lat: 25.7145, lng: -80.2787 },
  'Ocean Bank Convocation Center': { lat: 25.7551, lng: -80.3729 },
  'Phillip and Patricia Frost Museum of Science': { lat: 25.7854, lng: -80.1887 },
  'Frost Science Museum': { lat: 25.7854, lng: -80.1887 },
  'Museum of Miami': { lat: 25.7747, lng: -80.1945 },
  'HistoryMiami Museum': { lat: 25.7747, lng: -80.1945 },
  'Coral Gables Museum': { lat: 25.7495, lng: -80.2584 },
  'Blue Ridge Mountains Arts Association': { lat: 34.8639, lng: -84.3247 },
  'Downtown Blue Ridge': { lat: 34.864, lng: -84.3244 },
  'Blue Ridge Scenic Railway': { lat: 34.8636, lng: -84.3239 },
  'The Arts Council Smithgall Arts Center': { lat: 34.2991, lng: -83.8293 },
  'Quinlan Visual Arts Center': { lat: 34.3046, lng: -83.8213 },
  'Northeast Georgia History Center': { lat: 34.3029, lng: -83.8211 },
  "Brenau University's Pearce Auditorium": { lat: 34.3016, lng: -83.8226 },
  'McKenzie Arena': { lat: 35.0468, lng: -85.297 },
};

const CITY_FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  atlanta: { lat: 33.749, lng: -84.388 },
  marietta: { lat: 33.9526, lng: -84.5499 },
  woodstock: { lat: 34.1015, lng: -84.5194 },
  kennesaw: { lat: 34.0234, lng: -84.6155 },
  decatur: { lat: 33.7748, lng: -84.2963 },
  miami: { lat: 25.7743, lng: -80.1937 },
  'miami beach': { lat: 25.7907, lng: -80.13 },
  'coral gables': { lat: 25.7215, lng: -80.2684 },
  sunrise: { lat: 26.1578, lng: -80.325 },
  'miami gardens': { lat: 25.958, lng: -80.2389 },
  'blue ridge': { lat: 34.864, lng: -84.3241 },
  ellijay: { lat: 34.6948, lng: -84.4821 },
  blairsville: { lat: 34.8762, lng: -83.9582 },
  dahlonega: { lat: 34.5326, lng: -83.9849 },
  gainesville: { lat: 34.2979, lng: -83.8241 },
  chattanooga: { lat: 35.0456, lng: -85.3097 },
  athens: { lat: 33.9519, lng: -83.3576 },
};

function resolveVenueCoords(
  venueName: string,
  city?: string,
  geoLat?: number,
  geoLng?: number
): { lat: number; lng: number } | null {
  if (
    typeof geoLat === 'number' &&
    typeof geoLng === 'number' &&
    Number.isFinite(geoLat) &&
    Number.isFinite(geoLng) &&
    geoLat !== 0 &&
    geoLng !== 0
  ) {
    return { lat: geoLat, lng: geoLng };
  }
  if (EXTRA_VENUE_COORDS[venueName]) {
    return EXTRA_VENUE_COORDS[venueName];
  }
  const lower = venueName.toLowerCase();
  for (const [k, coords] of Object.entries(EXTRA_VENUE_COORDS)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) {
      return coords;
    }
  }
  if (city) {
    const c = CITY_FALLBACK_COORDS[city.toLowerCase().trim()];
    if (c) return c;
  }
  return null;
}

async function fetchWithTimeout(url: string, timeoutMs = 5500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CSHPropertiesEvents/1.0)',
        Accept: 'application/json, text/html;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface EspnTeamDef {
  id: string;
  label: string;
  sportPath: string;
  teamSlug: string;
  teamIdMatch?: string;
  defaultVenue: string;
  city: string;
  state: string;
  ticketFallbackUrl: string;
}

async function fetchEspnTeamHomeGames(
  team: EspnTeamDef,
  windowStart: Date,
  windowEnd: Date
): Promise<{ ok: boolean; events: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[] }> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${team.sportPath}/teams/${team.teamSlug}/schedule`;
    const res = await fetchWithTimeout(url, 5500);
    if (!res.ok) return { ok: false, events: [] };
    const data: any = await res.json();
    const rawList: any[] = data.events || [];
    const results: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[] = [];

    for (const ev of rawList) {
      const evDate = new Date(ev.date);
      if (isNaN(evDate.getTime())) continue;
      if (evDate.getTime() < windowStart.getTime() || evDate.getTime() > windowEnd.getTime()) continue;

      const comp = ev.competitions?.[0];
      if (!comp) continue;

      // Verify this team is the HOME team (so guests only get games hosted locally!)
      const competitors: any[] = comp.competitors || [];
      const ourComp = competitors.find((c) => {
        const abbr = (c.team?.abbreviation || '').toLowerCase();
        const cId = String(c.team?.id || '');
        if (team.teamIdMatch && cId === team.teamIdMatch) return true;
        return abbr === team.teamSlug.toLowerCase();
      });

      const isHome = ourComp ? ourComp.homeAway === 'home' : false;
      const venueObj = comp.venue || {};
      const venueState = (venueObj.address?.state || '').toUpperCase();
      const venueCity = (venueObj.address?.city || team.city).trim();

      if (!isHome && venueState !== team.state.toUpperCase()) {
        continue;
      }

      const venueName = venueObj.fullName || team.defaultVenue;
      const awayComp = competitors.find((c) => c.homeAway === 'away');
      const homeComp = competitors.find((c) => c.homeAway === 'home');
      const matchupTitle =
        ev.name ||
        `${awayComp?.team?.displayName || 'Opponent'} at ${homeComp?.team?.displayName || team.label}`;

      const ticketLink =
        (ev.links || []).find((l: any) => Array.isArray(l.rel) && l.rel.includes('tickets'))?.href ||
        (ev.links || []).find((l: any) => Array.isArray(l.rel) && l.rel.includes('summary'))?.href ||
        team.ticketFallbackUrl;

      const tbdTime = ev.timeValid === false;
      const dateStr = formatDateInTZ(evDate, DEFAULT_TIMEZONE, tbdTime ? 'Time TBA' : undefined);

      results.push({
        id: `espn-${team.id}-${ev.id}`,
        title: `${team.label}: ${matchupTitle}`,
        category: 'Sporting Events',
        date: dateStr,
        rawDate: evDate,
        isoDate: evDate.toISOString(),
        venue: venueName,
        city: venueCity,
        state: venueState || team.state,
        description: `Live official ${team.label} home matchup at ${venueName} in ${venueCity}, ${venueState || team.state}.`,
        ticketUrl: ticketLink,
        source: 'ESPN Official Schedule',
      });
    }

    return { ok: true, events: results };
  } catch {
    return { ok: false, events: [] };
  }
}

interface TribeSourceDef {
  id: string;
  label: string;
  baseUrl: string;
  defaultVenue: string;
  defaultCity: string;
  defaultState: string;
  defaultCategory?: LiveEvent['category'];
  defaultCoords?: { lat: number; lng: number };
  perPage?: number;
}

function classifyTribeCategory(
  title: string,
  description: string,
  catNames: string[],
  source: TribeSourceDef
): LiveEvent['category'] {
  const combined = `${title} ${description} ${catNames.join(' ')}`.toLowerCase();

  if (
    /\b(kids|children|toddler|young sprouts|puppet|frog feeding|homeschool|ride-on train|storytime|paleontology|youth|dino|lego)\b/i.test(
      combined
    )
  ) {
    return 'Kids';
  }
  if (
    /\b(run club|5k|10k|marathon|half marathon|road race|trot)\b/i.test(
      combined
    )
  ) {
    return 'Sporting Events';
  }
  if (
    /\b(jazz|soul|concert|live music|vocalist|band|symphony|theatre|theater|comedy|laser evening|wine|trivia|night|after dark|show|showcase|cinema|film|sing a long|nutcracker|christmas carol)\b/i.test(
      combined
    )
  ) {
    return 'Night Life Entertainments';
  }
  if (source.defaultCategory) {
    return source.defaultCategory;
  }
  return 'Family';
}

async function fetchTribeEventsSource(
  source: TribeSourceDef,
  windowStart: Date,
  windowEnd: Date
): Promise<{
  ok: boolean;
  events: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[];
}> {
  try {
    const startYmd = getDateYMDInTZ(windowStart, DEFAULT_TIMEZONE);
    const endYmd = getDateYMDInTZ(windowEnd, DEFAULT_TIMEZONE);
    const url = `${source.baseUrl}?start_date=${startYmd}&end_date=${endYmd}&per_page=${source.perPage || 35}`;
    const res = await fetchWithTimeout(url, 5500);
    if (!res.ok) return { ok: false, events: [] };
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return { ok: false, events: [] };
    const data: any = await res.json();
    const rawList: any[] = data.events || [];
    const results: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[] = [];
    const titleOccurrenceCount = new Map<string, number>();

    for (const ev of rawList) {
      const cleanTitle = decodeHtml(ev.title);
      if (!cleanTitle) continue;
      // Skip explicitly sold out items
      if (/^sold\s*out\s*:/i.test(cleanTitle)) continue;

      const parsedDate = parseEasternLocalDateTime(ev.start_date || ev.utc_start_date);
      if (!parsedDate) continue;

      // For all-day or multi-day exhibitions whose start_date is before windowStart but end_date is still in window:
      let effectiveDate = parsedDate;
      let isOngoingMultiDay = false;
      if (effectiveDate.getTime() < windowStart.getTime()) {
        const parsedEnd = ev.end_date ? parseEasternLocalDateTime(ev.end_date) : null;
        if (parsedEnd && parsedEnd.getTime() >= windowStart.getTime()) {
          effectiveDate = new Date(windowStart.getTime() + 2 * 60 * 60 * 1000);
          isOngoingMultiDay = true;
        } else {
          continue;
        }
      }

      if (effectiveDate.getTime() > windowEnd.getTime()) continue;

      // Cap daily recurring clones (e.g. Drop-In Garden Tours) to max 2 upcoming entries for variety
      const normalizedTitleKey = cleanTitle.toLowerCase().replace(/\s+/g, ' ').trim();
      const count = titleOccurrenceCount.get(normalizedTitleKey) || 0;
      if (count >= 2) continue;
      titleOccurrenceCount.set(normalizedTitleKey, count + 1);

      const vObj = ev.venue && !Array.isArray(ev.venue) ? ev.venue : null;
      const venueName = decodeHtml(vObj?.venue) || source.defaultVenue;
      const venueCity = decodeHtml(vObj?.city) || source.defaultCity;
      const venueState = decodeHtml(vObj?.stateprovince || vObj?.state) || source.defaultState;
      const geoLat = vObj?.geo_lat ? parseFloat(vObj.geo_lat) : source.defaultCoords?.lat;
      const geoLng = vObj?.geo_lng ? parseFloat(vObj.geo_lng) : source.defaultCoords?.lng;

      const catNames: string[] = (ev.categories || []).map((c: any) => decodeHtml(c?.name || ''));
      const cleanDesc = summarizeText(ev.description || ev.excerpt || `${cleanTitle} at ${venueName}.`);
      const category = classifyTribeCategory(cleanTitle, cleanDesc, catNames, source);
      const isAllDay = ev.all_day === true || /00:00:00$/.test(ev.start_date || '');
      const customTimeLabel = isOngoingMultiDay ? 'Ongoing Exhibit / Run' : isAllDay ? 'All Day Event' : undefined;

      results.push({
        id: `tribe-${source.id}-${ev.id}`,
        title: cleanTitle,
        category,
        date: formatDateInTZ(effectiveDate, DEFAULT_TIMEZONE, customTimeLabel),
        rawDate: effectiveDate,
        isoDate: effectiveDate.toISOString(),
        venue: venueName,
        city: venueCity,
        state: venueState,
        description: cleanDesc || `Live event at ${venueName} in ${venueCity}, ${venueState}.`,
        ticketUrl: ev.url || source.baseUrl,
        source: source.label,
        geo:
          typeof geoLat === 'number' && typeof geoLng === 'number' && !isNaN(geoLat) && !isNaN(geoLng)
            ? { lat: geoLat, lng: geoLng }
            : undefined,
      });
    }

    return { ok: true, events: results };
  } catch {
    return { ok: false, events: [] };
  }
}

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function parseShortDateToken(token: string, refDate: Date): Date | null {
  const cleaned = token.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!m) return null;
  const monthIdx = MONTH_MAP[m[1].toLowerCase()];
  if (monthIdx === undefined) return null;
  const day = parseInt(m[2], 10);
  let year = m[3] ? parseInt(m[3], 10) : refDate.getFullYear();
  // Handle Dec -> Jan rollover when current date is Nov/Dec
  if (!m[3] && refDate.getMonth() >= 10 && monthIdx <= 1) {
    year += 1;
  }
  return new Date(Date.UTC(year, monthIdx, day, 15, 0, 0)); // 10:00 AM EST
}

async function fetchBlueRidgeCalendar(
  windowStart: Date,
  windowEnd: Date
): Promise<{
  ok: boolean;
  events: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[];
}> {
  try {
    const res = await fetchWithTimeout('https://www.blueridgemountains.com/events/', 6000);
    if (!res.ok) return { ok: false, events: [] };
    const html = await res.text();
    const blocks = html.split('class="card__main-wrap"').slice(1);
    const results: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[] = [];

    blocks.forEach((b, idx) => {
      const rawHeading =
        b.match(/card__date-heading[^>]*>([\s\S]*?)<\/p>/i)?.[1]?.replace(/<[^>]+>|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || '';
      const linkMatch = b.match(/card__heading[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch || !rawHeading) return;

      const ticketUrl = linkMatch[1].trim();
      const title = decodeHtml(linkMatch[2]);
      if (!title || title.toLowerCase() === 'sign up') return;

      const parts = rawHeading.split(/[—–-]/).map((p) => p.trim());
      const startDt = parseShortDateToken(parts[0], windowStart);
      if (!startDt) return;
      const endDt = parts[1] ? parseShortDateToken(parts[1], windowStart) || startDt : startDt;

      // Keep if [startDt, endDt] overlaps [windowStart, windowEnd]
      if (endDt.getTime() < windowStart.getTime() || startDt.getTime() > windowEnd.getTime()) {
        return;
      }

      const displayDt = startDt.getTime() < windowStart.getTime() ? new Date(windowStart.getTime() + 3600000) : startDt;
      const lower = title.toLowerCase();
      let category: LiveEvent['category'] = 'Family';
      if (/train|parade|kids|santa/.test(lower)) category = 'Family';
      if (/5k|run|trot/.test(lower)) category = 'Sporting Events';
      if (/music|concert|beer|wine|jazz/.test(lower)) category = 'Night Life Entertainments';

      results.push({
        id: `blueridge-official-${idx}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
        title,
        category,
        date: `${formatDateInTZ(displayDt, DEFAULT_TIMEZONE, rawHeading)}`,
        rawDate: displayDt,
        isoDate: displayDt.toISOString(),
        venue: title.toLowerCase().includes('train')
          ? 'Blue Ridge Scenic Railway'
          : title.toLowerCase().includes('market')
          ? 'Blue Ridge Mountains Arts Association'
          : 'Downtown Blue Ridge',
        city: 'Blue Ridge',
        state: 'GA',
        description: `Official Blue Ridge, Georgia event (${rawHeading}). Discover downtown shopping, mountain festivities, and community celebrations in Fannin County.`,
        ticketUrl,
        source: 'Blue Ridge Mountains Official Calendar',
        geo: { lat: 34.864, lng: -84.3244 },
      });
    });

    return { ok: true, events: results };
  } catch {
    return { ok: false, events: [] };
  }
}

const ATLANTA_ESPN_TEAMS: EspnTeamDef[] = [
  {
    id: 'hawks',
    label: 'Atlanta Hawks (NBA)',
    sportPath: 'basketball/nba',
    teamSlug: 'atl',
    teamIdMatch: '1',
    defaultVenue: 'State Farm Arena',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://www.ticketmaster.com/atlanta-hawks-tickets/artist/805898',
  },
  {
    id: 'falcons',
    label: 'Atlanta Falcons (NFL)',
    sportPath: 'football/nfl',
    teamSlug: 'atl',
    teamIdMatch: '1',
    defaultVenue: 'Mercedes-Benz Stadium',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://www.atlantafalcons.com/tickets/',
  },
  {
    id: 'braves',
    label: 'Atlanta Braves (MLB)',
    sportPath: 'baseball/mlb',
    teamSlug: 'atl',
    teamIdMatch: '15',
    defaultVenue: 'Truist Park',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://www.mlb.com/braves/tickets',
  },
  {
    id: 'dream',
    label: 'Atlanta Dream (WNBA)',
    sportPath: 'basketball/wnba',
    teamSlug: 'atl',
    teamIdMatch: '20',
    defaultVenue: 'Gateway Center Arena',
    city: 'College Park',
    state: 'GA',
    ticketFallbackUrl: 'https://dream.wnba.com/tickets/',
  },
  {
    id: 'atlutd',
    label: 'Atlanta United FC (MLS)',
    sportPath: 'soccer/usa.1',
    teamSlug: '18418',
    teamIdMatch: '18418',
    defaultVenue: 'Mercedes-Benz Stadium',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://www.atlutd.com/tickets/',
  },
  {
    id: 'gt-mbb',
    label: 'Georgia Tech Basketball',
    sportPath: 'basketball/mens-college-basketball',
    teamSlug: '59',
    teamIdMatch: '59',
    defaultVenue: 'McCamish Pavilion',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://ramblinwreck.com/tickets/',
  },
  {
    id: 'gt-cfb',
    label: 'Georgia Tech Football',
    sportPath: 'football/college-football',
    teamSlug: '59',
    teamIdMatch: '59',
    defaultVenue: 'Bobby Dodd Stadium at Historic Grant Field',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://ramblinwreck.com/tickets/',
  },
  {
    id: 'gsu-mbb',
    label: 'Georgia State Basketball',
    sportPath: 'basketball/mens-college-basketball',
    teamSlug: '2247',
    teamIdMatch: '2247',
    defaultVenue: 'GSU Convocation Center',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://georgiastatesports.com/',
  },
  {
    id: 'gsu-cfb',
    label: 'Georgia State Football',
    sportPath: 'football/college-football',
    teamSlug: '2247',
    teamIdMatch: '2247',
    defaultVenue: 'Center Parc Stadium',
    city: 'Atlanta',
    state: 'GA',
    ticketFallbackUrl: 'https://georgiastatesports.com/',
  },
];

const ATLANTA_TRIBE_SOURCES: TribeSourceDef[] = [
  {
    id: 'stjames',
    label: 'St. James Live',
    baseUrl: 'https://stjamesliveatl.com/wp-json/tribe/events/v1/events',
    defaultVenue: 'St. James Live',
    defaultCity: 'Atlanta',
    defaultState: 'GA',
    defaultCategory: 'Night Life Entertainments',
    defaultCoords: { lat: 33.6558, lng: -84.502 },
    perPage: 25,
  },
  {
    id: 'atlantabg',
    label: 'Atlanta Botanical Garden',
    baseUrl: 'https://atlantabg.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Atlanta Botanical Garden',
    defaultCity: 'Atlanta',
    defaultState: 'GA',
    defaultCategory: 'Family',
    defaultCoords: { lat: 33.7905, lng: -84.3732 },
    perPage: 35,
  },
  {
    id: 'ahc',
    label: 'Atlanta History Center',
    baseUrl: 'https://www.atlantahistorycenter.com/wp-json/tribe/events/v1/events',
    defaultVenue: 'Atlanta History Center',
    defaultCity: 'Atlanta',
    defaultState: 'GA',
    defaultCategory: 'Family',
    defaultCoords: { lat: 33.8421, lng: -84.3858 },
    perPage: 20,
  },
  {
    id: 'piedmont',
    label: 'Piedmont Park Conservancy',
    baseUrl: 'https://piedmontpark.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Piedmont Park',
    defaultCity: 'Atlanta',
    defaultState: 'GA',
    defaultCategory: 'Family',
    defaultCoords: { lat: 33.7851, lng: -84.3738 },
    perPage: 20,
  },
  {
    id: 'alliance',
    label: 'Alliance Theatre',
    baseUrl: 'https://www.alliancetheatre.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Alliance Theatre',
    defaultCity: 'Atlanta',
    defaultState: 'GA',
    defaultCategory: 'Night Life Entertainments',
    defaultCoords: { lat: 33.7892, lng: -84.3854 },
    perPage: 15,
  },
  {
    id: 'artsatl',
    label: 'ArtsATL',
    baseUrl: 'https://www.artsatl.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Atlanta Cultural Venues',
    defaultCity: 'Atlanta',
    defaultState: 'GA',
    defaultCategory: 'Night Life Entertainments',
    defaultCoords: { lat: 33.7628, lng: -84.3897 },
    perPage: 25,
  },
  {
    id: 'marietta',
    label: 'Visit Marietta GA',
    baseUrl: 'https://www.visitmariettaga.com/wp-json/tribe/events/v1/events',
    defaultVenue: 'Marietta Square',
    defaultCity: 'Marietta',
    defaultState: 'GA',
    defaultCategory: 'Family',
    defaultCoords: { lat: 33.9526, lng: -84.5499 },
    perPage: 15,
  },
];

const MIAMI_ESPN_TEAMS: EspnTeamDef[] = [
  {
    id: 'heat',
    label: 'Miami Heat (NBA)',
    sportPath: 'basketball/nba',
    teamSlug: 'mia',
    teamIdMatch: '14',
    defaultVenue: 'Kaseya Center',
    city: 'Miami',
    state: 'FL',
    ticketFallbackUrl: 'https://www.nba.com/heat/tickets',
  },
  {
    id: 'dolphins',
    label: 'Miami Dolphins (NFL)',
    sportPath: 'football/nfl',
    teamSlug: 'mia',
    teamIdMatch: '15',
    defaultVenue: 'Hard Rock Stadium',
    city: 'Miami Gardens',
    state: 'FL',
    ticketFallbackUrl: 'https://www.miamidolphins.com/tickets/',
  },
  {
    id: 'panthers',
    label: 'Florida Panthers (NHL)',
    sportPath: 'hockey/nhl',
    teamSlug: 'fla',
    teamIdMatch: '26',
    defaultVenue: 'Amerant Bank Arena',
    city: 'Sunrise',
    state: 'FL',
    ticketFallbackUrl: 'https://www.nhl.com/panthers/tickets',
  },
  {
    id: 'marlins',
    label: 'Miami Marlins (MLB)',
    sportPath: 'baseball/mlb',
    teamSlug: 'mia',
    teamIdMatch: '28',
    defaultVenue: 'loanDepot park',
    city: 'Miami',
    state: 'FL',
    ticketFallbackUrl: 'https://www.mlb.com/marlins/tickets',
  },
  {
    id: 'intermiami',
    label: 'Inter Miami CF (MLS)',
    sportPath: 'soccer/usa.1',
    teamSlug: '20232',
    teamIdMatch: '20232',
    defaultVenue: 'Chase Stadium',
    city: 'Fort Lauderdale',
    state: 'FL',
    ticketFallbackUrl: 'https://www.intermiamicf.com/tickets/',
  },
  {
    id: 'hurricanes-mbb',
    label: 'Miami Hurricanes Basketball',
    sportPath: 'basketball/mens-college-basketball',
    teamSlug: '2390',
    teamIdMatch: '2390',
    defaultVenue: 'Watsco Center',
    city: 'Coral Gables',
    state: 'FL',
    ticketFallbackUrl: 'https://miamihurricanes.com/tickets/',
  },
  {
    id: 'hurricanes-cfb',
    label: 'Miami Hurricanes Football',
    sportPath: 'football/college-football',
    teamSlug: '2390',
    teamIdMatch: '2390',
    defaultVenue: 'Hard Rock Stadium',
    city: 'Miami Gardens',
    state: 'FL',
    ticketFallbackUrl: 'https://miamihurricanes.com/tickets/',
  },
  {
    id: 'fiu-mbb',
    label: 'FIU Panthers Basketball',
    sportPath: 'basketball/mens-college-basketball',
    teamSlug: '2229',
    teamIdMatch: '2229',
    defaultVenue: 'Ocean Bank Convocation Center',
    city: 'Miami',
    state: 'FL',
    ticketFallbackUrl: 'https://fiusports.com/',
  },
];

const MIAMI_TRIBE_SOURCES: TribeSourceDef[] = [
  {
    id: 'frostscience',
    label: 'Frost Science Museum',
    baseUrl: 'https://www.frostscience.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Phillip and Patricia Frost Museum of Science',
    defaultCity: 'Miami',
    defaultState: 'FL',
    defaultCategory: 'Kids',
    defaultCoords: { lat: 25.7854, lng: -80.1887 },
    perPage: 25,
  },
  {
    id: 'historymiami',
    label: 'HistoryMiami Museum',
    baseUrl: 'https://historymiami.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'HistoryMiami Museum',
    defaultCity: 'Miami',
    defaultState: 'FL',
    defaultCategory: 'Family',
    defaultCoords: { lat: 25.7747, lng: -80.1945 },
    perPage: 20,
  },
  {
    id: 'coralgables',
    label: 'Coral Gables Museum',
    baseUrl: 'https://coralgablesmuseum.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Coral Gables Museum',
    defaultCity: 'Coral Gables',
    defaultState: 'FL',
    defaultCategory: 'Night Life Entertainments',
    defaultCoords: { lat: 25.7495, lng: -80.2584 },
    perPage: 20,
  },
];

const BLUERIDGE_TRIBE_SOURCES: TribeSourceDef[] = [
  {
    id: 'gainesville',
    label: 'Explore Gainesville / North GA',
    baseUrl: 'https://www.exploregainesville.org/wp-json/tribe/events/v1/events',
    defaultVenue: 'Gainesville Arts & Gardens',
    defaultCity: 'Gainesville',
    defaultState: 'GA',
    defaultCategory: 'Family',
    defaultCoords: { lat: 34.2979, lng: -83.8241 },
    perPage: 25,
  },
];

const BLUERIDGE_ESPN_TEAMS: EspnTeamDef[] = [
  {
    id: 'utc-mbb',
    label: 'Chattanooga Mocs Basketball',
    sportPath: 'basketball/mens-college-basketball',
    teamSlug: '236',
    teamIdMatch: '236',
    defaultVenue: 'McKenzie Arena',
    city: 'Chattanooga',
    state: 'TN',
    ticketFallbackUrl: 'https://gomocs.com/tickets',
  },
];

function determineRegion(req: LiveEventsRequest): 'atlanta' | 'miami' | 'blueridge' {
  const combined = `${req.propertyId || ''} ${req.propertyName || ''} ${req.city || ''} ${req.state || ''}`.toLowerCase();
  if (combined.includes('miami') || combined.includes('oceanview') || combined.includes('fl')) {
    return 'miami';
  }
  if (combined.includes('blue ridge') || combined.includes('mountain retreat') || combined.includes('cabin')) {
    return 'blueridge';
  }
  return 'atlanta';
}

export async function getLiveLocalEvents(req: LiveEventsRequest): Promise<LiveEventsResponse> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000); // Include events starting within current day/evening
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const region = determineRegion(req);
  const originLat = typeof req.lat === 'number' && Number.isFinite(req.lat) ? req.lat : region === 'miami' ? 25.7825 : region === 'blueridge' ? 34.864 : 33.6823;
  const originLng = typeof req.lng === 'number' && Number.isFinite(req.lng) ? req.lng : region === 'miami' ? -80.134 : region === 'blueridge' ? -84.324 : -84.5262;
  const propLabel = req.propertyName || (region === 'miami' ? 'Oceanview Villa' : region === 'blueridge' ? 'Mountain Retreat' : 'Stonewall Villa');

  let rawEvents: (Omit<LiveEvent, 'distance' | 'distanceMiles'> & { geo?: { lat: number; lng: number } })[] = [];
  let sourcesChecked: string[] = [];

  const cached = regionCache.get(region);
  if (!req.forceRefresh && cached && cached.expiresAt > Date.now()) {
    rawEvents = cached.rawEvents;
    sourcesChecked = cached.sourcesChecked;
  } else {
    const tasks: Promise<{ label: string; ok: boolean; events: any[] }>[] = [];

    if (region === 'atlanta') {
      for (const t of ATLANTA_ESPN_TEAMS) {
        tasks.push(fetchEspnTeamHomeGames(t, windowStart, windowEnd).then((r) => ({ label: t.label, ...r })));
      }
      for (const s of ATLANTA_TRIBE_SOURCES) {
        tasks.push(fetchTribeEventsSource(s, windowStart, windowEnd).then((r) => ({ label: s.label, ...r })));
      }
    } else if (region === 'miami') {
      for (const t of MIAMI_ESPN_TEAMS) {
        tasks.push(fetchEspnTeamHomeGames(t, windowStart, windowEnd).then((r) => ({ label: t.label, ...r })));
      }
      for (const s of MIAMI_TRIBE_SOURCES) {
        tasks.push(fetchTribeEventsSource(s, windowStart, windowEnd).then((r) => ({ label: s.label, ...r })));
      }
    } else {
      tasks.push(
        fetchBlueRidgeCalendar(windowStart, windowEnd).then((r) => ({
          label: 'Blue Ridge Official Calendar',
          ...r,
        }))
      );
      for (const s of BLUERIDGE_TRIBE_SOURCES) {
        tasks.push(fetchTribeEventsSource(s, windowStart, windowEnd).then((r) => ({ label: s.label, ...r })));
      }
      for (const t of BLUERIDGE_ESPN_TEAMS) {
        tasks.push(fetchEspnTeamHomeGames(t, windowStart, windowEnd).then((r) => ({ label: t.label, ...r })));
      }
    }

    const settled = await Promise.all(tasks);
    sourcesChecked = settled.filter((s) => s.ok).map((s) => s.label);
    const seenIds = new Set<string>();
    for (const batch of settled) {
      for (const ev of batch.events) {
        if (!seenIds.has(ev.id)) {
          seenIds.add(ev.id);
          rawEvents.push(ev);
        }
      }
    }

    if (rawEvents.length > 0) {
      regionCache.set(region, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        sourcesChecked,
        rawEvents,
      });
    }
  }

  // Enrich with accurate Haversine distances relative to selected property coordinates
  const enriched: LiveEvent[] = rawEvents
    .filter((ev) => {
      const t = new Date(ev.isoDate).getTime();
      return t >= windowStart.getTime() && t <= windowEnd.getTime();
    })
    .map((ev) => {
      const coords = resolveVenueCoords(ev.venue, ev.city, ev.geo?.lat, ev.geo?.lng);
      const miles = coords ? calculateHaversineMiles(originLat, originLng, coords.lat, coords.lng) : 12.0;
      const distance = `${miles} mi from ${propLabel}`;
      return {
        id: ev.id,
        title: ev.title,
        category: ev.category,
        date: ev.date,
        rawDate: new Date(ev.isoDate),
        isoDate: ev.isoDate,
        description: ev.description,
        ticketUrl: ev.ticketUrl,
        venue: ev.venue,
        city: ev.city,
        state: ev.state,
        distance,
        distanceMiles: miles,
        source: ev.source,
      };
    })
    .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

  return {
    success: true,
    region,
    windowStart: now.toISOString(),
    windowEnd: windowEnd.toISOString(),
    refreshedAt: now.toISOString(),
    totalCount: enriched.length,
    sourcesChecked,
    events: enriched,
  };
}
