import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, serverTimestamp, deleteDoc, setDoc } from 'firebase/firestore';
import { Booking, Property } from '../types';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, XCircle, Home, MapPin, Edit3, X, Trash2, Printer, CreditCard, Loader2 } from 'lucide-react';
import { parseISO, differenceInHours } from 'date-fns';
import { Calendar } from '../components/Calendar';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

import { LegalFooter } from '../components/LegalFooter';

// Stripe initialization for modifications
const stripePromiseBase = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
let dynamicStripePromise: Promise<any> | null = null;
const getStripe = async () => {
  if (dynamicStripePromise) return dynamicStripePromise;
  let key = stripePromiseBase;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      if (config.stripePublishableKey) key = config.stripePublishableKey;
    }
  } catch (e) {}
  if (!key || key === 'pk_test_placeholder') return null;
  dynamicStripePromise = loadStripe(key);
  return dynamicStripePromise;
};

const ModificationPaymentForm: React.FC<{ 
  clientSecret: string, 
  onSuccess: () => void, 
  onCancel: () => void,
  amount: number
}> = ({ clientSecret, onSuccess, onCancel, amount }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required"
    });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <CreditCard className="text-indigo-600" />
        Pay Difference: ${(amount / 100).toFixed(2)}
      </h3>
      <p className="text-sm text-slate-500 mb-6 italic">To confirm your new dates, please pay the difference for the extended stay or higher rate.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PaymentElement />
        {error && <div className="text-red-500 text-xs font-medium">{error}</div>}
        <div className="flex gap-3 pt-4 font-black uppercase text-[10px] tracking-widest">
           <button 
             type="button" 
             onClick={onCancel}
             className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl transition-colors italic"
           >
             Cancel Changes
           </button>
           <button 
             type="submit" 
             disabled={!stripe || processing}
             className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl disabled:bg-slate-400 transition-colors shadow-sm flex items-center justify-center gap-2"
           >
             {processing ? <Loader2 className="animate-spin" size={16} /> : 'Complete Payment'}
           </button>
        </div>
      </form>
    </div>
  );
};

export const MyBookings: React.FC = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [bookings, setBookings] = useState<(Booking & { propertyName?: string; propertyImage?: string; property?: Property | null })[]>([]);
    const [filter, setFilter] = useState<'active' | 'cancelled'>('active');
    const [fetching, setFetching] = useState(true);
    const [editingBooking, setEditingBooking] = useState<(Booking & { propertyName?: string; propertyImage?: string; property?: Property | null }) | null>(null);
    const [modificationPayment, setModificationPayment] = useState<{ clientSecret: string; amount: number; checkIn: string; checkOut: string; priceDetails: any } | null>(null);
    const [stripePromise, setStripePromise] = useState<any>(null);

    const [globalSettings, setGlobalSettings] = useState<any>(null);

    useEffect(() => {
        getStripe().then(setStripePromise);
    }, []);

    useEffect(() => {
        if (!user) {
            if (!loading) navigate('/');
            return;
        }
        
        getDoc(doc(db, 'global_settings', 'settings')).then(snap => {
            if (snap.exists()) setGlobalSettings(snap.data());
        });

        const fetchBookings = async () => {
            setFetching(true);
            try {
                const q = query(collection(db, 'bookings'), where('userId', '==', user.uid));
                const snap = await getDocs(q);
                const fetchedBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking))
                    .filter(b => !b.deletedByGuest);                
                
                // Enhance with property details
                const enhanced = await Promise.all(fetchedBookings.map(async (b) => {
                    let propertyName = "Unknown Property";
                    let propertyImage = "";
                    let property: Property | null = null;
                    try {
                       const pSnap = await getDoc(doc(db, 'properties', b.propertyId));
                       if (pSnap.exists()) {
                           const pData = pSnap.data() as Property;
                           property = { id: pSnap.id, ...pData };
                           propertyName = pData.name;
                           if (pData.images && pData.images.length > 0) {
                               propertyImage = pData.images[0];
                           }
                       }
                    } catch (e) {}
                    return { ...b, propertyName, propertyImage, property };
                }));

                // Sort descending by creation
                enhanced.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return timeB - timeA;
                });

                setBookings(enhanced);
            } catch (err) {
                console.error("Failed to load bookings:", err);
            }
            setFetching(false);
        };

        fetchBookings();
    }, [user, loading, navigate]);

    const handleCancel = async (booking: Booking & { propertyName?: string; propertyImage?: string }) => {
        const now = new Date();
        const checkIn = parseISO(booking.checkIn);
        const checkOut = parseISO(booking.checkOut);
        const hoursUntilCheckIn = differenceInHours(checkIn, now);
        
        let freeCancelHoursBefore = 48; // Global Default fallback
        let lateCancelFeePercent = 100; // Global Default fallback (no refund if cancelled < 48h)
        const tripDays = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

        if (globalSettings?.cancellationRules && globalSettings.cancellationRules.length > 0) {
            // Find the correct rule matching the length of stay, preferring rules for longer stays first
            const sortedRules = [...globalSettings.cancellationRules].sort((a,b) => b.minBookingDays - a.minBookingDays);
            const appliedRule = sortedRules.find((r: any) => tripDays >= r.minBookingDays);
            if (appliedRule) {
                freeCancelHoursBefore = appliedRule.freeCancelHoursBefore;
                lateCancelFeePercent = appliedRule.lateCancelFeePercent;
            }
        }

        let isLateCancellation = hoursUntilCheckIn < freeCancelHoursBefore;
        let cancellationFee = 0;
        
        if (isLateCancellation) {
            cancellationFee = Math.round(booking.totalPrice * (lateCancelFeePercent / 100));
            const proceed = window.confirm(`You are cancelling within the ${freeCancelHoursBefore}-hour window for a ${tripDays}-day stay.\nA late cancellation fee of $${(cancellationFee / 100).toFixed(2)} applies.\n\nDo you want to proceed and accept the fee?`);
            if (!proceed) return;
        } else {
            const proceed = window.confirm(`You are within the free cancellation window.\nNo fee will be charged to continuously cancel this booking.\n\nAre you sure you want to cancel?`);
            if (!proceed) return;
        }

        try {
            await updateDoc(doc(db, 'bookings', booking.id), {
                status: 'cancelled',
                cancellationFee: cancellationFee,
                updatedAt: serverTimestamp()
            });

            // Remove associated maintenance blackout
            try {
                await deleteDoc(doc(db, 'blackout_dates', `maint-${booking.id}`));
                console.log(`[MyBookings] Maintenance blackout removed for booking ${booking.id}`);
            } catch (blackoutErr) {
                console.warn("Failed to remove maintenance blackout on cancellation", blackoutErr);
            }
            
            // Refresh list locally
            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled', cancellationFee } : b));
            alert("Booking cancelled successfully.");
        } catch (err: any) {
            alert(`Failed to cancel: ${err.message}`);
        }
    };

    const handleDeleteCancelled = async (bookingId: string) => {
        if (!window.confirm("Are you sure you want to permanently delete this cancelled booking record?")) return;
        try {
            await updateDoc(doc(db, 'bookings', bookingId), {
                deletedByGuest: true,
                updatedAt: serverTimestamp()
            });
            setBookings(prev => prev.filter(b => b.id !== bookingId));
        } catch (err: any) {
            alert(`Failed to delete booking: ${err.message}`);
        }
    };

    const handleSaveEdit = async (checkIn: string, checkOut: string, priceDetails: any) => {
        if (!editingBooking || !user) return;
        const newTotal = Math.round(priceDetails.grandTotal * 100);
        const oldTotal = editingBooking.totalPrice;
        const diff = newTotal - oldTotal;

        if (diff < 0 && editingBooking.paymentIntentId) {
            // Initiate Refund
            const confirmRefund = window.confirm(`Your new booking total is $${(newTotal / 100).toFixed(2)}, which is $${(Math.abs(diff) / 100).toFixed(2)} less than your original payment.\n\nWe will issue a refund of $${(Math.abs(diff) / 100).toFixed(2)} to your original payment method.\n\nProceed with changes?`);
            if (!confirmRefund) return;

            try {
                const refundRes = await fetch('/api/refund-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentIntentId: editingBooking.paymentIntentId,
                        amount: Math.abs(diff)
                    })
                });

                if (!refundRes.ok) {
                    const errData = await refundRes.json();
                    throw new Error(errData.error || "Refund failed");
                }
                
                console.log("[MyBookings] Refund successful");
            } catch (e: any) {
                console.error("[MyBookings] Refund error:", e);
                alert(`We couldn't automatically issue a refund: ${e.message}. Please contact support to complete your modification.`);
                return;
            }
        } else if (diff > 0) {
            // Initiate Charge
            try {
                const intentRes = await fetch('/api/create-payment-intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: diff })
                });

                if (!intentRes.ok) throw new Error("Failed to create modification payment intent");
                const { clientSecret } = await intentRes.json();
                
                setModificationPayment({
                    clientSecret,
                    amount: diff,
                    checkIn,
                    checkOut,
                    priceDetails
                });
                return; // Wait for payment form
            } catch (e: any) {
                alert(`Error initializing additional payment: ${e.message}`);
                return;
            }
        }

        // Proceed to update Firestore if diff == 0 or refund was handled
        await finalizeBookingUpdate(checkIn, checkOut, newTotal);
    };

    const finalizeBookingUpdate = async (checkIn: string, checkOut: string, newTotal: number) => {
        if (!editingBooking || !user) return;
        try {
            const cleanCheckIn = checkIn.split('T')[0];
            const cleanCheckOut = checkOut.split('T')[0];
            await updateDoc(doc(db, 'bookings', editingBooking.id), {
                checkIn: cleanCheckIn,
                checkOut: cleanCheckOut,
                totalPrice: newTotal,
                updatedAt: serverTimestamp()
            });

            // Update associated maintenance blackout
            try {
                const checkOutDate = new Date(cleanCheckOut + 'T12:00:00'); // Use noon to avoid TZ issues
                const dayAfterDate = new Date(checkOutDate);
                dayAfterDate.setDate(dayAfterDate.getDate() + 1);
                const blackoutDateString = dayAfterDate.toISOString().split('T')[0];
                
                await setDoc(doc(db, 'blackout_dates', `maint-${editingBooking.id}`), {
                    propertyId: editingBooking.propertyId,
                    date: blackoutDateString,
                    targetType: editingBooking.selectedBedroom ? 'room' : 'property',
                    roomNumber: editingBooking.selectedBedroom?.roomNumber || null,
                    reason: `Maintenance/Cleaning for Booking ${editingBooking.bookingRef}`,
                    createdAt: serverTimestamp()
                });
                console.log(`[MyBookings] Maintenance blackout updated for ${blackoutDateString}`);
            } catch (blackoutErr) {
                console.warn("Failed to update maintenance blackout on edit", blackoutErr);
            }
            
            // Notify Managers and User
            try {
                let managers: any[] = [];
                let isTestProperty = false;
                const managersSnap = await getDocs(query(collection(db, 'property_managers')));
                managers = managersSnap.docs.map(d => d.data()).filter(m => m.enabled);
                
                const propSnap = await getDoc(doc(db, 'properties', editingBooking.propertyId));
                if (propSnap.exists() && propSnap.data().isTestProperty) {
                    isTestProperty = true;
                }

                await fetch('/api/notify-managers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                       managers,
                       bookingDetails: {
                          isUpdate: true,
                          checkIn: cleanCheckIn,
                          checkOut: cleanCheckOut,
                          totalAmount: newTotal,
                          propertyName: editingBooking.propertyName || 'Property',
                          guestName: user.displayName,
                          guestEmail: user.email,
                          accessCode: editingBooking.accessCode,
                          isTestProperty: isTestProperty
                       }
                    })
                });
            } catch (notifyErr) {
                console.error("Failed to send update notification:", notifyErr);
            }
            
            // Refresh list locally
            setBookings(prev => prev.map(b => b.id === editingBooking.id ? { 
                ...b, 
                checkIn: cleanCheckIn, 
                checkOut: cleanCheckOut,
                totalPrice: newTotal 
            } : b));
            
            alert("Booking dates successfully updated! Notifications have been sent.");
            setEditingBooking(null);
            setModificationPayment(null);
        } catch (err: any) {
            alert(`Failed to update booking: ${err.message}`);
        }
    };

    if (loading || fetching) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">Loading bookings...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12">
            <header className="pt-6 px-6 max-w-5xl mx-auto w-full mb-8">
                <div className="flex justify-between items-center bg-white rounded-2xl shadow-sm border border-slate-200 py-3 px-4">
                    <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-colors">
                        <div className="bg-slate-100 p-1.5 rounded-lg"><ChevronLeft size={18} /></div> Back to Home
                    </Link>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                        <CalendarIcon size={18} className="text-indigo-500" />
                        My Bookings
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-5xl mx-auto w-full px-6">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-8">Your Travel Itineraries</h1>

                <div className="flex gap-4 mb-6">
                    <button onClick={() => setFilter('active')} className={`px-4 py-2 rounded-full font-bold ${filter === 'active' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Active</button>
                    <button onClick={() => setFilter('cancelled')} className={`px-4 py-2 rounded-full font-bold ${filter === 'cancelled' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>Cancelled</button>
                </div>

                {bookings.filter(b => filter === 'cancelled' ? b.status === 'cancelled' : b.status !== 'cancelled').length === 0 ? (
                    <div className="text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <CalendarIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-700 mb-2">No {filter} bookings</h3>
                        <p className="text-slate-500 mb-6">You haven't {filter === 'active' ? 'booked any active properties' : 'cancelled any properties'} yet.</p>
                        {filter === 'active' && <Link to="/" className="inline-block bg-indigo-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-indigo-500 transition-colors">Explore Properties</Link>}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {bookings.filter(b => filter === 'cancelled' ? b.status === 'cancelled' : b.status !== 'cancelled').map(booking => {
                            const checkInDate = parseISO(booking.checkIn);
                            const checkOutDate = parseISO(booking.checkOut);
                            const hoursUntilCheckIn = differenceInHours(checkInDate, new Date());
                            const tripDays = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
                            
                            let freeCancelHoursBefore = 48;
                            if (globalSettings?.cancellationRules && globalSettings.cancellationRules.length > 0) {
                                const sortedRules = [...globalSettings.cancellationRules].sort((a,b) => b.minBookingDays - a.minBookingDays);
                                const appliedRule = sortedRules.find((r: any) => tripDays >= r.minBookingDays);
                                if (appliedRule) {
                                    freeCancelHoursBefore = appliedRule.freeCancelHoursBefore;
                                }
                            }
                            // Users can cancel/edit even if late just for a fee now as long as it's not the day of
                            const canCancel = hoursUntilCheckIn >= 0 && booking.status !== 'cancelled';
                            const isLate = hoursUntilCheckIn < freeCancelHoursBefore;

                            return (
                                <div key={booking.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col md:flex-row">
                                    <div className="md:w-64 h-48 md:h-auto bg-slate-100 relative shrink-0">
                                        {filter === 'active' && booking.propertyImage ? (
                                            <img src={booking.propertyImage} alt={booking.propertyName} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                                <Home size={32} className="mb-2 opacity-50" />
                                                <span className="text-sm font-medium">No Image</span>
                                            </div>
                                        )}
                                        <div className={`absolute top-4 left-4 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-md text-white ${
                                                booking.status === 'confirmed' ? 'bg-emerald-500' :
                                                booking.status === 'cancelled' ? 'bg-rose-500' :
                                                'bg-amber-500'
                                            }`}>
                                            {booking.status}
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 md:p-8 flex-1 flex flex-col">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">{booking.propertyName}</h3>
                                                <div className="text-sm font-mono text-slate-400 bg-slate-50 inline-block px-2 py-1 rounded-md border border-slate-100">
                                                    Ref: {booking.bookingRef || booking.id.substring(0, 8)}
                                                </div>
                                            </div>
                                            {booking.status !== 'cancelled' ? (
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold text-emerald-600">${(booking.totalPrice / 100).toFixed(2)}</div>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleDeleteCancelled(booking.id)}
                                                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                                                    title="Delete cancelled booking record"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <span className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Check In</span>
                                                <span className="font-medium text-slate-800">{booking.checkIn.split('T')[0]}</span>
                                            </div>
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <span className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Check Out</span>
                                                <span className="font-medium text-slate-800">{booking.checkOut.split('T')[0]}</span>
                                            </div>
                                        </div>

                                        {isLate && canCancel && (
                                           <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-xl text-xs font-medium">
                                              You are within the {freeCancelHoursBefore}-hour window of check-in. Cancellation fees will apply if you cancel or reschedule this booking.
                                           </div>
                                        )}

                                        {booking.cancellationFee !== undefined && booking.cancellationFee > 0 && booking.status === 'cancelled' && (
                                           <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-bold">
                                              Late Cancellation Fee Assessed: ${(booking.cancellationFee / 100).toFixed(2)}
                                           </div>
                                        )}

                                        {booking.accessCode && booking.status !== 'cancelled' && (
                                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                                        <MapPin size={20} />
                                                    </div>
                                                    <div>
                                                        <span className="block text-xs font-bold uppercase text-indigo-400 tracking-wider mb-0.5">Main Entry PIN</span>
                                                        <span className="font-mono text-xl font-bold text-indigo-700 tracking-widest">{booking.accessCode}</span>
                                                    </div>
                                                </div>

                                                {(booking.selectedBedrooms || (booking.selectedBedroom ? [booking.selectedBedroom] : [])).length > 0 && (
                                                    <div className="pt-2 border-t border-indigo-100 space-y-2">
                                                        {(booking.selectedBedrooms || [booking.selectedBedroom]).map((room, idx) => (
                                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                                                    <span className="font-bold text-slate-700">Room {room.roomNumber}</span>
                                                                    <span className="text-slate-400 text-[10px] uppercase font-medium">{room.type}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Room Lock</span>
                                                                    <span className="font-mono font-bold text-indigo-600">{room.roomLockNumber}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-auto flex flex-col gap-3 pt-6 border-t border-slate-100">
                                            {booking.status !== 'cancelled' && (
                                                <Link 
                                                    to={`/itinerary/${booking.id}`}
                                                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2 hover:bg-indigo-500 shadow-sm"
                                                >
                                                    <Printer size={18} /> View Itinerary
                                                </Link>
                                            )}
                                            <div className="flex gap-3">
                                                {canCancel ? (
                                                    <>
                                                        <button 
                                                            onClick={() => setEditingBooking(booking)}
                                                            className="flex-1 bg-white border-2 border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                                                        >
                                                            <Edit3 size={18} /> Edit Dates
                                                        </button>
                                                        <button 
                                                            onClick={() => handleCancel(booking)}
                                                            className="flex-1 bg-white border-2 border-rose-100 text-rose-600 hover:bg-rose-50 hover:border-rose-200 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                                                        >
                                                            <XCircle size={18} /> Cancel
                                                        </button>
                                                    </>
                                                ) : booking.status !== 'cancelled' ? (
                                                    <div className="text-sm font-bold text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-100 flex-1 text-center">
                                                        Check-in complete or underway
                                                    </div>
                                                ) : (
                                                    <div className="text-sm font-bold text-slate-500 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 flex-1 text-center">
                                                        Reservation Cancelled
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {editingBooking && !modificationPayment && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 overflow-y-auto flex items-start justify-center pt-20 pb-20 px-4">
                    <div className="bg-white rounded-3xl overflow-hidden w-full max-w-6xl shadow-2xl">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-2xl font-bold text-slate-800">Edit Booking Dates</h2>
                            <button onClick={() => setEditingBooking(null)} className="p-2 bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-600 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 bg-slate-50">
                            <Calendar 
                                key={editingBooking.id}
                                propertyId={editingBooking.propertyId} 
                                property={editingBooking.property || undefined}
                                isEditMode={true}
                                initialCheckIn={editingBooking.checkIn}
                                initialCheckOut={editingBooking.checkOut}
                                initialSelectedRoom={editingBooking.selectedBedroom}
                                onSaveEdit={handleSaveEdit}
                                onCancelEdit={() => setEditingBooking(null)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {modificationPayment && (
                <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4">
                    <Elements stripe={stripePromise} options={{ clientSecret: modificationPayment.clientSecret }}>
                        <ModificationPaymentForm 
                            clientSecret={modificationPayment.clientSecret}
                            amount={modificationPayment.amount}
                            onSuccess={() => finalizeBookingUpdate(modificationPayment.checkIn, modificationPayment.checkOut, Math.round(modificationPayment.priceDetails.grandTotal * 100))}
                            onCancel={() => setModificationPayment(null)}
                        />
                    </Elements>
                </div>
            )}
            <LegalFooter />
        </div>
    );
};
