/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { doc, setDoc, serverTimestamp, getDocs, getDoc, query, collection, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid'; 
import { calculatePriceDetails, PricingRule } from '../lib/pricing';
import { cn } from '../lib/utils';

import { Property } from '../types';

const stripePromiseBase = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
let dynamicStripePromise: Promise<any> | null = null;

const getStripe = async () => {
  if (dynamicStripePromise) return dynamicStripePromise;
  
  let key = stripePromiseBase;
  
    // Try to fetch from server for runtime dynamic config (Render.com etc)
    try {
      console.log("[Checkout] Fetching /api/config...");
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        if (config.stripePublishableKey) {
          key = config.stripePublishableKey;
          console.log("[Checkout] Using dynamic Stripe key from server:", key.substring(0, 10) + "...");
        }
      } else {
        console.error(`[Checkout] /api/config failed with status ${res.status}. Response:`, await res.text().catch(() => "no-body"));
        // Check server-debug if config fails
        const debugRes = await fetch('/server-debug').catch(() => null);
        if (debugRes) console.log(`[Checkout] /server-debug status: ${debugRes.status}`);
      }
    } catch (e) {
      console.warn("[Checkout] Failed to fetch dynamic config:", e);
    }
  
  if (!key || key === 'pk_test_placeholder') {
    return null;
  }
  
  dynamicStripePromise = loadStripe(key);
  return dynamicStripePromise;
};

const formatPhoneE164 = (phone: string) => {
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, and it's 10 digits, assume US (+1)
  if (!cleaned.startsWith('+') && cleaned.length === 10) {
    cleaned = '+1' + cleaned;
  }
  
  return cleaned;
};

const processBooking = async (
  bookingDetails: any,
  user: any,
  guestEmail: string,
  guestPhone: string,
  navigate: ReturnType<typeof useNavigate>,
  setError: (err: string) => void,
  setProcessing: (b: boolean) => void,
  isTestMode: boolean = false,
  selectedBedrooms: any[] = [],
  paymentIntentId?: string,
  paymentIntentAmount?: number,
  dailySelections?: any
) => {
  const bookingId = uuidv4();
  const e164Phone = formatPhoneE164(guestPhone);
  
  try {
    let accessCode = '';

    // Check if property has a manual front door lock code set
    try {
      const propSnap = await getDoc(doc(db, 'properties', bookingDetails.propertyId));
      if (propSnap.exists()) {
        const propData = propSnap.data() as Property;
        if (propData.hasSmartLock && propData.frontDoorCode) {
          accessCode = propData.frontDoorCode.trim();
        }
      }
    } catch (err) {
      console.warn("Failed to fetch property details for manual lock code lookup:", err);
    }

    if (!accessCode) {
      // Provision Yale access code via backend
      const lockRes = await fetch('/api/provision-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIn: bookingDetails.checkIn,
          checkOut: bookingDetails.checkOut,
          name: user.displayName,
        })
      });
      
      if (lockRes.ok) {
         try {
             const text = await lockRes.text();
             if (text) {
                 const data = JSON.parse(text);
                 accessCode = data.accessCode || '';
             }
         } catch (err) {
             console.warn("Failed to parse provision-lock response", err);
         }
      }
    }

    const bookingRef = Math.random().toString(36).substring(2, 8).toUpperCase();

    const payload: any = {
      userId: user.uid,
      propertyId: bookingDetails.propertyId,
      checkIn: bookingDetails.checkIn.split('T')[0],
      checkOut: bookingDetails.checkOut.split('T')[0],
      status: isTestMode ? 'confirmed' : 'pending', // Auto-confirm test bookings
      totalPrice: paymentIntentAmount || Math.round(bookingDetails.priceDetails.grandTotal * 100),
      paymentIntentId, // Save stripe payment intent ID for future modifications/refunds
      bookingRef,
      selectedBedrooms, // Save multiple rooms
      guestPhone: e164Phone, // Save formatted phone
      guestEmail: guestEmail, // Save guest email
      guestName: user.displayName || "Guest", // Save guest name
      guests: 1, // simplified for demo
      priceDetails: bookingDetails.priceDetails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    if (dailySelections) {
      payload.dailySelections = dailySelections;
    }
    
    // For backward compatibility / display
    if (selectedBedrooms.length > 0) {
        payload.selectedBedroom = selectedBedrooms[0];
    }

    if (accessCode) {
       payload.accessCode = accessCode;
    }

    if (db) {
      await setDoc(doc(db, 'bookings', bookingId), payload);

      // Auto-add Blackout for the day after checkout for maintenance/cleaning
      try {
        const checkOutDate = new Date(bookingDetails.checkOut);
        const dayAfterDate = new Date(checkOutDate);
        dayAfterDate.setDate(dayAfterDate.getDate() + 1);
        const blackoutDateString = dayAfterDate.toISOString().split('T')[0];
        
        if (selectedBedrooms.length > 0) {
            // Blackout each room
            for (const room of selectedBedrooms) {
                const blackoutId = `maint-${bookingId}-${room.roomNumber}`;
                await setDoc(doc(db, 'blackout_dates', blackoutId), {
                  propertyId: bookingDetails.propertyId,
                  date: blackoutDateString,
                  targetType: 'room',
                  roomNumber: room.roomNumber,
                  reason: `Maintenance/Cleaning for Booking ${bookingRef} (Room ${room.roomNumber})`,
                  createdAt: serverTimestamp()
                });
            }
        } else {
            // Blackout entire property
            await setDoc(doc(db, 'blackout_dates', `maint-${bookingId}`), {
              propertyId: bookingDetails.propertyId,
              date: blackoutDateString,
              targetType: 'property',
              roomNumber: null,
              reason: `Maintenance/Cleaning for Booking ${bookingRef}`,
              createdAt: serverTimestamp()
            });
        }
        console.log(`[Checkout] Auto-blackout(s) created for ${blackoutDateString}`);
      } catch (blackoutErr) {
        console.warn("Failed to create auto-blackout", blackoutErr);
      }
    }
    
    let notificationResults: string[] = [];
    // Notify Managers
    try {
       let managers: any[] = [];
       let propertyName = "Villa";
       let isTestProperty = false;
       if (db) {
         const managersSnap = await getDocs(query(collection(db, 'property_managers')));
         managers = managersSnap.docs.map(d => d.data()).filter(m => m.enabled);
         try {
            const propSnap = await getDoc(doc(db, 'properties', bookingDetails.propertyId));
            if(propSnap.exists()) {
               propertyName = propSnap.data().name;
               isTestProperty = !!propSnap.data().isTestProperty;
            }
         } catch(e) {}
       }

       if (managers.length > 0 || guestEmail || guestPhone) {
          const notifyRes = await fetch('/api/notify-managers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               managers,
               bookingDetails: {
                  checkIn: bookingDetails.checkIn.split('T')[0],
                  checkOut: bookingDetails.checkOut.split('T')[0],
                  totalAmount: Math.round(bookingDetails.priceDetails.grandTotal * 100),
                  propertyName: propertyName,
                  guestName: user.displayName,
                  guestEmail: guestEmail,
                  guestPhone: e164Phone,
                  accessCode: accessCode,
                  isTestProperty: isTestProperty,
                  selectedBedrooms: selectedBedrooms // Pass multiple rooms
               }
            })
          });
          if (notifyRes.ok) {
             try {
                 const text = await notifyRes.text();
                 if (text) {
                     const notifyData = JSON.parse(text);
                     notificationResults = notifyData.results || [];
                 }
             } catch(e) {
                 console.warn("Failed to parse notify-managers response", e);
             }
          }
       }
    } catch (notifyErr) {
       console.error("Manager notification failed, but booking succeeded", notifyErr);
    }

    navigate('/confirmation', { state: { bookingId, accessCode, notificationResults, bookingRef, selectedBedrooms, checkIn: bookingDetails.checkIn, checkOut: bookingDetails.checkOut }});
  } catch (e: any) {
     console.error("Booking error:", e);
     setError(`Booking failed: ${e.message}`);
     setProcessing(false);
  }
};

const CheckoutForm: React.FC<{ clientSecret: string, bookingDetails: any, guestEmail: string, guestPhone: string, isTestProperty: boolean, selectedBedrooms: any[], dailySelections: any }> = ({ clientSecret, bookingDetails, guestEmail, guestPhone, isTestProperty, selectedBedrooms, dailySelections }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningConfirmed, setWarningConfirmed] = useState(false);

  const checkIsSameDay = () => {
    if (!bookingDetails?.checkIn) return false;
    const checkInYMD = bookingDetails.checkIn.split('T')[0];
    const today = new Date();
    const todayYMD = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return checkInYMD === todayYMD;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !user) return;

    if (checkIsSameDay() && !warningConfirmed) {
      setShowWarningModal(true);
      return;
    }

    await executePayment();
  };

  const handleConfirmWarningAndPay = async () => {
    setShowWarningModal(false);
    setWarningConfirmed(true);
    await executePayment();
  };

  const executePayment = async () => {
    setProcessing(true);

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required"
    });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else {
      // Payment successful, generate lock code and write Booking to firestore
      await processBooking(bookingDetails, user, guestEmail, guestPhone, navigate, setError, setProcessing, isTestProperty, selectedBedrooms, paymentIntent?.id, paymentIntent?.amount, dailySelections);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <button 
        type="submit" 
        disabled={!stripe || processing}
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-bold disabled:bg-slate-400 transition-colors shadow-sm mt-6"
      >
        {processing ? 'Processing...' : 'Pay & Confirm Booking'}
      </button>

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
                You are scheduling a booking that checks in today (<span className="text-indigo-600 font-bold">{bookingDetails.checkIn.split('T')[0]}</span>).
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
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-95 text-sm"
              >
                I Understand & Proceed to Book
              </button>
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all text-sm"
              >
                Go Back / Edit Dates
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

export const Checkout: React.FC = () => {
  const location = useLocation();
  const { user, loading } = useAuth();
  
  const propertyId = location.state?.propertyId;
  const checkIn = location.state?.checkIn;
  const checkOut = location.state?.checkOut;
  const priceDetails = location.state?.priceDetails;
  
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stripeConfigError, setStripeConfigError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [property, setProperty] = useState<Property | null>(null);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [localPriceDetails, setLocalPriceDetails] = useState<any>(priceDetails);

  const isTestProperty = !!property?.isTestProperty;
  
  const [stripePromise, setStripePromise] = useState<any>(null);
  const [hasPublishableKey, setHasPublishableKey] = useState(false);

  const [selectedBedrooms, setSelectedBedrooms] = useState<any[]>(location.state?.selectedBedrooms || []);
  const dailySelections = location.state?.dailySelections || null;
  const navigate = useNavigate();
  
  useEffect(() => {
    getStripe().then(sp => {
      if (sp) {
        setStripePromise(sp);
        setHasPublishableKey(true);
      } else {
        setHasPublishableKey(false);
      }
    });
  }, []);
  
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

        // Fetch rules for local recalc
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

  useEffect(() => {
    if (!propertyId || !checkIn || !checkOut) return;
    
    setStripeConfigError(null);
    setClientSecret('');
    
    fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        checkIn,
        checkOut,
        selectedBedrooms, // Pass array
        dailySelections
      })
    })
    .then(async res => {
      const contentType = res.headers.get("content-type");
      let data: any = {};
      
      try {
        if (contentType && contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text();
          console.error(`[Checkout] Expected JSON from server but got ${contentType || 'no content-type'}. Body snippet: ${text.substring(0, 100)}`);
          if (!res.ok) {
            setStripeConfigError(`Server Error: ${res.status}. Please ensure the server is running and /api/config is registered.`);
            setClientSecret('MOCK_TEST_MODE');
            return;
          }
        }
      } catch (e) {
        console.error("Error parsing response:", e);
      }

      if (!res.ok) {
        console.error("Stripe API Error (Local Server):", data?.error || "Unknown Error");
        setClientSecret('MOCK_TEST_MODE');
        setStripeConfigError(data.error || `Server responded with ${res.status}`);
        return;
      }

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        setClientSecret('MOCK_TEST_MODE');
        setStripeConfigError("Server did not return a clientSecret.");
      }
      
      if (!hasPublishableKey) {
        setStripeConfigError("VITE_STRIPE_PUBLISHABLE_KEY is missing on the client. Please add it to your Secrets.");
      }
    })
    .catch((err) => {
       console.error("Payment intent fetch error:", err);
       setClientSecret('MOCK_TEST_MODE');
       setStripeConfigError("Network error: Could not reach the payment server.");
    });
  }, [propertyId, checkIn, checkOut, selectedBedrooms, hasPublishableKey]);

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
               <div className="flex justify-between items-end border-t border-slate-800 pt-6 mt-6">
                  <span>Total Due</span>
                  <span className="font-mono text-3xl font-bold text-white">${(localPriceDetails.grandTotal).toFixed(2)}</span>
               </div>
            </div>

            <div className="mt-8 flex justify-center gap-3 opacity-60">
                <div className="w-10 h-6 bg-slate-700 rounded-sm flex items-center justify-center text-[8px] font-bold">VISA</div>
                <div className="w-10 h-6 bg-slate-700 rounded-sm flex items-center justify-center text-[8px] font-bold">STRIPE</div>
            </div>
          </div>
          
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 h-fit">
             <h3 className="font-bold text-lg mb-6 text-slate-800">Payment Details</h3>
             
             {/* Bedroom / SmartLock Section */}
             {property?.bedrooms && property.bedrooms.length > 0 && (
                 <div className="mb-6">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Rooms</label>
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
                                            <div className="text-[10px] text-slate-500 font-medium">{b.sqFt} sq ft • Lock: {b.roomLockNumber}</div>
                                        </div>
                                    </div>
                                    <div className="font-mono font-bold text-indigo-600">${b.fee}</div>
                                </label>
                            );
                        })}
                    </div>
                 </div>
             )}
             
             {property?.hasSmartLock && property?.isTestProperty && (
                 <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 border-dashed">
                     <p className="font-bold text-sm">Simulated SmartLock Code</p>
                     <p className="text-3xl font-mono font-bold tracking-widest mt-1">123456</p>
                 </div>
             )}
             
             {/* Guest Details Capture */}
             <div className="mb-6 space-y-4">
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Confirmation Email</label>
                    <input 
                       type="email" 
                       value={guestEmail}
                       onChange={e => setGuestEmail(e.target.value)}
                       placeholder="guest@example.com"
                       className="w-full border border-slate-200 rounded-xl px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow"
                    />
                 </div>
                 <div>
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
                        <span>*</span>
                        <span>Mobile number must be in E.164 format (e.g., +14155552671) for automated access codes</span>
                     </div>
                     <label className="block text-sm font-bold text-slate-700 mb-1">Mobile Number (For Access Code SMS)</label>
                    <input 
                       type="tel" 
                       value={guestPhone}
                       onChange={e => setGuestPhone(e.target.value)}
                       placeholder="+1 (123) 456-7890"
                       className="w-full border border-slate-200 rounded-xl px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow"
                    />
                 </div>
             </div>

             {isTestProperty ? (
                 <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl mb-6">
                    <p className="text-emerald-800 font-medium mb-4 text-sm">This is a TEST property. You may use the Test Visa card number: 4242 4242 4242 4242</p>
                 </div>
             ) : null}

             {clientSecret && clientSecret !== 'MOCK_TEST_MODE' ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <CheckoutForm clientSecret={clientSecret} bookingDetails={{ propertyId, checkIn, checkOut, priceDetails: localPriceDetails }} guestEmail={guestEmail} guestPhone={guestPhone} isTestProperty={isTestProperty} selectedBedrooms={selectedBedrooms} dailySelections={dailySelections} />
                </Elements>
             ) : (
                <div className="p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center">
                   {stripeConfigError ? (
                      <div className="space-y-3">
                        <p className="text-rose-600 font-bold">Stripe Configuration Required</p>
                        <p className="text-slate-500 text-sm leading-relaxed">
                          {stripeConfigError}
                          <br />
                          Please add <code className="bg-slate-100 px-1 rounded">STRIPE_SECRET_KEY</code> and <code className="bg-slate-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> to your secrets to enable payments.
                        </p>
                      </div>
                   ) : (
                      <div className="animate-pulse flex flex-col items-center space-y-4">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-medium text-sm">Initializing secure checkout...</p>
                      </div>
                   )}
                </div>
             )}

             {/* Booking Controls */}
             <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center">
                 <button 
                    onClick={() => navigate(`/property/${propertyId}`)}
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors"
                 >
                    Edit Booking Dates
                 </button>
                 <button 
                    onClick={() => navigate('/')}
                    className="text-red-500 hover:text-red-700 font-medium text-sm transition-colors"
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
