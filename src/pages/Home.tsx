import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signIn, signOut, db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Calendar as CalendarIcon, Key, LogOut, ChevronRight, Lock, BellRing, 
  ShieldCheck, MessageSquare, HelpCircle, MapPin, Ticket, Sparkles, 
  Music, Trophy, Compass, Smile 
} from 'lucide-react';
import { Property } from '../types';
import { PrivacyPolicyModal } from '../components/PrivacyPolicyModal';

import { LegalFooter } from '../components/LegalFooter';
import { getEventsForCurrentMonth, EventItem } from '../data/events';

export const Home: React.FC = () => {
    const { user, loading } = useAuth();
    const [properties, setProperties] = useState<Property[]>([]);
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'properties' | 'events'>('properties');
    const navigate = useNavigate();

    const checkOptInAndNavigate = (path: string) => {
        if (loading) return;
        if (!user) {
            handleSignIn();
            return;
        }
        if (path.startsWith('#')) {
            const el = document.querySelector(path);
            el?.scrollIntoView({ behavior: 'smooth' });
        } else {
            navigate(path);
        }
    };

    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(query(collection(db, 'properties')), (snap) => {
            const allProperties = snap.docs.map(d => ({id: d.id, ...d.data() } as Property));
            const allowedTestEmails = ['reach_dlaniger@hotmail.com', 'dlaniger.napm.consulting@gmail.com', 'monnib30228@gmail.com'];
            const canViewTestProps = user && user.email && allowedTestEmails.includes(user.email);
            
            setProperties(allProperties.filter(p => !p.isTestProperty || canViewTestProps));
        }, (error) => {
            console.error("Home properties snapshot error:", error);
        });
        return unsub;
    }, [user]);
    
    const handleSignIn = async () => {
        try {
            await signIn();
        } catch (error: any) {
            console.error("Sign in error:", error);
            if (error.code === 'auth/unauthorized-domain') {
                const domain = window.location.hostname;
                alert(`Authentication Error: Firebase does not trust this domain (${domain}).\n\nPlease go to Firebase Console -> Authentication -> Settings -> Authorized Domains and add:\n\n${domain}`);
            } else {
                alert(`Sign in failed: ${error.message}`);
            }
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            // Force a reload to clear any internal state and ensure a clean slate
            window.location.href = '/';
        } catch (error) {
            console.error("Sign out error:", error);
            window.location.reload();
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col font-sans text-slate-900 pb-12 overflow-x-hidden">
            <header className="pt-6 px-6 max-w-7xl mx-auto w-full z-10 relative">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                    <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-85 transition-opacity flex-shrink-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <CalendarIcon size={18} />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Bookings</span></h1>
                    </Link>
                    <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
                        {loading ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 rounded-xl">
                                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Verifying...</span>
                            </div>
                        ) : user ? (
                            <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-center sm:justify-end">
                                {(user.role === 'admin' || user.email === 'dlaniger.napm.consulting@gmail.com') && (
                                   <Link 
                                     to="/admin" 
                                     className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-slate-50"
                                     title="Admin Dashboard"
                                   >
                                       <Key size={15}/>
                                       <span className="hidden md:inline">Admin</span>
                                   </Link>
                                )}
                                <Link 
                                  to="/my-bookings" 
                                  className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-slate-50"
                                  title="My Bookings"
                                >
                                    <CalendarIcon size={15}/>
                                    <span className="hidden md:inline">My Bookings</span>
                                </Link>
                                <button 
                                  onClick={() => {
                                      setActiveTab('events');
                                      setTimeout(() => {
                                          const el = document.getElementById('main-content-tabs');
                                          el?.scrollIntoView({ behavior: 'smooth' });
                                      }, 100);
                                  }}
                                  className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-slate-50 cursor-pointer"
                                  title="Upcoming Local Events"
                                >
                                    <Compass size={15}/>
                                    <span>Events</span>
                                </button>
                                <Link 
                                  to="/faq" 
                                  className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-slate-50"
                                  title="Frequently Asked Questions"
                                >
                                    <HelpCircle size={15}/>
                                    <span className="hidden md:inline">FAQ</span>
                                </Link>
                                <Link 
                                  to="/opt-in" 
                                  className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 text-xs sm:text-sm transition-colors rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-slate-50"
                                  title="Opt-in Preferences"
                                >
                                    <MessageSquare size={15}/>
                                    <span className="hidden md:inline">Opt-in</span>
                                </Link>
                                <div className="flex items-center gap-2 bg-white py-1 pl-1 pr-2 sm:pr-4 rounded-full border border-slate-200 shadow-sm">
                                  {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-6 h-6 sm:w-8 sm:h-8 rounded-full" referrerPolicy="no-referrer" />}
                                  <div className="text-left hidden sm:block">
                                    <p className="font-semibold text-xs leading-none text-slate-800 truncate max-w-[80px]">{user.displayName ? user.displayName.split(' ')[0] : 'Guest'}</p>
                                    <p className="text-[9px] text-indigo-600 font-medium leading-none mt-0.5">Welcome</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={handleSignOut} 
                                  className="text-slate-400 hover:text-red-500 transition-colors p-1.5 sm:p-2 bg-white rounded-full border border-slate-200 shadow-sm cursor-pointer"
                                  title="Logout"
                                >
                                   <LogOut size={15} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 sm:gap-4">
                                <button 
                                  onClick={() => {
                                      setActiveTab('events');
                                      setTimeout(() => {
                                          const el = document.getElementById('main-content-tabs');
                                          el?.scrollIntoView({ behavior: 'smooth' });
                                      }, 100);
                                  }}
                                  className="text-slate-500 hover:text-indigo-600 font-bold text-[10px] sm:text-xs uppercase tracking-widest transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                    <Compass size={14}/> Events
                                </button>
                                <Link to="/faq" className="text-slate-500 hover:text-indigo-600 font-bold text-[10px] sm:text-xs uppercase tracking-widest transition-colors flex items-center gap-1">
                                    <HelpCircle size={14}/> FAQ
                                </Link>
                                <Link to="/opt-in" className="text-slate-500 hover:text-indigo-600 font-bold text-[10px] sm:text-xs uppercase tracking-widest transition-colors">
                                    Opt-In Preview
                                </Link>
                                <button onClick={handleSignIn} className="px-4 py-2 sm:px-6 sm:py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors text-xs sm:text-sm shadow-md">
                                    Login to Book
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-20 pb-28 px-6 lg:pt-32 lg:pb-40 border-b border-slate-100">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50/50 via-white to-white -z-10 tracking-tight"></div>
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 leading-tight">
                        Seamless bookings.<br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">
                            Automated access.
                        </span>
                    </h1>
                    <p className="text-xl text-slate-500 mb-10 max-w-2xl mx-auto leading-relaxed">
                        Experience the ultimate property rental workflow. Select your dates, process payments securely, and receive smart lock access codes instantly out of the box.
                    </p>
                    <div className="flex justify-center gap-4">
                        {loading ? (
                            <div className="px-8 py-4 bg-slate-100 text-slate-400 font-bold rounded-xl flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                                Updating Session...
                            </div>
                        ) : (
                            <>
                                <button 
                                    onClick={() => {
                                        setActiveTab('properties');
                                        setTimeout(() => {
                                            const el = document.getElementById('main-content-tabs');
                                            el?.scrollIntoView({ behavior: 'smooth' });
                                        }, 100);
                                    }} 
                                    className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-colors transform hover:-translate-y-0.5 cursor-pointer"
                                >
                                    Browse Properties
                                </button>
                                <button 
                                    onClick={() => {
                                        setActiveTab('events');
                                        setTimeout(() => {
                                            const el = document.getElementById('main-content-tabs');
                                            el?.scrollIntoView({ behavior: 'smooth' });
                                        }, 100);
                                    }} 
                                    className="px-8 py-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-colors transform hover:-translate-y-0.5 cursor-pointer"
                                >
                                    📅 Explore Local Events
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-24 px-6 bg-white border-b border-slate-100">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">Why Book With Us</h2>
                        <p className="text-lg text-slate-500 mt-4">Everything you need for a perfect stay, entirely automated.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        {/* Feature 1 */}
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-indigo-100">
                                <CalendarIcon size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Live Availability</h3>
                            <p className="text-slate-500 flex-1 leading-relaxed">
                                Our dynamic calendar ensures you only see valid dates. Holiday pricing and weekend rates apply automatically, eliminating back-and-forth negotiations.
                            </p>
                        </div>
                        
                        {/* Feature 2 */}
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-blue-100">
                                <Lock size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Smart Lock Access</h3>
                            <p className="text-slate-500 flex-1 leading-relaxed">
                                Upon confirmed payment, your personal access code is physically provisioned to the property's York smart locks, valid exactly for the duration of your stay.
                            </p>
                        </div>
                      
                        {/* Feature 3 */}
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
                                <ShieldCheck size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Instant Confirmation</h3>
                            <p className="text-slate-500 flex-1 leading-relaxed">
                                Never wait for host approval. Our Stripe integration secures your dates instantly, delivering receipts and itineraries directly to your email in seconds.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
            
            {/* Main Tabs Container */}
            <main id="main-content-tabs" className="flex-1 w-full max-w-7xl mx-auto px-6 pt-24 pb-12">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-12 border-b border-slate-100 pb-8">
                    <div>
                        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
                            {activeTab === 'properties' ? 'Featured Properties' : 'Upcoming Atlanta Events'}
                        </h2>
                        <p className="text-base text-slate-500 mt-2">
                            {activeTab === 'properties' 
                                ? 'Find your next perfect getaway with seamless, fully-automated access.' 
                                : `Top 20 curated events for ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()} within 30 miles of Zip Code 30331.`
                            }
                        </p>
                    </div>

                    {/* Tab Selector */}
                    <div className="inline-flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner flex-shrink-0">
                        <button
                            onClick={() => setActiveTab('properties')}
                            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                                activeTab === 'properties' 
                                    ? 'bg-white text-indigo-600 shadow-md' 
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            🏡 Properties
                        </button>
                        <button
                            onClick={() => setActiveTab('events')}
                            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                                activeTab === 'events' 
                                    ? 'bg-white text-indigo-600 shadow-md' 
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            📅 Events Tab
                        </button>
                    </div>
                </div>

                {activeTab === 'properties' ? (
                    properties.length === 0 ? (
                        <div className="text-center p-12 bg-slate-50 rounded-3xl border border-slate-200 border-dashed text-slate-500">
                            No properties available yet. Check back soon.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
                            {properties.map(p => (
                                <div key={p.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm group cursor-pointer hover:shadow-xl hover:border-indigo-200 transition-all hover:-translate-y-1 block" onClick={() => checkOptInAndNavigate(`/property/${p.id}`)}>
                                    <div className="h-64 relative overflow-hidden bg-slate-100 flex items-center justify-center">
                                        {p.images && p.images.length > 0 ? (
                                           <img src={p.images[0]} className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out" />
                                        ) : (
                                           <div className="w-full h-full flex items-center justify-center text-slate-400">No images</div>
                                        )}
                                        {p.isTestProperty && (
                                            <div className="absolute top-4 right-4 bg-amber-500 text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full shadow-md z-10">
                                                Test Property
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    </div>
                                    <div className="p-6">
                                       <h3 className="text-2xl font-bold mb-2 text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight">{p.name}</h3>
                                       <p className="text-slate-500 line-clamp-2 text-base leading-relaxed mb-6">{p.description}</p>
                                       <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                           <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{p.images?.length || 0} Photos</span>
                                           <span className="text-sm font-bold text-indigo-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                               Check Rates <ChevronRight size={16}/>
                                           </span>
                                       </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="space-y-16 animate-in fade-in duration-300">
                        {/* Summary Block */}
                        <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-3xl p-6 sm:p-8 border border-indigo-100/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                                    <Sparkles size={18} className="text-indigo-500" /> Curated Hotspots Nearby
                                </h3>
                                <p className="text-slate-600 text-sm mt-1 max-w-2xl leading-relaxed">
                                    Make the most of your stay! All highlighted venues are chosen specifically for their stellar local ratings, proximity to your rental (under 30 miles), and seasonal relevance.
                                </p>
                            </div>
                            <div className="bg-white/80 backdrop-blur px-5 py-3 rounded-2xl border border-indigo-100 text-center flex-shrink-0">
                                <span className="block text-2xl font-extrabold text-indigo-600">20</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Highlights</span>
                            </div>
                        </div>

                        {/* 1. SPORTING EVENTS */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-3">
                                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100/55">
                                    <Trophy size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Sporting Events</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Top-tier athletic events, championships, and matchups</p>
                                </div>
                                <span className="ml-auto text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-bold">
                                    {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Sporting Events').length} Matches
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Sporting Events').map(event => (
                                    <div key={event.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-150 flex flex-col justify-between h-full">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                                    📍 {event.venue}
                                                </span>
                                                <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                    <MapPin size={12} /> {event.distance}
                                                </span>
                                            </div>
                                            <h4 className="text-base sm:text-lg font-bold text-slate-850 tracking-tight mb-2">
                                                {event.title}
                                            </h4>
                                            <p className="text-xs sm:text-sm text-indigo-600 font-semibold flex items-center gap-1.5 mb-3">
                                                <CalendarIcon size={14} /> {event.date}
                                            </p>
                                            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-5">
                                                {event.description}
                                            </p>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100 mt-auto">
                                            <a 
                                                href={event.ticketUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors group shadow-sm"
                                            >
                                                <Ticket size={14} className="group-hover:rotate-12 transition-transform" />
                                                <span>Get Tickets on Ticketmaster</span>
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. NIGHT LIFE ENTERTAINMENTS */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-3">
                                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100/55">
                                    <Music size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Night Life Entertainments</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Live music concerts, lounge sessions, and theater productions</p>
                                </div>
                                <span className="ml-auto text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold">
                                    {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Night Life Entertainments').length} Shows
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Night Life Entertainments').map(event => (
                                    <div key={event.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-150 flex flex-col justify-between h-full">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                                    📍 {event.venue}
                                                </span>
                                                <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                    <MapPin size={12} /> {event.distance}
                                                </span>
                                            </div>
                                            <h4 className="text-base sm:text-lg font-bold text-slate-850 tracking-tight mb-2">
                                                {event.title}
                                            </h4>
                                            <p className="text-xs sm:text-sm text-indigo-600 font-semibold flex items-center gap-1.5 mb-3">
                                                <CalendarIcon size={14} /> {event.date}
                                            </p>
                                            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-5">
                                                {event.description}
                                            </p>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100 mt-auto">
                                            <a 
                                                href={event.ticketUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors group shadow-sm"
                                            >
                                                <Ticket size={14} className="group-hover:rotate-12 transition-transform" />
                                                <span>Get Tickets</span>
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 3. FAMILY */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-3">
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100/55">
                                    <Compass size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Family</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Festivals, museum exhibitions, and sightseeing spots for all ages</p>
                                </div>
                                <span className="ml-auto text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold">
                                    {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Family').length} Exhibits
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Family').map(event => (
                                    <div key={event.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-150 flex flex-col justify-between h-full">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                                    📍 {event.venue}
                                                </span>
                                                <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                    <MapPin size={12} /> {event.distance}
                                                </span>
                                            </div>
                                            <h4 className="text-base sm:text-lg font-bold text-slate-850 tracking-tight mb-2">
                                                {event.title}
                                            </h4>
                                            <p className="text-xs sm:text-sm text-indigo-600 font-semibold flex items-center gap-1.5 mb-3">
                                                <CalendarIcon size={14} /> {event.date}
                                            </p>
                                            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-5">
                                                {event.description}
                                            </p>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100 mt-auto">
                                            <a 
                                                href={event.ticketUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors group shadow-sm"
                                            >
                                                <Ticket size={14} className="group-hover:rotate-12 transition-transform" />
                                                <span>Explore Event</span>
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. KIDS */}
                        <div>
                            <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-3">
                                <div className="w-10 h-10 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center border border-pink-100/55">
                                    <Smile size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">Kids</h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Immersive aquariums, zoo safaris, and kids play centers</p>
                                </div>
                                <span className="ml-auto text-xs bg-pink-50 text-pink-700 px-3 py-1 rounded-full font-bold">
                                    {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Kids').length} Spots
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {getEventsForCurrentMonth(new Date()).filter(e => e.category === 'Kids').map(event => (
                                    <div key={event.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all hover:border-indigo-150 flex flex-col justify-between h-full">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                                    📍 {event.venue}
                                                </span>
                                                <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                    <MapPin size={12} /> {event.distance}
                                                </span>
                                            </div>
                                            <h4 className="text-base sm:text-lg font-bold text-slate-850 tracking-tight mb-2">
                                                {event.title}
                                            </h4>
                                            <p className="text-xs sm:text-sm text-indigo-600 font-semibold flex items-center gap-1.5 mb-3">
                                                <CalendarIcon size={14} /> {event.date}
                                            </p>
                                            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-5">
                                                {event.description}
                                            </p>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100 mt-auto">
                                            <a 
                                                href={event.ticketUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="w-full bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors group shadow-sm"
                                            >
                                                <Ticket size={14} className="group-hover:rotate-12 transition-transform" />
                                                <span>Explore Event</span>
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <LegalFooter />

            <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
        </div>
    );
}
