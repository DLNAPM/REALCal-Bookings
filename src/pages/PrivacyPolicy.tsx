import React from 'react';
import { Calendar as CalendarIcon, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const CONSENT_Doc_URL = "/consent_document.html";

export const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();
  const [fullOptInUrl, setFullOptInUrl] = React.useState('');

  React.useEffect(() => {
    try {
      // Create a clean URL for the legal consent document relative to the current origin
      const url = new URL('/consent_document.html', window.location.href).href;
      setFullOptInUrl(url);
    } catch (e) {
      // absolute fallback if URL constructor fails for any reason
      setFullOptInUrl(`${window.location.protocol}//${window.location.host}/consent_document.html`);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="py-6 px-6 max-w-7xl mx-auto w-full border-b border-slate-100 bg-white shadow-sm flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <CalendarIcon size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Privacy</span></h1>
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
              <Shield size={32} />
            </div>
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">Privacy Policy</h2>
            <p className="text-slate-500 font-medium">Last Updated: May 2, 2026</p>
          </header>

          <div className="space-y-10 prose prose-slate prose-indigo max-w-none">
            <section>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-black">1</span>
                Information We Collect
              </h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                We collect information you provide directly to us when you register, book a property, or communicate with us. This includes your name, email, phone number, and payment information.
              </p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-black">2</span>
                How We Use Information
              </h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                Your data is used specifically to manage your bookings, facilitate property access via smart locks, process payments through Stripe, and provide customer support.
              </p>
            </section>

            <section>
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-black">3</span>
                Security
              </h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                We implement robust security measures to protect your personal data. All payments are handled by Stripe, ensuring no raw credit card data is stored on our servers.
              </p>
            </section>

            <section className="p-8 bg-indigo-50 rounded-3xl border border-indigo-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm font-black">5</span>
                Consent to Communications
              </h3>
              <p className="text-slate-700 leading-relaxed font-bold mb-4 italic">
                By booking with REALCal, you explicitly consent to receiving transactional SMS and email notifications regarding your stay. We maintain a separate, secure Opt-in menu for managing these preferences.
              </p>
              <div className="flex flex-col md:flex-row gap-8 items-center bg-white p-6 rounded-2xl border border-indigo-200">
                {fullOptInUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-2 bg-white border border-slate-100 rounded-xl shadow-sm">
                      <QRCodeSVG value={fullOptInUrl} size={140} level="H" includeMargin={true} />
                    </div>
                    <p className="text-[9px] text-slate-400 font-mono truncate max-w-[150px]">{fullOptInUrl}</p>
                  </div>
                ) : (
                  <div className="w-[156px] h-[156px] bg-slate-50 animate-pulse rounded-2xl border border-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">Loading QR...</div>
                )}
                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Verification & Consent Required</h4>
                  <p className="text-sm text-slate-500 mb-4 italic leading-relaxed">
                    To satisfy vendor verification and ensure Yorkshire smart lock code delivery, please visit our <button onClick={() => navigate('/opt-in')} className="text-indigo-600 underline font-bold group hover:text-indigo-500 transition-colors">dedicated Opt-in menu <ChevronRight size={14} className="inline group-hover:translate-x-0.5 transition-transform" /></button> to manage your communication preferences.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a 
                      href={CONSENT_Doc_URL} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                      View Legal Consent Doc
                    </a>
                  </div>
                </div>
              </div>
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
        &copy; 2026 C.&.S.H. Group Properties &bull; Private & Secure
      </footer>
    </div>
  );
};
