import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Booking, Property } from '../types';
import { 
  Printer, 
  MapPin, 
  Calendar, 
  Clock, 
  Hash, 
  Key, 
  ChevronLeft, 
  AlertCircle,
  Home,
  User,
  Phone,
  CreditCard
} from 'lucide-react';
import { LegalFooter } from '../components/LegalFooter';

export const Itinerary: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const bookingSnap = await getDoc(doc(db, 'bookings', id));
        if (bookingSnap.exists()) {
          const bookingData = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
          setBooking(bookingData);

          const propertySnap = await getDoc(doc(db, 'properties', bookingData.propertyId));
          if (propertySnap.exists()) {
            setProperty({ id: propertySnap.id, ...propertySnap.data() } as Property);
          }
        } else {
          setError('Booking not found.');
        }
      } catch (err: any) {
        console.error('Error fetching itinerary:', err);
        setError('Failed to load itinerary details.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Generating your itinerary...</p>
        </div>
      </div>
    );
  }

  if (error || !booking || !property) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h2>
          <p className="text-slate-500 mb-6">{error || 'Booking info missing.'}</p>
          <Link to="/" className="inline-block bg-indigo-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-indigo-500 transition-colors">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const checkInDate = new Date(booking.checkIn);
  const checkOutDate = new Date(booking.checkOut);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-20 print:bg-white print:pb-0">
      {/* Header - Hidden on Print */}
      <header className="pt-6 px-6 max-w-4xl mx-auto w-full mb-8 print:hidden">
        <div className="flex justify-between items-center bg-white rounded-2xl shadow-sm border border-slate-200 py-3 px-4">
          <Link to="/my-bookings" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-colors">
            <div className="bg-slate-100 p-1.5 rounded-lg"><ChevronLeft size={18} /></div> My Bookings
          </Link>
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-indigo-500 transition-colors shadow-sm"
          >
            <Printer size={18} /> Print Itinerary
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 print:px-0">
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden print:shadow-none print:border-none">
          {/* Hero Banner / Receipt Header */}
          <div className="bg-slate-900 text-white p-10 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-100 print:p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <p className="text-indigo-400 font-bold uppercase tracking-widest text-sm mb-2 print:text-indigo-600">Travel Itinerary</p>
                <h1 className="text-4xl font-bold tracking-tight mb-1">{property.name}</h1>
                <p className="text-slate-400 text-lg flex items-center gap-2 print:text-slate-500">
                  <MapPin size={18} /> {property.location || 'Vacation Rental'}
                </p>
              </div>
              <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/10 text-right print:bg-slate-50 print:border-slate-200 print:text-left md:print:text-right">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 print:text-slate-500">Booking Reference</p>
                <p className="text-2xl font-mono font-bold text-indigo-300 print:text-indigo-600">#{booking.bookingRef || booking.id.substring(0, 8).toUpperCase()}</p>
              </div>
            </div>
          </div>

          <div className="p-10 space-y-12 print:p-6">
            {/* Stay Dates */}
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                <Calendar className="text-indigo-600" /> Stay Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 print:border-slate-200">
                  <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-xs mb-3">
                    <Clock size={14} /> Check-In
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{checkInDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p className="text-slate-500 mt-1">4:00 PM onwards</p>
                </div>
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 print:border-slate-200">
                  <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-xs mb-3">
                    <Clock size={14} /> Check-Out
                  </div>
                  <p className="text-2xl font-bold text-slate-800">{checkOutDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p className="text-slate-500 mt-1">By 11:00 AM</p>
                </div>
              </div>
            </section>

            {/* Access Info */}
            <section>
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                   <Key className="text-indigo-600" /> Arrival & Access
                </h2>
                <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-lg print:bg-white print:text-slate-900 print:border-2 print:border-indigo-600 print:shadow-none">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                         <div className="flex-1 text-center md:text-left">
                            <h3 className="text-2xl font-bold mb-2">Welcome Home</h3>
                            <p className="text-indigo-100 print:text-slate-600">Use the following digital access code for the property main entry.</p>
                         </div>
                         <div className="bg-white/20 px-8 py-6 rounded-2xl border border-white/20 text-center min-w-[200px] print:bg-indigo-50 print:border-indigo-100">
                            <p className="text-indigo-200 text-xs font-bold uppercase tracking-[0.2em] mb-2 print:text-indigo-400">Main Entry Code</p>
                            <p className="text-5xl font-mono font-bold tracking-[0.2em]">{booking.accessCode || '----'}</p>
                         </div>
                    </div>
                </div>
                
                {booking.selectedBedroom && (
                  <div className="mt-6 bg-slate-50 rounded-3xl p-8 border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 print:border-slate-200">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm text-indigo-600">
                         <Home size={28} />
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-0.5">Assigned Private Room</p>
                        <p className="text-xl font-bold text-slate-800">Room {booking.selectedBedroom.roomNumber}</p>
                        <p className="text-slate-500 text-sm">{booking.selectedBedroom.type}</p>
                      </div>
                    </div>
                    
                    <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 text-center md:text-right min-w-[150px]">
                       <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Room Lock Code</p>
                       <p className="text-2xl font-mono font-bold text-indigo-600">{booking.selectedBedroom.roomLockNumber || 'N/A'}</p>
                    </div>
                  </div>
                )}
            </section>

            {/* Billing Summary */}
            <section>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
                <CreditCard className="text-indigo-600" /> Payment Summary
              </h2>
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 print:border-none print:p-0">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Total Amount Paid</span>
                    <span className="text-2xl font-bold text-slate-900">${(booking.totalPrice / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Payment Status</span>
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold uppercase tracking-wider text-[10px]">Paid & Confirmed</span>
                  </div>
                </div>
                <div className="mt-8 pt-8 border-t border-slate-200">
                   <p className="text-xs text-slate-400 leading-relaxed">
                     A digital receipt has been sent to your registered email. This itinerary serves as your check-in document. Please have your digital access code ready upon arrival at the property. For any questions, please contact management through the dashboard.
                   </p>
                </div>
              </div>
            </section>
          </div>

          {/* Footer - Only visible on print */}
          <div className="hidden print:block p-6 mt-12 border-t border-slate-100 text-center text-slate-400 text-xs">
            <p className="mb-1">Thank you for booking with REALCal Bookings.</p>
            <p>© {new Date().getFullYear()} REALCal Bookings. All rights reserved.</p>
          </div>
        </div>

        {/* Action Buttons - Hidden on Print */}
        <div className="mt-12 flex flex-col md:flex-row gap-4 print:hidden">
            <Link to="/" className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold py-4 rounded-2xl hover:bg-slate-50 transition-colors text-center shadow-sm">
                Explore More Properties
            </Link>
            <Link to="/my-bookings" className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-500 transition-colors text-center shadow-sm shadow-indigo-200">
                Manage All Bookings
            </Link>
        </div>
      </main>
      
      <div className="print:hidden">
        <LegalFooter />
      </div>
      
      <style>{`
        @media print {
          body {
            background-color: white !important;
          }
          @page {
            margin: 20mm;
          }
          header, footer, nav, .print-hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
