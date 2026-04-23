import React from 'react';
import { useLocation, Link, Navigate } from 'react-router-dom';
import { CheckCircle, Key } from 'lucide-react';

export const Confirmation: React.FC = () => {
    const location = useLocation();
    const { bookingId, accessCode, notificationResults, bookingRef, selectedBedroom } = location.state || {};

    if (!bookingId) return <Navigate to="/" />;

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-900 overflow-y-auto">
            <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-200 text-center my-8">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                   <CheckCircle className="w-10 h-10 text-emerald-500" />
                </div>
                <h1 className="text-3xl font-bold mb-2 text-slate-800">Booking Confirmed!</h1>
                <p className="text-slate-500 mb-8">Your reservation has been successfully booked.</p>

                {selectedBedroom && (
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl mb-4 text-left">
                       <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Assigned Room</p>
                       <p className="font-bold text-slate-800">Room {selectedBedroom.roomNumber}</p>
                       <p className="text-sm text-slate-600">Lock: {selectedBedroom.roomLockNumber}</p>
                    </div>
                )}
                
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-4 text-xs font-mono text-slate-500 break-all select-all flex justify-between items-center px-6">
                   <span className="uppercase tracking-widest font-bold text-slate-400">Booking Ref:</span>
                   <span className="text-sm font-bold text-indigo-600">{bookingRef || bookingId}</span>
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

                <p className="text-sm text-slate-500 mb-6">We've sent a receipt and full instructions to your email.</p>

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
        </div>
    )
}
