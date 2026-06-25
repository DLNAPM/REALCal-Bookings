import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronDown, ChevronUp, Mail, Phone, MapPin, User, Clock, HelpCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { LegalFooter } from '../components/LegalFooter';

interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ: React.FC = () => {
  const navigate = useNavigate();
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'global_settings', 'settings'), (snap) => {
      if (snap.exists()) {
        setGlobalSettings(snap.data());
      }
    }, (error) => {
      console.error("Error loading global settings for FAQ:", error);
    });
    return unsub;
  }, []);

  // Leadership defaults
  const ceoName = globalSettings?.ceoName || "Cynthia S. H. Robinson";
  const ceoContact = globalSettings?.ceoContact || "cynthia@cshproperties.com";
  const ceoImage = globalSettings?.ceoImage || "";
  
  const pmName = globalSettings?.pmName || "Markus Vance";
  const pmContact = globalSettings?.pmContact || "markus@cshproperties.com";
  const pmImage = globalSettings?.pmImage || "";

  // Contact info defaults
  const contactEmail = globalSettings?.contactUsEmail || "support@cshproperties.com";
  const contactPhone = globalSettings?.contactUsPhone || "(800) 555-0199";
  const contactAddress = globalSettings?.contactUsAddress || "100 Starling Blvd, Suite 400, Atlanta, GA 30309";
  const contactText = globalSettings?.contactUsText || "Our friendly support team is available 24/7 to assist you with any booking or property inquiries.";

  // FAQ Questions in ALPHABETICAL ORDER
  const faqs: FAQItem[] = [
    {
      question: "Are your properties pet-friendly?",
      answer: "No, no pets of any kind are allowed (too include emotional support animals)."
    },
    {
      question: "Do guestrooms include mini-fridges or microwaves?",
      answer: "No, not at this time. However we have Refridgerator and Microwave for all guest to share in the Kitchen"
    },
    {
      question: "Do your Properties offer an airport shuttle?",
      answer: "No, airport shuttle is not provided to guests. Guests may use taxis or rideshre services for airport transfers."
    },
    {
      question: "Do your Properties provide free Wi-Fi?",
      answer: "Yes, Complimentary basic Wi-Fi is included in guestrooms, living and kitchen spaces of our Properties"
    },
    {
      question: "How do I change my reservation?",
      answer: "You can modify or cancel your booking directly by logging into your account and visiting the My Bookings page. Under each reservation, you will find options to edit dates or cancel. Please note that modifications or cancellations are subject to our cancellation rules and penalty thresholds based on the scheduled check-in date."
    },
    {
      question: "What are the check-in and check-out times at your Properties?",
      answer: "Standard check-in time begins at 4:00 PM on your check-in date, and check-out time is by 11:00 AM on your check-out date. These times ensure our cleaning staff has adequate time to prepare the property for the next guest."
    },
    {
      question: "What is the cancellation policy at The Starling Hotel?",
      answer: "At The Starling Hotel, cancellations can be made via the My Bookings section. Cancellations made outside of the late-cancellation window (typically 48 hours prior to check-in) are fully refundable. Late cancellations or same-day cancellations forfeit the cancellation option or are subject to fee penalties according to global policy settings."
    }
  ];

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header Sticky Bar */}
      <header className="py-6 px-6 max-w-7xl mx-auto w-full border-b border-slate-100 bg-white shadow-sm flex justify-between items-center sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-3 hover:opacity-85 transition-opacity">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <CalendarIcon size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">FAQ</span></h1>
        </Link>
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 font-bold transition-colors"
        >
          <ChevronLeft size={20} /> Back
        </button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-12 mb-20">
        <div className="bg-white rounded-[40px] shadow-xl shadow-indigo-100/50 border border-slate-100 p-8 md:p-16 space-y-16">
          
          {/* Section 1: Leadership Team */}
          <section className="space-y-8">
            <div className="text-center space-y-3">
              <span className="text-indigo-600 font-bold uppercase tracking-wider text-xs bg-indigo-50 px-3.5 py-1.5 rounded-full">Leadership</span>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Meet Our Team</h2>
              <p className="text-slate-500 max-w-xl mx-auto">Our dedicated executives ensure you enjoy a seamless, five-star hospitality experience at our premium properties.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* CEO Card */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-3xl border border-slate-100 bg-slate-50/50 hover:shadow-md transition-shadow">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-indigo-100 flex-shrink-0 flex items-center justify-center shadow-inner border border-slate-200">
                  {ceoImage ? (
                    <img src={ceoImage} alt={ceoName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-indigo-700">
                      <User size={32} />
                      <span className="text-xs font-bold mt-1">CEO</span>
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-left space-y-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Chief Executive Officer</p>
                    <h3 className="text-xl font-bold text-slate-900">{ceoName}</h3>
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-600 text-sm">
                    <Mail size={14} className="text-slate-400" />
                    <span className="font-medium break-all">{ceoContact}</span>
                  </div>
                </div>
              </div>

              {/* Property Manager Card */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-3xl border border-slate-100 bg-slate-50/50 hover:shadow-md transition-shadow">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-emerald-100 flex-shrink-0 flex items-center justify-center shadow-inner border border-slate-200">
                  {pmImage ? (
                    <img src={pmImage} alt={pmName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-emerald-700">
                      <User size={32} />
                      <span className="text-xs font-bold mt-1">Manager</span>
                    </div>
                  )}
                </div>
                <div className="text-center sm:text-left space-y-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Property Manager</p>
                    <h3 className="text-xl font-bold text-slate-900">{pmName}</h3>
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-600 text-sm">
                    <Mail size={14} className="text-slate-400" />
                    <span className="font-medium break-all">{pmContact}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: FAQ Accordion */}
          <section className="space-y-8 pt-6 border-t border-slate-100">
            <div className="text-center space-y-3">
              <span className="text-indigo-600 font-bold uppercase tracking-wider text-xs bg-indigo-50 px-3.5 py-1.5 rounded-full">Help & Support</span>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Frequently Asked Questions</h2>
              <p className="text-slate-500">Get quick answers to common questions about house rules, check-in, and cancellations.</p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, i) => {
                const isOpen = openIndex === i;
                return (
                  <div 
                    key={i} 
                    className={`border rounded-2xl transition-all duration-200 ${
                      isOpen 
                        ? 'border-indigo-100 bg-indigo-50/20 shadow-sm shadow-indigo-100/30' 
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <button
                      onClick={() => toggleFaq(i)}
                      className="w-full flex items-center justify-between text-left p-6 font-bold text-slate-800 hover:text-indigo-600 transition-colors focus:outline-none"
                    >
                      <span className="pr-4 leading-relaxed">{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp size={20} className="text-indigo-600 flex-shrink-0" />
                      ) : (
                        <ChevronDown size={20} className="text-slate-400 flex-shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-6 pt-1 text-slate-600 leading-relaxed border-t border-dashed border-slate-100 text-sm font-medium">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3: Contact Info Details */}
          <section className="space-y-8 pt-10 border-t border-slate-100">
            <div className="text-center space-y-3">
              <span className="text-indigo-600 font-bold uppercase tracking-wider text-xs bg-indigo-50 px-3.5 py-1.5 rounded-full">Contact Us</span>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Still Need Help?</h2>
              <p className="text-slate-500 max-w-lg mx-auto">{contactText}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Email */}
              <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Mail size={24} />
                </div>
                <h4 className="font-bold text-slate-900 mb-1">Email Support</h4>
                <p className="text-xs text-slate-500 mb-3">Direct message our staff</p>
                <a href={`mailto:${contactEmail}`} className="text-sm font-extrabold text-indigo-600 hover:text-indigo-800 break-all">{contactEmail}</a>
              </div>

              {/* Phone */}
              <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Phone size={24} />
                </div>
                <h4 className="font-bold text-slate-900 mb-1">Phone Helpline</h4>
                <p className="text-xs text-slate-500 mb-3">Call or Text (toll-free)</p>
                <a href={`tel:${contactPhone}`} className="text-sm font-extrabold text-indigo-600 hover:text-indigo-800">{contactPhone}</a>
              </div>

              {/* Address */}
              <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <MapPin size={24} />
                </div>
                <h4 className="font-bold text-slate-900 mb-1">Corporate HQ</h4>
                <p className="text-xs text-slate-500 mb-3">Office Location</p>
                <p className="text-sm font-medium text-slate-700 leading-snug">{contactAddress}</p>
              </div>
            </div>
          </section>

        </div>
      </main>

      <LegalFooter />
    </div>
  );
};
