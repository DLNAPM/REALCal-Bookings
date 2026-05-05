import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ShieldCheck, Mail, MessageSquare, AlertCircle, LogIn, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { signIn } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

export const OptIn: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [showSuccess, setShowSuccess] = React.useState(false);

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (e) {
      console.error(e);
    }
  };

  const handleConsent = async (accepted: boolean) => {
    if (!user || !db) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        tollFreeAccept: accepted
      });
      if (accepted) {
        setShowSuccess(true);
        // Automatically navigate after 3 seconds
        setTimeout(() => {
          navigate('/');
        }, 3500);
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error("Failed to update consent", err);
      alert("Error updating consent. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="py-6 px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <CalendarIcon size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Bookings</span></h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-[32px] shadow-xl shadow-indigo-100/50 border border-slate-100 overflow-hidden transform transition-all">
          <div className="p-8 md:p-12 text-center border-b border-slate-50">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-sm border border-indigo-100 ring-8 ring-indigo-50/50">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">Stay Connected</h2>
            <p className="text-lg text-slate-500 leading-relaxed">
              To provide you with the best experience, we need your consent to communicate important booking details and access codes.
            </p>
          </div>

          <div className="p-8 md:p-12 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 transition-all hover:border-indigo-200 hover:bg-indigo-50/30 group">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm text-indigo-600 group-hover:scale-110 transition-transform">
                  <MessageSquare size={24} />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">SMS Notifications</h3>
                <p className="text-sm text-slate-500 leading-relaxed italic">
                  Receive your York smart lock guest codes, check-in instructions, and urgent property updates via text messaging (SMS).
                </p>
              </div>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 transition-all hover:border-indigo-200 hover:bg-indigo-50/30 group">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm text-blue-600 group-hover:scale-110 transition-transform">
                  <Mail size={24} />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">Email Updates</h3>
                <p className="text-sm text-slate-500 leading-relaxed italic">
                  Get your booking confirmations, digital receipts, and property guides sent directly to your inbox.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4 items-start">
              <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-amber-800 leading-relaxed italic">
                <p className="font-bold mb-1">Opt-In Consent</p>
                By clicking &quot;Accept and Continue&quot;, you expressly consent to receive automated messaging (SMS or text messaging) from REALCal Bookings at the phone number associated with your account. Messaging frequency varies. Message and data rates may apply. Reply STOP to opt-out at any time.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              {loading ? (
                <div className="flex-1 bg-slate-100 animate-pulse h-14 rounded-2xl"></div>
              ) : user ? (
                <>
                  <button 
                    onClick={() => handleConsent(true)}
                    className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-all transform hover:-translate-y-0.5"
                  >
                    Accept and Continue
                  </button>
                  <button 
                    onClick={() => handleConsent(false)}
                    className="px-8 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                  >
                    Decline
                  </button>
                </>
              ) : (
                <div className="flex-1 space-y-4">
                  <button 
                    onClick={handleSignIn}
                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all transform hover:-translate-y-0.5"
                  >
                    <LogIn size={20} />
                    Login with Booking Email to Consent
                  </button>
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-[11px] font-bold leading-relaxed text-center italic">
                    VENDORS: This page serves as our official verification portal for communication consent. Users must log in with their registered booking email to confirm preferences.
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Secure Opt-In Verification &bull; REALCal 2026
            </p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-slate-400 text-sm">
        &copy; 2026 C.&.S.H. Group Properties &bull; Trusted Automation
      </footer>

      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[32px] p-8 md:p-12 max-w-lg w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
              
              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-sm border border-green-100 ring-8 ring-green-50/50">
                <CheckCircle2 size={40} />
              </div>
              
              <h2 className="text-3xl font-bold text-slate-900 mb-4 tracking-tight">Thank You!</h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Thank you for your consent to receive <span className="font-bold text-indigo-600 italic">SMS and Email Updates</span>. You can now access all property information and guest services.
              </p>
              
              <button 
                onClick={() => navigate('/')}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
              >
                Browse Properties
              </button>
              
              <p className="mt-6 text-sm text-slate-400 italic">Redirecting you shortly...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
