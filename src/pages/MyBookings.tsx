import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, serverTimestamp, deleteDoc, setDoc } from 'firebase/firestore';
import { Booking, Property } from '../types';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, XCircle, CheckCircle, Home, MapPin, Edit3, X, Trash2, Printer, CreditCard, Loader2, AlertCircle } from 'lucide-react';
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
    const [modificationPayment, setModificationPayment] = useState<{ clientSecret: string; amount: number; checkIn: string; checkOut: string; priceDetails: any; selectedBedrooms: any[]; rentalMode: 'entire' | 'room' } | null>(null);
    const [stripePromise, setStripePromise] = useState<any>(null);

    const [globalSettings, setGlobalSettings] = useState<any>(null);
    const [checkoutTargetBooking, setCheckoutTargetBooking] = useState<(Booking & { propertyName?: string; propertyImage?: string; property?: Property | null }) | null>(null);
    const [checkoutProcessing, setCheckoutProcessing] = useState(false);

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

    const executeCheckout = async (bookingId: string) => {
        setCheckoutProcessing(true);
        try {
            const res = await fetch('/api/checkout-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to complete electronic check-out.");
            }
            
            // Success! Update local listings state
            setBookings(prev => prev.map(b => b.id === bookingId ? { 
                ...b, 
                checkedOut: true,
                checkedOutAt: data.checkedOutAt,
                lateCheckoutFee: data.lateCheckoutFee,
                overdueHours: data.overdueHours
            } : b));

            alert("Check-out Completed! Thank you for staying with us. A confirmation email/SMS has been sent.");
            setCheckoutTargetBooking(null);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setCheckoutProcessing(false);
        }
    };

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
            
            const feeString = `$${(cancellationFee / 100).toFixed(2)}`;
            const message = `WARNING: You are cancelling within the ${freeCancelHoursBefore}-hour late cancellation period.\n\n` +
                            `The Late Cancellation Fee for this booking would be: ${feeString}.\n\n` +
                            `Are you absolutely sure you want to cancel this booking and accept the late cancellation fee of ${feeString}?`;
            
            const proceed = window.confirm(message);
            if (!proceed) return;
        } else {
            const proceed = window.confirm(`You are within the free cancellation window.\nNo fee will be charged to cancel this booking.\n\nAre you sure you want to cancel?`);
            if (!proceed) return;
        }

        try {
            // Handle Refund if payment exists
            const refundAmount = booking.totalPrice - cancellationFee;
            if (refundAmount > 0 && booking.paymentIntentId) {
                try {
                    const refundRes = await fetch('/api/refund-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            paymentIntentId: booking.paymentIntentId,
                            amount: refundAmount
                        })
                    });

                    if (!refundRes.ok) {
                        const errData = await refundRes.json();
                        throw new Error(errData.error || "Refund failed");
                    }
                    console.log(`[MyBookings] Successfully refunded $${(refundAmount / 100).toFixed(2)} for cancellation`);
                } catch (refundErr: any) {
                    console.error("[MyBookings] Cancellation refund error:", refundErr);
                    // We alert but still allow cancellation if they clicked yes to the fee? 
                    // Actually, if the refund fails but they expect a refund, we should probably warn them.
                    alert(`Refund failed: ${refundErr.message}. The booking was NOT yet cancelled. Please contact support if this persists.`);
                    return;
                }
            }

            await updateDoc(doc(db, 'bookings', booking.id), {
                status: 'cancelled',
                cancellationFee: cancellationFee,
                updatedAt: serverTimestamp()
            });

            // Remove associated maintenance blackout
            try {
                const rooms = booking.selectedBedrooms || (booking.selectedBedroom ? [booking.selectedBedroom] : []);
                if (rooms.length > 0) {
                    for (const room of rooms) {
                        await deleteDoc(doc(db, 'blackout_dates', `maint-${booking.id}-${room.roomNumber}`));
                    }
                } else {
                    await deleteDoc(doc(db, 'blackout_dates', `maint-${booking.id}`));
                }
                console.log(`[MyBookings] Maintenance blackout(s) removed for booking ${booking.id}`);
            } catch (blackoutErr) {
                console.warn("Failed to remove maintenance blackout on cancellation", blackoutErr);
            }
            
            // Refresh list locally
            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled', cancellationFee } : b));
            
            const refundMsg = refundAmount > 0 && booking.paymentIntentId 
                ? `\n\nA refund of $${(refundAmount / 100).toFixed(2)} has been issued to your original payment method.`
                : "";
            alert(`Booking cancelled successfully.${refundMsg}`);
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

    const handleSaveEdit = async (checkIn: string, checkOut: string, priceDetails: any, selectedBedrooms: any[], rentalMode: 'entire' | 'room') => {
        if (!editingBooking || !user) return;
        const newTotal = Math.round(priceDetails.grandTotal * 100);
        const oldTotal = editingBooking.totalPrice;
        const diff = newTotal - oldTotal;

        if (diff < 0 && editingBooking.paymentIntentId) {
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
            } catch (e: any) {
                console.error("[MyBookings] Refund error:", e);
                alert(`We couldn't automatically issue a refund: ${e.message}. Please contact support to complete your modification.`);
                return;
            }
        } else if (diff > 0) {
            try {
                const intentRes = await fetch('/api/create-payment-intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        amount: diff,
                        propertyId: editingBooking.propertyId,
                        checkIn,
                        checkOut,
                        metadata: {
                            bookingId: editingBooking.id,
                            type: 'modification_charge'
                        }
                    })
                });

                if (!intentRes.ok) throw new Error("Failed to create modification payment intent");
                const { clientSecret } = await intentRes.json();
                
                setModificationPayment({
                    clientSecret,
                    amount: diff,
                    checkIn,
                    checkOut,
                    priceDetails,
                    selectedBedrooms,
                    rentalMode
                });
                return;
            } catch (e: any) {
                alert(`Error initializing additional payment: ${e.message}`);
                return;
            }
        }

        await finalizeBookingUpdate(checkIn, checkOut, newTotal, selectedBedrooms, rentalMode);
    };

    const finalizeBookingUpdate = async (checkIn: string, checkOut: string, newTotal: number, selectedBedrooms: any[], rentalMode: 'entire' | 'room') => {
        if (!editingBooking || !user) return;
        try {
            const cleanCheckIn = checkIn.split('T')[0];
            const cleanCheckOut = checkOut.split('T')[0];
            
            // 1. Cleanup old maintenance blackouts
            try {
                const oldRooms = editingBooking.selectedBedrooms || (editingBooking.selectedBedroom ? [editingBooking.selectedBedroom] : []);
                if (oldRooms.length > 0) {
                    for (const room of oldRooms) {
                        await deleteDoc(doc(db, 'blackout_dates', `maint-${editingBooking.id}-${room.roomNumber}`));
                    }
                } else {
                    await deleteDoc(doc(db, 'blackout_dates', `maint-${editingBooking.id}`));
                }
            } catch (err) {
                console.warn("Minor: Failed to cleanup old blackouts", err);
            }

            // 2. Update Booking
            await updateDoc(doc(db, 'bookings', editingBooking.id), {
                checkIn: cleanCheckIn,
                checkOut: cleanCheckOut,
                totalPrice: newTotal,
                selectedBedrooms: selectedBedrooms.length > 0 ? selectedBedrooms : null,
                selectedBedroom: null, // Wipe legacy field if exists
                updatedAt: serverTimestamp()
            });

            // 3. Create new maintenance blackouts
            try {
                const checkOutDate = new Date(cleanCheckOut + 'T12:00:00'); 
                const dayAfterDate = new Date(checkOutDate);
                dayAfterDate.setDate(dayAfterDate.getDate() + 1);
                const blackoutDateString = dayAfterDate.toISOString().split('T')[0];
                
                if (rentalMode === 'room' && selectedBedrooms.length > 0) {
                    for (const room of selectedBedrooms) {
                        await setDoc(doc(db, 'blackout_dates', `maint-${editingBooking.id}-${room.roomNumber}`), {
                            propertyId: editingBooking.propertyId,
                            date: blackoutDateString,
                            targetType: 'room',
                            roomNumber: room.roomNumber,
                            reason: `Maintenance/Cleaning for Booking ${editingBooking.bookingRef} (Room ${room.roomNumber})`,
                            createdAt: serverTimestamp()
                        });
                    }
                } else {
                    await setDoc(doc(db, 'blackout_dates', `maint-${editingBooking.id}`), {
                        propertyId: editingBooking.propertyId,
                        date: blackoutDateString,
                        targetType: 'property',
                        roomNumber: null,
                        reason: `Maintenance/Cleaning for Booking ${editingBooking.bookingRef}`,
                        createdAt: serverTimestamp()
                    });
                }
            } catch (blackoutErr) {
                console.warn("Failed to create maintenance blackout on edit", blackoutErr);
            }
            
            // 4. Notify Managers
            try {
                const managersSnap = await getDocs(query(collection(db, 'property_managers'), where('enabled', '==', true)));
                const managers = managersSnap.docs.map(d => d.data());
                
                const propSnap = await getDoc(doc(db, 'properties', editingBooking.propertyId));
                const isTestProperty = propSnap.exists() && propSnap.data().isTestProperty;

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
            
            setBookings(prev => prev.map(b => b.id === editingBooking.id ? { 
                ...b, 
                checkIn: cleanCheckIn, 
                checkOut: cleanCheckOut,
                totalPrice: newTotal,
                selectedBedrooms: selectedBedrooms.length > 0 ? selectedBedrooms : null
            } : b));
            
            alert("Booking successfully updated! Notifications have been sent.");
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
                            // Users can cancel/edit even if late just for a fee now, as long as it's confirmed and not yet checked out
                            const canCancel = booking.status === 'confirmed' && !booking.checkedOut;
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
                                                booking.checkedOut ? 'bg-indigo-600' :
                                                booking.status === 'confirmed' ? 'bg-emerald-500' :
                                                booking.status === 'cancelled' ? 'bg-rose-500' :
                                                'bg-amber-500'
                                            }`}>
                                            {booking.checkedOut ? 'Checked Out' : booking.status}
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
                                                    {booking.lateCheckoutFee ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-xs text-slate-400 line-through font-normal font-mono">Base: ${(booking.totalPrice / 100).toFixed(2)}</span>
                                                            <span className="text-xs text-rose-500 font-normal font-mono">+ Late: ${(booking.lateCheckoutFee / 100).toFixed(2)}</span>
                                                            <span className="text-xl font-extrabold text-slate-950 font-mono">Total: ${((booking.totalPrice + booking.lateCheckoutFee) / 100).toFixed(2)}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-2xl font-bold text-emerald-600">${(booking.totalPrice / 100).toFixed(2)}</div>
                                                    )}
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

                                        {booking.status !== 'cancelled' && !booking.checkedOut && (
                                            <div className="mb-6 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm italic">
                                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                    <AlertCircle size={12} className="text-indigo-500" /> Flexible Booking Policies
                                                </h4>
                                                <ul className="text-xs text-slate-500 space-y-1.5">
                                                    <li>• <strong>Edit Dates:</strong> Extend stays or reschedule. Price differences are settled instantly.</li>
                                                    <li>• <strong>Cancel: {freeCancelHoursBefore}h window.</strong> Free cancellation until {freeCancelHoursBefore} hours before arrival.</li>
                                                </ul>
                                            </div>
                                        )}

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
                                                        {booking.checkedOut ? (
                                                            <span className="font-mono text-xs font-bold text-slate-400 line-through tracking-wider">Deactivated (Checked Out)</span>
                                                        ) : (
                                                            <span className="font-mono text-xl font-bold text-indigo-700 tracking-widest">{booking.accessCode}</span>
                                                        )}
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

                                        {booking.checkedOut && (
                                            <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner text-slate-700 space-y-2">
                                                <h4 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                                    <AlertCircle size={12} className="text-indigo-500" /> Electronic Check-Out Summary
                                                </h4>
                                                <p className="text-xs">
                                                    Checked out successfully on <strong>{booking.checkedOutAt ? new Date(booking.checkedOutAt).toLocaleDateString() : 'N/A'}</strong> at <strong>{booking.checkedOutAt ? new Date(booking.checkedOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</strong>.
                                                </p>
                                                {booking.overdueHours ? (
                                                    <div className="text-xs bg-rose-50 text-rose-800 border border-rose-100 p-2 rounded-xl border-dashed">
                                                        ⚠️ Check-out was <strong>{booking.overdueHours} hour(s) late</strong> (past the 11:00 AM deadline). A late check-out fee of <strong>${((booking.lateCheckoutFee || 0) / 100).toFixed(2)}</strong> has been added to your bill.
                                                    </div>
                                                ) : (
                                                    <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-100 p-2 rounded-xl">
                                                        ✅ Checked out on time! Thank you for staying with us.
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

                                            {booking.status === 'confirmed' && !booking.checkedOut && (() => {
                                                 const dateParts = booking.checkIn.split('T')[0].split('-').map(Number);
                                                 const checkInTimeObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 16, 0, 0); // 4:00 PM
                                                 return new Date() >= checkInTimeObj;
                                             })() && (
                                                <button 
                                                    onClick={() => setCheckoutTargetBooking(booking)}
                                                    className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold py-3.5 px-4 rounded-xl transition-all flex justify-center items-center gap-2 border border-indigo-200 shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                                                >
                                                    🔔 Complete Electronic Check-out
                                                </button>
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
                                                    booking.checkedOut ? (
                                                        <div className="text-sm font-bold text-indigo-700 bg-indigo-50 px-4 py-3 rounded-xl border border-indigo-100 flex-1 text-center">
                                                            Checked Out Successfully
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm font-bold text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-100 flex-1 text-center">
                                                            Check-in complete or underway
                                                        </div>
                                                    )
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
                                editingBookingId={editingBooking.id}
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
                            onSuccess={() => finalizeBookingUpdate(
                                modificationPayment.checkIn, 
                                modificationPayment.checkOut, 
                                Math.round(modificationPayment.priceDetails.grandTotal * 100),
                                modificationPayment.selectedBedrooms,
                                modificationPayment.rentalMode
                            )}
                            onCancel={() => setModificationPayment(null)}
                        />
                    </Elements>
                </div>
            )}

            {checkoutTargetBooking && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl overflow-hidden w-full max-w-lg shadow-2xl border border-slate-100 animate-duration-150">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">Confirm Electronic Check-Out</h2>
                            <button 
                                onClick={() => setCheckoutTargetBooking(null)} 
                                className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 bg-slate-50 space-y-4">
                            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm text-slate-700">
                                <h3 className="font-bold text-slate-900 text-sm mb-2">{checkoutTargetBooking.propertyName}</h3>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Check Out Date</span>
                                        <span className="font-semibold text-slate-700">{checkoutTargetBooking.checkOut}</span>
                                    </div>
                                    <div>
                                        <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">Required Time</span>
                                        <span className="font-semibold text-indigo-600">By 11:00 AM</span>
                                    </div>
                                </div>
                            </div>

                            {(() => {
                                const checkoutDeadline = new Date(`${checkoutTargetBooking.checkOut}T11:00:00`);
                                const now = new Date();
                                const isLate = now > checkoutDeadline;
                                let overdueHours = 0;
                                let computedLateFee = 0;
                                if (isLate) {
                                  overdueHours = Math.ceil((now.getTime() - checkoutDeadline.getTime()) / (1000 * 60 * 60));
                                  const rate = (globalSettings?.lateCheckoutFeePercent !== undefined ? globalSettings.lateCheckoutFeePercent : 5) / 100;
                                  computedLateFee = Math.round(overdueHours * checkoutTargetBooking.totalPrice * rate);
                                }

                                return (
                                    <div className="space-y-4">
                                        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm text-xs">
                                            <span className="block text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">Your Check-Out Time</span>
                                            <span className="font-semibold text-slate-800 text-sm">{now.toLocaleDateString()} at {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>

                                        {isLate ? (
                                            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl space-y-2">
                                                <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
                                                    <AlertCircle size={16} /> 
                                                    Late Check-Out Detected
                                                </div>
                                                <p className="text-xs">
                                                    The check-out deadline was 11:00 AM on {checkoutTargetBooking.checkOut}. You are checking out <strong>{overdueHours} hour(s) late</strong>.
                                                </p>
                                                <p className="text-xs bg-rose-100 p-2 rounded-xl font-bold mt-1 text-rose-900 flex justify-between">
                                                    <span>Late Fee Accrued ({globalSettings?.lateCheckoutFeePercent || 5}% input rate/hr):</span>
                                                    <span>${(computedLateFee / 100).toFixed(2)}</span>
                                                </p>
                                                <p className="text-[10px] text-rose-600 italic">
                                                    Fee will be automatically calculated on the server and appended to your Final booking total.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl space-y-1">
                                                <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                                                    <CheckCircle size={16} className="text-emerald-500" /> 
                                                    On-Time Check-Out
                                                </div>
                                                <p className="text-xs">
                                                    You are checking out before the 11:00 AM deadline. No late checkout fee will be applied to your account.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            <p className="text-xs text-slate-500 text-center px-4 leading-relaxed">
                                Complete your electronic check-out now to release your digital room keys. Property managers will be alerted for cleaning and maintenance.
                            </p>
                        </div>
                        <div className="p-6 bg-white border-t border-slate-100 flex gap-4">
                            <button 
                                onClick={() => setCheckoutTargetBooking(null)}
                                className="flex-1 border-2 border-slate-200 text-slate-600 hover:bg-slate-50 py-3 rounded-xl font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => executeCheckout(checkoutTargetBooking.id)}
                                disabled={checkoutProcessing}
                                className="flex-1 bg-indigo-600 text-white hover:bg-indigo-500 py-3 rounded-xl font-bold transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-50"
                            >
                                {checkoutProcessing ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    "Confirm Check-out"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <LegalFooter />
        </div>
    );
};
