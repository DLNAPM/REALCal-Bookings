import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Booking, Property } from '../types';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, XCircle, Home, MapPin } from 'lucide-react';
import { parseISO, differenceInHours } from 'date-fns';

export const MyBookings: React.FC = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [bookings, setBookings] = useState<(Booking & { propertyName?: string; propertyImage?: string })[]>([]);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        if (!user) {
            if (!loading) navigate('/');
            return;
        }

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

    const handleCancel = async (bookingId: string, checkInDate: string) => {
        // Enforce 48-hour cancellation policy
        const now = new Date();
        const checkIn = parseISO(checkInDate);
        const hoursUntilCheckIn = differenceInHours(checkIn, now);

        if (hoursUntilCheckIn < 48) {
            alert("Sorry, cancellations are only permitted at least 48 hours before check-in.");
            return;
        }

        if (window.confirm("Are you sure you want to cancel this booking?")) {
            try {
                await updateDoc(doc(db, 'bookings', bookingId), {
                    status: 'cancelled',
                    updatedAt: new Date() // Firestore automatically intercepts this or it's handled server side, let's use actual firestore timestamp
                });
                
                // Refresh list locally
                setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
                alert("Booking cancelled successfully.");
            } catch (err: any) {
                alert(`Failed to cancel: ${err.message}`);
            }
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
                            const hoursUntilCheckIn = differenceInHours(checkInDate, new Date());
                            const canCancel = hoursUntilCheckIn >= 48 && booking.status !== 'cancelled';

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
                                                        onClick={() => handleCancel(booking.id, booking.checkIn)}
                                                        className="flex-1 bg-white border-2 border-rose-100 text-rose-600 hover:bg-rose-50 hover:border-rose-200 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                                                    >
                                                        <XCircle size={18} /> Cancel Booking
                                                    </button>
                                                    <Link 
                                                        to={`/property/${booking.propertyId}`}
                                                        className="flex-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold py-3 rounded-xl transition-colors text-center"
                                                    >
                                                        Book Again
                                                    </Link>
                                                </>
                                            ) : booking.status !== 'cancelled' ? (
                                                <div className="text-sm font-bold text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-100 flex-1 text-center">
                                                    Past Cancellation Window (48h)
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
        </div>
    );
};
