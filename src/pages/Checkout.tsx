/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, setDoc, serverTimestamp, getDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid'; 
import { calculatePriceDetails, PricingRule } from '../lib/pricing';
import { cn } from '../lib/utils';
import { Property } from '../types';

const formatPhoneE164 = (phone: string) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
};

export const Checkout: React.FC = () => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  const propertyId = location.state?.propertyId;
  const checkIn = location.state?.checkIn;
  const checkOut = location.state?.checkOut;
  const priceDetails = location.state?.priceDetails;
  const leaseCode = location.state?.leaseCode || null;
  const bookingType = location.state?.bookingType || null;
  
  const [paymentOption, setPaymentOption] = useState<'full' | 'monthly'>('full');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [property, setProperty] = useState<Property | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [localPriceDetails, setLocalPriceDetails] = useState<any>(priceDetails);

  const isLongTermLease = localPriceDetails && localPriceDetails.nights > 60;
  const numMonths = localPriceDetails ? Math.ceil(localPriceDetails.nights / 30) : 0;
  const securityDeposit = localPriceDetails?.securityDeposit || 0;
  const grandTotal = localPriceDetails?.grandTotal || 0;
  const monthlyAmount = numMonths > 0 ? (grandTotal / numMonths) : 0;
  
  const upfrontAmount = isLongTermLease
    ? (paymentOption === 'full' ? (grandTotal + securityDeposit) : (monthlyAmount + securityDeposit))
    : grandTotal;

  const isTestProperty = !!property?.isTestProperty;
  
  const [selectedBedrooms, setSelectedBedrooms] = useState<any[]>(location.state?.selectedBedrooms || []);
  const dailySelections = location.state?.dailySelections || null;

  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningConfirmed, setWarningConfirmed] = useState(false);

  useEffect(() => {
    if (user?.email && !guestEmail) {
       setGuestEmail(user.email);
    }
  }, [user]);
  
  useEffect(() => {
    if (propertyId) {
        getDoc(doc(db, 'properties', propertyId)).then(snap => {
            if (snap.exists()) {
                const propData = { id: snap.id, ...snap.data() } as Property;
                setProperty(propData);
            }
        });

        getDocs(query(collection(db, 'pricing_rules'), where('propertyId', '==', propertyId))).then(snap => {
           setPricingRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as PricingRule)));
        });

        getDoc(doc(db, 'global_settings', 'settings')).then(snap => {
           if(snap.exists()) setGlobalSettings(snap.data());
        });
    }
  }, [propertyId]);

  useEffect(() => {
     if (checkIn && checkOut && pricingRules.length > 0) {
        const rentalMode = selectedBedrooms.length > 0 ? 'room' : 'entire';
        const newDetails = calculatePriceDetails(checkIn, checkOut, pricingRules, globalSettings, selectedBedrooms, rentalMode, 0, dailySelections);
        setLocalPriceDetails(newDetails);
     }
  }, [selectedBedrooms, pricingRules, globalSettings, checkIn, checkOut]);

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/" />;
  
  if (user && user.tollFreeAccept === undefined) {
    return <Navigate to="/opt-in" replace />;
  }

  if (!propertyId || !checkIn || !checkOut || !priceDetails) return <Navigate to="/" />;

  const checkIsSameDay = () => {
    if (!checkIn) return false;
    const checkInYMD = checkIn.split('T')[0];
    const today = new Date();
    const todayYMD = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return checkInYMD === todayYMD;
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestEmail.trim()) {
      setError("Please enter a valid confirmation email.");
      return;
    }
    if (!guestPhone.trim()) {
      setError("Please enter a valid mobile number.");
      return;
    }

    if (checkIsSameDay() && !warningConfirmed) {
      setShowWarningModal(true);
      return;
    }

    await startStripeCheckout();
  };

  const handleConfirmWarningAndPay = async () => {
    setShowWarningModal(false);
    setWarningConfirmed(true);
    await startStripeCheckout();
  };

  const startStripeCheckout = async () => {
    setProcessing(true);
    setError(null);

    const bookingId = uuidv4();
    const e164Phone = formatPhoneE164(guestPhone);
    const bookingRef = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      // 1. Create accessCode (lookup manual code first, or assign placeholder)
      let accessCode = '';
      if (property?.hasSmartLock && property?.frontDoorCode) {
        accessCode = property.frontDoorCode.trim();
      }

      // 2. Prepare Firestore payload (initially as 'pending_payment')
      const payload: any = {
        userId: user.uid,
        propertyId: propertyId,
        checkIn: checkIn.split('T')[0],
        checkOut: checkOut.split('T')[0],
        status: 'pending_payment',
        totalPrice: Math.round(upfrontAmount * 100),
        bookingRef,
        selectedBedrooms,
        guestPhone: e164Phone,
        guestEmail: guestEmail,
        guestName: user.displayName || "Guest",
        guests: 1,
        priceDetails: localPriceDetails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (leaseCode) {
        payload.leaseCode = leaseCode;
      }
      if (bookingType) {
        payload.bookingType = bookingType;
      }
      if (accessCode) {
        payload.accessCode = accessCode;
      }

      if (localPriceDetails?.nights > 60) {
        payload.paymentOption = paymentOption;
        payload.securityDeposit = securityDeposit;
        payload.numMonths = numMonths;
        payload.monthlyAmount = monthlyAmount;
        payload.upfrontAmountPaid = upfrontAmount;

        // Build simple initial payment schedule
        const paymentSchedule: any[] = [];
        const checkInDate = new Date(checkIn);
        paymentSchedule.push({
          month: 1,
          dueDate: checkIn.split('T')[0],
          amount: paymentOption === 'full' ? grandTotal : monthlyAmount,
          status: 'paid',
          description: paymentOption === 'full' ? 'Entire Lease Amount' : 'First Month Stay',
          alertSent: false
        });

        for (let m = 2; m <= numMonths; m++) {
          const dueDate = new Date(checkInDate);
          dueDate.setDate(dueDate.getDate() + (m - 1) * 30);
          paymentSchedule.push({
            month: m,
            dueDate: dueDate.toISOString().split('T')[0],
            amount: paymentOption === 'full' ? 0 : monthlyAmount,
            status: paymentOption === 'full' ? 'paid' : 'unpaid',
            description: `Month ${m} Stay`,
            alertSent: false
          });
        }
        payload.paymentSchedule = paymentSchedule;
      }

      if (dailySelections) {
        payload.dailySelections = dailySelections;
      }

      // Save Booking to Firestore as 'pending_payment'
      if (db) {
        await setDoc(doc(db, 'bookings', bookingId), payload);
      }

      // 3. Request Checkout Session from Server
      const res = await fetch('/api/create-booking-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to initiate secure Stripe Checkout Session.");
      }

      const data = await res.json();
      if (data.url) {
        console.log("[Checkout] Redirecting to Checkout Session URL:", data.url);
        window.location.href = data.url;
      } else {
        throw new Error("No payment session URL returned from backend server.");
      }
    } catch (err: any) {
      console.error("[Checkout] Error during starting checkout session:", err);
      setError(err.message || "Failed to initialize payment process.");
      setProcessing(false);
    }
  };

  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <div className="max-w-4xl mx-auto w-full p-6 py-12">
        <h1 className="text-3xl font-bold mb-8 text-slate-800">Complete your booking</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex flex-col h-full border border-slate-800">
            <h3 className="font-bold text-xl mb-6">Booking Summary</h3>
            <div className="space-y-4 mb-8">
               <div className="flex justify-between items-center text-slate-400">
                 <span>Check-in</span>
                 <span className="text-white font-medium">{parseLocalDate(checkIn).toLocaleDateString()}</span>
               </div>
               <div className="flex justify-between items-center text-slate-400">
                 <span>Check-out</span>
                 <span className="text-white font-medium">{parseLocalDate(checkOut).toLocaleDateString()}</span>
               </div>
            </div>
            
            <div className="space-y-3 border-t border-slate-800 pt-6 text-sm text-slate-400">
               <div className="flex justify-between">
                  <span>Base Rate ({localPriceDetails.nights} nights)</span>
                  <span className="font-mono text-white">${(localPriceDetails.baseTotal).toFixed(2)}</span>
               </div>
               {localPriceDetails.discount > 0 && (
                   <div className="flex justify-between text-emerald-400">
                      <span>Discount</span>
                      <span className="font-mono">-${(localPriceDetails.discount).toFixed(2)}</span>
                   </div>
               )}
               <div className="flex justify-between">
                  <span>Cleaning Fee</span>
                  <span className="font-mono text-white">${(localPriceDetails.cleaningFee).toFixed(2)}</span>
               </div>
               <div className="flex justify-between">
                  <span>Occupancy Taxes</span>
                  <span className="font-mono text-white">${(localPriceDetails.taxes).toFixed(2)}</span>
               </div>
               <div className="flex justify-between border-b border-slate-800 pb-3 mb-2 font-medium">
                  <span className="text-white">Lease Booking Subtotal</span>
                  <span className="font-mono text-white">${(localPriceDetails.grandTotal).toFixed(2)}</span>
               </div>

               {isLongTermLease && (
                  <div className="space-y-2 border-b border-slate-800 pb-3 mb-2 text-xs">
                     <div className="flex justify-between text-indigo-300 font-bold">
                        <span>Required Security Deposit</span>
                        <span className="font-mono">${(securityDeposit).toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between text-[11px]">
                        <span>Selected Payment Plan</span>
                        <span className="text-white font-semibold uppercase">{paymentOption === 'full' ? 'In Full' : 'Month-To-Month'}</span>
                     </div>
                     {paymentOption === 'monthly' && (
                        <div className="space-y-1 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800 text-left text-slate-400 mt-2">
                           <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300 block mb-1">Month-To-Month Schedule:</span>
                           <div className="flex justify-between text-[11px]">
                              <span>Month 1 (Due Upfront)</span>
                              <span className="font-mono text-white">${(monthlyAmount).toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between text-[11px]">
                              <span>Remaining ({numMonths - 1} months)</span>
                              <span className="font-mono text-white">${(monthlyAmount).toFixed(2)} / mo</span>
                           </div>
                        </div>
                     )}
                  </div>
               )}

               <div className="flex justify-between items-end pt-2">
                  <span className="text-white font-bold">{isLongTermLease ? "Amt Due Today" : "Total Due"}</span>
                  <span className="font-mono text-3xl font-black text-indigo-400">${(upfrontAmount).toFixed(2)}</span>
               </div>
            </div>

            <div className="mt-8 flex justify-center gap-3 opacity-60">
                <div className="w-10 h-6 bg-slate-700 rounded-sm flex items-center justify-center text-[8px] font-bold">VISA</div>
                <div className="w-10 h-6 bg-slate-700 rounded-sm flex items-center justify-center text-[8px] font-bold">STRIPE</div>
            </div>
          </div>
          
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-fit">
             <h3 className="font-bold text-lg mb-6 text-slate-800">Payment Details</h3>
             
             {isLongTermLease && (
                  <div className="mb-6 p-5 bg-indigo-50/40 border border-indigo-100 rounded-2xl text-left">
                     <h4 className="font-extrabold text-sm text-indigo-950 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                        <span>🔒</span> Long Term Lease Options ({localPriceDetails?.nights} Nights)
                     </h4>
                     <p className="text-xs text-indigo-900 mb-4 font-semibold leading-relaxed">
                        A fully-refundable **Security Deposit** of <strong>${securityDeposit.toFixed(2)}</strong> is required upfront. Select your preferred lease payment plan below:
                     </p>
                     <div className="grid grid-cols-1 gap-3 font-sans">
                        <button
                           type="button"
                           onClick={() => setPaymentOption('full')}
                           className={cn(
                              "w-full p-4 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer",
                              paymentOption === 'full' 
                                ? "border-indigo-600 bg-white ring-2 ring-indigo-600/20" 
                                : "border-slate-200 bg-white hover:border-indigo-300"
                           )}
                        >
                           <div className="flex justify-between items-center w-full">
                              <span className="font-black text-sm text-slate-800">Pay In Full Upfront</span>
                              <span className={cn(
                                 "w-4 h-4 rounded-full border flex items-center justify-center",
                                 paymentOption === 'full' ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                              )}>
                                 {paymentOption === 'full' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                              </span>
                           </div>
                           <p className="text-[11px] text-slate-500 font-medium">
                              Pay entire lease amount + security deposit now. No monthly follow-ups.
                           </p>
                           <span className="text-indigo-600 text-xs font-mono font-bold mt-1 block">
                              Total Today: ${(grandTotal + securityDeposit).toFixed(2)}
                           </span>
                        </button>

                        <button
                           type="button"
                           onClick={() => setPaymentOption('monthly')}
                           className={cn(
                              "w-full p-4 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer",
                              paymentOption === 'monthly' 
                                ? "border-indigo-600 bg-white ring-2 ring-indigo-600/20" 
                                : "border-slate-200 bg-white hover:border-indigo-300"
                           )}
                        >
                           <div className="flex justify-between items-center w-full">
                              <span className="font-black text-sm text-slate-800">Month-to-Month Plan</span>
                              <span className={cn(
                                 "w-4 h-4 rounded-full border flex items-center justify-center",
                                 paymentOption === 'monthly' ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                              )}>
                                 {paymentOption === 'monthly' && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                              </span>
                           </div>
                           <p className="text-[11px] text-slate-500 font-medium font-semibold">
                              Pay Security Deposit + 1st month now. Remaining payments auto-drafted every 30 days.
                           </p>
                           <div className="mt-1 flex flex-wrap justify-between items-center gap-1">
                              <span className="text-indigo-600 text-xs font-mono font-bold">
                                 Total Today: ${(monthlyAmount + securityDeposit).toFixed(2)}
                              </span>
                              <span className="text-slate-500 font-bold font-mono text-[10px] bg-slate-150 px-1.5 py-0.5 rounded">
                                 ${(monthlyAmount).toFixed(2)} / mo
                              </span>
                           </div>
                           <div className="mt-2 bg-amber-50/60 p-2 rounded-lg border border-amber-105 text-[10px] text-amber-800 leading-relaxed font-semibold">
                              💡 Alert sent 5 days prior to each remaining month (balance of ${(grandTotal - monthlyAmount).toFixed(2)} split across remaining {numMonths - 1} months).
                           </div>
                        </button>
                     </div>
                  </div>
             )}
             
             {/* Bedroom / SmartLock Section */}
             {property?.bedrooms && property.bedrooms.length > 0 && (
                  <div className="mb-6">
                     {selectedBedrooms.length === 0 ? (
                         <div className="bg-indigo-50/50 border border-indigo-105 p-5 rounded-2xl mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block animate-pulse"></span>
                                <label className="block text-sm font-bold text-indigo-950">Entire Property Booking Included Access</label>
                            </div>
                            <p className="text-xs text-indigo-700/80 mb-4 leading-relaxed font-semibold">
                               You booked the **Entire Property**. This includes digital smart lock entry for the front door and secure individual codes for **all** rooms below:
                            </p>
                            <div className="space-y-2.5">
                                {property?.bedrooms?.map((b, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white p-3 rounded-xl border border-indigo-50/60 shadow-sm">
                                        <div>
                                            <span className="font-bold text-xs text-slate-800">{b.type}</span>
                                            <span className="text-[10px] text-slate-400 font-bold ml-1.5 font-mono">Room {b.roomNumber}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                             <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">Hidden until paid</span>
                                             <span className="font-mono text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200" title="Revealed after payment">🔒 ••••</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                         </div>
                     ) : (
                         <label className="block text-sm font-bold text-slate-700 mb-2">Select Rooms</label>
                     )}
                     {selectedBedrooms.length > 0 && (
                     <div className="space-y-2">
                         {property.bedrooms.map((b, i) => {
                             const isSelected = selectedBedrooms.some(rb => rb.roomNumber === b.roomNumber);
                             return (
                                 <label key={i} className={cn(
                                     "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all",
                                     isSelected ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200 hover:border-indigo-100"
                                 )}>
                                     <div className="flex items-center gap-3">
                                         <input 
                                             type="checkbox" 
                                             className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                             checked={isSelected}
                                             onChange={() => {
                                                 setSelectedBedrooms(prev => 
                                                     isSelected 
                                                         ? prev.filter(rb => rb.roomNumber !== b.roomNumber)
                                                         : [...prev, b]
                                                 );
                                             }}
                                         />
                                         <div>
                                             <div className="font-bold text-sm text-slate-800">{b.type} - Room {b.roomNumber}</div>
                                             <div className="text-[10px] text-slate-500 font-medium">{b.sqFt} sq ft • Max {b.maxCapacity || 2} Guests • Private Code: <span className="font-mono bg-slate-50 text-slate-400 px-1 py-0.5 rounded border border-slate-150 inline-flex items-center gap-0.5" title="Revealed after payment">🔒 ••••</span></div>
                                         </div>
                                     </div>
                                     <div className="font-mono font-bold text-indigo-600">${b.fee}</div>
                                 </label>
                             );
                         })}
                     </div>
                     )}
                  </div>
             )}
             
             {property?.hasSmartLock && property?.isTestProperty && (
                  <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 border-dashed">
                       <p className="font-bold text-xs text-indigo-950 flex items-center gap-1">
                           <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Smart Lock Code Status
                       </p>
                       <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                           Your custom front door smart key will be automatically provisioned and sent as soon as checkout payment is verified.
                       </p>
                       <div className="mt-3 flex items-center gap-2 bg-white/65 px-3 py-2 rounded-lg border border-indigo-100 h-10">
                           <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Front Door Lock PIN</span>
                           <span className="text-xs font-mono font-black text-slate-400 tracking-wider">🔒 CODES HIDDEN UNTIL PAID</span>
                       </div>
                  </div>
             )}
             
             {/* Guest Details Capture */}
             <form onSubmit={handleCheckoutSubmit} className="mb-6 space-y-4">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Confirmation Email</label>
                    <input 
                       type="email" 
                       value={guestEmail}
                       onChange={e => setGuestEmail(e.target.value)}
                       placeholder="guest@example.com"
                       className="w-full border border-slate-200 rounded-xl px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow font-sans"
                       required
                    />
                 </div>
                 <div>
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
                        <span>*</span>
                        <span>Enter mobile number (e.g., 4155552671) for automated access codes</span>
                     </div>
                     <label className="block text-sm font-bold text-slate-700 mb-1">Mobile Number (For Access Code SMS)</label>
                    <input 
                       type="tel" 
                       value={guestPhone}
                       onChange={e => setGuestPhone(e.target.value)}
                       placeholder="(415) 555-2671"
                       className="w-full border border-slate-200 rounded-xl px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow font-sans"
                       required
                    />
                 </div>

                 {isTestProperty && (
                     <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-medium">
                        💡 This is a TEST property. You may use any valid test card on Stripe Checkout to finalize your reservation.
                     </div>
                 )}

                 <div className="pt-4 border-t border-slate-100">
                    <div className="text-center text-[11px] text-slate-400 mb-4 flex items-center justify-center gap-1.5 font-medium">
                       <span>🔒 Secure redirect to Stripe Checkout</span>
                       <span>•</span>
                       <span>Card, Apple Pay, Google Pay accepted</span>
                    </div>

                    {error && <div className="text-rose-500 text-sm font-semibold mb-3">{error}</div>}

                    <button 
                      type="submit" 
                      disabled={processing}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold disabled:bg-slate-400 transition-colors shadow-sm flex items-center justify-center gap-2 text-base cursor-pointer"
                    >
                      {processing ? (
                        <>
                          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>Proceed to Secure Payment</span>
                      )}
                    </button>
                 </div>
             </form>

             {/* Same-day Booking Policy Agreement Dialog */}
             {showWarningModal && (
               <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                 <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col gap-6 animate-in fade-in-50 zoom-in-95 duration-200 text-left">
                   <div className="flex items-center gap-3 text-amber-500">
                     <span className="text-2xl">⚠️</span>
                     <h3 className="text-xl font-extrabold tracking-tight text-slate-800">Same-Day Booking Agreement</h3>
                   </div>
                   
                   <div className="space-y-4 text-slate-600 text-sm leading-relaxed">
                     <p className="font-semibold text-slate-700">
                       You are scheduling a booking that checks in today (<span className="text-indigo-600 font-bold">{checkIn.split('T')[0]}</span>).
                     </p>
                     <p>
                       Same-day bookings are subject to unique cancellation restrictions. You must understand and accept:
                     </p>
                     <div className="space-y-3 pl-1">
                       <div className="flex gap-2.5">
                         <span className="text-amber-500 font-extrabold font-mono">1.</span>
                         <span><strong>Cancellation Forfeited:</strong> Since this booking starts today, you cannot cancel this reservation for a refund.</span>
                       </div>
                       <div className="flex gap-2.5">
                         <span className="text-amber-500 font-extrabold font-mono">2.</span>
                         <span><strong>Date Changes Allowed:</strong> You are still allowed to change/edit your dates in the future. However, if you do, <strong>you will still be charged a 50% nightly rate penalty for tonight</strong>, plus the regular pricing for your new dates.</span>
                       </div>
                     </div>
                   </div>

                   <div className="flex flex-col gap-3 mt-2">
                     <button
                       type="button"
                       onClick={handleConfirmWarningAndPay}
                       className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-95 text-sm cursor-pointer"
                     >
                       I Understand & Proceed to Book
                     </button>
                     <button
                       type="button"
                       onClick={() => setShowWarningModal(false)}
                       className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all text-sm cursor-pointer"
                     >
                       Go Back / Edit Dates
                     </button>
                   </div>
                 </div>
               </div>
             )}

             {/* Booking Controls */}
             <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center">
                 <button 
                    onClick={() => navigate(`/property/${propertyId}`)}
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors cursor-pointer"
                 >
                    Edit Booking Dates
                 </button>
                 <button 
                    onClick={() => navigate('/')}
                    className="text-red-500 hover:text-red-700 font-medium text-sm transition-colors cursor-pointer"
                 >
                    Cancel Booking
                 </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
