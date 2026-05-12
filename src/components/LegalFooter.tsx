import React from 'react';
import { Link } from 'react-router-dom';

export const LegalFooter: React.FC = () => {
    return (
        <footer className="w-full max-w-7xl mx-auto px-6 py-12 border-t border-slate-100 text-center flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-bold tracking-widest uppercase text-slate-700">
                    A C.&.S.H. Group Properties A.I. APP
                </p>
                <p className="text-xs text-slate-400 font-medium">
                    Secure Property Management & Automated Bookings
                </p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mt-2">
                <Link to="/privacy" className="text-xs text-slate-500 hover:text-indigo-600 font-bold uppercase tracking-widest transition-colors">
                    Privacy Policy
                </Link>
                <Link to="/terms" className="text-xs text-slate-500 hover:text-indigo-600 font-bold uppercase tracking-widest transition-colors">
                    Terms of Service
                </Link>
                <Link to="/opt-in" className="text-xs text-slate-500 hover:text-indigo-600 font-bold uppercase tracking-widest transition-colors">
                    Opt-In & Consent
                </Link>
            </div>
            
            <p className="text-[10px] text-slate-400 font-medium mt-4">
                &copy; 2026 C.&.S.H. Group Properties &bull; All Rights Reserved
            </p>
        </footer>
    );
};
