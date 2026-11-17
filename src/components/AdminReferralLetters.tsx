import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  UserCheck,
  Building2,
  RefreshCw,
  CheckCircle2,
  Eye,
  Send,
  Download,
  Printer,
  Trash2,
  Edit3,
  Plus,
  Mail,
  DollarSign,
  Loader2,
  Search,
  Lock,
  Check,
  FileDown,
  AlertCircle
} from 'lucide-react';
import {
  Booking,
  Property,
  ReferralLetter,
  ReferralLedgerEntry,
  ReferralRecipientType,
  ReferralFeeType
} from '../types';
import { cn } from '../lib/utils';

interface AdminReferralLettersProps {
  currentUser: { email?: string; displayName?: string; role?: string } | null;
  bookings: Booking[];
  properties: Property[];
  onPublishedLettersUpdate?: (publishedLetters: ReferralLetter[]) => void;
}

const generateLocalReferralCode = (type: ReferralRecipientType): string => {
  const prefix = type === 'business' ? 'REF-BUS' : 'REF-IND';
  const digits = Math.floor(100000 + Math.random() * 900000);
  const chars = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `${prefix}-${digits}${chars}`;
};

export const AdminReferralLetters: React.FC<AdminReferralLettersProps> = ({
  currentUser,
  bookings,
  properties,
  onPublishedLettersUpdate
}) => {
  const [subTab, setSubTab] = useState<'studio' | 'directory' | 'ledger'>('studio');

  // Persisted lists
  const [letters, setLetters] = useState<ReferralLetter[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<ReferralLedgerEntry[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Form & Draft State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [recipientType, setRecipientType] = useState<ReferralRecipientType>('individual');
  const [referralNumber, setReferralNumber] = useState<string>(() => generateLocalReferralCode('individual'));
  const [letterDate, setLetterDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Individual Fields
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [indEmail, setIndEmail] = useState<string>('');
  const [indPhone, setIndPhone] = useState<string>('');

  // Business Corporation Fields
  const [businessName, setBusinessName] = useState<string>('');
  const [attentionFirstName, setAttentionFirstName] = useState<string>('');
  const [attentionLastName, setAttentionLastName] = useState<string>('');
  const [streetAddress, setStreetAddress] = useState<string>('');
  const [cityStateZip, setCityStateZip] = useState<string>('');
  const [busEmail, setBusEmail] = useState<string>('');
  const [busPhone, setBusPhone] = useState<string>('');

  // Referral Fee
  const [referralFee, setReferralFee] = useState<string>('150');
  const [referralFeeType, setReferralFeeType] = useState<ReferralFeeType>('flat');

  // Optional custom notes for Draft Review
  const [customOpeningNote, setCustomOpeningNote] = useState<string>('');
  const [customClosingNote, setCustomClosingNote] = useState<string>('');

  // Feedback & Operation states
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Email Modal State
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [emailTargetLetter, setEmailTargetLetter] = useState<ReferralLetter | null>(null);
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailCc, setEmailCc] = useState<string>('candsh@cashgroupproperties.com');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);

  // Directory & Ledger filters
  const [directorySearch, setDirectorySearch] = useState<string>('');
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'owed' | 'paid'>('all');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [updatingLedgerId, setUpdatingLedgerId] = useState<string | null>(null);

  const adminHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-user-email': currentUser?.email || 'dlaniger.napm.consulting@gmail.com',
      'x-user-role': currentUser?.role || 'admin'
    }),
    [currentUser]
  );

  const fetchReferralData = async () => {
    setLoadingData(true);
    try {
      const [lettersRes, ledgerRes] = await Promise.all([
        fetch('/api/referral-letters', { headers: adminHeaders }),
        fetch('/api/referral-ledger', { headers: adminHeaders })
      ]);

      if (lettersRes.ok) {
        const lData = await lettersRes.json();
        const list: ReferralLetter[] = lData.letters || [];
        setLetters(list);
        if (onPublishedLettersUpdate) {
          onPublishedLettersUpdate(list.filter((l) => l.status === 'published'));
        }
      }
      if (ledgerRes.ok) {
        const ledData = await ledgerRes.json();
        setLedgerEntries(ledData.entries || []);
      }
    } catch (err) {
      console.error('[ReferralLetters] Error loading referral data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchReferralData();
  }, [currentUser?.email]);

  // Also reconcile any bookings in Firestore that have referralNumber but are missing from server ledger
  const mergedLedgerEntries = useMemo(() => {
    const map = new Map<string, ReferralLedgerEntry>();
    ledgerEntries.forEach((entry) => {
      const key = entry.bookingId ? `${entry.bookingId}::${entry.referralNumber}` : entry.id;
      map.set(key, entry);
    });

    bookings.forEach((b) => {
      if (b.referralNumber && b.status !== 'cancelled' && b.status !== 'pending_payment') {
        const cleanCode = b.referralNumber.toUpperCase();
        const key = `${b.id}::${cleanCode}`;
        if (!map.has(key)) {
          const matchedLetter = letters.find((l) => l.referralNumber.toUpperCase() === cleanCode);
          const totalDollars = Number(b.priceDetails?.grandTotal || (b.totalPrice ? b.totalPrice / 100 : 0));
          let owed = Number(b.referralOwedAmount || 0);
          if (!owed && matchedLetter) {
            owed =
              matchedLetter.referralFeeType === 'percentage'
                ? Math.round((totalDollars * (matchedLetter.referralFee / 100)) * 100) / 100
                : Number(matchedLetter.referralFee || 0);
          }
          const prop = properties.find((p) => p.id === b.propertyId);
          const rooms = b.selectedBedrooms
            ? b.selectedBedrooms.map((r: any) => `Room ${r.roomNumber || r}`).join(', ')
            : b.selectedBedroom?.roomNumber
            ? `Room ${b.selectedBedroom.roomNumber}`
            : 'Full Property';

          const isBus = (b.referrerType || matchedLetter?.recipientType) === 'business';
          const refName =
            b.referrerName ||
            (matchedLetter
              ? isBus
                ? matchedLetter.businessName || 'Business Partner'
                : `${matchedLetter.firstName || ''} ${matchedLetter.lastName || ''}`.trim()
              : 'Referred Partner');

          map.set(key, {
            id: `ref-claim-${b.id}`,
            referralNumber: cleanCode,
            referralLetterId: b.referralLetterId || matchedLetter?.id || '',
            recipientType: (b.referrerType || matchedLetter?.recipientType || 'individual') as ReferralRecipientType,
            referrerName: refName,
            referrerEmail:
              b.referrerEmail ||
              (isBus ? matchedLetter?.contactEmail : matchedLetter?.email) ||
              '',
            bookingId: b.id,
            bookingRef: b.bookingRef || b.id.substring(0, 8).toUpperCase(),
            guestName: b.guestName || 'Guest',
            guestEmail: b.guestEmail || '',
            propertyId: b.propertyId,
            propertyName: b.propertyName || prop?.name || 'Property',
            roomSummary: rooms,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            bookingTotal: totalDollars,
            owedAmount: owed,
            feeDescription: matchedLetter
              ? matchedLetter.referralFeeType === 'percentage'
                ? `${matchedLetter.referralFee}% of Booking`
                : `Flat $${Number(matchedLetter.referralFee || 0).toFixed(2)}`
              : undefined,
            status: b.referralPayoutStatus || 'owed',
            paidAt: b.referralPaidAt || undefined,
            createdAt:
              typeof b.createdAt === 'string'
                ? b.createdAt
                : b.createdAt?.toDate
                ? b.createdAt.toDate().toISOString()
                : new Date().toISOString()
          });
        }
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }, [ledgerEntries, bookings, letters, properties]);

  // Summary metrics
  const draftCount = letters.filter((l) => l.status === 'draft').length;
  const publishedCount = letters.filter((l) => l.status === 'published').length;
  const totalOwedAmount = mergedLedgerEntries
    .filter((e) => e.status === 'owed')
    .reduce((acc, e) => acc + Number(e.owedAmount || 0), 0);
  const totalPaidAmount = mergedLedgerEntries
    .filter((e) => e.status === 'paid')
    .reduce((acc, e) => acc + Number(e.owedAmount || 0), 0);

  // Grouped balances by Referral Number / Referrer
  const referrerBalances = useMemo(() => {
    const groups = new Map<
      string,
      {
        referralNumber: string;
        referrerName: string;
        recipientType: ReferralRecipientType;
        referrerEmail: string;
        bookingCount: number;
        totalOwed: number;
        totalPaid: number;
      }
    >();

    mergedLedgerEntries.forEach((e) => {
      const k = e.referralNumber;
      const existing = groups.get(k) || {
        referralNumber: e.referralNumber,
        referrerName: e.referrerName,
        recipientType: e.recipientType,
        referrerEmail: e.referrerEmail,
        bookingCount: 0,
        totalOwed: 0,
        totalPaid: 0
      };
      existing.bookingCount += 1;
      if (e.status === 'paid') {
        existing.totalPaid += Number(e.owedAmount || 0);
      } else {
        existing.totalOwed += Number(e.owedAmount || 0);
      }
      groups.set(k, existing);
    });

    return Array.from(groups.values());
  }, [mergedLedgerEntries]);

  const handleRecipientTypeSwitch = (nextType: ReferralRecipientType) => {
    setRecipientType(nextType);
    // If creating a fresh letter (no editingId), refresh prefix cleanly
    if (!editingId) {
      setReferralNumber(generateLocalReferralCode(nextType));
    }
  };

  const resetFormToNew = (type: ReferralRecipientType = 'individual') => {
    setEditingId(null);
    setStatus('draft');
    setRecipientType(type);
    setReferralNumber(generateLocalReferralCode(type));
    setLetterDate(new Date().toISOString().split('T')[0]);
    setFirstName('');
    setLastName('');
    setIndEmail('');
    setIndPhone('');
    setBusinessName('');
    setAttentionFirstName('');
    setAttentionLastName('');
    setStreetAddress('');
    setCityStateZip('');
    setBusEmail('');
    setBusPhone('');
    setReferralFee('150');
    setReferralFeeType('flat');
    setCustomOpeningNote('');
    setCustomClosingNote('');
    setFeedbackBanner(null);
  };

  const loadLetterIntoStudio = (l: ReferralLetter) => {
    setEditingId(l.id);
    setStatus(l.status || 'draft');
    setRecipientType(l.recipientType || 'individual');
    setReferralNumber(l.referralNumber || generateLocalReferralCode(l.recipientType));
    setLetterDate(l.letterDate || new Date().toISOString().split('T')[0]);
    setFirstName(l.firstName || '');
    setLastName(l.lastName || '');
    setIndEmail(l.email || '');
    setIndPhone(l.phone || '');
    setBusinessName(l.businessName || '');
    setAttentionFirstName(l.attentionFirstName || '');
    setAttentionLastName(l.attentionLastName || '');
    setStreetAddress(l.streetAddress || '');
    setCityStateZip(l.cityStateZip || '');
    setBusEmail(l.contactEmail || '');
    setBusPhone(l.contactPhone || '');
    setReferralFee(String(l.referralFee ?? 150));
    setReferralFeeType(l.referralFeeType || 'flat');
    setCustomOpeningNote(l.customOpeningNote || '');
    setCustomClosingNote(l.customClosingNote || '');
    setFeedbackBanner(null);
    setSubTab('studio');
  };

  const validateForm = (): string | null => {
    if (recipientType === 'individual') {
      if (!firstName.trim()) return 'Referral First Name is required.';
      if (!lastName.trim()) return 'Referral Last Name is required.';
      if (!indEmail.trim()) return 'Referral Email Address is required.';
    } else {
      if (!businessName.trim()) return 'Referral Business Name is required.';
      if (!attentionFirstName.trim() || !attentionLastName.trim()) {
        return 'Attention To: First Name and Last Name are required.';
      }
      if (!streetAddress.trim()) return 'Bus. Street Address is required.';
      if (!cityStateZip.trim()) return 'Bus. City, State Zip is required.';
      if (!busEmail.trim()) return 'Contact Email Address is required.';
    }
    if (!referralFee || Number(referralFee) <= 0) {
      return `${recipientType === 'individual' ? 'Ind. Referral Fee' : 'Bus. Referral Fee'} must be greater than 0.`;
    }
    if (!referralNumber.trim()) return 'Referral Number is required.';
    return null;
  };

  const buildPayload = (targetStatus: 'draft' | 'published') => ({
    id: editingId || undefined,
    recipientType,
    status: targetStatus,
    referralNumber: referralNumber.trim().toUpperCase(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: indEmail.trim(),
    phone: indPhone.trim(),
    businessName: businessName.trim(),
    attentionFirstName: attentionFirstName.trim(),
    attentionLastName: attentionLastName.trim(),
    streetAddress: streetAddress.trim(),
    cityStateZip: cityStateZip.trim(),
    contactEmail: busEmail.trim(),
    contactPhone: busPhone.trim(),
    referralFee: Number(referralFee || 0),
    referralFeeType,
    customOpeningNote: customOpeningNote.trim(),
    customClosingNote: customClosingNote.trim(),
    letterDate,
    createdBy: currentUser?.email || 'Admin'
  });

  const handleSaveLetter = async (targetStatus: 'draft' | 'published') => {
    const err = validateForm();
    if (err) {
      setFeedbackBanner({ type: 'error', message: err });
      return;
    }

    if (targetStatus === 'draft') setSavingDraft(true);
    else setPublishing(true);
    setFeedbackBanner(null);

    try {
      const res = await fetch('/api/referral-letters', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(buildPayload(targetStatus))
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save referral letter.');
      }

      const saved: ReferralLetter = data.letter;
      setEditingId(saved.id);
      setStatus(saved.status);
      setReferralNumber(saved.referralNumber);
      await fetchReferralData();

      setFeedbackBanner({
        type: 'success',
        message:
          targetStatus === 'draft'
            ? `Draft saved for review (${saved.referralNumber}). Review the letter preview and click "Approve & Publish Referral Letter" when ready to Email, Print, or Save as PDF.`
            : `Referral Letter ${saved.referralNumber} is now Published! You can now Email it, Save as PDF, or Print it. Guests can also use ${saved.referralNumber} when booking a room.`
      });
    } catch (e: any) {
      setFeedbackBanner({ type: 'error', message: e.message || 'Error saving referral letter.' });
    } finally {
      setSavingDraft(false);
      setPublishing(false);
    }
  };

  const handleDeleteLetter = async (letter: ReferralLetter) => {
    if (!window.confirm(`Delete Referral Letter ${letter.referralNumber}?`)) return;
    try {
      const res = await fetch(`/api/referral-letters/${letter.id}`, {
        method: 'DELETE',
        headers: adminHeaders
      });
      if (!res.ok) throw new Error('Failed to delete referral letter.');
      if (editingId === letter.id) {
        resetFormToNew(recipientType);
      }
      await fetchReferralData();
    } catch (e: any) {
      setFeedbackBanner({ type: 'error', message: e.message });
    }
  };

  // Current active letter object for preview/actions
  const activePreviewLetter: ReferralLetter = useMemo(() => {
    return {
      id: editingId || 'preview-unsaved',
      recipientType,
      status,
      referralNumber,
      firstName,
      lastName,
      email: indEmail,
      phone: indPhone,
      businessName,
      attentionFirstName,
      attentionLastName,
      streetAddress,
      cityStateZip,
      contactEmail: busEmail,
      contactPhone: busPhone,
      referralFee: Number(referralFee || 0),
      referralFeeType,
      customOpeningNote,
      customClosingNote,
      letterDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [
    editingId,
    recipientType,
    status,
    referralNumber,
    firstName,
    lastName,
    indEmail,
    indPhone,
    businessName,
    attentionFirstName,
    attentionLastName,
    streetAddress,
    cityStateZip,
    busEmail,
    busPhone,
    referralFee,
    referralFeeType,
    customOpeningNote,
    customClosingNote,
    letterDate
  ]);

  const isPublishedCurrent = Boolean(editingId && status === 'published');

  const handleSaveAsPdf = async (letterObj: ReferralLetter) => {
    if (letterObj.status !== 'published') {
      setFeedbackBanner({
        type: 'info',
        message: 'Please review the draft and click "Approve & Publish Referral Letter" before saving as PDF.'
      });
      return;
    }
    setDownloadingPdf(true);
    try {
      const res = await fetch('/api/referral-letters/pdf', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ letterId: letterObj.id !== 'preview-unsaved' ? letterObj.id : undefined, letter: letterObj })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate PDF file.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Referral-Letter-${letterObj.referralNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setFeedbackBanner({ type: 'error', message: e.message });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const buildPrintableHtml = (l: ReferralLetter): string => {
    const isBus = l.recipientType === 'business';
    const recipientName = isBus
      ? l.businessName || 'Business Corporation'
      : `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Referred Individual';
    const attn = isBus ? `${l.attentionFirstName || ''} ${l.attentionLastName || ''}`.trim() : '';
    const email = isBus ? l.contactEmail || '' : l.email || '';
    const phone = isBus ? l.contactPhone || '' : l.phone || '';
    const feeVal = Number(l.referralFee || 0);
    const feeDisplay =
      l.referralFeeType === 'percentage'
        ? `${feeVal}% of completed booking total`
        : `$${feeVal.toFixed(2)} USD per completed referral booking`;
    const formattedDate = l.letterDate
      ? new Date(l.letterDate + 'T12:00:00').toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const salutation = isBus ? `Dear ${attn || recipientName},` : `Dear ${l.firstName || recipientName},`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Referral Letter - ${l.referralNumber}</title>
  <style>
    @page { size: letter; margin: 0.65in; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 10px 16px; border-radius: 8px; margin-bottom: 24px; font-family: Arial, sans-serif; font-size: 12px; }
    .btn { background: #4338ca; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
    @media print { .toolbar { display: none; } body { padding: 0; } }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 22px; }
    .company { font-family: Arial, sans-serif; font-size: 20px; font-weight: 800; }
    .meta { font-family: Arial, sans-serif; font-size: 12px; color: #475569; margin-top: 4px; }
    .ref-box { text-align: right; font-family: Arial, sans-serif; }
    .ref-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: bold; }
    .ref-num { font-family: monospace; font-size: 16px; font-weight: 800; color: #4338ca; margin-top: 2px; }
    .addr { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.55; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
    .highlights { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px 20px; margin: 18px 0; font-family: Arial, sans-serif; }
    .fee-box { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 14px 18px; margin: 18px 0; font-family: Arial, sans-serif; font-size: 13px; }
    .sig { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.65; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span><strong>C&amp;SH Group Properties, LLC</strong> &bull; Referral Letter (${l.referralNumber})</span>
    <button class="btn" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="header">
    <div>
      <div class="company">C&amp;SH Group Properties, LLC</div>
      <div class="meta">E:candsh@cashgroupproperties.com &nbsp;&bull;&nbsp; P:404-910-3194</div>
    </div>
    <div class="ref-box">
      <div class="ref-label">Referral Number</div>
      <div class="ref-num">${l.referralNumber}</div>
      <div class="meta">${formattedDate}</div>
    </div>
  </div>
  <div class="addr">
    <div style="font-weight:bold; font-size:14px;">${recipientName}</div>
    ${isBus && attn ? `<div><strong>Attention To:</strong> ${attn}</div>` : ''}
    ${isBus && l.streetAddress ? `<div>${l.streetAddress}</div>` : ''}
    ${isBus && l.cityStateZip ? `<div>${l.cityStateZip}</div>` : ''}
    ${email ? `<div>Email: ${email}</div>` : ''}
    ${phone ? `<div>Phone: ${phone}</div>` : ''}
  </div>
  <p style="font-family: Arial, sans-serif; font-weight: bold; font-size: 14px;">Re: Short-Term Rental Referral Partnership &amp; Fee Agreement (${l.referralNumber})</p>
  <p style="font-size: 15px; line-height: 1.65;">${salutation}</p>
  ${l.customOpeningNote ? `<p style="font-size: 15px; line-height: 1.65;">${l.customOpeningNote}</p>` : ''}
  <p style="font-size: 15px; line-height: 1.65;">C&amp;SH Group Properties, LLC is pleased to welcome referrals for our private, quiet, keyless short-term residential accommodations.</p>
  <div class="highlights">
    <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">C&amp;SH Group Properties, LLC is open to short Term Rental related to:</div>
    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8;">
      <li><strong>Traveling Nurses</strong></li>
      <li><strong>Individuals who experience water damage in their home and need temporary housing during repair</strong></li>
      <li><strong>Flight Attendants</strong></li>
      <li><strong>Musician housing who will perform at St. James Live 5 miles away</strong></li>
    </ul>
  </div>
  <div class="fee-box">
    <div><strong>Referral Number:</strong> <span style="font-family: monospace;">${l.referralNumber}</span></div>
    <div><strong>${isBus ? 'Bus. Referral Fee' : 'Ind. Referral Fee'}:</strong> ${feeDisplay}</div>
    <div style="margin-top: 6px; font-size: 12px; color: #3730a3;">Guests booking a room should enter Referral Number <strong>${l.referralNumber}</strong> so that our commission ledger tracks the referral fee owed.</div>
  </div>
  ${l.customClosingNote ? `<p style="font-size: 15px; line-height: 1.65;">${l.customClosingNote}</p>` : ''}
  <div class="sig">
    <div>Sincerely</div>
    <div style="font-weight:bold; margin-top:4px;">Housing Management</div>
    <div style="font-weight:bold;">C&amp;SH Group Properties, LLC</div>
    <div>E:candsh@cashgroupproperties.com</div>
    <div>P:404-910-3194</div>
  </div>
</body>
</html>`;
  };

  const handlePrintLetter = (letterObj: ReferralLetter) => {
    if (letterObj.status !== 'published') {
      setFeedbackBanner({
        type: 'info',
        message: 'Please review the draft and click "Approve & Publish Referral Letter" before printing.'
      });
      return;
    }
    const html = buildPrintableHtml(letterObj);
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
      console.warn('[Print] Sandboxed iframe fallback:', err);
    }
    window.print();
  };

  const openEmailModal = (letterObj: ReferralLetter) => {
    if (letterObj.status !== 'published') {
      setFeedbackBanner({
        type: 'info',
        message: 'Please review the draft and click "Approve & Publish Referral Letter" before emailing.'
      });
      return;
    }
    const targetEmail =
      letterObj.recipientType === 'business' ? letterObj.contactEmail || '' : letterObj.email || '';
    setEmailTargetLetter(letterObj);
    setEmailTo(targetEmail);
    setEmailCc(currentUser?.email || 'candsh@cashgroupproperties.com');
    setEmailSubject(
      `C&SH Group Properties, LLC — Short-Term Rental Referral Letter (${letterObj.referralNumber})`
    );
    setShowEmailModal(true);
  };

  const handleSendReferralEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTargetLetter || !emailTo.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch('/api/referral-letters/send-email', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          letterId: emailTargetLetter.id !== 'preview-unsaved' ? emailTargetLetter.id : undefined,
          letter: emailTargetLetter,
          to: emailTo.trim(),
          cc: emailCc.trim(),
          subject: emailSubject.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send referral email.');
      }
      setShowEmailModal(false);
      await fetchReferralData();
      setFeedbackBanner({
        type: 'success',
        message: data.message || `Referral Letter emailed to ${emailTo.trim()}.`
      });
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', message: err.message });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleToggleLedgerStatus = async (entry: ReferralLedgerEntry) => {
    const nextStatus = entry.status === 'paid' ? 'owed' : 'paid';
    setUpdatingLedgerId(entry.id);
    try {
      // Ensure entry exists on backend before updating if it came only from client bookings snapshot
      await fetch('/api/referral-ledger/record', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          bookingId: entry.bookingId,
          bookingRef: entry.bookingRef,
          referralNumber: entry.referralNumber,
          guestName: entry.guestName,
          guestEmail: entry.guestEmail,
          propertyId: entry.propertyId,
          propertyName: entry.propertyName,
          roomSummary: entry.roomSummary,
          checkIn: entry.checkIn,
          checkOut: entry.checkOut,
          bookingTotalDollars: entry.bookingTotal
        })
      });

      const res = await fetch(`/api/referral-ledger/${entry.id}/status`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update ledger payout status.');
      }
      await fetchReferralData();
    } catch (err: any) {
      setFeedbackBanner({ type: 'error', message: err.message });
    } finally {
      setUpdatingLedgerId(null);
    }
  };

  const exportLedgerCsv = () => {
    const header =
      'Referral Number,Recipient Type,Referrer Name,Referrer Email,Booking Ref,Guest Name,Property,Rooms,Check In,Check Out,Booking Total,Amount Owed,Status,Paid At\n';
    const rows = mergedLedgerEntries
      .map((e) =>
        [
          e.referralNumber,
          e.recipientType,
          `"${(e.referrerName || '').replace(/"/g, '""')}"`,
          e.referrerEmail || '',
          e.bookingRef || '',
          `"${(e.guestName || '').replace(/"/g, '""')}"`,
          `"${(e.propertyName || '').replace(/"/g, '""')}"`,
          `"${(e.roomSummary || '').replace(/"/g, '""')}"`,
          e.checkIn,
          e.checkOut,
          e.bookingTotal.toFixed(2),
          e.owedAmount.toFixed(2),
          e.status.toUpperCase(),
          e.paidAt || ''
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referral_commission_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLetters = useMemo(() => {
    if (!directorySearch.trim()) return letters;
    const q = directorySearch.toLowerCase();
    return letters.filter((l) => {
      const target = [
        l.referralNumber,
        l.firstName,
        l.lastName,
        l.email,
        l.businessName,
        l.attentionFirstName,
        l.attentionLastName,
        l.contactEmail,
        l.cityStateZip
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return target.includes(q);
    });
  }, [letters, directorySearch]);

  const filteredLedger = useMemo(() => {
    return mergedLedgerEntries.filter((e) => {
      if (ledgerFilter !== 'all' && e.status !== ledgerFilter) return false;
      if (ledgerSearch.trim()) {
        const q = ledgerSearch.toLowerCase();
        const text = [e.referralNumber, e.referrerName, e.referrerEmail, e.guestName, e.bookingRef, e.propertyName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [mergedLedgerEntries, ledgerFilter, ledgerSearch]);

  // Display values for live draft preview
  const previewIsBus = recipientType === 'business';
  const previewRecipientName = previewIsBus
    ? businessName.trim() || '[Referral Business Name]'
    : `${firstName.trim() || '[First Name]'} ${lastName.trim() || '[Last Name]'}`;
  const previewAttentionName = previewIsBus
    ? `${attentionFirstName.trim() || '[First Name]'} ${attentionLastName.trim() || '[Last Name]'}`
    : '';
  const previewEmail = previewIsBus ? busEmail.trim() : indEmail.trim();
  const previewPhone = previewIsBus ? busPhone.trim() : indPhone.trim();
  const previewFeeFormatted =
    referralFeeType === 'percentage'
      ? `${Number(referralFee || 0)}% of completed booking total`
      : `$${Number(referralFee || 0).toFixed(2)} USD per completed referral booking`;
  const previewFormattedDate = letterDate
    ? new Date(letterDate + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <section
      id="admin-referral-letter-section"
      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-indigo-600" size={20} />
            Referral Letter &amp; Commission Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Draft, review, and publish tailored referral letters for Individuals or Business Corporations, deliver via Email, PDF, or Print, and track commissions owed when guests book with a Referral Number.
          </p>
        </div>

        {/* Workspace Segmented Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => setSubTab('studio')}
            className={cn(
              'px-3.5 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              subTab === 'studio'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Referral Letter Studio
          </button>
          <button
            type="button"
            onClick={() => setSubTab('directory')}
            className={cn(
              'px-3.5 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              subTab === 'directory'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Drafts &amp; Published ({letters.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={cn(
              'px-3.5 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer',
              subTab === 'ledger'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Commission Ledger ({mergedLedgerEntries.length})
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip (Tabular Numerals) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-5 border-b border-slate-100 mb-6">
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
          <div className="text-xs font-semibold text-slate-500">Drafts Pending Review</div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {draftCount}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Require review before publish</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
          <div className="text-xs font-semibold text-slate-500">Published Letters</div>
          <div className="text-2xl font-extrabold text-indigo-700 font-mono tabular-nums mt-1">
            {publishedCount}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Active Referral Numbers</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
          <div className="text-xs font-semibold text-slate-500">Referred Room Bookings</div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
            {mergedLedgerEntries.length}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Booked via Referral Number</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/70">
          <div className="text-xs font-semibold text-slate-500">Total Commission Owed</div>
          <div className="text-2xl font-extrabold text-amber-700 font-mono tabular-nums mt-1">
            ${totalOwedAmount.toFixed(2)}
          </div>
          <div className="text-xs text-emerald-700 font-mono tabular-nums mt-0.5">
            Paid to date: ${totalPaidAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={cn(
            'mb-6 p-4 rounded-2xl border text-xs font-medium flex items-start justify-between gap-3',
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedbackBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          )}
        >
          <div className="flex items-start gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SUB-TAB 1: REFERRAL LETTER STUDIO (FORM + LIVE DRAFT REVIEW + PUBLISH) */}
      {subTab === 'studio' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* LEFT: TAILORED FORM INPUTS */}
          <div className="xl:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingId ? `Editing Letter (${referralNumber})` : 'New Referral Letter Details'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Step 1: Tailor recipient &amp; fee, then Save Draft to review before publishing.
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={() => resetFormToNew(recipientType)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus size={14} /> New Letter
                </button>
              )}
            </div>

            {/* Recipient Type Segmented Toggle */}
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-2">
                Tailor Referral Letter To:
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleRecipientTypeSwitch('individual')}
                  className={cn(
                    'py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap',
                    recipientType === 'individual'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <UserCheck size={14} /> Individual
                </button>
                <button
                  type="button"
                  onClick={() => handleRecipientTypeSwitch('business')}
                  className={cn(
                    'py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap',
                    recipientType === 'business'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Building2 size={14} /> Business Corporation
                </button>
              </div>
            </div>

            {/* Conditional Fields: Individual vs Business Corporation */}
            {recipientType === 'individual' ? (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Referral First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g. Jordan"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Referral Last Name *
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g. Carter"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Referral Email Address *
                  </label>
                  <input
                    type="email"
                    value={indEmail}
                    onChange={(e) => setIndEmail(e.target.value)}
                    placeholder="jordan.carter@example.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Referral Phone <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={indPhone}
                    onChange={(e) => setIndPhone(e.target.value)}
                    placeholder="(404) 555-0192"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Referral Business Name *
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. PeachState Travel Nursing Group, Inc."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Attention To: First Name *
                    </label>
                    <input
                      type="text"
                      value={attentionFirstName}
                      onChange={(e) => setAttentionFirstName(e.target.value)}
                      placeholder="First Name"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Attention To: Last Name *
                    </label>
                    <input
                      type="text"
                      value={attentionLastName}
                      onChange={(e) => setAttentionLastName(e.target.value)}
                      placeholder="Last Name"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Bus. Street Address *
                  </label>
                  <input
                    type="text"
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="e.g. 1200 Peachtree Street NE, Suite 400"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Bus. City, State Zip *
                  </label>
                  <input
                    type="text"
                    value={cityStateZip}
                    onChange={(e) => setCityStateZip(e.target.value)}
                    placeholder="e.g. Atlanta, GA 30309"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Contact Email Address *
                    </label>
                    <input
                      type="email"
                      value={busEmail}
                      onChange={(e) => setBusEmail(e.target.value)}
                      placeholder="housing@company.com"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Contact Phone <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="tel"
                      value={busPhone}
                      onChange={(e) => setBusPhone(e.target.value)}
                      placeholder="(404) 555-0148"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Referral Fee & Auto-Generated Referral Number */}
            <div className="pt-3 border-t border-slate-200 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {recipientType === 'individual' ? 'Ind. Referral Fee *' : 'Bus. Referral Fee *'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      {referralFeeType === 'flat' && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                          $
                        </span>
                      )}
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={referralFee}
                        onChange={(e) => setReferralFee(e.target.value)}
                        className={cn(
                          'w-full border border-slate-200 rounded-xl py-2 bg-white text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                          referralFeeType === 'flat' ? 'pl-7 pr-3' : 'pl-3 pr-7'
                        )}
                      />
                      {referralFeeType === 'percentage' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                          %
                        </span>
                      )}
                    </div>
                    <select
                      value={referralFeeType}
                      onChange={(e) => setReferralFeeType(e.target.value as ReferralFeeType)}
                      className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold bg-white text-slate-700 cursor-pointer"
                    >
                      <option value="flat">$ USD</option>
                      <option value="percentage">% Rate</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Letter Date
                  </label>
                  <input
                    type="date"
                    value={letterDate}
                    onChange={(e) => setLetterDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Referral Number (Auto-Generated)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={referralNumber}
                    onChange={(e) => setReferralNumber(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-indigo-700 bg-white uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setReferralNumber(generateLocalReferralCode(recipientType))}
                    className="px-3 py-2 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    title="Auto-generate a new Referral Number"
                  >
                    <RefreshCw size={13} /> Regenerate
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Guests enter this code at checkout to attribute the booking &amp; fee to this partner.
                </p>
              </div>
            </div>

            {/* Optional Custom Paragraphs for Draft Review */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Personal Opening Note <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={customOpeningNote}
                  onChange={(e) => setCustomOpeningNote(e.target.value)}
                  placeholder="Optional custom introductory sentence tailored to this partner..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Additional Closing Terms <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={customClosingNote}
                  onChange={(e) => setCustomClosingNote(e.target.value)}
                  placeholder="Optional custom closing note or payout cadence details..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Draft & Reset Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleSaveLetter('draft')}
                disabled={savingDraft || publishing}
                className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                <span>{editingId && status === 'draft' ? 'Update Draft' : 'Save Draft for Review'}</span>
              </button>
              <button
                type="button"
                onClick={() => resetFormToNew(recipientType)}
                className="py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>

          {/* RIGHT: DRAFT REVIEW & PUBLISH LETTER PANE */}
          <div className="xl:col-span-7 space-y-4">
            {/* Review & Publish Control Bar */}
            <div
              className={cn(
                'p-4 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3',
                isPublishedCurrent
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              )}
            >
              <div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  {isPublishedCurrent ? (
                    <>
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span className="text-emerald-900">
                        Published &amp; Ready to Email / Save PDF / Print
                      </span>
                    </>
                  ) : (
                    <>
                      <Edit3 size={15} className="text-amber-700" />
                      <span className="text-amber-900">
                        Draft Review Mode — Review Letter Below Before Publishing
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isPublishedCurrent
                    ? `Referral Number ${referralNumber} is active for guest bookings.`
                    : 'Approve and publish this draft to unlock Email, Save as PDF, and Print actions.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!isPublishedCurrent ? (
                  <button
                    type="button"
                    onClick={() => handleSaveLetter('published')}
                    disabled={publishing || savingDraft}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {publishing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>Approve &amp; Publish Referral Letter</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSaveLetter('draft')}
                    disabled={savingDraft}
                    className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 size={13} /> Revert to Draft
                  </button>
                )}
              </div>
            </div>

            {/* Publish-Gated Distribution Actions (Email / Save as PDF / Print) */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <span className="text-xs font-semibold text-slate-600">
                {isPublishedCurrent
                  ? 'Distribution Actions:'
                  : 'Distribution Locked (Publish Draft to Unlock):'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEmailModal(activePreviewLetter)}
                  disabled={!isPublishedCurrent}
                  className={cn(
                    'px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap',
                    isPublishedCurrent
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  )}
                >
                  {isPublishedCurrent ? <Mail size={14} /> : <Lock size={13} />}
                  <span>Email Referral Letter</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveAsPdf(activePreviewLetter)}
                  disabled={!isPublishedCurrent || downloadingPdf}
                  className={cn(
                    'px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap',
                    isPublishedCurrent
                      ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer shadow-xs'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  )}
                >
                  {downloadingPdf ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isPublishedCurrent ? (
                    <Download size={14} />
                  ) : (
                    <Lock size={13} />
                  )}
                  <span>Save as PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintLetter(activePreviewLetter)}
                  disabled={!isPublishedCurrent}
                  className={cn(
                    'px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap',
                    isPublishedCurrent
                      ? 'bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 cursor-pointer'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  )}
                >
                  {isPublishedCurrent ? <Printer size={14} /> : <Lock size={13} />}
                  <span>Print Letter</span>
                </button>
              </div>
            </div>

            {/* FORMATTED LETTER PAPER PREVIEW */}
            <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-10 shadow-xs text-slate-900 font-serif leading-relaxed">
              {/* Letterhead */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-4 mb-6 font-sans">
                <div>
                  <div className="text-xl font-extrabold text-slate-900 tracking-tight">
                    C&amp;SH Group Properties, LLC
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    E:candsh@cashgroupproperties.com &middot; P:404-910-3194
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-[11px] font-bold text-slate-500">
                    {isPublishedCurrent ? 'Published Referral Number' : 'Draft Referral Number'}
                  </div>
                  <div className="text-base font-mono font-extrabold text-indigo-700 mt-0.5">
                    {referralNumber || 'REF-PENDING'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{previewFormattedDate}</div>
                </div>
              </div>

              {/* Recipient Address Block */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 font-sans text-xs space-y-1">
                <div className="text-sm font-bold text-slate-900">{previewRecipientName}</div>
                {previewIsBus && (
                  <>
                    <div className="text-slate-700">
                      <strong>Attention To:</strong> {previewAttentionName}
                    </div>
                    <div className="text-slate-600">
                      {streetAddress.trim() || '[Bus. Street Address]'}
                    </div>
                    <div className="text-slate-600">
                      {cityStateZip.trim() || '[Bus. City, State Zip]'}
                    </div>
                  </>
                )}
                <div className="text-slate-600 pt-1">
                  Email: <span className="font-semibold text-slate-800">{previewEmail || '[Email Address]'}</span>
                  {previewPhone ? ` · Phone: ${previewPhone}` : ''}
                </div>
              </div>

              {/* Letter Subject */}
              <p className="font-sans text-sm font-bold text-slate-900 mb-4">
                Re: Short-Term Rental Referral Partnership &amp; Fee Agreement ({referralNumber})
              </p>

              {/* Salutation & Body */}
              <p className="text-sm mb-3">
                {previewIsBus
                  ? `Dear ${attentionFirstName.trim() ? `${attentionFirstName.trim()} ${attentionLastName.trim()}`.trim() : previewRecipientName},`
                  : `Dear ${firstName.trim() || '[First Name]'},`}
              </p>

              {customOpeningNote.trim() && <p className="text-sm mb-3">{customOpeningNote.trim()}</p>}

              <p className="text-sm mb-4">
                C&amp;SH Group Properties, LLC is pleased to extend this formal Referral Partnership Letter inviting you to refer qualified guests in need of clean, quiet, keyless short-term rental housing across our residential portfolio.
              </p>

              {/* Mandatory 4 Target Short-Term Rental Segments */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 my-5 font-sans">
                <p className="text-xs font-bold text-slate-900 mb-2">
                  C&amp;SH Group Properties, LLC is open to short Term Rental related to:
                </p>
                <ul className="list-disc pl-5 text-xs text-slate-800 space-y-1.5">
                  <li className="font-semibold">Traveling Nurses</li>
                  <li className="font-semibold">
                    Individuals who experience water damage in their home and need temporary housing during repair
                  </li>
                  <li className="font-semibold">Flight Attendants</li>
                  <li className="font-semibold">
                    Musician housing who will perform at St. James Live 5 miles away
                  </li>
                </ul>
              </div>

              {/* Fee & Referral Number Box */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 my-5 font-sans text-xs space-y-1.5">
                <div className="font-bold text-indigo-950">Referral Fee &amp; Booking Attribution</div>
                <div className="text-indigo-900">
                  <strong>Referral Number:</strong>{' '}
                  <span className="font-mono font-bold">{referralNumber}</span>
                  {' · '}
                  <strong>{previewIsBus ? 'Bus. Referral Fee' : 'Ind. Referral Fee'}:</strong>{' '}
                  <span className="font-bold">{previewFeeFormatted}</span>
                </div>
                <p className="text-indigo-800/90 leading-relaxed">
                  When a guest books a room using Referral Number <strong>{referralNumber}</strong>, the reservation is recorded in our Referral Commission Ledger and your referral fee is marked as owed to {previewRecipientName}.
                </p>
              </div>

              {customClosingNote.trim() && <p className="text-sm mb-4">{customClosingNote.trim()}</p>}

              {/* Mandatory Exact Signature */}
              <div className="mt-8 pt-4 border-t border-slate-200 font-sans text-xs text-slate-800 space-y-0.5">
                <div>Sincerely</div>
                <div className="font-bold text-slate-900 pt-1">Housing Management</div>
                <div className="font-bold text-slate-900">C&amp;SH Group Properties, LLC</div>
                <div>E:candsh@cashgroupproperties.com</div>
                <div>P:404-910-3194</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SAVED DRAFTS & PUBLISHED LETTERS DIRECTORY */}
      {subTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                placeholder="Search referral #, name, business, or email..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                resetFormToNew('individual');
                setSubTab('studio');
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus size={14} /> Create New Referral Letter
            </button>
          </div>

          {loadingData ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Loading referral letters...
            </div>
          ) : filteredLetters.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <FileText size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No referral letters created yet</p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Create a tailored Individual or Business Corporation referral letter draft to get started.
              </p>
              <button
                type="button"
                onClick={() => setSubTab('studio')}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Create First Draft
              </button>
            </div>
          ) : (
            <div
              className={cn(
                'overflow-x-auto border border-slate-200 rounded-2xl',
                filteredLetters.length > 10 && 'max-h-[460px] overflow-y-auto'
              )}
            >
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Referral #</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Recipient / Attention To</th>
                    <th className="px-4 py-3">Email &amp; Phone</th>
                    <th className="px-4 py-3 text-right">Fee Rate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLetters.map((l) => {
                    const isBus = l.recipientType === 'business';
                    const name = isBus
                      ? l.businessName || 'Business Partner'
                      : `${l.firstName || ''} ${l.lastName || ''}`.trim();
                    const attn = isBus
                      ? `Attn: ${l.attentionFirstName || ''} ${l.attentionLastName || ''}`.trim()
                      : '';
                    const email = isBus ? l.contactEmail : l.email;
                    const phone = isBus ? l.contactPhone : l.phone;

                    return (
                      <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                          {l.referralNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                          {isBus ? 'Business Corp.' : 'Individual'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{name}</div>
                          {attn && <div className="text-slate-500">{attn}</div>}
                          {isBus && l.cityStateZip && (
                            <div className="text-slate-400">{l.cityStateZip}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{email || '—'}</div>
                          {phone && <div className="text-slate-400">{phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                          {l.referralFeeType === 'percentage'
                            ? `${Number(l.referralFee || 0)}%`
                            : `$${Number(l.referralFee || 0).toFixed(2)}`}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              'font-bold',
                              l.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                            )}
                          >
                            {l.status === 'published' ? 'Published' : 'Draft Review'}
                          </span>
                          {l.lastEmailedAt && (
                            <div className="text-[11px] text-slate-400">
                              Emailed {new Date(l.lastEmailedAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => loadLetterIntoStudio(l)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg cursor-pointer"
                            >
                              {l.status === 'draft' ? 'Review & Publish' : 'Open'}
                            </button>
                            {l.status === 'published' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEmailModal(l)}
                                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg cursor-pointer"
                                  title="Email Letter"
                                >
                                  <Send size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveAsPdf(l)}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                                  title="Save as PDF"
                                >
                                  <Download size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintLetter(l)}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer"
                                  title="Print Letter"
                                >
                                  <Printer size={13} />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteLetter(l)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: REFERRAL COMMISSION & OWED LEDGER */}
      {subTab === 'ledger' && (
        <div className="space-y-6">
          {/* Grouped Balance Summary by Individual / Business Corporation */}
          {referrerBalances.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-3">
                Balances Owed by Individual / Business Corporation
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {referrerBalances.map((grp) => (
                  <div
                    key={grp.referralNumber}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{grp.referrerName}</div>
                        <div className="text-xs text-slate-500">
                          {grp.recipientType === 'business' ? 'Business Corporation' : 'Individual'} ·{' '}
                          <span className="font-mono font-semibold text-indigo-700">
                            {grp.referralNumber}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {grp.bookingCount} booking{grp.bookingCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-500">Owed: </span>
                        <span className="font-mono font-extrabold text-amber-700 tabular-nums">
                          ${grp.totalOwed.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Paid: </span>
                        <span className="font-mono font-bold text-emerald-700 tabular-nums">
                          ${grp.totalPaid.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
              <div className="relative flex-1 sm:max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Search referral #, referrer, or guest..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center p-1 bg-slate-100 rounded-xl">
                {(['all', 'owed', 'paid'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLedgerFilter(f)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-bold rounded-lg capitalize cursor-pointer',
                      ledgerFilter === f
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {f === 'all' ? 'All' : f === 'owed' ? 'Owed' : 'Paid'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={exportLedgerCsv}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileDown size={14} /> Export Ledger CSV
            </button>
          </div>

          {/* Itemized Booking Referral Ledger Table */}
          {filteredLedger.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <DollarSign size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                No referral commission entries found
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                When a guest books a room using a published Referral Number, the booking and exact commission owed to the Individual or Business Corporation are automatically recorded here.
              </p>
            </div>
          ) : (
            <div
              className={cn(
                'overflow-x-auto border border-slate-200 rounded-2xl',
                filteredLedger.length > 10 && 'max-h-[460px] overflow-y-auto'
              )}
            >
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Referral #</th>
                    <th className="px-4 py-3">Owed To (Individual / Business)</th>
                    <th className="px-4 py-3">Guest &amp; Booking Ref</th>
                    <th className="px-4 py-3">Property / Room / Stay</th>
                    <th className="px-4 py-3 text-right">Booking Total</th>
                    <th className="px-4 py-3 text-right">Amount Owed</th>
                    <th className="px-4 py-3">Ledger Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLedger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {entry.referralNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{entry.referrerName}</div>
                        <div className="text-slate-500">
                          {entry.recipientType === 'business' ? 'Business Corp.' : 'Individual'}
                          {entry.referrerEmail ? ` · ${entry.referrerEmail}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{entry.guestName}</div>
                        <div className="text-slate-500 font-mono">
                          Ref #{entry.bookingRef || entry.bookingId.substring(0, 6).toUpperCase()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="font-medium text-slate-800">{entry.propertyName}</div>
                        <div>{entry.roomSummary}</div>
                        <div className="text-slate-400 font-mono">
                          {entry.checkIn} to {entry.checkOut}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        ${Number(entry.bookingTotal || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-extrabold tabular-nums text-slate-900 whitespace-nowrap">
                        ${Number(entry.owedAmount || 0).toFixed(2)}
                        {entry.feeDescription && (
                          <div className="text-[11px] font-normal text-slate-400">
                            {entry.feeDescription}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {entry.status === 'paid' ? (
                          <div>
                            <span className="font-bold text-emerald-700">Paid</span>
                            {entry.paidAt && (
                              <div className="text-[11px] text-slate-400">
                                {new Date(entry.paidAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-bold text-amber-700">Owed / Unpaid</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleLedgerStatus(entry)}
                          disabled={updatingLedgerId === entry.id}
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap',
                            entry.status === 'paid'
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                          )}
                        >
                          {updatingLedgerId === entry.id
                            ? 'Updating...'
                            : entry.status === 'paid'
                            ? 'Mark Owed'
                            : 'Mark Paid'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Email Referral Letter Modal */}
      {showEmailModal && emailTargetLetter && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Mail size={16} className="text-indigo-600" />
                Email Published Referral Letter ({emailTargetLetter.referralNumber})
              </h4>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSendReferralEmail} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Recipient Email Address ({emailTargetLetter.recipientType === 'business' ? 'Contact Email' : 'Referral Email'}) *
                </label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">CC (Optional)</label>
                <input
                  type="email"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Subject *</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 leading-relaxed">
                Includes the tailored HTML Referral Letter highlighting short-term rental opportunities (Traveling Nurses, Water Damage Temporary Housing, Flight Attendants, Musicians at St. James Live) plus a downloadable PDF copy attached automatically.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  {sendingEmail ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Send Referral Letter
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
