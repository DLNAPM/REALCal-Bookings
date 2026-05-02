/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { doc, setDoc, serverTimestamp, getDocs, getDoc, query, collection, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid'; // I need to install uuid

import { Property } from '../types';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

const processBooking = async (
  bookingDetails: any,
  user: any,
  guestEmail: string,
  guestPhone: string,
  navigate: ReturnType<typeof useNavigate>,
  setError: (err: string) => void,
  setProcessing: (b: boolean) => void,
  isTestMode: boolean = false,
  selectedBedroom: any = null
) => {
  const bookingId = uuidv4();
  try {
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
    
    let accessCode = '';
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

    const bookingRef = Math.random().toString(36).substring(2, 8).toUpperCase();

    const payload: any = {
      userId: user.uid,
      propertyId: bookingDetails.propertyId,
      checkIn: bookingDetails.checkIn,
      checkOut: bookingDetails.checkOut,
      status: isTestMode ? 'confirmed' : 'pending', // Auto-confirm test bookings
      totalPrice: bookingDetails.priceDetails.grandTotal,
      guests: 1, // simplified for demo
      bookingRef,
      selectedBedroom,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (accessCode) {
       payload.accessCode = accessCode;
    }

    if (db) {
      await setDoc(doc(db, 'bookings', bookingId), payload);
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
                  checkIn: bookingDetails.checkIn,
                  checkOut: bookingDetails.checkOut,
                  totalAmount: Math.round(bookingDetails.priceDetails.grandTotal * 100),
                  propertyName: propertyName,
                  guestName: user.displayName,
                  guestEmail: guestEmail,
                  guestPhone: guestPhone,
                  accessCode: accessCode,
                  isTestProperty: isTestProperty
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

    navigate('/confirmation', { state: { bookingId, accessCode, notificationResults, bookingRef, selectedBedroom }});
  } catch (e: any) {
     console.error("Booking error:", e);
     setError(`Booking failed: ${e.message}`);
     setProcessing(false);
  }
};

const CheckoutForm: React.FC<{ clientSecret: string, bookingDetails: any, guestEmail: string, guestPhone: string, isTestProperty: boolean, selectedBedroom: any }> = ({ clientSecret, bookingDetails, guestEmail, guestPhone, isTestProperty, selectedBedroom }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !user) return;
    setProcessing(true);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required"
    });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else {
      // Payment successful, generate lock code and write Booking to firestore
      await processBooking(bookingDetails, user, guestEmail, guestPhone, navigate, setError, setProcessing, isTestProperty, selectedBedroom);
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
  const [processing, setProcessing] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [property, setProperty] = useState<Property | null>(null);
  const isTestProperty = !!property?.isTestProperty;
  const [selectedBedroom, setSelectedBedroom] = useState<any>(location.state?.selectedBedroom || null);
  const navigate = useNavigate();
  
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
    }
  }, [propertyId]);

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/" />;

  if (!propertyId || !checkIn || !checkOut || !priceDetails) return <Navigate to="/" />;

  useEffect(() => {
    fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(priceDetails.grandTotal * 100), // convert to cents
      })
    })
    .then(async res => {
      try {
        const text = await res.text();
        if (!text) {
           setClientSecret('MOCK_TEST_MODE');
           return;
        }
        const data = JSON.parse(text);
        if (!res.ok) {
           console.error("Stripe Error:", data?.error);
           setClientSecret('MOCK_TEST_MODE');
           return;
        }
        setClientSecret(data.clientSecret || 'MOCK_TEST_MODE');
      } catch (err) {
        console.error("Payment intent JSON parse error:", err);
        setClientSecret('MOCK_TEST_MODE');
      }
    })
    .catch((err) => {
       console.error("Payment intent fetch error:", err);
       setClientSecret('MOCK_TEST_MODE');
    });
  }, [priceDetails]);

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
                 <span className="text-white font-medium">{new Date(checkIn).toLocaleDateString()}</span>
               </div>
               <div className="flex justify-between items-center text-slate-400">
                 <span>Check-out</span>
                 <span className="text-white font-medium">{new Date(checkOut).toLocaleDateString()}</span>
               </div>
            </div>
            
            <div className="space-y-3 border-t border-slate-800 pt-6 text-sm text-slate-400">
               <div className="flex justify-between">
                  <span>Base Rate ({priceDetails.nights} nights)</span>
                  <span className="font-mono text-white">${(priceDetails.baseTotal).toFixed(2)}</span>
               </div>
               {priceDetails.discount > 0 && (
                   <div className="flex justify-between text-emerald-400">
                      <span>Discount</span>
                      <span className="font-mono">-${(priceDetails.discount).toFixed(2)}</span>
                   </div>
               )}
               <div className="flex justify-between">
                  <span>Cleaning Fee</span>
                  <span className="font-mono text-white">${(priceDetails.cleaningFee).toFixed(2)}</span>
               </div>
               <div className="flex justify-between">
                  <span>Occupancy Taxes</span>
                  <span className="font-mono text-white">${(priceDetails.taxes).toFixed(2)}</span>
               </div>
               <div className="flex justify-between items-end border-t border-slate-800 pt-6 mt-6">
                  <span>Total Due</span>
                  <span className="font-mono text-3xl font-bold text-white">${(priceDetails.grandTotal).toFixed(2)}</span>
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
                    <label className="block text-sm font-bold text-slate-700 mb-1">Select Room</label>
                    <select value={selectedBedroom ? JSON.stringify(selectedBedroom) : ''} onChange={e => setSelectedBedroom(e.target.value ? JSON.parse(e.target.value) : null)} className="w-full border border-slate-300 rounded-xl p-3 bg-white shadow-sm">
                        <option value="">Entire Property</option>
                        {property.bedrooms.map((b, i) => <option key={i} value={JSON.stringify(b)}>{b.type} - Room {b.roomNumber}</option>)}
                    </select>
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
                    <label className="block text-sm font-bold text-slate-700 mb-1">Mobile Number (For Access Code SMS)</label>
                    <input 
                       type="tel" 
                       value={guestPhone}
                       onChange={e => setGuestPhone(e.target.value)}
                       placeholder="+1 (123) 456-7890"
                       className="w-full border border-slate-200 rounded-xl px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-shadow"
                    />
                 </div>

                 <div className="pt-4 border-t border-slate-100">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <div className="relative flex items-center h-5">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                          checked={user?.tollFreeAccept || false}
                          onChange={async (e) => {
                            if (!user || !db) return;
                            try {
                              await updateDoc(doc(db, 'users', user.uid), {
                                tollFreeAccept: e.target.checked
                              });
                            } catch (err) {
                              console.error("Failed to update toll-free consent", err);
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1 text-[11px] leading-tight mt-0.5">
                        <span className="block font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">Toll-free-accept</span>
                        <span className="block text-slate-500 mt-0.5">
                          I consent to receive automated SMS messages for access codes and booking updates.
                        </span>
                      </div>
                    </label>
                 </div>
             </div>

             {isTestProperty ? (
                 <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl mb-6">
                    <p className="text-emerald-800 font-medium mb-4 text-sm">This is a TEST property. You may use the Test Visa card number: 4242 4242 4242 4242</p>
                 </div>
             ) : null}

             {clientSecret === 'MOCK_TEST_MODE' ? (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl md:mt-8">
                   <p className="text-amber-800 font-medium mb-4 text-sm">Stripe is not configured in this environment (STRIPE_SECRET_KEY missing). You can bypass payment for end-to-end testing.</p>
                   <div className="flex flex-col gap-3">
                     <button 
                       disabled={processing}
                       onClick={async () => {
                           setProcessing(true);
                           await processBooking({ propertyId, checkIn, checkOut, priceDetails }, user, guestEmail, guestPhone, navigate, setError, setProcessing, !!property?.isTestProperty, selectedBedroom);
                       }}
                       className="w-full bg-amber-600 hover:bg-amber-500 text-white py-4 rounded-xl font-bold transition-colors shadow-sm disabled:opacity-50"
                     >
                       {processing ? 'Processing...' : 'Bypass Payment & Confirm'}
                     </button>
                     {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
                   </div>
                </div>
             ) : clientSecret ? (
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <CheckoutForm clientSecret={clientSecret} bookingDetails={{ propertyId, checkIn, checkOut, priceDetails }} guestEmail={guestEmail} guestPhone={guestPhone} isTestProperty={isTestProperty} selectedBedroom={selectedBedroom} />
                </Elements>
             ) : (
                <div className="animate-pulse flex flex-col space-y-4">
                   <div className="h-10 bg-slate-100 border border-slate-200 rounded-xl"></div>
                   <div className="h-48 bg-slate-100 border border-slate-200 rounded-xl"></div>
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
