/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { doc, setDoc, serverTimestamp, getDocs, getDoc, query, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid'; // I need to install uuid

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

const processBooking = async (
  bookingDetails: any,
  user: any,
  navigate: ReturnType<typeof useNavigate>,
  setError: (err: string) => void,
  setProcessing: (b: boolean) => void
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
       const data = await lockRes.json();
       accessCode = data.accessCode || '';
    }

    const payload: any = {
      userId: user.uid,
      propertyId: bookingDetails.propertyId,
      checkIn: bookingDetails.checkIn,
      checkOut: bookingDetails.checkOut,
      status: 'confirmed',
      totalPrice: bookingDetails.priceDetails.grandTotal,
      guests: 1, // simplified for demo
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (accessCode) {
       payload.accessCode = accessCode;
    }

    if (db) {
      await setDoc(doc(db, 'bookings', bookingId), payload);
    }
    
    // Notify Managers
    try {
       let managers: any[] = [];
       let propertyName = "Villa";
       if (db) {
         const managersSnap = await getDocs(query(collection(db, 'property_managers')));
         managers = managersSnap.docs.map(d => d.data()).filter(m => m.enabled);
         try {
            const propSnap = await getDoc(doc(db, 'properties', bookingDetails.propertyId));
            if(propSnap.exists()) propertyName = propSnap.data().name;
         } catch(e) {}
       }

       if (managers.length > 0 || user.email) {
          await fetch('/api/notify-managers', {
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
                  guestEmail: user.email
               }
            })
          });
       }
    } catch (notifyErr) {
       console.error("Manager notification failed, but booking succeeded", notifyErr);
    }

    navigate('/confirmation', { state: { bookingId, accessCode }});
  } catch (e: any) {
     setError("Booking failed to save. Please contact support.");
     setProcessing(false);
  }
};

const CheckoutForm: React.FC<{ clientSecret: string, bookingDetails: any }> = ({ clientSecret, bookingDetails }) => {
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
      await processBooking(bookingDetails, user, navigate, setError, setProcessing);
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
  const [clientSecret, setClientSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/" />;
  
  const { propertyId, checkIn, checkOut, priceDetails } = location.state || {};
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
      const data = await res.json();
      if (!res.ok) {
         console.error("Stripe Error:", data.error);
         setClientSecret('MOCK_TEST_MODE');
         return;
      }
      setClientSecret(data.clientSecret);
    })
    .catch((err) => {
       console.error(err);
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
             {clientSecret === 'MOCK_TEST_MODE' ? (
                <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl">
                   <p className="text-amber-800 font-medium mb-4 text-sm">Stripe is not configured in this environment (STRIPE_SECRET_KEY missing). You can bypass payment for end-to-end testing.</p>
                   <div className="flex flex-col gap-3">
                     <button 
                       disabled={processing}
                       onClick={async () => {
                           setProcessing(true);
                           await processBooking({ propertyId, checkIn, checkOut, priceDetails }, user, navigate, setError, setProcessing);
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
                  <CheckoutForm clientSecret={clientSecret} bookingDetails={{ propertyId, checkIn, checkOut, priceDetails }} />
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
