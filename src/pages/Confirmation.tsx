import React from 'react';
import { useLocation, Link, Navigate } from 'react-router-dom';
import { CheckCircle, Key, Printer, Video } from 'lucide-react';
import { LegalFooter } from '../components/LegalFooter';

export const Confirmation: React.FC = () => {
    const location = useLocation();
    const { bookingId, accessCode, notificationResults, bookingRef, selectedBedroom, selectedBedrooms, checkIn, checkOut } = location.state || {};
    const rooms = selectedBedrooms || (selectedBedroom ? [selectedBedroom] : []);
    
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
            const date = new Date(year, month - 1, day);
            return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    };

    if (!bookingId) return <Navigate to="/" />;

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900 overflow-y-auto">
            <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-200 text-center my-8">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                   <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-slate-800">Booking Confirmed!</h1>
                {checkIn && checkOut && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-6 flex justify-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-tight">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400">Check-in</span>
                            <span className="text-slate-700">{formatDate(checkIn)}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400">Check-out</span>
                            <span className="text-slate-700">{formatDate(checkOut)}</span>
                        </div>
                    </div>
                )}
                <p className="text-slate-500 mb-8">Your reservation has been successfully booked.</p>

                {rooms.length > 0 && (
                    <div className="space-y-2 mb-4">
                        {rooms.map((room, idx) => (
                            <div key={idx} className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-left">
                               <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Assigned Room</p>
                               <p className="font-bold text-slate-800">Room {room.roomNumber}</p>
                               <p className="text-sm text-slate-600 font-medium">Room Lock: <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-100 ml-1">{room.roomLockNumber}</span></p>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-4 text-xs font-mono text-slate-500 break-all select-all flex justify-between items-center px-6">
                   <span className="uppercase tracking-widest font-bold text-slate-400">Booking Ref:</span>
                   <span className="text-sm font-bold text-indigo-600">{bookingRef || bookingId}</span>
                </div>

                <div className="text-left bg-indigo-50 border border-indigo-100 p-5 rounded-2xl mb-6">
                    <h3 className="text-sm font-bold text-indigo-800 mb-2 uppercase tracking-wide">Manage Your Stay</h3>
                    <p className="text-xs text-indigo-700 leading-relaxed mb-3">
                        Need to change your dates or cancel? You can manage your reservation directly through your **My Bookings** dashboard. 
                    </p>
                    <ul className="text-[10px] text-indigo-600 space-y-1 font-medium list-disc list-inside opacity-90 italic">
                        <li>Free cancellation up to 48 hours before check-in.</li>
                        <li>Easily add extra days to your stay.</li>
                        <li>Automatic refunds for shortened stays.</li>
                    </ul>
                </div>
                
                {accessCode && (
                  <div className="bg-indigo-600 text-white p-6 rounded-2xl mb-8 shadow-inner shadow-indigo-700 relative overflow-hidden">
                      <div className="flex justify-center mb-2">
                          <Key className="w-8 h-8 text-indigo-200" />
                      </div>
                      <p className="text-xs uppercase font-bold text-indigo-300 mb-1 tracking-widest">Digital Access Pin</p>
                      <p className="text-4xl font-mono tracking-[0.25em]">{accessCode}</p>
                      <p className="text-xs text-indigo-200 mt-4 opacity-80">Valid during your stay duration</p>
                  </div>
                )}

                <div className="bg-slate-900 text-white p-6 rounded-2xl mb-8 text-left relative overflow-hidden border border-slate-800 shadow-md">
                    <div className="absolute -top-3 -right-3 p-4 opacity-10">
                        <Video size={80} className="text-indigo-400" />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-450 animate-ping"></span>
                        <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">
                            YAMIRY Smart Lock Guide
                        </h3>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed mb-4">
                        Please watch the short animated video and instructions on how to enter the Property and/or Room via the YAMIRY Smart Lock.
                    </p>
                    <Link 
                        to="/my-bookings" 
                        className="inline-flex items-center justify-center w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition-all shadow-md shadow-indigo-600/30 text-center"
                    >
                        View Interactive Video Guide
                    </Link>
                </div>

                <p className="text-sm text-slate-500 mb-6">We've sent a receipt and full instructions to your email.</p>

                <Link 
                  to={`/itinerary/${bookingId}`}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-500 transition-colors shadow-sm mb-4"
                >
                    <Printer size={20} /> View / Print Itinerary
                </Link>

                {notificationResults && notificationResults.length > 0 && (
                    <div className="text-left bg-blue-50 border border-blue-100 p-4 rounded-2xl mb-8">
                        <p className="text-xs font-bold text-blue-800 mb-2 uppercase tracking-wide">Test Integration Logs</p>
                        <ul className="text-xs text-blue-700 space-y-1.5 list-disc list-inside">
                            {notificationResults.map((res: string, i: number) => (
                                <li key={i}>{res}</li>
                            ))}
                        </ul>
                    </div>
                )}

            <Link to="/" className="w-full block py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-colors shadow-sm">
                Return Home
            </Link>
        </div>
        <LegalFooter />
    </div>
    )
}
