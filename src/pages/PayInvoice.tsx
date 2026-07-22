import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Booking } from '../types';
import { 
  FileText, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  CreditCard, 
  Loader2, 
  ArrowLeft, 
  Building, 
  Calendar as CalendarIcon, 
  User, 
  Lock, 
  Download 
} from 'lucide-react';

export const PayInvoice: React.FC = () => {
  const { bookingId: paramBookingId } = useParams<{ bookingId?: string }>();
  const [searchParams] = useSearchParams();
  const bookingId = paramBookingId || searchParams.get('bookingId') || searchParams.get('id');

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Agreement state checkboxes
  const [agreedToHouseRules, setAgreedToHouseRules] = useState<boolean>(false);
  const [agreedToBookingAgreement, setAgreedToBookingAgreement] = useState<boolean>(false);
  const [agreedToNoKids, setAgreedToNoKids] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (!bookingId) {
      setError('No booking ID provided in payment URL.');
      setLoading(false);
      return;
    }

    const fetchBooking = async () => {
      try {
        setLoading(true);
        const docRef = doc(db, 'bookings', bookingId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const b = { id: snap.id, ...snap.data() } as Booking;
          setBooking(b);
          // If already accepted prior, pre-fill
          if (b.agreedToHouseRules) setAgreedToHouseRules(true);
          if (b.agreedToBookingAgreement) setAgreedToBookingAgreement(true);
        } else {
          setError('Booking or Invoice not found. Please verify your link or contact support.');
        }
      } catch (err: any) {
        console.error('Error fetching booking for invoice pay:', err);
        setError(err.message || 'Failed to load invoice details.');
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  const handleProceedToPayment = async () => {
    if (!booking || !bookingId) return;

    if (!agreedToHouseRules || !agreedToBookingAgreement) {
      alert('Please read and check both the House Rules Agreement and Booking Agreement before proceeding.');
      return;
    }

    if (booking.rentalMode === 'room' && !agreedToNoKids) {
      alert('Please check the Age Restriction Policy agreement before proceeding.');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Update Firestore with agreement confirmations
      const docRef = doc(db, 'bookings', bookingId);
      await updateDoc(docRef, {
        agreedToHouseRules: true,
        agreedToBookingAgreement: true,
        agreementsAcceptedAt: new Date().toISOString()
      });

      // 2. Determine invoice total
      const inv = booking.invoiceDetails || {};
      const baseAmt = inv.baseAmount !== undefined ? inv.baseAmount : (booking.totalPrice / 100);
      const stripeFee = inv.stripeFee !== undefined ? inv.stripeFee : Math.round((baseAmt * 0.029 + 0.3) * 100) / 100;
      const grandTotal = inv.grandTotal !== undefined ? inv.grandTotal : (baseAmt + stripeFee);

      // 3. Create Checkout Session
      const res = await fetch('/api/create-invoice-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          amount: grandTotal,
          invoiceNumber: inv.invoiceNumber || 'Manual',
          guestName: booking.guestName || inv.sponsorName || 'Guest',
          propertyName: booking.propertyName || 'Property',
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          sponsorEmail: inv.sponsorEmail || booking.guestEmail
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}: Failed to create payment session.`);
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No Stripe redirect URL returned from payment server.');
      }
    } catch (err: any) {
      console.error('Error creating invoice payment checkout session:', err);
      alert('Error initiating checkout: ' + err.message);
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
        <p className="text-slate-300 font-medium text-sm">Loading Invoice Details...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-slate-800 border border-slate-700 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <AlertTriangle className="text-amber-400 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-bold text-slate-100 mb-2">Invoice Not Found</h2>
          <p className="text-slate-400 text-xs mb-6 leading-relaxed">{error || 'The requested invoice could not be located.'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all text-xs"
          >
            <ArrowLeft size={16} /> Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const inv = booking.invoiceDetails || {};
  const isPaid = inv.paid || booking.status === 'confirmed';
  const baseAmt = inv.baseAmount !== undefined ? inv.baseAmount : (booking.totalPrice / 100);
  const stripeFee = inv.stripeFee !== undefined ? inv.stripeFee : Math.round((baseAmt * 0.029 + 0.3) * 100) / 100;
  const grandTotal = inv.grandTotal !== undefined ? inv.grandTotal : (baseAmt + stripeFee);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-indigo-500 selection:text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header Branding */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <Link to="/" className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="p-2 bg-indigo-600 rounded-xl text-white inline-flex"><Building size={20} /></span>
              REALCal <span className="text-indigo-400">Bookings</span>
            </Link>
            <p className="text-xs text-slate-400 mt-1">Official Guest Invoice Payment Portal</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-full self-start sm:self-auto">
            <ShieldCheck className="text-emerald-400" size={16} />
            <span>256-Bit SSL Encrypted Payment</span>
          </div>
        </div>

        {/* Invoice Summary Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          {/* Top Banner */}
          <div className="bg-slate-850 p-6 sm:p-8 border-b border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="text-indigo-400" size={20} />
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  INVOICE #{inv.invoiceNumber || 'Manual'}
                </h1>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Due Date: <strong className="text-slate-200">{inv.dueDate || 'Upon Receipt'}</strong>
              </p>
            </div>
            <div>
              {isPaid ? (
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider">
                  <CheckCircle2 size={16} /> Invoice Paid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-full font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={16} /> Payment Due
                </span>
              )}
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs border-b border-slate-800">
            <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Billed To (Sponsor / Guest)</span>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <User size={14} className="text-indigo-400" />
                {inv.sponsorName || booking.guestName || 'Valued Guest'}
              </p>
              <p className="text-slate-400">{inv.sponsorEmail || booking.guestEmail || 'N/A'}</p>
              {inv.sponsorPhone && <p className="text-slate-400">{inv.sponsorPhone}</p>}
              {inv.sponsorAddress && <p className="text-slate-400 whitespace-pre-wrap">{inv.sponsorAddress}</p>}
            </div>

            <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Stay Information</span>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <Building size={14} className="text-indigo-400" />
                {booking.propertyName || 'REALCal Property'}
              </p>
              <p className="text-slate-300 flex items-center gap-1.5">
                <CalendarIcon size={12} className="text-slate-400" />
                {booking.checkIn} &rarr; {booking.checkOut}
              </p>
              {booking.selectedBedrooms && booking.selectedBedrooms.length > 0 && (
                <p className="text-slate-400">Rooms: {booking.selectedBedrooms.join(', ')}</p>
              )}
            </div>
          </div>

          {/* Charges Breakdown */}
          <div className="p-6 sm:p-8 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Summary of Charges</h3>
            <div className="space-y-2.5 text-xs bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center text-slate-300">
                <span>Lodging Coverage Base Fee</span>
                <span className="font-mono font-bold text-slate-100">${baseAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Stripe Processing Surcharge (2.9% + $0.30)</span>
                <span className="font-mono">${stripeFee.toFixed(2)}</span>
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-sm font-black text-white">
                <span>Grand Total Due</span>
                <span className="font-mono text-indigo-400 text-lg">${grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {inv.customNotes && (
              <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-slate-300 italic">
                &ldquo;{inv.customNotes}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* If Paid: Show Confirmation Message */}
        {isPaid ? (
          <div className="bg-emerald-950/40 border border-emerald-800/50 p-8 rounded-3xl text-center space-y-4">
            <CheckCircle2 size={48} className="text-emerald-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">This Invoice Has Been Paid</h2>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              Thank you! Payment for Invoice #{inv.invoiceNumber || 'Manual'} has been received and processed successfully. Your booking is confirmed.
            </p>
            <div className="pt-2 flex justify-center gap-4">
              <a
                href={`/api/bookings/${booking.id}/invoice.pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-emerald-900/30"
              >
                <Download size={16} /> Download Paid Receipt PDF
              </a>
            </div>
          </div>
        ) : (
          /* If Unpaid: Mandatory Agreements Section before Payment */
          <div className="bg-slate-900 border border-indigo-500/30 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Lock className="text-indigo-400" size={18} />
                Mandatory Guest Agreements & Policies
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Before proceeding to payment, you must read and check the required terms of stay below.
              </p>
            </div>

            {/* Checkbox 1: HOUSE RULES AGREEMENT */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl transition-all hover:border-slate-700">
              <label className="flex items-start gap-3 cursor-pointer select-none text-slate-300">
                <input
                  type="checkbox"
                  id="invoice-agree-rules"
                  checked={agreedToHouseRules}
                  onChange={(e) => setAgreedToHouseRules(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:text-indigo-600 accent-indigo-600 cursor-pointer flex-shrink-0"
                />
                <div className="leading-relaxed">
                  <span className="font-bold block mb-1 uppercase tracking-wider text-xs text-amber-400">
                    HOUSE RULES AGREEMENT
                  </span>
                  <span className="text-slate-300 text-xs sm:text-sm">
                    I agree that properties are <strong>NOT Pet Friendly</strong> and there is <strong>ZERO tolerance</strong> for Drugs, Smoking, and Weapons. (Alcohol is OK).
                  </span>
                </div>
              </label>
            </div>

            {/* Checkbox 2: BOOKING AGREEMENT */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl transition-all hover:border-slate-700">
              <label className="flex items-start gap-3 cursor-pointer select-none text-slate-300">
                <input
                  type="checkbox"
                  id="invoice-agree-booking"
                  checked={agreedToBookingAgreement}
                  onChange={(e) => setAgreedToBookingAgreement(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:text-indigo-600 accent-indigo-600 cursor-pointer flex-shrink-0"
                />
                <div className="leading-relaxed">
                  <span className="font-bold block mb-1 uppercase tracking-wider text-xs text-indigo-400">
                    BOOKING AGREEMENT
                  </span>
                  <span className="text-slate-300 text-xs sm:text-sm">
                    In consideration of being allowed to stay at this property, the guest agrees to release and hold harmless the Property from any and all liability for injuries, including falls, cuts, and burns. Guest uses all facilities at their own risk.
                  </span>
                </div>
              </label>
            </div>

            {/* Optional Age Restriction for Room Rentals */}
            {booking.rentalMode === 'room' && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl transition-all hover:border-slate-700">
                <label className="flex items-start gap-3 cursor-pointer select-none text-slate-300">
                  <input
                    type="checkbox"
                    id="invoice-agree-nokids"
                    checked={agreedToNoKids}
                    onChange={(e) => setAgreedToNoKids(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 focus:text-indigo-600 accent-indigo-600 cursor-pointer flex-shrink-0"
                  />
                  <div className="leading-relaxed">
                    <span className="font-bold block mb-1 uppercase tracking-wider text-xs text-rose-400">
                      AGE RESTRICTION POLICY
                    </span>
                    <span className="text-slate-300 text-xs sm:text-sm">
                      I certify that none of the guests in our party are <strong>children under 10 years of age</strong>.
                    </span>
                  </div>
                </label>
              </div>
            )}

            {/* Proceed to Payment Action */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handleProceedToPayment}
                disabled={!agreedToHouseRules || !agreedToBookingAgreement || (booking.rentalMode === 'room' && !agreedToNoKids) || isProcessing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-2xl text-sm sm:text-base transition-all shadow-xl shadow-indigo-950 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin" size={20} /> Processing & Redirecting to Stripe...
                  </>
                ) : (
                  <>
                    <CreditCard size={20} /> Pay Invoice Now (${grandTotal.toFixed(2)})
                  </>
                )}
              </button>

              {(!agreedToHouseRules || !agreedToBookingAgreement || (booking.rentalMode === 'room' && !agreedToNoKids)) && (
                <p className="text-center text-xs text-amber-400/90 font-medium animate-pulse">
                  ⚠️ Please check all required agreement boxes above to enable the payment button.
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
