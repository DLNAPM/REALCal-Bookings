import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Booking, Property } from '../types';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, XCircle, Home, MapPin, Edit3, X } from 'lucide-react';
import { parseISO, differenceInHours } from 'date-fns';
import { Calendar } from '../components/Calendar';

export const MyBookings: React.FC = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [bookings, setBookings] = useState<(Booking & { propertyName?: string; propertyImage?: string })[]>([]);
    const [fetching, setFetching] = useState(true);
    const [editingBooking, setEditingBooking] = useState<(Booking & { propertyName?: string; propertyImage?: string }) | null>(null);

    const [globalSettings, setGlobalSettings] = useState<any>(null);

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
                const fetchedBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
                
                // Enhance with property details
                const enhanced = await Promise.all(fetchedBookings.map(async (b) => {
                    let propertyName = "Unknown Property";
                    let propertyImage = "";
                    try {
                       const pSnap = await getDoc(doc(db, 'properties', b.propertyId));
                       if (pSnap.exists()) {
                           const pData = pSnap.data() as Property;
                           propertyName = pData.name;
                           if (pData.images && pData.images.length > 0) {
                               propertyImage = pData.images[0];
                           }
                       }
                    } catch (e) {}
                    return { ...b, propertyName, propertyImage };
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
            
            // Refresh list locally
            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled', cancellationFee } : b));
            alert("Booking cancelled successfully.");
        } catch (err: any) {
            alert(`Failed to cancel: ${err.message}`);
        }
    };

    const handleSaveEdit = async (checkIn: string, checkOut: string, priceDetails: any) => {
        if (!editingBooking) return;
        try {
            const newTotal = Math.round(priceDetails.grandTotal * 100);
            await updateDoc(doc(db, 'bookings', editingBooking.id), {
                checkIn: checkIn,
                checkOut: checkOut,
                totalPrice: newTotal,
                updatedAt: serverTimestamp()
            });
            
            // Refresh list locally
            setBookings(prev => prev.map(b => b.id === editingBooking.id ? { 
                ...b, 
                checkIn, 
                checkOut,
                totalPrice: newTotal 
            } : b));
            
            alert("Booking dates successfully updated!");
            setEditingBooking(null);
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

                {bookings.length === 0 ? (
                    <div className="text-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
                        <CalendarIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-700 mb-2">No bookings yet</h3>
                        <p className="text-slate-500 mb-6">You haven't booked any properties yet.</p>
                        <Link to="/" className="inline-block bg-indigo-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-indigo-500 transition-colors">Explore Properties</Link>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {bookings.map(booking => {
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
                                        {booking.propertyImage ? (
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
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-emerald-600">${(booking.totalPrice / 100).toFixed(2)}</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <span className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Check In</span>
                                                <span className="font-medium text-slate-800">{booking.checkIn}</span>
                                            </div>
                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <span className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1">Check Out</span>
                                                <span className="font-medium text-slate-800">{booking.checkOut}</span>
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
                                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 flex items-center gap-4">
                                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                                    <MapPin size={20} />
                                                </div>
                                                <div>
                                                    <span className="block text-xs font-bold uppercase text-indigo-400 tracking-wider mb-0.5">Yale Access PIN</span>
                                                    <span className="font-mono text-xl font-bold text-indigo-700 tracking-widest">{booking.accessCode}</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-auto flex gap-3 pt-6 border-t border-slate-100">
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
                            );
                        })}
                    </div>
                )}
            </main>

            {editingBooking && (
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
                                propertyId={editingBooking.propertyId} 
                                isEditMode={true}
                                initialCheckIn={editingBooking.checkIn}
                                initialCheckOut={editingBooking.checkOut}
                                onSaveEdit={handleSaveEdit}
                                onCancelEdit={() => setEditingBooking(null)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
