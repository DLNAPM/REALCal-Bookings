import React, { useState, useMemo } from 'react';
import { 
  Star, 
  Send, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Users, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  Search, 
  Mail, 
  Phone, 
  CheckSquare, 
  Square, 
  Eye, 
  Sparkles,
  MessageSquare,
  Building,
  Calendar,
  X,
  FileText,
  Check
} from 'lucide-react';
import { Booking, Lease, Property, Review, SurveyResponse } from '../types';
import { format } from 'date-fns';

export interface PastGuestItem {
  id: string; // bookingId or leaseId
  type: 'booking' | 'lease';
  bookingRef: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  stayDays: number;
  status: string;
  hasSurvey: boolean;
  surveyData?: SurveyResponse;
  hasReview: boolean;
  reviewData?: Review;
  sentReminder: boolean;
  sentReminderAt?: string;
  rawBooking?: Booking;
  rawLease?: Lease;
}

interface AdminSurveyRemindersProps {
  bookings: Booking[];
  leases: Lease[];
  properties: Property[];
  surveys: SurveyResponse[];
  reviews: Review[];
  onRefreshData?: () => void;
  onUpdateBooking?: (bookingId: string, updates: Partial<Booking>) => void;
  onUpdateLease?: (leaseId: string, updates: Partial<Lease>) => void;
}

export const AdminSurveyReminders: React.FC<AdminSurveyRemindersProps> = ({
  bookings,
  leases,
  properties,
  surveys,
  reviews,
  onRefreshData,
  onUpdateBooking,
  onUpdateLease,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_either' | 'neither' | 'missing_survey' | 'missing_review' | 'completed_both'>('pending_either');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modal states
  const [singleReminderItem, setSingleReminderItem] = useState<PastGuestItem | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [sendSmsOption, setSendSmsOption] = useState(true);
  const [viewingSurveyItem, setViewingSurveyItem] = useState<SurveyResponse | null>(null);
  const [viewingReviewItem, setViewingReviewItem] = useState<Review | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [includeActiveStays, setIncludeActiveStays] = useState(false);

  const now = new Date();

  // Helper to determine if a date is in the past
  const isPastDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr.split('T')[0] + 'T23:59:59');
      return !isNaN(d.getTime()) && d < now;
    } catch {
      return false;
    }
  };

  // Compile all past guests across Bookings and Leases
  const pastGuests: PastGuestItem[] = useMemo(() => {
    const items: PastGuestItem[] = [];

    // 1. Process Bookings
    bookings.forEach((b) => {
      // Must not be cancelled
      if (b.status === 'cancelled') return;

      const hasEnded = includeActiveStays || b.checkedOut === true || (b as any).status === 'completed' || (b as any).status === 'checked_out' || (b.checkOut && isPastDate(b.checkOut));
      if (!hasEnded) return;

      const prop = properties.find((p) => p.id === b.propertyId);
      const propName = b.propertyName || prop?.name || 'Stonewall Villa';
      const refCode = b.bookingRef || b.id;
      const email = (b.guestEmail || '').trim().toLowerCase();
      const name = (b.guestName || 'Guest').trim();

      // Check survey completion
      const matchedSurvey = surveys.find((s) => {
        if (s.bookingRef && (s.bookingRef === b.id || s.bookingRef === b.bookingRef)) return true;
        if (email && s.guestEmail && s.guestEmail.trim().toLowerCase() === email) return true;
        return false;
      });

      // Check review completion
      const matchedReview = reviews.find((r) => {
        if (r.bookingRef && (r.bookingRef === b.id || r.bookingRef === b.bookingRef)) return true;
        if (email && (r as any).email && (r as any).email.trim().toLowerCase() === email) return true;
        if (name && r.author && r.author.trim().toLowerCase() === name.toLowerCase()) return true;
        return false;
      });

      // Calculate stay duration
      let duration = 1;
      try {
        const dIn = new Date(b.checkIn);
        const dOut = new Date(b.checkOut);
        const diff = dOut.getTime() - dIn.getTime();
        duration = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
      } catch {}

      items.push({
        id: b.id,
        type: 'booking',
        bookingRef: refCode,
        guestName: b.guestName || 'Guest',
        guestEmail: b.guestEmail || '',
        guestPhone: b.guestPhone || '',
        propertyName: propName,
        checkIn: b.checkIn || '',
        checkOut: b.checkOut || '',
        stayDays: duration,
        status: b.checkedOut ? 'Checked Out' : 'Stay Ended',
        hasSurvey: !!(matchedSurvey || (b as any).surveyCompleted),
        surveyData: matchedSurvey,
        hasReview: !!matchedReview,
        reviewData: matchedReview,
        sentReminder: !!(b.sentSurveyEmail || (b as any).sentSurveyReminder),
        sentReminderAt: b.sentSurveyEmailAt || (b as any).sentSurveyReminderAt,
        rawBooking: b,
      });
    });

    // 2. Process Leases
    leases.forEach((l) => {
      if (l.status === 'revoked') return;
      const hasEnded = includeActiveStays || l.status === 'terminating' || (l.endDate && isPastDate(l.endDate));
      if (!hasEnded) return;

      const propName = l.propertyNameOrRoom || 'Stonewall Villa';
      const refCode = l.leaseCode || l.id;
      const email = (l.tenantEmail || '').trim().toLowerCase();
      const name = (l.tenantName || 'Resident').trim();

      const matchedSurvey = surveys.find((s) => {
        if (s.bookingRef && (s.bookingRef === l.id || s.bookingRef === l.leaseCode)) return true;
        if (email && s.guestEmail && s.guestEmail.trim().toLowerCase() === email) return true;
        return false;
      });

      const matchedReview = reviews.find((r) => {
        if (r.bookingRef && (r.bookingRef === l.id || r.bookingRef === l.leaseCode)) return true;
        if (email && (r as any).email && (r as any).email.trim().toLowerCase() === email) return true;
        if (name && r.author && r.author.trim().toLowerCase() === name.toLowerCase()) return true;
        return false;
      });

      let duration = 30;
      try {
        const dIn = new Date(l.startDate);
        const dOut = new Date(l.endDate);
        const diff = dOut.getTime() - dIn.getTime();
        duration = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
      } catch {}

      items.push({
        id: l.id,
        type: 'lease',
        bookingRef: refCode,
        guestName: l.tenantName || 'Resident',
        guestEmail: l.tenantEmail || '',
        guestPhone: l.tenantPhone || '',
        propertyName: propName,
        checkIn: l.startDate || '',
        checkOut: l.endDate || '',
        stayDays: duration,
        status: l.status === 'terminating' ? 'Terminating Lease' : 'Completed Lease',
        hasSurvey: !!(matchedSurvey || (l as any).surveyCompleted),
        surveyData: matchedSurvey,
        hasReview: !!matchedReview,
        reviewData: matchedReview,
        sentReminder: !!l.sentSurveyEmail,
        sentReminderAt: l.sentSurveyEmailAt || l.lastReminderSentAt,
        rawLease: l,
      });
    });

    // Sort by check-out date descending (most recent past guests first)
    return items.sort((a, b) => new Date(b.checkOut).getTime() - new Date(a.checkOut).getTime());
  }, [bookings, leases, properties, surveys, reviews, includeActiveStays]);

  // Metrics
  const metrics = useMemo(() => {
    const total = pastGuests.length;
    const completedBoth = pastGuests.filter((g) => g.hasSurvey && g.hasReview).length;
    const completedSurvey = pastGuests.filter((g) => g.hasSurvey).length;
    const completedReview = pastGuests.filter((g) => g.hasReview).length;
    const pendingEither = pastGuests.filter((g) => !g.hasSurvey || !g.hasReview).length;
    const neitherCompleted = pastGuests.filter((g) => !g.hasSurvey && !g.hasReview).length;
    const remindersSent = pastGuests.filter((g) => g.sentReminder).length;

    return {
      total,
      completedBoth,
      completedSurvey,
      completedReview,
      pendingEither,
      neitherCompleted,
      remindersSent,
    };
  }, [pastGuests]);

  // Filtered List
  const filteredGuests = useMemo(() => {
    return pastGuests.filter((g) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          g.guestName.toLowerCase().includes(q) ||
          g.guestEmail.toLowerCase().includes(q) ||
          (g.guestPhone && g.guestPhone.toLowerCase().includes(q)) ||
          g.propertyName.toLowerCase().includes(q) ||
          g.bookingRef.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Property filter
      if (propertyFilter !== 'all' && g.propertyName !== propertyFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'pending_either') {
        return !g.hasSurvey || !g.hasReview;
      }
      if (statusFilter === 'neither') {
        return !g.hasSurvey && !g.hasReview;
      }
      if (statusFilter === 'missing_survey') {
        return !g.hasSurvey;
      }
      if (statusFilter === 'missing_review') {
        return !g.hasReview;
      }
      if (statusFilter === 'completed_both') {
        return g.hasSurvey && g.hasReview;
      }

      return true;
    });
  }, [pastGuests, searchQuery, statusFilter, propertyFilter]);

  // Unique properties list for dropdown
  const uniqueProperties = useMemo(() => {
    const set = new Set<string>();
    pastGuests.forEach((g) => set.add(g.propertyName));
    return Array.from(set);
  }, [pastGuests]);

  // Checkbox handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    if (selectedIds.length === filteredGuests.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredGuests.map((g) => g.id));
    }
  };

  // Dispatch single reminder
  const handleSendSingleReminder = async (item: PastGuestItem) => {
    if (!item.guestEmail) {
      alert("Guest does not have a valid email address on file.");
      return;
    }

    setIsSending(true);
    try {
      const payload = {
        bookingId: item.type === 'booking' ? item.id : undefined,
        leaseId: item.type === 'lease' ? item.id : undefined,
        guestEmail: item.guestEmail,
        guestName: item.guestName,
        guestPhone: item.guestPhone,
        propertyName: item.propertyName,
        bookingRef: item.bookingRef,
        sendSms: sendSmsOption && !!item.guestPhone,
      };

      const res = await fetch('/api/send-survey-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch survey reminder email.');
      }

      // Update local state and trigger callback
      const nowIso = new Date().toISOString();
      if (item.type === 'booking' && onUpdateBooking) {
        onUpdateBooking(item.id, {
          sentSurveyEmail: true,
          sentSurveyEmailAt: nowIso,
        });
      } else if (item.type === 'lease' && onUpdateLease) {
        onUpdateLease(item.id, {
          sentSurveyEmail: true,
          sentSurveyEmailAt: nowIso,
        });
      }

      setSendSuccessMsg(
        `Survey & Review Reminder successfully sent to ${item.guestName} (${item.guestEmail})${
          data.smsSent ? ' & via SMS' : ''
        }!`
      );
      setSingleReminderItem(null);
      setTimeout(() => setSendSuccessMsg(null), 5000);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(`Error sending reminder: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSending(false);
    }
  };

  // Dispatch batch reminders
  const handleSendBatchReminders = async () => {
    const targetItems = pastGuests.filter((g) => selectedIds.includes(g.id));
    if (targetItems.length === 0) return;

    setIsSending(true);
    try {
      const batchPayload = targetItems.map((g) => ({
        bookingId: g.type === 'booking' ? g.id : undefined,
        leaseId: g.type === 'lease' ? g.id : undefined,
        guestEmail: g.guestEmail,
        guestName: g.guestName,
        guestPhone: g.guestPhone,
        propertyName: g.propertyName,
        bookingRef: g.bookingRef,
      }));

      const res = await fetch('/api/send-batch-survey-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batchPayload,
          sendSms: sendSmsOption,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send batch survey reminders.');
      }

      const nowIso = new Date().toISOString();
      targetItems.forEach((item) => {
        if (item.type === 'booking' && onUpdateBooking) {
          onUpdateBooking(item.id, { sentSurveyEmail: true, sentSurveyEmailAt: nowIso });
        } else if (item.type === 'lease' && onUpdateLease) {
          onUpdateLease(item.id, { sentSurveyEmail: true, sentSurveyEmailAt: nowIso });
        }
      });

      setSendSuccessMsg(
        `Batch Reminders Dispatched: Successfully sent Survey & Review reminders to ${data.count || targetItems.length} past guest(s)!`
      );
      setShowBatchModal(false);
      setSelectedIds([]);
      setTimeout(() => setSendSuccessMsg(null), 6000);
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(`Failed to send batch reminders: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // Copy personalized survey link
  const handleCopyLink = (item: PastGuestItem, type: 'survey' | 'review') => {
    const origin = window.location.origin;
    let url = '';
    if (type === 'survey') {
      url = `${origin}/survey?ref=${encodeURIComponent(item.bookingRef)}&property=${encodeURIComponent(
        item.propertyName
      )}&guest=${encodeURIComponent(item.guestName)}&email=${encodeURIComponent(
        item.guestEmail
      )}&stayType=${item.type}`;
    } else {
      url = `${origin}/reviews?prop=${encodeURIComponent(item.propertyName)}&ref=${encodeURIComponent(
        item.bookingRef
      )}`;
    }

    navigator.clipboard.writeText(url);
    setCopiedId(`${item.id}-${type}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden mb-8">
      {/* Header */}
      <div className="p-6 sm:p-8 bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-bold tracking-wide uppercase">
              <Sparkles size={13} className="text-amber-300 animate-pulse" />
              <span>Guest Experience & Feedback Automation</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <MessageSquare className="text-indigo-400" size={28} />
              <span>Survey & Review Reminders</span>
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200/80 max-w-2xl leading-relaxed">
              Target and follow up with past guests who haven't completed their 5-Question Stay Survey or left a public Google/Stripe review. Send automated email invitations, SMS alerts, and batch reminders with one click.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {metrics.pendingEither > 0 && (
              <button
                type="button"
                onClick={() => {
                  const pendingItems = pastGuests.filter((g) => !g.hasSurvey || !g.hasReview);
                  setSelectedIds(pendingItems.map((g) => g.id));
                  setShowBatchModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer hover:scale-[1.02]"
              >
                <Send size={15} className="text-slate-950" />
                <span>Remind All Pending ({metrics.pendingEither})</span>
              </button>
            )}

            {onRefreshData && (
              <button
                type="button"
                onClick={onRefreshData}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Refresh real-time survey and review logs"
              >
                <RefreshCw size={14} />
                <span>Sync Logs</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric Cards Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300/70">Past Stays</div>
            <div className="text-2xl font-black mt-1 text-white">{metrics.total}</div>
            <div className="text-[10px] text-indigo-200/60 mt-0.5">Ended reservations</div>
          </div>

          <div className="bg-amber-500/10 border border-amber-400/30 rounded-2xl p-4 backdrop-blur-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Needs Reminder</div>
            <div className="text-2xl font-black mt-1 text-amber-300">{metrics.pendingEither}</div>
            <div className="text-[10px] text-amber-200/70 mt-0.5">Missing survey or review</div>
          </div>

          <div className="bg-rose-500/10 border border-rose-400/20 rounded-2xl p-4 backdrop-blur-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300">Neither Done</div>
            <div className="text-2xl font-black mt-1 text-rose-300">{metrics.neitherCompleted}</div>
            <div className="text-[10px] text-rose-200/70 mt-0.5">No feedback yet</div>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-400/20 rounded-2xl p-4 backdrop-blur-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">Surveys Done</div>
            <div className="text-2xl font-black mt-1 text-indigo-300">{metrics.completedSurvey}</div>
            <div className="text-[10px] text-indigo-200/70 mt-0.5">5-Question responses</div>
          </div>

          <div className="bg-amber-400/10 border border-amber-300/20 rounded-2xl p-4 backdrop-blur-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Reviews Done</div>
            <div className="text-2xl font-black mt-1 text-amber-200">{metrics.completedReview}</div>
            <div className="text-[10px] text-amber-200/70 mt-0.5">Public star reviews</div>
          </div>

          <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4 backdrop-blur-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Both Completed</div>
            <div className="text-2xl font-black mt-1 text-emerald-300">{metrics.completedBoth}</div>
            <div className="text-[10px] text-emerald-200/70 mt-0.5">100% feedback complete</div>
          </div>
        </div>
      </div>

      {/* Success Notification Bar */}
      {sendSuccessMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 p-4 text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <span>{sendSuccessMsg}</span>
          </div>
          <button
            onClick={() => setSendSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="p-6 border-b border-slate-200/80 bg-slate-50/70 space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by guest name, email, phone, property, or booking reference..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Property Dropdown */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 whitespace-nowrap">
              <Building size={14} /> Property:
            </div>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-2xs cursor-pointer"
            >
              <option value="all">All Properties ({pastGuests.length})</option>
              {uniqueProperties.map((prop) => (
                <option key={prop} value={prop}>
                  {prop}
                </option>
              ))}
            </select>

            {/* Include Active Stays Toggle */}
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors shadow-2xs select-none">
              <input
                type="checkbox"
                checked={includeActiveStays}
                onChange={(e) => setIncludeActiveStays(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span title="Include current and upcoming reservations for administrative reminder testing">
                All Stays (Inc. Active)
              </span>
            </label>
          </div>
        </div>

        {/* Tab Filter Pills */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              onClick={() => setStatusFilter('pending_either')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'pending_either'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Needs Follow-Up ({metrics.pendingEither})
            </button>

            <button
              onClick={() => setStatusFilter('neither')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'neither'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Neither Done ({metrics.neitherCompleted})
            </button>

            <button
              onClick={() => setStatusFilter('missing_survey')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'missing_survey'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Missing Survey ({pastGuests.filter((g) => !g.hasSurvey).length})
            </button>

            <button
              onClick={() => setStatusFilter('missing_review')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'missing_review'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Missing Review ({pastGuests.filter((g) => !g.hasReview).length})
            </button>

            <button
              onClick={() => setStatusFilter('completed_both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'completed_both'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Completed Both ({metrics.completedBoth})
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Past Guests ({pastGuests.length})
            </button>
          </div>

          {/* Bulk Action Controls */}
          {filteredGuests.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                {selectedIds.length === filteredGuests.length ? (
                  <CheckSquare size={14} className="text-indigo-600" />
                ) : (
                  <Square size={14} className="text-slate-400" />
                )}
                <span>
                  {selectedIds.length === filteredGuests.length
                    ? 'Deselect All'
                    : `Select All (${filteredGuests.length})`}
                </span>
              </button>

              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send size={13} />
                  <span>Send Reminders to Selected ({selectedIds.length})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] uppercase font-bold text-slate-500 tracking-wider">
            <tr>
              <th className="py-3.5 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filteredGuests.length}
                  onChange={handleSelectAllFiltered}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="py-3.5 px-4">Guest Information</th>
              <th className="py-3.5 px-4">Property & Stay Dates</th>
              <th className="py-3.5 px-4 text-center">5-Question Survey</th>
              <th className="py-3.5 px-4 text-center">Stay Review</th>
              <th className="py-3.5 px-4 text-center">Reminder History</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredGuests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <Users size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-600">No past guests match your filter criteria.</p>
                  <p className="text-xs text-slate-400 mt-1">Try clearing search or switching status tabs above.</p>
                </td>
              </tr>
            ) : (
              filteredGuests.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const hasPending = !item.hasSurvey || !item.hasReview;

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Guest Information */}
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900">{item.guestName}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Mail size={12} className="text-slate-400" />
                        <span>{item.guestEmail || 'No email provided'}</span>
                      </div>
                      {item.guestPhone && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                          <Phone size={11} className="text-slate-400" />
                          <span>{item.guestPhone}</span>
                        </div>
                      )}
                      <div className="text-[10px] text-indigo-600 font-mono mt-1 font-semibold">
                        Ref: #{item.bookingRef}
                      </div>
                    </td>

                    {/* Property & Stay Dates */}
                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-800">{item.propertyName}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Calendar size={12} className="text-slate-400" />
                        <span>
                          {item.checkIn} &rarr; {item.checkOut}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {item.stayDays} Night{item.stayDays !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                          {item.type === 'booking' ? 'Booking' : 'Lease'}
                        </span>
                      </div>
                    </td>

                    {/* 5-Question Survey Status */}
                    <td className="py-4 px-4 text-center">
                      {item.hasSurvey ? (
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle size={12} className="text-emerald-600" />
                            <span>Completed</span>
                          </span>
                          {item.surveyData && (
                            <button
                              type="button"
                              onClick={() => setViewingSurveyItem(item.surveyData!)}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View Responses
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                          <Clock size={12} className="text-amber-500" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    {/* Review Status */}
                    <td className="py-4 px-4 text-center">
                      {item.hasReview ? (
                        <div className="inline-flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                            <Star size={12} className="fill-amber-500 text-amber-500" />
                            <span>
                              {item.reviewData?.rating ? `${item.reviewData.rating}/5 Stars` : 'Published'}
                            </span>
                          </span>
                          {item.reviewData && (
                            <button
                              type="button"
                              onClick={() => setViewingReviewItem(item.reviewData!)}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={11} /> View Review
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                          <Clock size={12} className="text-slate-400" />
                          <span>No Review</span>
                        </span>
                      )}
                    </td>

                    {/* Reminder Status History */}
                    <td className="py-4 px-4 text-center">
                      {item.sentReminder ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Mail size={10} /> Reminder Sent
                          </span>
                          {item.sentReminderAt && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(() => {
                                try {
                                  return format(new Date(item.sentReminderAt), 'MMM d, h:mm a');
                                } catch {
                                  return 'Logged';
                                }
                              })()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Not reminded</span>
                      )}
                    </td>

                    {/* Row Action Buttons */}
                    <td className="py-4 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {/* Single Send / Resend Reminder */}
                        {hasPending ? (
                          <button
                            type="button"
                            onClick={() => setSingleReminderItem(item)}
                            className="px-3 py-1.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                            title="Send personalized Survey & Review reminder email/SMS"
                          >
                            <Send size={12} />
                            <span>{item.sentReminder ? 'Resend' : 'Send Reminder'}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md">
                            <CheckCircle size={12} /> Done
                          </span>
                        )}

                        {/* Copy Survey Link */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(item, 'survey')}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Copy personalized direct 5-Question Survey URL"
                        >
                          {copiedId === `${item.id}-survey` ? (
                            <Check size={13} className="text-emerald-600" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>

                        {/* Copy Review Link */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(item, 'review')}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                          title="Copy direct Reviews Page URL"
                        >
                          {copiedId === `${item.id}-review` ? (
                            <Check size={13} className="text-emerald-600" />
                          ) : (
                            <Star size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-2">
        <div>
          Showing <strong className="text-slate-800">{filteredGuests.length}</strong> of{' '}
          <strong className="text-slate-800">{pastGuests.length}</strong> past guests.
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Survey Completed
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Review Completed
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block"></span> Needs Follow-Up
          </span>
        </div>
      </div>

      {/* ==================================================== */}
      {/* MODAL 1: Individual Reminder Confirmation & Preview */}
      {/* ==================================================== */}
      {singleReminderItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-indigo-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Send size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Send Survey & Review Reminder</h3>
                  <p className="text-xs text-slate-500">Dispatch reminder to past guest</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSingleReminderItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Recipient:</span>
                  <span className="font-bold text-slate-900">{singleReminderItem.guestName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Email:</span>
                  <span className="font-bold text-indigo-600">{singleReminderItem.guestEmail}</span>
                </div>
                {singleReminderItem.guestPhone && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Phone:</span>
                    <span className="font-mono font-bold text-slate-700">{singleReminderItem.guestPhone}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Property:</span>
                  <span className="font-bold text-slate-900">{singleReminderItem.propertyName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Dates:</span>
                  <span className="text-slate-700">{singleReminderItem.checkIn} to {singleReminderItem.checkOut} ({singleReminderItem.stayDays} nights)</span>
                </div>
              </div>

              {/* Status Checklist */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className={`p-3 rounded-xl border ${singleReminderItem.hasSurvey ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {singleReminderItem.hasSurvey ? <CheckCircle size={14} /> : <Clock size={14} />}
                    <span>5-Question Survey</span>
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    {singleReminderItem.hasSurvey ? 'Submitted' : 'Not completed yet'}
                  </div>
                </div>

                <div className={`p-3 rounded-xl border ${singleReminderItem.hasReview ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {singleReminderItem.hasReview ? <Star size={14} className="fill-amber-500 text-amber-500" /> : <Clock size={14} />}
                    <span>Public Stay Review</span>
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    {singleReminderItem.hasReview ? 'Published' : 'Not completed yet'}
                  </div>
                </div>
              </div>

              {/* Delivery Channels */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-700 block">Delivery Channels:</label>
                <div className="flex items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input type="checkbox" checked={true} disabled className="rounded text-indigo-600" />
                    <span>Email Invitation (Standard)</span>
                  </label>
                  {singleReminderItem.guestPhone && (
                    <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={sendSmsOption}
                        onChange={(e) => setSendSmsOption(e.target.checked)}
                        className="rounded text-indigo-600 cursor-pointer"
                      />
                      <span>SMS Text Alert ({singleReminderItem.guestPhone})</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Message Outline Box */}
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1 text-indigo-800">
                  <Mail size={13} />
                  <span>Email Content Includes:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-indigo-800/80 pl-1">
                  <li>Warm thank-you for choosing {singleReminderItem.propertyName}</li>
                  <li>Direct link to the 5-Question Stay Survey (Comfort, Cleanliness, Amenities, Operations)</li>
                  <li>Direct link to leave a 5-star public experience review</li>
                </ul>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end items-center gap-3">
              <button
                type="button"
                onClick={() => setSingleReminderItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={() => handleSendSingleReminder(singleReminderItem)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Sending Reminder...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Send Reminder Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 2: Batch Send Reminders to Multiple Guests     */}
      {/* ==================================================== */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-indigo-50/50 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                  <Send size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Send Batch Reminders ({selectedIds.length} Guests)
                  </h3>
                  <p className="text-xs text-slate-500">Dispatch Survey & Review follow-ups simultaneously</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to send personalized <strong>Stay Survey & Review Reminder invitations</strong> to{' '}
                <strong className="text-slate-900">{selectedIds.length} past guests</strong> who have not yet finished their feedback.
              </p>

              {/* Recipients Preview List */}
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 bg-slate-50/50">
                {pastGuests
                  .filter((g) => selectedIds.includes(g.id))
                  .map((g) => (
                    <div key={g.id} className="p-3 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-900">{g.guestName}</span>
                        <span className="text-slate-400 ml-2">({g.guestEmail})</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">{g.propertyName} &bull; Check-out: {g.checkOut}</div>
                      </div>
                      <div className="text-right flex items-center gap-1.5">
                        {!g.hasSurvey && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-semibold">
                            Needs Survey
                          </span>
                        )}
                        {!g.hasReview && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-800 font-semibold">
                            Needs Review
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Delivery Settings */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800">Dispatch Options:</div>
                <div className="flex items-center gap-6 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                    <input type="checkbox" checked={true} disabled className="rounded text-indigo-600" />
                    <span>Email Notifications (All {selectedIds.length})</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={sendSmsOption}
                      onChange={(e) => setSendSmsOption(e.target.checked)}
                      className="rounded text-indigo-600 cursor-pointer"
                    />
                    <span>Include SMS if Phone Available</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end items-center gap-3">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={handleSendBatchReminders}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Dispatching {selectedIds.length} Reminders...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Send Batch Reminders Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 3: View Guest Survey Response Modal            */}
      {/* ==================================================== */}
      {viewingSurveyItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600" />
                  <span>5-Question Stay Survey Results</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Guest: <strong>{viewingSurveyItem.guestName}</strong> ({viewingSurveyItem.guestEmail})
                </p>
              </div>
              <button
                onClick={() => setViewingSurveyItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-900 text-sm">{viewingSurveyItem.propertyName}</div>
                <div className="text-slate-500">Booking Ref: #{viewingSurveyItem.bookingRef || 'N/A'}</div>
                {viewingSurveyItem.createdAt && (
                  <div className="text-slate-400 text-[10px]">Submitted: {String(viewingSurveyItem.createdAt)}</div>
                )}
              </div>

              {/* 5 Questions */}
              <div className="space-y-3">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-800">1. Comfort & Overall Experience ({viewingSurveyItem.comfortRating || 5}/5 Stars)</div>
                  <div className="text-slate-600 mt-1">{viewingSurveyItem.comfort || 'No comments'}</div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-800">2. Amenities Feedback</div>
                  <div className="text-slate-600 mt-1">{viewingSurveyItem.amenities || 'Everything provided'}</div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-800">3. Cleanliness & Preparation</div>
                  <div className="text-slate-600 mt-1">{viewingSurveyItem.cleanliness || 'Met expectations'}</div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-800">4. Operations (Check-in, Wi-Fi, Lock, Appliances)</div>
                  <div className="text-slate-600 mt-1">{viewingSurveyItem.operations || 'No operational issues'}</div>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-800">5. Future Ideas & Would Stay Again</div>
                  <div className="text-slate-600 mt-1">{viewingSurveyItem.futureIdeas || 'Would stay again'}</div>
                </div>
              </div>

              {viewingSurveyItem.publicReviewComment && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <div className="font-bold text-indigo-900">Public Review Comment Authorized:</div>
                  <div className="text-indigo-800 mt-1 italic">"{viewingSurveyItem.publicReviewComment}"</div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setViewingSurveyItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 4: View Public Review Modal                    */}
      {/* ==================================================== */}
      {viewingReviewItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Star size={18} className="fill-amber-400 text-amber-400" />
                <span>Guest Review Details</span>
              </h3>
              <button
                onClick={() => setViewingReviewItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm">{viewingReviewItem.author}</div>
                  <div className="text-slate-500">{viewingReviewItem.role || 'Verified Guest'} &bull; {viewingReviewItem.propertyName}</div>
                </div>
                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-bold text-amber-900">
                  <Star size={13} className="fill-amber-500 text-amber-500" />
                  <span>{viewingReviewItem.rating} / 5</span>
                </div>
              </div>

              {viewingReviewItem.title && (
                <div className="font-bold text-slate-800 text-sm">
                  "{viewingReviewItem.title}"
                </div>
              )}

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-700 leading-relaxed italic">
                "{viewingReviewItem.comment}"
              </div>

              <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                <span>Ref: #{viewingReviewItem.bookingRef || 'N/A'}</span>
                <span>{viewingReviewItem.verified ? 'Verified Stay' : 'Unverified'}</span>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setViewingReviewItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
