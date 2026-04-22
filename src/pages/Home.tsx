import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signIn, signOut, db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Key, LogOut, ChevronRight, Lock, BellRing, ShieldCheck } from 'lucide-react';
import { Property } from '../types';

export const Home: React.FC = () => {
    const { user, loading } = useAuth();
    const [properties, setProperties] = useState<Property[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(query(collection(db, 'properties')), (snap) => {
            setProperties(snap.docs.map(d => ({id: d.id, ...d.data() } as Property)));
        });
        return unsub;
    }, []);
    
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

    return (
        <div className="min-h-screen bg-white flex flex-col font-sans text-slate-900 pb-12 overflow-x-hidden">
            <header className="pt-6 px-6 max-w-7xl mx-auto w-full z-10 relative">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <CalendarIcon size={20} />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Bookings</span></h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {!loading && user ? (
                            <div className="flex items-center gap-4">
                                {user.role === 'admin' && (
                                   <Link to="/admin" className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-2 text-sm transition-colors rounded-lg px-3 py-2 hover:bg-slate-50">
                                       <Key size={16}/> Admin Dashboard
                                   </Link>
                                )}
                                <div className="flex items-center gap-4 bg-white py-1.5 pl-1.5 pr-4 rounded-full border border-slate-200 shadow-sm">
                                  {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />}
                                  <div className="text-sm">
                                    <p className="font-semibold leading-none text-slate-800">{user.displayName}</p>
                                    <p className="text-xs text-indigo-600 font-medium">Welcome back</p>
                                  </div>
                                </div>
                                <button onClick={signOut} className="text-slate-400 hover:text-red-500 transition-colors p-2 bg-white rounded-full border border-slate-200 shadow-sm">
                                   <LogOut size={16} />
                                </button>
                            </div>
                        ) : (
                            <button onClick={handleSignIn} className="px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-indigo-600 transition-colors text-sm shadow-md">
                                Login to Book
                            </button>
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
                        <a href="#properties" className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-colors transform hover:-translate-y-0.5">
                            Browse Properties
                        </a>
                        {!user && (
                            <button onClick={handleSignIn} className="px-8 py-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 transition-colors">
                                Sign In Now
                            </button>
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
                                Upon confirmed payment, your personal access code is physically provisioned to the property's Yale smart locks, valid exactly for the duration of your stay.
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
            
            {/* Properties Section */}
            <main id="properties" className="flex-1 w-full max-w-7xl mx-auto px-6 pt-24 pb-12">
               <div className="mb-12">
                   <h2 className="text-3xl font-bold tracking-tight text-slate-900">Featured Properties</h2>
                   <p className="text-lg text-slate-500 mt-2">Find your next perfect getaway.</p>
               </div>
               
               {properties.length === 0 ? (
                 <div className="text-center p-12 bg-slate-50 rounded-3xl border border-slate-200 border-dashed text-slate-500">
                     No properties available yet. Check back soon.
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                     {properties.map(p => (
                         <div key={p.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm group cursor-pointer hover:shadow-xl hover:border-indigo-200 transition-all hover:-translate-y-1 block" onClick={() => navigate(`/property/${p.id}`)}>
                             <div className="h-64 relative overflow-hidden bg-slate-100 flex items-center justify-center">
                                 {p.images && p.images.length > 0 ? (
                                    <img src={p.images[0]} className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out" />
                                 ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400">No images</div>
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
               )}
            </main>
        </div>
    );
}
