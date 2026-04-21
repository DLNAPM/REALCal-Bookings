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

        await setDoc(doc(db, 'bookings', bookingId), payload);
        
        // Notify Managers
        try {
           const managersSnap = await getDocs(query(collection(db, 'property_managers')));
           const managers = managersSnap.docs.map(d => d.data()).filter(m => m.enabled);
           let propertyName = "Villa";
           try {
              const propSnap = await getDoc(doc(db, 'properties', bookingDetails.propertyId));
              if(propSnap.exists()) propertyName = propSnap.data().name;
           } catch(e) {}

           if (managers.length > 0) {
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
                      guestName: user.displayName
                   }
                })
              });
           }
        } catch (notifyErr) {
           console.error("Manager notification failed, but booking succeeded", notifyErr);
        }

        navigate('/confirmation', { state: { bookingId, accessCode }});
      } catch (e: any) {
         setError("Payment succeeded but booking failed to save. Please contact support.");
         setProcessing(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <button 
        type="submit" 
        disabled={!stripe || processing}
        className="w-full bg-black text-white py-3 rounded-lg font-bold disabled:bg-gray-400"
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
    .then(res => res.json())
    .then(data => setClientSecret(data.clientSecret))
    .catch(console.error);
  }, [priceDetails]);

  return (
    <div className="max-w-3xl mx-auto p-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Secure Checkout</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gray-50 p-6 rounded-xl border">
          <h3 className="font-bold text-lg border-b pb-4 mb-4">Booking Summary</h3>
          <p><strong>Check In:</strong> {new Date(checkIn).toLocaleDateString()}</p>
          <p className="mb-4"><strong>Check Out:</strong> {new Date(checkOut).toLocaleDateString()}</p>
          
          <div className="space-y-2 border-t pt-4 text-sm text-gray-600">
             <div className="flex justify-between">
                <span>Base Rate ({priceDetails.nights} nights)</span>
                <span>$\{(priceDetails.baseTotal).toFixed(2)}</span>
             </div>
             {priceDetails.discount > 0 && (
                 <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-$\{(priceDetails.discount).toFixed(2)}</span>
                 </div>
             )}
             <div className="flex justify-between">
                <span>Cleaning Fee</span>
                <span>$\{(priceDetails.cleaningFee).toFixed(2)}</span>
             </div>
             <div className="flex justify-between">
                <span>Taxes</span>
                <span>$\{(priceDetails.taxes).toFixed(2)}</span>
             </div>
             <div className="flex justify-between font-bold text-black border-t pt-2 mt-2 text-lg">
                <span>Total Due</span>
                <span>$\{(priceDetails.grandTotal).toFixed(2)}</span>
             </div>
          </div>
        </div>
        
        <div>
           {clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm clientSecret={clientSecret} bookingDetails={{ propertyId, checkIn, checkOut, priceDetails }} />
              </Elements>
           ) : (
              <div className="animate-pulse flex flex-col space-y-4">
                 <div className="h-10 bg-gray-200 rounded"></div>
                 <div className="h-24 bg-gray-200 rounded"></div>
              </div>
           )}
        </div>
      </div>
    </div>
  )
}
