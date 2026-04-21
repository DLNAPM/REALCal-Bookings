import React from 'react';
import { useLocation, Link, Navigate } from 'react-router-dom';
import { CheckCircle, Key } from 'lucide-react';

export const Confirmation: React.FC = () => {
    const location = useLocation();
    const { bookingId, accessCode } = location.state || {};

    if (!bookingId) return <Navigate to="/" />;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h1 className="text-3xl font-bold mb-2">Booking Confirmed!</h1>
                <p className="text-gray-600 mb-6">Your reservation has been successfully booked.</p>
                <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm font-mono text-gray-500 break-all">
                   Booking Ref: {bookingId}
                </div>
                
                {accessCode && (
                  <div className="bg-black text-white p-6 rounded-lg mb-8 shadow-inner relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-700 to-gray-500 border-b border-gray-800"></div>
                      <div className="flex justify-center mb-2">
                          <Key className="w-8 h-8 text-yellow-400 opacity-90" />
                      </div>
                      <p className="text-xs uppercase font-bold text-gray-400 mb-1 tracking-widest">Yale Smart Lock Pin</p>
                      <p className="text-4xl font-mono tracking-[0.25em]">{accessCode}</p>
                      <p className="text-xs text-gray-400 mt-3">Valid during your stay duration</p>
                  </div>
                )}

                <p className="text-sm text-gray-500 mb-6">We've sent a receipt and full instructions to your email.</p>
                <Link to="/" className="w-full block py-3 bg-black text-white font-bold rounded-lg hover:bg-gray-800">
                    Return to Home
                </Link>
            </div>
        </div>
    )
}
