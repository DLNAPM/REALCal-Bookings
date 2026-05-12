import React from 'react';
import { Calendar as CalendarIcon, FileText, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TermsOfService: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="py-6 px-6 max-w-7xl mx-auto w-full border-b border-slate-100 bg-white shadow-sm flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <CalendarIcon size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Terms</span></h1>
        </div>
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 font-bold transition-colors"
        >
          <ChevronLeft size={20} /> Back
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-12 mb-20">
        <div className="bg-white rounded-[40px] shadow-xl shadow-indigo-100/50 border border-slate-100 p-8 md:p-16 space-y-12">
          <header className="text-center space-y-4">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FileText size={32} />
            </div>
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Terms of Service</h2>
            <p className="text-slate-500 font-medium">Last Updated: May 11, 2026</p>
          </header>

          <div className="space-y-10 prose prose-slate prose-indigo max-w-none">
            <section>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-black">1</span>
                SMS Terms & Conditions
              </h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                By providing your phone number and completing your profile, you expressly consent to receive automated messaging (SMS or text messaging) from REALCal Bookings.
              </p>
              <ul className="list-disc pl-5 mt-4 text-slate-600 space-y-2">
                <li><strong>Frequency:</strong> Message frequency is limited to one per property booked transaction (confirmation, check-in, check-out).</li>
                <li><strong>Fees:</strong> Standard message and data rates may apply depending on your mobile carrier plan.</li>
                <li><strong>Opt-Out:</strong> Reply STOP to any message to opt-out at any time.</li>
                <li><strong>Support:</strong> Reply HELP for assistance.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-black">2</span>
                Booking Policies
              </h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                All bookings are subject to availability and payment confirmation. Users must provide valid identification and contact information to receive property access codes.
              </p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-black">3</span>
                Liability
              </h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                REALCal Bookings is not liable for data delivery failures or interruptions caused by mobile carrier networks. Property access is contingent upon successful identity verification and payment.
              </p>
            </section>

            <section className="pt-8 border-t border-slate-100">
               <button 
                 onClick={() => navigate('/privacy')}
                 className="text-indigo-600 font-bold underline hover:text-indigo-800 transition-colors"
               >
                 Privacy Policy
               </button>
            </section>
          </div>

          <footer className="pt-12 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-400 font-bold uppercase tracking-widest italic">
              REALCal 2026 &bull; Secure Property Management
            </p>
          </footer>
        </div>
      </main>

      <footer className="py-8 text-center text-slate-400 text-sm">
        &copy; 2026 C.&.S.H. Group Properties &bull; Terms of Service
      </footer>
    </div>
  );
};
