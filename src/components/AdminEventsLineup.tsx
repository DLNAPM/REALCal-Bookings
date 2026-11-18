import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Download,
  Printer,
  Mail,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  Check,
  Loader2,
  Users,
  Send,
  AlertCircle,
  CheckCircle2,
  MapPin
} from 'lucide-react';
import { Booking, Property } from '../types';
import { EventItem, fetchLiveEventsForProperty } from '../data/events';
import { KNOWN_PROPERTY_PROFILES, resolvePropertyProfile } from '../data/propertyLocations';
import { cn } from '../lib/utils';

interface AdminEventsLineupProps {
  currentUser: { email?: string; displayName?: string; role?: string } | null;
  bookings: Booking[];
  properties: Property[];
  defaultContactPhone?: string;
}

type LineupCategoryKey = 'sports' | 'nightlife' | 'family' | 'kids';

interface LineupCategoryDef {
  key: LineupCategoryKey;
  number: string;
  label: string;
  sourceCategory: EventItem['category'];
}

const LINEUP_CATEGORIES: LineupCategoryDef[] = [
  { key: 'sports', number: '01', label: 'Sports', sourceCategory: 'Sporting Events' },
  { key: 'nightlife', number: '02', label: 'Nightlife & Concerts', sourceCategory: 'Night Life Entertainments' },
  { key: 'family', number: '03', label: 'Family', sourceCategory: 'Family' },
  { key: 'kids', number: '04', label: 'Kids', sourceCategory: 'Kids' },
];

interface BookedGuestRecipient {
  key: string;
  bookingId: string;
  bookingRef: string;
  name: string;
  email: string;
  phone: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  stayStatus: 'In-House Now' | 'Upcoming Stay' | 'Recent Stay';
}

const formatPhoneDisplay = (raw?: string, fallback = '404-910-3194'): string => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return fallback;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  return trimmed;
};

export const AdminEventsLineup: React.FC<AdminEventsLineupProps> = ({
  currentUser,
  bookings,
  properties,
  defaultContactPhone,
}) => {
  // Property edition choices (Firestore properties + known profiles)
  const propertyOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; city: string; state: string; lat: number; lng: number }>();
    properties.forEach((p) => {
      const prof = resolvePropertyProfile({ id: p.id, name: p.name, location: p.location });
      map.set(p.id, {
        id: p.id,
        name: p.name || prof.name,
        city: prof.city,
        state: prof.state,
        lat: prof.lat,
        lng: prof.lng,
      });
    });
    KNOWN_PROPERTY_PROFILES.forEach((prof) => {
      if (!map.has(prof.id)) {
        map.set(prof.id, {
          id: prof.id,
          name: prof.name,
          city: prof.city,
          state: prof.state,
          lat: prof.lat,
          lng: prof.lng,
        });
      }
    });
    return Array.from(map.values());
  }, [properties]);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    const sw = propertyOptions.find((p) => p.name.toLowerCase().includes('stonewall'));
    return sw?.id || propertyOptions[0]?.id || 'stonewall-villa';
  });

  const activeProperty = useMemo(
    () => propertyOptions.find((p) => p.id === selectedPropertyId) || propertyOptions[0],
    [propertyOptions, selectedPropertyId]
  );

  // Live events & loading state
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState<Date>(() => new Date());
  const [windowEnd, setWindowEnd] = useState<Date>(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [maxRadiusMiles, setMaxRadiusMiles] = useState<number>(45);
  const [excludedEventIds, setExcludedEventIds] = useState<Set<string>>(new Set());
  const [activeCategoryFocus, setActiveCategoryFocus] = useState<'all' | LineupCategoryKey>('all');

  // Publication customization state
  const [showCustomize, setShowCustomize] = useState<boolean>(false);
  const [editionTitle, setEditionTitle] = useState<string>('THE EVENTS LINEUP');
  const [introNote, setIntroNote] = useState<string>(
    'Welcome to your C&SH Concierge Edition Events LineUp. Below is our curated calendar for the next 30 days divided into Sports, Nightlife & Concerts, Family, and Kids entertainment near your residence.'
  );

  // Delivery / Modal states
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [includeRecentGuests, setIncludeRecentGuests] = useState<boolean>(false);
  const [selectedRecipientKeys, setSelectedRecipientKeys] = useState<Set<string>>(new Set());
  const [customRecipientEmail, setCustomRecipientEmail] = useState<string>('');
  const [customRecipientPhone, setCustomRecipientPhone] = useState<string>('');
  const [customRecipientName, setCustomRecipientName] = useState<string>('');

  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailCc, setEmailCc] = useState<string>('candsh@cashgroupproperties.com');
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);

  const [showSmsModal, setShowSmsModal] = useState<boolean>(false);
  const [smsCustomNote, setSmsCustomNote] = useState<string>('');
  const [sendingSms, setSendingSms] = useState<boolean>(false);

  const conciergePhone = useMemo(
    () => formatPhoneDisplay(defaultContactPhone, '404-910-3194'),
    [defaultContactPhone]
  );

  const adminHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-user-email': currentUser?.email || 'dlaniger.napm.consulting@gmail.com',
      'x-user-role': currentUser?.role || 'admin',
    }),
    [currentUser]
  );

  const loadEvents = async (forceRefresh = false) => {
    if (!activeProperty) return;
    setLoadingEvents(true);
    setEventsError(null);
    try {
      const res = await fetchLiveEventsForProperty({
        propertyId: activeProperty.id,
        propertyName: activeProperty.name,
        city: activeProperty.city,
        state: activeProperty.state,
        lat: activeProperty.lat,
        lng: activeProperty.lng,
        forceRefresh,
      });
      setEvents(res.events || []);
      setWindowStart(res.windowStart);
      setWindowEnd(res.windowEnd);
    } catch (err: any) {
      setEventsError(err.message || 'Unable to load live events for Events LineUp.');
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents(false);
  }, [selectedPropertyId]);

  const windowLabel = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${windowStart.toLocaleDateString('en-US', opts)} – ${windowEnd.toLocaleDateString('en-US', opts)}`;
  }, [windowStart, windowEnd]);

  // All events filtered by radius
  const radiusFilteredEvents = useMemo(() => {
    if (maxRadiusMiles >= 999) return events;
    return events.filter((ev) => (ev.distanceMiles ?? 12) <= maxRadiusMiles);
  }, [events, maxRadiusMiles]);

  // Events grouped strictly into the 4 requested categories
  const categorizedAll = useMemo(() => {
    const groups: Record<LineupCategoryKey, EventItem[]> = {
      sports: [],
      nightlife: [],
      family: [],
      kids: [],
    };
    radiusFilteredEvents.forEach((ev) => {
      if (ev.category === 'Sporting Events') groups.sports.push(ev);
      else if (ev.category === 'Night Life Entertainments') groups.nightlife.push(ev);
      else if (ev.category === 'Kids') groups.kids.push(ev);
      else groups.family.push(ev);
    });
    return groups;
  }, [radiusFilteredEvents]);

  // Active events included in publication output (Download / Print / Email / Text)
  const categorizedPublished = useMemo(() => {
    const filterIncluded = (list: EventItem[]) =>
      list.filter((ev) => !excludedEventIds.has(ev.id)).slice(0, 12);
    return {
      sports: filterIncluded(categorizedAll.sports),
      nightlife: filterIncluded(categorizedAll.nightlife),
      family: filterIncluded(categorizedAll.family),
      kids: filterIncluded(categorizedAll.kids),
    };
  }, [categorizedAll, excludedEventIds]);

  const totalPublishedCount =
    categorizedPublished.sports.length +
    categorizedPublished.nightlife.length +
    categorizedPublished.family.length +
    categorizedPublished.kids.length;

  // Derive Current Booked Guests cleanly from bookings
  const currentBookedGuests = useMemo<BookedGuestRecipient[]>(() => {
    const todayYMD = new Date().toISOString().split('T')[0];
    const items: BookedGuestRecipient[] = [];
    const seen = new Set<string>();

    bookings.forEach((b) => {
      if (!b || b.status === 'cancelled' || b.deletedByGuest) return;
      const checkOut = String(b.checkOut || '').trim();
      const checkIn = String(b.checkIn || '').trim();
      const isCurrentOrUpcoming = !checkOut || checkOut >= todayYMD;
      if (!isCurrentOrUpcoming && !includeRecentGuests) return;

      const email = String(b.guestEmail || b.invoiceDetails?.guestEmail || '').trim();
      const phone = String(b.guestPhone || b.invoiceDetails?.guestPhone || '').trim();
      if (!email && !phone) return;

      const name = String(b.guestName || b.invoiceDetails?.guestName || 'Guest').trim();
      const dedupeKey = `${email.toLowerCase()}|${phone.replace(/\D/g, '')}|${b.id}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const propMatch = properties.find((p) => p.id === b.propertyId);
      const stayStatus: BookedGuestRecipient['stayStatus'] =
        checkIn && checkOut && checkIn <= todayYMD && checkOut >= todayYMD
          ? 'In-House Now'
          : isCurrentOrUpcoming
          ? 'Upcoming Stay'
          : 'Recent Stay';

      items.push({
        key: b.id,
        bookingId: b.id,
        bookingRef: b.bookingRef || b.id.substring(0, 8).toUpperCase(),
        name,
        email,
        phone,
        propertyName: b.propertyName || propMatch?.name || 'C&SH Property',
        checkIn,
        checkOut,
        stayStatus,
      });
    });

    return items.sort((a, b) => {
      const rank = { 'In-House Now': 0, 'Upcoming Stay': 1, 'Recent Stay': 2 };
      return rank[a.stayStatus] - rank[b.stayStatus];
    });
  }, [bookings, properties, includeRecentGuests]);

  // Select all current booked guests by default when modal opens or guest list refreshes
  const selectAllAvailableGuests = (mode: 'email' | 'sms') => {
    const keys = new Set<string>();
    currentBookedGuests.forEach((g) => {
      if (mode === 'email' && g.email) keys.add(g.key);
      if (mode === 'sms' && g.phone) keys.add(g.key);
    });
    setSelectedRecipientKeys(keys);
  };

  const toggleEventIncluded = (eventId: string) => {
    setExcludedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const buildPublicationPayload = () => ({
    id: `lineup-${activeProperty?.id || 'prop'}-${new Date().toISOString().split('T')[0]}`,
    editionTitle: editionTitle.trim() || 'THE EVENTS LINEUP',
    editionSubtitle: `C&SH Group Properties, LLC · ${activeProperty?.city || 'Atlanta'}, ${activeProperty?.state || 'GA'}`,
    propertyName: activeProperty?.name || 'Stonewall Villa',
    windowLabel,
    introNote: introNote.trim(),
    leadershipPhone: conciergePhone,
    leadershipEmail: 'candsh@cashgroupproperties.com',
    categories: {
      sports: categorizedPublished.sports.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        venue: ev.venue,
        distance: ev.distance,
        description: ev.description,
        ticketUrl: ev.ticketUrl,
      })),
      nightlife: categorizedPublished.nightlife.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        venue: ev.venue,
        distance: ev.distance,
        description: ev.description,
        ticketUrl: ev.ticketUrl,
      })),
      family: categorizedPublished.family.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        venue: ev.venue,
        distance: ev.distance,
        description: ev.description,
        ticketUrl: ev.ticketUrl,
      })),
      kids: categorizedPublished.kids.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        venue: ev.venue,
        distance: ev.distance,
        description: ev.description,
        ticketUrl: ev.ticketUrl,
      })),
    },
  });

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    setFeedback(null);
    try {
      const publication = buildPublicationPayload();
      const res = await fetch('/api/events-lineup/pdf', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ publication }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate Events LineUp PDF.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const safeProp = (publication.propertyName || 'Property').replace(/[^a-zA-Z0-9_-]/g, '-');
      const link = document.createElement('a');
      link.href = url;
      link.download = `Events-LineUp-${safeProp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setFeedback({
        type: 'success',
        message: `Downloaded Events LineUp PDF (Events-LineUp-${safeProp}.pdf).`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const buildPrintableHtml = (): string => {
    const pub = buildPublicationPayload();
    const sectionsHtml = LINEUP_CATEGORIES.map((cat) => {
      const items = (pub.categories as any)[cat.key] || [];
      const rows =
        items.length === 0
          ? `<p style="font-size:12px; color:#64748b; font-style:italic; padding:8px 0;">No ${cat.label.toLowerCase()} listings scheduled in this window.</p>`
          : items
              .map(
                (ev: any) => `
          <div style="padding:10px 0; border-bottom:1px solid #e2e8f0; page-break-inside:avoid;">
            <div style="font-size:13.5px; font-weight:700; color:#0f172a;">${ev.title}</div>
            <div style="font-size:11px; font-weight:600; color:#1d4ed8; margin-top:2px;">
              ${[ev.date, ev.venue, ev.distance].filter(Boolean).join(' &middot; ')}
            </div>
            ${ev.description ? `<div style="font-size:11.5px; color:#334155; margin-top:3px; line-height:1.45;">${ev.description}</div>` : ''}
            ${ev.ticketUrl ? `<div style="font-size:11px; color:#0b192c; margin-top:3px;">Tickets &amp; Info: ${ev.ticketUrl}</div>` : ''}
          </div>`
              )
              .join('');

      return `
        <div style="margin-top:20px; page-break-inside:auto;">
          <div style="background:#f1f5f9; border-top:2px solid #0b192c; border-bottom:1px solid #cbd5e1; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:800; color:#0b192c; letter-spacing:0.04em;">${cat.number}. ${cat.label.toUpperCase()}</span>
            <span style="font-size:11px; color:#475569;">${items.length} Event${items.length === 1 ? '' : 's'}</span>
          </div>
          ${rows}
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${pub.editionTitle} — ${pub.propertyName}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 16px; background: #fff; }
    .masthead { background: #0b192c; color: #fff; border-top: 5px solid #c9a86a; padding: 22px 26px; border-radius: 6px; }
    .kicker { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a86a; font-weight: 700; }
    .title { font-family: Georgia, serif; font-size: 28px; font-weight: 700; margin: 4px 0; color: #fff; }
    .sub { font-size: 12px; color: #cbd5e1; }
    .intro { font-family: Georgia, serif; font-size: 13.5px; line-height: 1.6; color: #334155; margin: 16px 0; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="masthead">
    <div class="kicker">C&amp;SH Group Properties, LLC &middot; Guest Concierge Publication</div>
    <div class="title">${pub.editionTitle}</div>
    <div class="sub">${pub.propertyName} &middot; ${pub.windowLabel} &middot; Sports &middot; Nightlife &amp; Concerts &middot; Family &middot; Kids</div>
  </div>
  ${pub.introNote ? `<p class="intro">${pub.introNote}</p>` : ''}
  ${sectionsHtml}
  <div class="footer">
    Housing Management &middot; C&amp;SH Group Properties, LLC &middot; E:${pub.leadershipEmail} &middot; P:${pub.leadershipPhone}
  </div>
</body>
</html>`;
  };

  const handlePrint = () => {
    const html = buildPrintableHtml();
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const docRef = iframe.contentWindow?.document;
      if (docRef) {
        docRef.open();
        docRef.write(html);
        docRef.close();
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (iframe.parentNode) document.body.removeChild(iframe);
          }, 1500);
        }, 250);
        return;
      }
    } catch (err) {
      console.warn('[EventsLineup] Iframe print fallback:', err);
    }
    window.print();
  };

  const openEmailModal = () => {
    selectAllAvailableGuests('email');
    setEmailCc('candsh@cashgroupproperties.com');
    setEmailSubject(`${editionTitle || 'THE EVENTS LINEUP'} — ${activeProperty?.name || 'Stonewall Villa'} (${windowLabel})`);
    setShowEmailModal(true);
  };

  const openSmsModal = () => {
    selectAllAvailableGuests('sms');
    setSmsCustomNote('');
    setShowSmsModal(true);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients: { name: string; email: string }[] = currentBookedGuests
      .filter((g) => selectedRecipientKeys.has(g.key) && g.email)
      .map((g) => ({ name: g.name, email: g.email }));

    if (customRecipientEmail.trim()) {
      recipients.push({
        name: customRecipientName.trim() || 'Guest',
        email: customRecipientEmail.trim(),
      });
    }

    if (recipients.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Select at least one booked guest or enter an email address.',
      });
      return;
    }

    setSendingEmail(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/events-lineup/send-email', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          publication: buildPublicationPayload(),
          recipients,
          cc: emailCc.trim(),
          subject: emailSubject.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to email Events LineUp.');
      }
      setShowEmailModal(false);
      setCustomRecipientEmail('');
      setCustomRecipientName('');
      setFeedback({ type: 'success', message: data.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients: { name: string; phone: string }[] = currentBookedGuests
      .filter((g) => selectedRecipientKeys.has(g.key) && g.phone)
      .map((g) => ({ name: g.name, phone: g.phone }));

    if (customRecipientPhone.trim()) {
      recipients.push({
        name: customRecipientName.trim() || 'Guest',
        phone: customRecipientPhone.trim(),
      });
    }

    if (recipients.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Select at least one booked guest or enter a valid phone number.',
      });
      return;
    }

    setSendingSms(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/events-lineup/send-sms', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          publication: buildPublicationPayload(),
          recipients,
          customMessage: smsCustomNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send Events LineUp SMS/PDF.');
      }
      setShowSmsModal(false);
      setCustomRecipientPhone('');
      setCustomRecipientName('');
      setFeedback({ type: 'success', message: data.message });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSendingSms(false);
    }
  };

  const visibleCategories = useMemo(
    () =>
      activeCategoryFocus === 'all'
        ? LINEUP_CATEGORIES
        : LINEUP_CATEGORIES.filter((c) => c.key === activeCategoryFocus),
    [activeCategoryFocus]
  );

  return (
    <section
      id="admin-events-lineup-section"
      className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 mt-8 space-y-6"
    >
      {/* Top Studio Header & Distribution Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Calendar size={22} className="text-[#0b192c]" />
            <span>Events LineUp Publication</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            AMEX-inspired concierge publication divided into Sports, Nightlife &amp; Concerts, Family, and Kids for Current Booked Guests ({currentBookedGuests.length} active guest{currentBookedGuests.length === 1 ? '' : 's'}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loadingEvents}
            className="px-4 py-2 bg-[#0b192c] hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loadingEvents}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Printer size={14} />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={openEmailModal}
            disabled={loadingEvents}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Mail size={14} />
            <span>Email Guests</span>
          </button>

          <button
            type="button"
            onClick={openSmsModal}
            disabled={loadingEvents}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <MessageSquare size={14} />
            <span>Text Guests (PDF)</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={cn(
            'px-4 py-3 rounded-2xl border text-xs font-medium flex items-start gap-2.5',
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          )}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
          )}
          <div className="flex-1">{feedback.message}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Property Edition, Radius, Category Switch & Customize Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="lineup-property" className="sr-only">
              Property Edition
            </label>
            <select
              id="lineup-property"
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="border border-slate-300 bg-white rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.city}, {p.state})
                </option>
              ))}
            </select>
          </div>

          <select
            aria-label="Distance Radius"
            value={maxRadiusMiles}
            onChange={(e) => setMaxRadiusMiles(Number(e.target.value))}
            className="border border-slate-300 bg-white rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={15}>Within 15 miles</option>
            <option value={35}>Within 35 miles</option>
            <option value={45}>Within 45 miles</option>
            <option value={999}>All metro distances</option>
          </select>

          <button
            type="button"
            onClick={() => loadEvents(true)}
            disabled={loadingEvents}
            className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loadingEvents && 'animate-spin')} />
            <span>{loadingEvents ? 'Refreshing...' : 'Refresh Events'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCustomize((v) => !v)}
            className={cn(
              'px-3 py-2 border text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer',
              showCustomize
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            )}
          >
            <SlidersHorizontal size={13} />
            <span>Customize Copy</span>
          </button>
        </div>

        {/* Category Segmented Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveCategoryFocus('all')}
            className={cn(
              'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer',
              activeCategoryFocus === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            All 4 ({totalPublishedCount})
          </button>
          {LINEUP_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategoryFocus(c.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer',
                activeCategoryFocus === c.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {c.label} ({categorizedPublished[c.key].length})
            </button>
          ))}
        </div>
      </div>

      {/* Collapsible Edition Copy Customization */}
      {showCustomize && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Publication Title</label>
            <input
              type="text"
              value={editionTitle}
              onChange={(e) => setEditionTitle(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white font-semibold"
            />
          </div>
          <div className="md:col-span-2">
            <label className="font-bold text-slate-700 block mb-1">Guest Welcome Intro</label>
            <input
              type="text"
              value={introNote}
              onChange={(e) => setIntroNote(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white"
            />
          </div>
        </div>
      )}

      {/* AMEX EVENTS LINEUP EDITORIAL PUBLICATION CANVAS */}
      {eventsError ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between">
          <span>{eventsError}</span>
          <button
            type="button"
            onClick={() => loadEvents(true)}
            className="px-3 py-1.5 bg-rose-700 text-white font-bold rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <article className="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-xs">
          {/* Midnight Navy & Champagne Gold AMEX-Style Masthead */}
          <header className="bg-[#0b192c] border-t-4 border-[#c9a86a] px-6 sm:px-10 py-8 text-white">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#c9a86a]">
                  C&amp;SH Group Properties, LLC &middot; Guest Concierge Guide
                </p>
                <h3 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white mt-1.5">
                  {editionTitle || 'THE EVENTS LINEUP'}
                </h3>
                <div className="text-xs sm:text-sm text-slate-300 mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-semibold text-white">{activeProperty?.name}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span className="font-mono tabular-nums">{windowLabel}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>Sports &middot; Nightlife &amp; Concerts &middot; Family &middot; Kids</span>
                </div>
              </div>
              <div className="md:text-right text-xs text-slate-300 space-y-0.5 shrink-0">
                <div className="font-semibold text-white">Concierge Desk</div>
                <div>E: candsh@cashgroupproperties.com</div>
                <div className="font-mono tabular-nums">P: {conciergePhone}</div>
              </div>
            </div>
          </header>

          {/* Editorial Welcome & Category Sections */}
          <div className="px-6 sm:px-10 py-8 space-y-8">
            {introNote.trim() && (
              <p className="font-serif text-sm sm:text-base text-slate-700 leading-relaxed max-w-4xl border-b border-slate-200 pb-6">
                {introNote}
              </p>
            )}

            {loadingEvents ? (
              <div className="py-14 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <Loader2 size={22} className="animate-spin text-[#0b192c]" />
                <span>Curating live upcoming events (today – 30 days) across all 4 categories...</span>
              </div>
            ) : (
              <div
                className={cn(
                  'grid gap-8',
                  visibleCategories.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
                )}
              >
                {visibleCategories.map((cat) => {
                  const rawList = categorizedAll[cat.key];
                  const displayList = rawList.slice(0, 12);
                  const includedCount = displayList.filter((ev) => !excludedEventIds.has(ev.id)).length;

                  return (
                    <section key={cat.key} className="space-y-4">
                      {/* Editorial Category Masthead Rule */}
                      <div className="border-t-2 border-[#0b192c] border-b border-slate-300 bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                        <h4 className="text-sm font-extrabold tracking-wide text-[#0b192c] uppercase">
                          {cat.number}. {cat.label}
                        </h4>
                        <span className="text-xs font-mono tabular-nums text-slate-600">
                          {includedCount} / {displayList.length} Included
                        </span>
                      </div>

                      {displayList.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-4 px-1">
                          No {cat.label.toLowerCase()} events found within {maxRadiusMiles} miles for this 30-day window. Try expanding the distance filter above.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-200">
                          {displayList.map((ev) => {
                            const isIncluded = !excludedEventIds.has(ev.id);
                            return (
                              <div
                                key={ev.id}
                                className={cn(
                                  'py-3.5 px-1 transition-opacity flex items-start gap-3',
                                  !isIncluded && 'opacity-45'
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleEventIncluded(ev.id)}
                                  title={
                                    isIncluded
                                      ? 'Included in PDF/Email/Text publication (click to exclude)'
                                      : 'Excluded from publication (click to include)'
                                  }
                                  className={cn(
                                    'mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors',
                                    isIncluded
                                      ? 'bg-[#0b192c] border-[#0b192c] text-white'
                                      : 'bg-white border-slate-300 text-transparent hover:border-slate-500'
                                  )}
                                >
                                  <Check size={12} />
                                </button>

                                <div className="flex-1 min-w-0">
                                  <h5 className="text-sm font-bold text-slate-900 leading-snug">
                                    {ev.title}
                                  </h5>
                                  <div className="text-xs text-blue-800 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <span>{ev.date}</span>
                                    <span aria-hidden="true">&middot;</span>
                                    <span>{ev.venue}</span>
                                    {ev.distance && (
                                      <>
                                        <span aria-hidden="true">&middot;</span>
                                        <span className="font-mono tabular-nums text-slate-600 inline-flex items-center gap-0.5">
                                          <MapPin size={11} />
                                          {ev.distance}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  {ev.description && (
                                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed line-clamp-2">
                                      {ev.description}
                                    </p>
                                  )}
                                  {ev.ticketUrl && (
                                    <a
                                      href={ev.ticketUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0b192c] hover:underline mt-1.5"
                                    >
                                      <span>Tickets &amp; Event Details</span>
                                      <ExternalLink size={11} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          <footer className="bg-slate-50 border-t border-slate-200 px-6 sm:px-10 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs text-slate-600">
            <span>
              Published by <strong>Housing Management</strong> &middot; C&amp;SH Group Properties, LLC
            </span>
            <span className="font-mono tabular-nums">
              {totalPublishedCount} curated events across 4 categories &middot; {windowLabel}
            </span>
          </footer>
        </article>
      )}

      {/* Email Events LineUp to Current Booked Guests Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Mail size={16} className="text-indigo-600" />
                Email Events LineUp to Current Booked Guests
              </h4>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Users size={14} className="text-indigo-600" />
                  Current Booked Guests ({currentBookedGuests.filter((g) => g.email).length} with email)
                </span>
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRecentGuests}
                    onChange={(e) => setIncludeRecentGuests(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Include past stays</span>
                </label>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-slate-50/50">
                {currentBookedGuests.filter((g) => g.email).length === 0 ? (
                  <div className="p-4 text-center text-slate-500">
                    No active booked guests with email addresses found. Add an email below to send directly.
                  </div>
                ) : (
                  currentBookedGuests
                    .filter((g) => g.email)
                    .map((g) => (
                      <label
                        key={g.key}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedRecipientKeys.has(g.key)}
                            onChange={(e) => {
                              setSelectedRecipientKeys((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(g.key);
                                else next.delete(g.key);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {g.name} &middot; <span className="text-indigo-700 font-normal">{g.stayStatus}</span>
                            </div>
                            <div className="text-slate-500 truncate">
                              {g.email} &middot; {g.propertyName} ({g.checkIn} to {g.checkOut})
                            </div>
                          </div>
                        </div>
                      </label>
                    ))
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Add Guest Name (Optional)</label>
                  <input
                    type="text"
                    value={customRecipientName}
                    onChange={(e) => setCustomRecipientName(e.target.value)}
                    placeholder="Guest Name"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Add Guest Email (Optional)</label>
                  <input
                    type="email"
                    value={customRecipientEmail}
                    onChange={(e) => setCustomRecipientEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">CC (Optional)</label>
                <input
                  type="email"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Subject *</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                Sends the formatted HTML concierge Events LineUp plus an attached printable PDF copy divided into Sports, Nightlife &amp; Concerts, Family, and Kids.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  {sendingEmail ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Email LineUp + PDF
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Text (SMS + PDF) Events LineUp to Current Booked Guests Modal */}
      {showSmsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare size={16} className="text-emerald-600" />
                Text Events LineUp (PDF) to Current Booked Guests
              </h4>
              <button
                type="button"
                onClick={() => setShowSmsModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSendSms} className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-600" />
                  Current Booked Guests ({currentBookedGuests.filter((g) => g.phone).length} with phone)
                </span>
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRecentGuests}
                    onChange={(e) => setIncludeRecentGuests(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Include past stays</span>
                </label>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-slate-50/50">
                {currentBookedGuests.filter((g) => g.phone).length === 0 ? (
                  <div className="p-4 text-center text-slate-500">
                    No active booked guests with phone numbers found. Enter a phone number below to send directly.
                  </div>
                ) : (
                  currentBookedGuests
                    .filter((g) => g.phone)
                    .map((g) => (
                      <label
                        key={g.key}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedRecipientKeys.has(g.key)}
                            onChange={(e) => {
                              setSelectedRecipientKeys((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(g.key);
                                else next.delete(g.key);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {g.name} &middot; <span className="text-emerald-700 font-normal">{g.stayStatus}</span>
                            </div>
                            <div className="text-slate-500 truncate">
                              {g.phone} &middot; {g.propertyName} ({g.checkIn} to {g.checkOut})
                            </div>
                          </div>
                        </div>
                      </label>
                    ))
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Add Guest Name (Optional)</label>
                  <input
                    type="text"
                    value={customRecipientName}
                    onChange={(e) => setCustomRecipientName(e.target.value)}
                    placeholder="Guest Name"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Add Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={customRecipientPhone}
                    onChange={(e) => setCustomRecipientPhone(e.target.value)}
                    placeholder="(404) 555-0192"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Optional Custom SMS Intro (leave blank to use curated 4-category summary)
                </label>
                <textarea
                  rows={3}
                  value={smsCustomNote}
                  onChange={(e) => setSmsCustomNote(e.target.value)}
                  placeholder="Optional custom note..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                Automatically generates and sends the Published Events LineUp in PDF format with the text message (Sports, Nightlife &amp; Concerts, Family, and Kids).
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSmsModal(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingSms}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  {sendingSms ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Sending Text...
                    </>
                  ) : (
                    <>
                      <MessageSquare size={14} /> Send Text + PDF
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
