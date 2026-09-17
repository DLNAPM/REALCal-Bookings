import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Booking, Property } from '../types';
import { 
  X, Printer, Mail, Copy, Check, FileCheck, Building2, Calendar, 
  CreditCard, User, Phone, MapPin, ShieldCheck, AlertCircle, Plus, Trash2,
  Send, Loader2, Sparkles, CheckCircle, ArrowRight
} from 'lucide-react';

export interface ProofOfResidencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBooking?: Booking | null;
  bookings: Booking[];
  properties: Property[];
  users?: any[];
  currentUser?: any;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  date: string;
  description: string;
  amount: number;
  paid: boolean;
}

export const ProofOfResidencyModal: React.FC<ProofOfResidencyModalProps> = ({
  isOpen,
  onClose,
  initialBooking,
  bookings,
  properties,
  users = [],
  currentUser
}) => {
  // Helper to calculate consecutive days
  const calculateDays = (inStr: string, outStr: string): number => {
    if (!inStr || !outStr) return 0;
    try {
      const dIn = new Date(inStr.split('T')[0] + 'T12:00:00');
      const dOut = new Date(outStr.split('T')[0] + 'T12:00:00');
      const diff = dOut.getTime() - dIn.getTime();
      return diff > 0 ? Math.round(diff / (1000 * 60 * 60 * 24)) : 0;
    } catch {
      return 0;
    }
  };

  // Selected Booking ID
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  
  // Customization Form States
  const [recipientType, setRecipientType] = useState<'bank' | 'insurance' | 'government' | 'general' | 'custom'>('bank');
  const [institutionName, setInstitutionName] = useState<string>('First National Bank - Underwriting Department');
  const [attentionTo, setAttentionTo] = useState<string>('Loan Processing & Verification Division');
  const [referenceNumber, setReferenceNumber] = useState<string>('');

  // Guest Details
  const [guestName, setGuestName] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');

  // Stay & Property
  const [propertyName, setPropertyName] = useState<string>('Stonewall Villa');
  const [propertyAddress, setPropertyAddress] = useState<string>('3855 Stonewall Tell Rd, Atlanta, GA 30349');
  const [checkInDate, setCheckInDate] = useState<string>('');
  const [checkOutDate, setCheckOutDate] = useState<string>('');
  const [roomsCount, setRoomsCount] = useState<number>(1);
  const [roomsDescription, setRoomsDescription] = useState<string>('Room 1 (Master Bedroom Suite)');

  // Invoices
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);

  // Corporate Administration Details
  const [companyName, setCompanyName] = useState<string>(
    'C&SH Group Properties, LLC'
  );
  const [corporateAddress, setCorporateAddress] = useState<string>(
    '9404 West 144th Place, Orland Park, IL 60462'
  );
  const [corporatePhone, setCorporatePhone] = useState<string>('(404) 555-0199');
  const [corporateEmail, setCorporateEmail] = useState<string>(
    'admin@cshgroupproperties.com'
  );

  // Signer Details
  const [signerName, setSignerName] = useState<string>(
    currentUser?.displayName || 'David Laniger'
  );
  const [signerTitle, setSignerTitle] = useState<string>(
    'Property Operations Director & Authorized Corporate Officer'
  );
  const [signerPhone, setSignerPhone] = useState<string>('(404) 555-0199');
  const [signerEmail, setSignerEmail] = useState<string>(
    currentUser?.email || 'dlaniger.napm.consulting@gmail.com'
  );

  // Email Action States
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailCc, setEmailCc] = useState<string>(currentUser?.email || '');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSendSuccess, setEmailSendSuccess] = useState<string | null>(null);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);

  // Copy Feedback
  const [copied, setCopied] = useState<boolean>(false);

  // Document Reference Code
  const [docVerificationCode, setDocVerificationCode] = useState<string>('');

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Filter ONLY paid and non-cancelled bookings for the verification process
  const isPaidAndNotCancelled = (b: Booking): boolean => {
    if (!b) return false;
    // Strictly exclude cancelled bookings or invoices
    if (b.status === 'cancelled') return false;
    if (b.invoiceDetails?.cancelled) return false;

    // Must be verified as paid
    if (b.invoiceDetails) {
      return b.invoiceDetails.paid === true;
    }
    return b.status === 'confirmed';
  };

  const eligibleBookings = useMemo(() => {
    return bookings.filter(isPaidAndNotCancelled);
  }, [bookings]);

  // Set initial selected booking or default to first qualifying booking
  useEffect(() => {
    if (initialBooking && isPaidAndNotCancelled(initialBooking)) {
      setSelectedBookingId(initialBooking.id);
    } else if (eligibleBookings.length > 0) {
      // Find first booking with > 5 days among paid, or simply first paid booking
      const qualifying = eligibleBookings.find(b => calculateDays(b.checkIn, b.checkOut) > 5);
      setSelectedBookingId(qualifying ? qualifying.id : eligibleBookings[0].id);
    } else {
      setSelectedBookingId('');
    }
  }, [initialBooking, eligibleBookings]);

  // When selectedBookingId changes, populate fields
  useEffect(() => {
    if (!selectedBookingId) return;
    const b = eligibleBookings.find(x => x.id === selectedBookingId);
    if (!b) return;

    const prop = properties.find(p => p.id === b.propertyId);
    const userObj = users.find(u => u.uid === b.userId);

    // Guest details
    const gName = b.guestName || userObj?.displayName || b.invoiceDetails?.sponsorName || 'Valued Guest';
    const gEmail = b.guestEmail || userObj?.email || b.invoiceDetails?.sponsorEmail || '';
    const gPhone = b.guestPhone || userObj?.phone || b.invoiceDetails?.sponsorPhone || '';
    setGuestName(gName);
    setGuestEmail(gEmail);
    setGuestPhone(gPhone);
    setEmailTo(gEmail);

    // Property details
    const pName = b.propertyName || prop?.name || 'Stonewall Villa';
    const pLoc = prop?.location || '3855 Stonewall Tell Rd, Atlanta, GA 30349';
    setPropertyName(pName);
    setPropertyAddress(pLoc);

    // Dates
    setCheckInDate(b.checkIn ? b.checkIn.split('T')[0] : '');
    setCheckOutDate(b.checkOut ? b.checkOut.split('T')[0] : '');

    // Rooms
    if (b.selectedBedrooms && b.selectedBedrooms.length > 0) {
      setRoomsCount(b.selectedBedrooms.length);
      const roomDesc = b.selectedBedrooms.map((r: any) => {
        const num = typeof r === 'object' && r !== null ? r.roomNumber : r;
        return `Room ${num}`;
      }).join(', ');
      setRoomsDescription(`${b.selectedBedrooms.length} Dedicated Bedroom(s) (${roomDesc})`);
    } else if (b.selectedBedroom) {
      setRoomsCount(1);
      const num = typeof b.selectedBedroom === 'object' && b.selectedBedroom !== null 
        ? b.selectedBedroom.roomNumber 
        : b.selectedBedroom;
      setRoomsDescription(`1 Dedicated Suite (Room ${num})`);
    } else {
      setRoomsCount(prop?.bedrooms?.length || 5);
      setRoomsDescription(`Full Estate / Private Villa Buyout (${prop?.bedrooms?.length || 5} Bedrooms)`);
    }

    // Invoices preparation - STRICTLY ONLY PAID & NON-CANCELLED INVOICES
    const invList: InvoiceItem[] = [];

    // 1. Primary invoice from booking (only if paid and non-cancelled)
    if (b.invoiceDetails) {
      const isCancelled = b.invoiceDetails.cancelled || b.status === 'cancelled';
      const isPaid = b.invoiceDetails.paid === true;
      if (isPaid && !isCancelled) {
        const invNum = b.invoiceDetails.invoiceNumber || `INV-${b.bookingRef || b.id.substring(0, 6).toUpperCase()}`;
        const invTotal = b.invoiceDetails.grandTotal !== undefined 
          ? b.invoiceDetails.grandTotal 
          : (b.invoiceDetails.baseAmount || (b.totalPrice / 100));
        const invDate = b.invoiceDetails.sentAt 
          ? new Date(b.invoiceDetails.sentAt).toISOString().split('T')[0]
          : (b.checkIn ? b.checkIn.split('T')[0] : new Date().toISOString().split('T')[0]);

        invList.push({
          id: 'primary-inv',
          invoiceNumber: invNum,
          date: invDate,
          description: `Lodging Accommodations (${b.checkIn} to ${b.checkOut})`,
          amount: Number(invTotal) || 0,
          paid: true
        });
      }
    } else if (b.status === 'confirmed' && b.totalPrice) {
      invList.push({
        id: 'booking-payment',
        invoiceNumber: `INV-${b.bookingRef || b.id.substring(0, 6).toUpperCase()}`,
        date: b.checkIn ? b.checkIn.split('T')[0] : new Date().toISOString().split('T')[0],
        description: `Full Accommodations Stay (${b.checkIn} to ${b.checkOut})`,
        amount: b.totalPrice / 100,
        paid: true
      });
    }

    // 2. Check for other paid bookings/invoices by same guest (chained or extension stays)
    // ONLY include paid bookings and non-cancelled invoices
    const otherBookings = eligibleBookings.filter(other => 
      other.id !== b.id &&
      ((other.userId && other.userId === b.userId) || 
       (other.guestEmail && other.guestEmail.toLowerCase() === gEmail.toLowerCase()) ||
       (other.guestName && other.guestName.toLowerCase() === gName.toLowerCase()))
    );

    otherBookings.forEach((ob) => {
      if (ob.invoiceDetails) {
        const isCancelled = ob.invoiceDetails.cancelled || ob.status === 'cancelled';
        const isPaid = ob.invoiceDetails.paid === true;
        if (isPaid && !isCancelled) {
          const oNum = ob.invoiceDetails.invoiceNumber || `INV-${ob.bookingRef || ob.id.substring(0, 6).toUpperCase()}`;
          const oTotal = ob.invoiceDetails.grandTotal !== undefined 
            ? ob.invoiceDetails.grandTotal 
            : (ob.invoiceDetails.baseAmount || (ob.totalPrice / 100));
          const oDate = ob.invoiceDetails.sentAt 
            ? new Date(ob.invoiceDetails.sentAt).toISOString().split('T')[0]
            : (ob.checkIn ? ob.checkIn.split('T')[0] : '');

          invList.push({
            id: `linked-inv-${ob.id}`,
            invoiceNumber: oNum,
            date: oDate,
            description: `Stay Extension / Renewal (${ob.checkIn} to ${ob.checkOut})`,
            amount: Number(oTotal) || 0,
            paid: true
          });
        }
      } else if (ob.status === 'confirmed' && ob.totalPrice) {
        invList.push({
          id: `linked-booking-${ob.id}`,
          invoiceNumber: `INV-${ob.bookingRef || ob.id.substring(0, 6).toUpperCase()}`,
          date: ob.checkIn ? ob.checkIn.split('T')[0] : '',
          description: `Stay Extension / Additional Booking (${ob.checkIn} to ${ob.checkOut})`,
          amount: ob.totalPrice / 100,
          paid: true
        });
      }
    });

    setInvoices(invList);

    // Verification Code
    const code = `VER-${(b.bookingRef || b.id.substring(0, 5)).toUpperCase()}-${new Date().getFullYear()}`;
    setDocVerificationCode(code);

    // Default email subject
    setEmailSubject(`Official Proof of Residency Letter - ${gName} - ${pName}`);
  }, [selectedBookingId, eligibleBookings, properties, users]);

  // Recipient preset handler
  const handleRecipientTypeChange = (type: 'bank' | 'insurance' | 'government' | 'general' | 'custom') => {
    setRecipientType(type);
    if (type === 'bank') {
      setInstitutionName('First National Bank / Mortgage Underwriting Division');
      setAttentionTo('Loan Verification & Residency Compliance Department');
    } else if (type === 'insurance') {
      setInstitutionName('Insurance Carrier & Claims Processing Agency');
      setAttentionTo('Property & Casualty Claims Verification Office');
    } else if (type === 'government') {
      setInstitutionName('Department of Housing & Community Development / Public Agency');
      setAttentionTo('Residency Verification & Registry Office');
    } else if (type === 'general') {
      setInstitutionName('To Whom It May Concern');
      setAttentionTo('Official Verification & Records Department');
    }
  };

  // Calculations - Automatically recalculates Stay Days whenever Check-In or Check-Out dates change
  const consecutiveDays = useMemo(() => {
    return calculateDays(checkInDate, checkOutDate);
  }, [checkInDate, checkOutDate]);

  const meetsThreshold = consecutiveDays > 5;

  // Invoices metrics - Automatically recalculates Grand Combined Total whenever invoices are removed, added, or updated
  const totalInvoicesCount = invoices.length;
  const grandTotalAmount = useMemo(() => {
    return invoices.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [invoices]);

  // Quick Stay Extension Handler
  const handleExtendStay = (daysToAdd: number) => {
    try {
      const baseStr = checkOutDate || checkInDate;
      if (!baseStr) return;
      const d = new Date(baseStr.split('T')[0] + 'T12:00:00');
      d.setDate(d.getDate() + daysToAdd);
      setCheckOutDate(d.toISOString().split('T')[0]);
    } catch (e) {
      console.error("Error extending stay:", e);
    }
  };

  // Reload/Reset original paid invoices for the selected guest
  const handleReloadGuestInvoices = () => {
    if (!selectedBookingId) return;
    const b = eligibleBookings.find(x => x.id === selectedBookingId);
    if (!b) return;

    const gName = b.guestName || b.invoiceDetails?.sponsorName || 'Guest';
    const gEmail = b.guestEmail || b.invoiceDetails?.sponsorEmail || '';

    const invList: InvoiceItem[] = [];

    // Primary invoice from booking
    if (b.invoiceDetails) {
      const isCancelled = b.invoiceDetails.cancelled || b.status === 'cancelled';
      const isPaid = b.invoiceDetails.paid === true;
      if (isPaid && !isCancelled) {
        const invNum = b.invoiceDetails.invoiceNumber || `INV-${b.bookingRef || b.id.substring(0, 6).toUpperCase()}`;
        const invTotal = b.invoiceDetails.grandTotal !== undefined 
          ? b.invoiceDetails.grandTotal 
          : (b.invoiceDetails.baseAmount || (b.totalPrice / 100));
        const invDate = b.invoiceDetails.sentAt 
          ? new Date(b.invoiceDetails.sentAt).toISOString().split('T')[0]
          : (b.checkIn ? b.checkIn.split('T')[0] : new Date().toISOString().split('T')[0]);

        invList.push({
          id: 'primary-inv',
          invoiceNumber: invNum,
          date: invDate,
          description: `Lodging Accommodations (${b.checkIn} to ${b.checkOut})`,
          amount: Number(invTotal) || 0,
          paid: true
        });
      }
    } else if (b.status === 'confirmed' && b.totalPrice) {
      invList.push({
        id: 'booking-payment',
        invoiceNumber: `INV-${b.bookingRef || b.id.substring(0, 6).toUpperCase()}`,
        date: b.checkIn ? b.checkIn.split('T')[0] : new Date().toISOString().split('T')[0],
        description: `Full Accommodations Stay (${b.checkIn} to ${b.checkOut})`,
        amount: b.totalPrice / 100,
        paid: true
      });
    }

    // Additional paid invoices for same guest
    const otherBookings = eligibleBookings.filter(other => 
      other.id !== b.id &&
      ((other.userId && other.userId === b.userId) || 
       (other.guestEmail && gEmail && other.guestEmail.toLowerCase() === gEmail.toLowerCase()) ||
       (other.guestName && gName && other.guestName.toLowerCase() === gName.toLowerCase()))
    );

    otherBookings.forEach((ob) => {
      if (ob.invoiceDetails) {
        const isCancelled = ob.invoiceDetails.cancelled || ob.status === 'cancelled';
        const isPaid = ob.invoiceDetails.paid === true;
        if (isPaid && !isCancelled) {
          const oNum = ob.invoiceDetails.invoiceNumber || `INV-${ob.bookingRef || ob.id.substring(0, 6).toUpperCase()}`;
          const oTotal = ob.invoiceDetails.grandTotal !== undefined 
            ? ob.invoiceDetails.grandTotal 
            : (ob.invoiceDetails.baseAmount || (ob.totalPrice / 100));
          const oDate = ob.invoiceDetails.sentAt 
            ? new Date(ob.invoiceDetails.sentAt).toISOString().split('T')[0]
            : (ob.checkIn ? ob.checkIn.split('T')[0] : '');

          invList.push({
            id: `linked-inv-${ob.id}`,
            invoiceNumber: oNum,
            date: oDate,
            description: `Stay Extension / Renewal (${ob.checkIn} to ${ob.checkOut})`,
            amount: Number(oTotal) || 0,
            paid: true
          });
        }
      } else if (ob.status === 'confirmed' && ob.totalPrice) {
        invList.push({
          id: `linked-booking-${ob.id}`,
          invoiceNumber: `INV-${ob.bookingRef || ob.id.substring(0, 6).toUpperCase()}`,
          date: ob.checkIn ? ob.checkIn.split('T')[0] : '',
          description: `Stay Extension / Additional Booking (${ob.checkIn} to ${ob.checkOut})`,
          amount: ob.totalPrice / 100,
          paid: true
        });
      }
    });

    setInvoices(invList);
  };

  // Invoice management
  const handleAddInvoice = () => {
    const newInv: InvoiceItem = {
      id: 'inv-' + Math.random().toString(36).substring(2, 7),
      invoiceNumber: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString().split('T')[0],
      description: 'Additional Lodging / Verified Extension Fee',
      amount: 500,
      paid: true
    };
    setInvoices([...invoices, newInv]);
  };

  const handleUpdateInvoice = (id: string, field: keyof InvoiceItem, val: any) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, [field]: val } : inv));
  };

  const handleRemoveInvoice = (id: string) => {
    // Automatically recalculates grand total via grandTotalAmount useMemo
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  // Format Dates for Letter
  const formatLetterDate = (dStr: string) => {
    if (!dStr) return 'N/A';
    try {
      const d = new Date(dStr + 'T12:00:00');
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dStr;
    }
  };

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Print Handling (window.print + sandboxed iframe fallback)
  const handlePrint = () => {
    const htmlToPrint = generatePrintableHtml();

    try {
      const printWindow = window.open('', '_blank', 'width=900,height=1150');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlToPrint);
        printWindow.document.close();
        return;
      }
    } catch (e) {
      console.warn("window.open blocked, using iframe fallback for letter print:", e);
    }

    // Fallback: Invisible iframe printing
    try {
      const existingIframe = document.getElementById('proof-of-residency-print-frame');
      if (existingIframe) existingIframe.remove();

      const printFrame = document.createElement('iframe');
      printFrame.id = 'proof-of-residency-print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(htmlToPrint);
        frameDoc.close();
        printFrame.contentWindow?.focus();
        setTimeout(() => {
          printFrame.contentWindow?.print();
        }, 600);
      }
    } catch (fallbackErr) {
      console.error("Print fallback error:", fallbackErr);
      window.print();
    }
  };

  // Generate full HTML for Print & Email
  const generatePrintableHtml = (): string => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Proof of Residency Letter - ${guestName} - ${propertyName}</title>
  <style>
    @page {
      size: letter;
      margin: 0.55in;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #0f172a;
      line-height: 1.5;
      font-size: 13.5px;
    }
    .letter-container {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.2in 0.3in;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #4f46e5;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #1e1b4b;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .brand-sub {
      font-size: 11px;
      font-weight: 700;
      color: #4f46e5;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 3px;
    }
    .contact-box {
      text-align: right;
      font-size: 11px;
      color: #475569;
      line-height: 1.4;
    }
    .doc-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 18px;
      font-size: 12px;
      color: #334155;
    }
    .recipient-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .subject-line {
      font-size: 14px;
      font-weight: 800;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 6px;
      margin-bottom: 14px;
    }
    .body-paragraph {
      margin-bottom: 14px;
      color: #1e293b;
      text-align: justify;
    }
    .verification-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 16px 0 20px 0;
    }
    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .info-card-full {
      grid-column: span 2;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .info-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .info-val {
      font-size: 13.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .highlight-pill {
      display: inline-block;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      margin-top: 4px;
    }
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 16px 0;
      font-size: 12px;
    }
    .invoice-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.05em;
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid #cbd5e1;
    }
    .invoice-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .grand-total-row {
      background: #eef2ff !important;
      font-weight: 800 !important;
      color: #1e1b4b !important;
      font-size: 13px !important;
    }
    .signature-section {
      margin-top: 26px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
    .sig-block {
      max-width: 380px;
    }
    .cursive-signature {
      font-family: 'Brush Script MT', 'Dancing Script', 'Caveat', 'Segoe Script', cursive, serif;
      font-size: 32px;
      color: #1e293b;
      margin: 8px 0 4px 0;
      transform: rotate(-2deg);
      display: inline-block;
    }
    .official-seal {
      width: 140px;
      height: 140px;
      border: 2px dashed #4f46e5;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 10px;
      color: #4338ca;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #f5f3ff;
      opacity: 0.92;
    }
    .footer-disclaimer {
      margin-top: 26px;
      padding-top: 12px;
      border-top: 1px solid #f1f5f9;
      font-size: 9.5px;
      color: #64748b;
      text-align: center;
      line-height: 1.4;
    }
    .print-bar {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    @media print {
      .print-bar {
        display: none !important;
      }
      body {
        font-size: 12pt;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <div style="font-weight: bold; font-size: 13px;">Official Proof of Residency Letter &bull; Ready for 8.5&times;11 PDF Print</div>
    <button onclick="window.print()" style="background: #4f46e5; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>

  <div class="letter-container">
    <!-- Header Letterhead -->
    <div class="header">
      <div>
        <div class="brand-title">${companyName}</div>
        <div class="brand-sub">Executive Accommodations &bull; Residential Management Division</div>
        <div style="font-size: 12px; color: #475569; margin-top: 3px;">Operating: <strong>${propertyName}</strong></div>
      </div>
      <div class="contact-box">
        <div><strong>Corporate Administration:</strong></div>
        <div>${corporateAddress}</div>
        <div>Phone: ${corporatePhone}</div>
        <div>Email: ${corporateEmail}</div>
      </div>
    </div>

    <!-- Date & Ref -->
    <div class="doc-meta">
      <div><strong>Date of Issuance:</strong> ${todayFormatted}</div>
      <div><strong>Verification ID:</strong> <span style="font-family: monospace; font-weight: bold; color: #4f46e5;">${docVerificationCode}</span></div>
    </div>

    <!-- Recipient -->
    <div class="recipient-box">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">VERIFICATION PRESENTED TO:</div>
      <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${institutionName}</div>
      <div style="font-size: 12px; color: #475569; margin-top: 2px;">ATTN: ${attentionTo}</div>
      ${referenceNumber ? `<div style="font-size: 11px; color: #6366f1; font-weight: 600; margin-top: 3px;">Reference / Policy / Loan #: ${referenceNumber}</div>` : ''}
    </div>

    <!-- Subject -->
    <div class="subject-line">
      RE: CERTIFICATION OF CONTINUOUS RESIDENCY & ACCOMMODATION VERIFICATION
    </div>

    <!-- Letter Body -->
    <p class="body-paragraph">
      To Whom It May Concern:
    </p>
    <p class="body-paragraph">
      This official letter certifies that <strong>${guestName}</strong> (${guestEmail ? `Email: ${guestEmail}` : ''}${guestPhone ? ` &bull; Tel: ${guestPhone}` : ''}) has established and maintained continuous, uninterrupted occupancy and physical residency at the residential estate address detailed below under our lawful property management administration.
    </p>

    <!-- Key Verification Data Grid -->
    <div class="verification-grid">
      <div class="info-card">
        <div class="info-label">1. Property & Physical Address</div>
        <div class="info-val">${propertyName}</div>
        <div style="font-size: 12px; color: #475569; margin-top: 2px;">${propertyAddress}</div>
      </div>

      <div class="info-card">
        <div class="info-label">2. Room(s) Reserved by Guest</div>
        <div class="info-val">${roomsCount} Dedicated Room${roomsCount > 1 ? 's' : ''}</div>
        <div style="font-size: 12px; color: #475569; margin-top: 2px;">${roomsDescription}</div>
      </div>

      <div class="info-card-full">
        <div class="info-label">3. Time Period of Continuous Stay</div>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 13.5px; font-weight: bold; color: #0f172a;">${formatLetterDate(checkInDate)}</span>
            <span style="color: #64748b; margin: 0 6px;">through</span>
            <span style="font-size: 13.5px; font-weight: bold; color: #0f172a;">${formatLetterDate(checkOutDate)}</span>
          </div>
          <div>
            <span class="highlight-pill">&check; ${consecutiveDays} Consecutive Days / Nights (${consecutiveDays > 5 ? 'Meets & Exceeds >5 Day Residency Threshold' : 'Authorized Residency'})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Financial Accounting & Invoices Section -->
    <div style="margin-top: 22px;">
      <div style="font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between;">
        <span>4. Financial & Invoicing Accounting Summary</span>
        <span style="color: #4f46e5;">Total Invoices Issued: ${totalInvoicesCount}</span>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Billing Date</th>
            <th>Description of Accommodations</th>
            <th>Payment Status</th>
            <th style="text-align: right;">Amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map(inv => `
            <tr>
              <td style="font-family: monospace; font-weight: bold; color: #4f46e5;">${inv.invoiceNumber}</td>
              <td>${inv.date || 'N/A'}</td>
              <td>${inv.description}</td>
              <td>
                <span style="color: #065f46; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; font-size: 10px;">
                  &check; ${inv.paid ? 'PAID IN FULL' : 'PENDING'}
                </span>
              </td>
              <td style="text-align: right; font-family: monospace; font-weight: 700;">$${Number(inv.amount).toFixed(2)}</td>
            </tr>
          `).join('')}
          ${invoices.length > 1 ? `
            <tr class="grand-total-row">
              <td colspan="4" style="text-align: right; text-transform: uppercase; padding: 10px;">
                Grand Total of All Invoices Combined:
              </td>
              <td style="text-align: right; font-family: monospace; padding: 10px; color: #4338ca;">
                $${grandTotalAmount.toFixed(2)} USD
              </td>
            </tr>
          ` : `
            <tr class="grand-total-row">
              <td colspan="4" style="text-align: right; text-transform: uppercase; padding: 8px;">
                Total Invoiced & Paid:
              </td>
              <td style="text-align: right; font-family: monospace; padding: 8px; color: #4338ca;">
                $${grandTotalAmount.toFixed(2)} USD
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>

    <p class="body-paragraph" style="font-size: 12px; color: #334155; margin-top: 10px;">
      All lodging fees for the aforementioned duration have been reconciled in full with zero delinquent balance remaining. The resident has adhered to all house terms, maintaining authorized, verified occupancy throughout this timeline.
    </p>

    <!-- Professional Signature & Corporate Seal -->
    <div class="signature-section">
      <div class="sig-block">
        <div style="font-size: 12px; color: #475569;">Sincerely and Respectfully submitted,</div>
        <div class="cursive-signature">${signerName}</div>
        <div style="font-weight: 800; color: #0f172a; font-size: 13px;">${signerName}</div>
        <div style="font-size: 11px; color: #475569;">${signerTitle}</div>
        <div style="font-size: 11px; font-weight: 700; color: #4338ca;">${companyName}</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
          Corporate Verification: ${corporatePhone} &bull; ${corporateEmail}
        </div>
      </div>

      <div class="official-seal">
        <div style="font-size: 8px; color: #6366f1;">&starf; &starf; &starf;</div>
        <div style="font-size: 9px; font-weight: 900; margin: 2px 0; letter-spacing: 0.05em;">C&amp;SH GROUP</div>
        <div style="font-size: 8px; line-height: 1.1;">OFFICIAL CORPORATE SEAL</div>
        <div style="font-size: 7px; color: #4f46e5; margin-top: 2px;">VERIFIED RESIDENCY</div>
        <div style="font-size: 8px; font-family: monospace; margin-top: 2px;">${docVerificationCode}</div>
      </div>
    </div>

    <!-- Footer Disclaimer -->
    <div class="footer-disclaimer">
      This document has been issued by ${companyName} (${corporateAddress}) for official presentation to financial lending institutions, insurance underwriters, and administrative agencies. For instant verification, contact administration directly at ${corporateEmail} or ${corporatePhone}.
    </div>
  </div>
</body>
</html>`;
  };

  // Copy plain text formatted letter
  const handleCopyText = () => {
    const text = `
PROOF OF RESIDENCY LETTER
Date: ${todayFormatted}
Verification Code: ${docVerificationCode}

CORPORATE ADMINISTRATION:
Entity: ${companyName}
Corporate Office: ${corporateAddress}
Phone: ${corporatePhone}
Email: ${corporateEmail}

TO: ${institutionName}
ATTN: ${attentionTo}
${referenceNumber ? `Reference: ${referenceNumber}\n` : ''}
RE: CERTIFICATION OF CONTINUOUS RESIDENCY & ACCOMMODATION VERIFICATION

To Whom It May Concern,

This letter serves as official verification from ${companyName} that ${guestName} has established and maintained continuous residency at:

PROPERTY: ${propertyName}
PHYSICAL ADDRESS: ${propertyAddress}
ROOMS RESERVED: ${roomsCount} Room(s) - ${roomsDescription}

PERIOD OF CONTINUOUS STAY:
Check-In: ${checkInDate}
Check-Out: ${checkOutDate}
Duration: ${consecutiveDays} Consecutive Days / Nights (${consecutiveDays > 5 ? 'Exceeds >5 Days Residency Threshold' : 'Authorized Residency'})

FINANCIAL & INVOICING ACCOUNTING SUMMARY:
Total Invoices Issued: ${totalInvoicesCount}
${invoices.map(inv => `- Invoice #${inv.invoiceNumber} (${inv.date}): $${Number(inv.amount).toFixed(2)} USD - ${inv.paid ? 'PAID IN FULL' : 'PENDING'} [${inv.description}]`).join('\n')}
${invoices.length > 1 ? `GRAND TOTAL OF ALL INVOICES COMBINED: $${grandTotalAmount.toFixed(2)} USD (Paid in Full)\n` : `Total Invoiced & Paid: $${grandTotalAmount.toFixed(2)} USD\n`}
All accommodation charges for this period have been fully satisfied with zero remaining balance.

Sincerely,

${signerName}
${signerTitle}
${companyName}
Corporate Phone: ${corporatePhone}
Corporate Email: ${corporateEmail}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Dispatch Email
  const handleSendEmail = async () => {
    if (!emailTo || !emailTo.trim()) {
      setEmailSendError("Recipient email address is required.");
      return;
    }

    setIsSendingEmail(true);
    setEmailSendError(null);
    setEmailSendSuccess(null);

    try {
      const htmlContent = generatePrintableHtml();
      const res = await fetch('/api/send-proof-of-residency-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo.trim(),
          cc: emailCc ? emailCc.trim() : undefined,
          subject: emailSubject,
          html: htmlContent,
          guestName: guestName,
          institutionName: institutionName
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch Proof of Residency email.');
      }

      setEmailSendSuccess(`Proof of Residency Letter successfully emailed to ${emailTo}!`);
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSendSuccess(null);
      }, 2500);
    } catch (err: any) {
      console.error(err);
      setEmailSendError(err.message || 'Error transmitting email. Please try again.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden text-left animate-in zoom-in-95 duration-200 print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Top Navigation Bar */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 text-white flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-2xl border border-indigo-500/30 shadow-inner">
              <FileCheck size={22} className="text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">Proof of Residency Letter</h3>
                {meetsThreshold ? (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle size={11} /> Qualified ({consecutiveDays} Days &gt; 5)
                  </span>
                ) : (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertCircle size={11} /> {consecutiveDays} Consecutive Days (Standard is &gt;5)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Official accommodation certification for Banks, Insurance Agencies, &amp; Financial Institutions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              title="Print official letter or Save as PDF"
            >
              <Printer size={15} /> Print / Save PDF
            </button>

            <button
              type="button"
              onClick={() => setShowEmailModal(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Email directly to Guest or Bank / Insurance Agent"
            >
              <Mail size={15} /> Email Letter
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Copy text format to clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Content Area: Split View (Settings on Left, Live Document on Right) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 print:p-0 print:bg-white flex flex-col lg:flex-row gap-6">
          
          {/* Left Settings Drawer */}
          <div className="w-full lg:w-[380px] flex-shrink-0 space-y-4 print:hidden text-xs">
            
            {/* Booking Selector */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center justify-between">
                <span>Select Paid Reservation</span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {eligibleBookings.length} paid
                </span>
              </label>
              {eligibleBookings.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                  No qualifying paid reservations found. Cancelled and unpaid reservations are strictly excluded from the verification process.
                </div>
              ) : (
                <select
                  value={selectedBookingId}
                  onChange={(e) => setSelectedBookingId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  {eligibleBookings.map(b => {
                    const days = calculateDays(b.checkIn, b.checkOut);
                    const isOver5 = days > 5;
                    const gName = b.guestName || b.invoiceDetails?.sponsorName || 'Guest';
                    return (
                      <option key={b.id} value={b.id}>
                        {isOver5 ? '⭐ [>5 Days] ' : ''}{gName} &bull; {days} Days ({b.checkIn} - {b.checkOut}) [PAID]
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Corporate Administration (Address, Phone, Email) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Building2 size={13} className="text-indigo-600" />
                  Corporate Administration
                </label>
                <span className="text-[10px] text-indigo-700 bg-indigo-50 font-bold px-2 py-0.5 rounded border border-indigo-100">
                  Official Entity
                </span>
              </div>

              <div className="space-y-2 pt-0.5">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Rental Company Entity Name:</span>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none mt-1"
                    placeholder="e.g. C&SH Group Properties, LLC"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Corporate Headquarters Address:</span>
                  <input
                    type="text"
                    value={corporateAddress}
                    onChange={(e) => setCorporateAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none mt-1"
                    placeholder="e.g. 9404 West 144th Place, Orland Park, IL 60462"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Corporate Phone:</span>
                    <input
                      type="text"
                      value={corporatePhone}
                      onChange={(e) => setCorporatePhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none mt-1"
                      placeholder="e.g. (404) 555-0199"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Corporate Email:</span>
                    <input
                      type="email"
                      value={corporateEmail}
                      onChange={(e) => setCorporateEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none mt-1"
                      placeholder="e.g. admin@cshgroupproperties.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Stay Period & Dates (Automatically calculate Stay Days) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Calendar size={13} className="text-indigo-600" />
                  Check-In &amp; Check-Out Dates
                </label>
                <span className="text-[10px] text-slate-500 font-bold">
                  Auto-Calculates Stay
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Check-In Date:</span>
                  <input
                    type="date"
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none mt-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Check-Out Date:</span>
                  <input
                    type="date"
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none mt-1"
                  />
                </div>
              </div>

              {/* Automatically Calculated Stay Days Indicator */}
              <div className={`p-3 rounded-xl border transition-all ${meetsThreshold ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Calculated Stay Duration:
                    </span>
                    <span className="font-black text-base text-slate-900">
                      {consecutiveDays} Consecutive Days
                    </span>
                  </div>
                  <div className="text-right">
                    {meetsThreshold ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                        <CheckCircle size={11} className="text-emerald-600" />
                        &gt;5 Days Verified
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                        &lt;= 5 Days (Requires &gt;5)
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Quick Extend Buttons for convenience */}
                <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 font-medium">Quick Extend Stay:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleExtendStay(7)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded font-bold text-slate-700 cursor-pointer shadow-2xs"
                      title="Add 7 days to checkout"
                    >
                      +7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendStay(14)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded font-bold text-slate-700 cursor-pointer shadow-2xs"
                      title="Add 14 days to checkout"
                    >
                      +14 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendStay(30)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded font-bold text-slate-700 cursor-pointer shadow-2xs"
                      title="Add 30 days to checkout"
                    >
                      +30 Days
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Property Physical Address:</span>
                <input
                  type="text"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:bg-white outline-none mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Rooms #:</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={roomsCount}
                    onChange={(e) => setRoomsCount(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-800 mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Rooms Details:</span>
                  <input
                    type="text"
                    value={roomsDescription}
                    onChange={(e) => setRoomsDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-800 focus:bg-white outline-none mt-1"
                    placeholder="e.g. Room 1 (Master Suite)"
                  />
                </div>
              </div>
            </div>

            {/* Invoices Breakdown (Remove any invoices not relating to the guest) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <label className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <CreditCard size={13} className="text-indigo-600" />
                    Guest Invoices ({invoices.length})
                  </label>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Remove invoices not relating to selected guest
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleReloadGuestInvoices}
                    className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    title="Reset to default paid invoices for this guest"
                  >
                    ↺ Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleAddInvoice}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={11} /> Add
                  </button>
                </div>
              </div>

              {/* Invoices List with explicit Remove controls */}
              {invoices.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] text-center">
                  No invoices currently attached. Click <strong>&quot;+ Add&quot;</strong> or <strong>&quot;↺ Reset&quot;</strong> to restore guest invoices.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {invoices.map((inv, idx) => (
                    <div key={inv.id} className="p-2.5 bg-slate-50 hover:bg-slate-100/70 transition-colors rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={inv.invoiceNumber}
                            onChange={(e) => handleUpdateInvoice(inv.id, 'invoiceNumber', e.target.value)}
                            className="font-mono font-bold text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5 text-indigo-700 w-24"
                            placeholder="Invoice #"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-bold">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={inv.amount}
                            onChange={(e) => handleUpdateInvoice(inv.id, 'amount', parseFloat(e.target.value) || 0)}
                            className="font-mono font-bold text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-800 w-20 text-right"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveInvoice(inv.id)}
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1 rounded-md transition-colors cursor-pointer ml-1"
                            title="Remove invoice from verification letter"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="date"
                          value={inv.date}
                          onChange={(e) => handleUpdateInvoice(inv.id, 'date', e.target.value)}
                          className="col-span-1 text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600"
                        />
                        <input
                          type="text"
                          value={inv.description}
                          onChange={(e) => handleUpdateInvoice(inv.id, 'description', e.target.value)}
                          className="col-span-2 text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600"
                          placeholder="Description"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Automatically Recalculated Grand Total Display */}
              <div className="pt-2.5 border-t border-slate-200 bg-indigo-50/60 rounded-xl p-2.5 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-extrabold text-indigo-950 uppercase tracking-wider block">
                    Grand Combined Total ({invoices.length} {invoices.length === 1 ? 'Invoice' : 'Invoices'}):
                  </span>
                  <span className="text-[10px] text-indigo-600">
                    Automatically recalculated
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-indigo-700 text-base">
                    ${grandTotalAmount.toFixed(2)} USD
                  </span>
                </div>
              </div>
            </div>

            {/* Recipient Institution */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block">
                Recipient Institution (Bank / Insurance)
              </label>
              
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRecipientTypeChange('bank')}
                  className={`py-1.5 px-2 rounded-lg font-bold text-[10px] transition-all text-center cursor-pointer border ${recipientType === 'bank' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  🏦 Bank / Mortgage
                </button>
                <button
                  type="button"
                  onClick={() => handleRecipientTypeChange('insurance')}
                  className={`py-1.5 px-2 rounded-lg font-bold text-[10px] transition-all text-center cursor-pointer border ${recipientType === 'insurance' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  🛡️ Insurance Agency
                </button>
                <button
                  type="button"
                  onClick={() => handleRecipientTypeChange('government')}
                  className={`py-1.5 px-2 rounded-lg font-bold text-[10px] transition-all text-center cursor-pointer border ${recipientType === 'government' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  🏛️ Govt / Housing
                </button>
                <button
                  type="button"
                  onClick={() => handleRecipientTypeChange('general')}
                  className={`py-1.5 px-2 rounded-lg font-bold text-[10px] transition-all text-center cursor-pointer border ${recipientType === 'general' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >
                  📄 To Whom It May Concern
                </button>
              </div>

              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Institution Name:</span>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:bg-white outline-none"
                    placeholder="e.g. Chase Bank, State Farm Insurance"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Attention / Department:</span>
                  <input
                    type="text"
                    value={attentionTo}
                    onChange={(e) => setAttentionTo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:bg-white outline-none"
                    placeholder="e.g. Underwriting / Claims Dept"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Policy / Loan / Case # (Optional):</span>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:bg-white outline-none font-mono"
                    placeholder="e.g. LN-984210 / CLM-553"
                  />
                </div>
              </div>
            </div>

            {/* Professional Signer */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block">
                Authorized Signer &amp; Officer
              </label>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Signer Name:</span>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Signer Title:</span>
                    <input
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Preview: Real-time Render of Official Document */}
          <div className="flex-1 overflow-y-auto">
            <div 
              ref={printAreaRef}
              className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-3xl mx-auto p-8 sm:p-12 text-slate-900 font-sans relative"
              style={{ minHeight: '820px' }}
            >
              {/* Official Letterhead Header */}
              <div className="border-b-2 border-indigo-600 pb-6 mb-8 flex justify-between items-start gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">{companyName}</h1>
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-1">
                    Executive Accommodations &bull; Residential Management Division
                  </p>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Property Asset: <strong className="text-slate-800">{propertyName}</strong>
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-0.5">
                  <div className="font-bold text-slate-700">Corporate Administration</div>
                  <div>{corporateAddress}</div>
                  <div>Phone: {corporatePhone}</div>
                  <div>Email: {corporateEmail}</div>
                </div>
              </div>

              {/* Date & Ref Line */}
              <div className="flex justify-between items-center text-xs text-slate-500 mb-6 pb-2 border-b border-slate-100">
                <div>Date of Issuance: <strong className="text-slate-800">{todayFormatted}</strong></div>
                <div>Verification Code: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{docVerificationCode}</span></div>
              </div>

              {/* Recipient Information Box */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-6 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">OFFICIAL VERIFICATION PRESENTED TO:</div>
                <div className="text-sm font-extrabold text-slate-900">{institutionName}</div>
                <div className="text-xs text-slate-600">ATTN: {attentionTo}</div>
                {referenceNumber && (
                  <div className="text-xs font-mono font-semibold text-indigo-600 pt-1">
                    Reference / Policy / Loan Case #: {referenceNumber}
                  </div>
                )}
              </div>

              {/* Formal Subject Header */}
              <div className="text-sm font-black text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-6 flex items-center gap-2">
                <span>RE: CERTIFICATION OF CONTINUOUS RESIDENCY &amp; ACCOMMODATION VERIFICATION</span>
              </div>

              {/* Body Text */}
              <div className="space-y-4 text-sm text-slate-700 leading-relaxed text-justify">
                <p>To Whom It May Concern:</p>
                <p>
                  This letter serves as an official, certified statement from <strong>{companyName}</strong> confirming that <strong>{guestName}</strong>
                  {guestEmail ? ` (Email: ${guestEmail})` : ''}{guestPhone ? ` (Phone: ${guestPhone})` : ''} has maintained continuous, uninterrupted occupancy and physical residency at the real property location specified below under an authorized residential lodging agreement.
                </p>
              </div>

              {/* Verification Facts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
                
                {/* 1. Property Address */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <MapPin size={12} className="text-indigo-600" /> 1. Property &amp; Physical Address
                  </span>
                  <div className="font-bold text-slate-900 text-sm">{propertyName}</div>
                  <div className="text-xs text-slate-600 mt-1 leading-snug">{propertyAddress}</div>
                </div>

                {/* 2. Rooms Reserved */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Building2 size={12} className="text-indigo-600" /> 2. Number of Rooms Reserved
                  </span>
                  <div className="font-bold text-slate-900 text-sm">
                    {roomsCount} Dedicated Room{roomsCount > 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{roomsDescription}</div>
                </div>

                {/* 3. Time Period of Stay */}
                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 md:col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                    <Calendar size={12} className="text-indigo-600" /> 3. Time Period of Continuous Stay
                  </span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
                    <div className="text-sm font-bold text-slate-900">
                      {formatLetterDate(checkInDate)} &mdash; {formatLetterDate(checkOutDate)}
                    </div>
                    <div>
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                        <CheckCircle size={13} className="text-emerald-600" />
                        {consecutiveDays} Consecutive Days / Nights
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    {consecutiveDays > 5 
                      ? "Resident meets and exceeds the 5+ consecutive days threshold required for verifiable residential lodging." 
                      : "Continuous residency verification record on file with property management."}
                  </p>
                </div>
              </div>

              {/* 4. Invoices & Financial Accounting */}
              <div className="my-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard size={14} className="text-indigo-600" /> 4. Invoicing &amp; Financial Accounting
                  </span>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                    Total Number of Invoices: {totalInvoicesCount}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100/80 text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-200 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Billing Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Total (USD)</th>
                        <th className="py-2.5 px-3 text-center print:hidden w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400 italic">
                            No invoices attached. Use the drawer on the left to add or reset invoices.
                          </td>
                        </tr>
                      ) : (
                        invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono font-bold text-indigo-600">{inv.invoiceNumber}</td>
                            <td className="py-2 px-3 text-slate-600">{inv.date || '—'}</td>
                            <td className="py-2 px-3 text-slate-800">{inv.description}</td>
                            <td className="py-2 px-3">
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                &check; {inv.paid ? 'PAID IN FULL' : 'ACTIVE'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              ${Number(inv.amount).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center print:hidden">
                              <button
                                type="button"
                                onClick={() => handleRemoveInvoice(inv.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors cursor-pointer"
                                title="Remove this invoice from letter"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                      
                      {/* If more than one invoice, explicitly show Grand Total of all invoices combined */}
                      {invoices.length > 1 ? (
                        <tr className="bg-indigo-50/70 font-bold border-t-2 border-indigo-200 text-indigo-950">
                          <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider text-[11px] font-extrabold text-slate-700">
                            Grand Total of All {invoices.length} Invoices Combined:
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-sm font-black text-indigo-700">
                            ${grandTotalAmount.toFixed(2)} USD
                          </td>
                          <td className="print:hidden"></td>
                        </tr>
                      ) : (
                        <tr className="bg-slate-50 font-bold border-t border-slate-200">
                          <td colSpan={4} className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px] text-slate-600">
                            Total Invoiced Amount:
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-slate-900">
                            ${grandTotalAmount.toFixed(2)} USD
                          </td>
                          <td className="print:hidden"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-500 italic mt-2">
                  Notice: All fees corresponding to the indicated period have been paid in full with zero outstanding balance.
                </p>
              </div>

              {/* 5. Professional Signature & Corporate Seal */}
              <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">Sincerely and respectfully submitted,</p>
                  
                  {/* Digital Signature Font */}
                  <div 
                    className="text-3xl text-slate-900 font-serif italic py-1 tracking-wide select-none"
                    style={{ fontFamily: "'Brush Script MT', 'Dancing Script', 'Caveat', cursive, serif" }}
                  >
                    {signerName}
                  </div>
                  
                  <div className="font-extrabold text-sm text-slate-900">{signerName}</div>
                  <div className="text-xs text-slate-600">{signerTitle}</div>
                  <div className="text-xs font-bold text-indigo-700">{companyName}</div>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Corporate Verification: {corporatePhone} &bull; {corporateEmail}
                  </div>
                </div>

                {/* Circular Corporate Seal Graphic */}
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-indigo-400 bg-indigo-50/50 p-2 flex flex-col items-center justify-center text-center select-none shadow-xs">
                  <ShieldCheck size={20} className="text-indigo-600 mb-1" />
                  <span className="text-[8px] font-black text-indigo-950 uppercase tracking-wider">C&amp;SH Group Properties</span>
                  <span className="text-[7px] font-bold text-indigo-600 uppercase">Corporate Verification</span>
                  <span className="text-[7px] font-mono font-bold text-slate-500 mt-1">{docVerificationCode}</span>
                </div>
              </div>

              {/* Bottom Notice */}
              <div className="mt-8 pt-4 border-t border-slate-100 text-[10px] text-slate-400 text-center leading-relaxed">
                This document is certified by {companyName} ({corporateAddress}) for submission to banks, insurance underwriters, and municipal housing administrators. For authentication inquiries, contact administration directly at {corporateEmail} or {corporatePhone}.
              </div>

            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0 print:hidden">
          <div className="text-xs text-slate-500">
            Consecutive Stay: <strong className="text-slate-800">{consecutiveDays} Days</strong> &bull; Invoices Combined: <strong className="text-indigo-700">${grandTotalAmount.toFixed(2)}</strong>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
          </div>
        </div>

      </div>

      {/* Email Modal Overlay */}
      {showEmailModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Mail size={16} className="text-indigo-600" /> Email Proof of Residency Letter
              </h4>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {emailSendSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-medium">
                  {emailSendSuccess}
                </div>
              )}
              {emailSendError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl font-medium">
                  {emailSendError}
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                  Recipient Email Address:
                </label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="e.g. guest@example.com or underwriter@bank.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                  CC Email (Admin copy):
                </label>
                <input
                  type="email"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="e.g. admin@cshgroupproperties.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:bg-white outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block mb-1">
                  Email Subject:
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 focus:bg-white outline-none"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-[11px] leading-relaxed">
                The full formatted HTML Proof of Residency Letter with official letterhead, verified stay dates, room reservations, itemized invoices &amp; grand total, and executive signature will be transmitted directly to the recipient.
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={isSendingEmail}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Dispatching...
                  </>
                ) : (
                  <>
                    <Send size={14} /> Send Letter
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
