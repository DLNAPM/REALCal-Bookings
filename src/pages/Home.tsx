import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signIn, signOut, db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Key, LogOut, ChevronRight } from 'lucide-react';
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
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-12 overflow-hidden">
            <header className="pt-6 px-6 max-w-7xl mx-auto w-full">
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
                                   <Link to="/admin" className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-2 text-sm transition-colors rounded-lg px-3 py-2 hover:bg-indigo-50">
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
                            <button onClick={handleSignIn} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-colors text-sm">
                                Login to Book
                            </button>
                        )}
                    </div>
                </div>
            </header>
            
            <main className="flex-1 w-full max-w-7xl mx-auto px-6 mt-4">
               <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 mb-8">
                   <h2 className="text-4xl font-bold tracking-tight mb-4 text-slate-800">Available Properties</h2>
                   <p className="text-xl text-slate-500 max-w-2xl">Select a property below to view dates for instant pricing and secure booking.</p>
               </div>
               
               {properties.length === 0 ? (
                 <div className="text-center p-12 bg-white rounded-3xl border border-slate-200 border-dashed text-slate-500">
                     No properties available yet. Admin needs to configure properties.
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {properties.map(p => (
                         <div key={p.id} className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm group cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1" onClick={() => navigate(`/property/${p.id}`)}>
                             <div className="h-56 relative overflow-hidden bg-slate-100">
                                 {p.images && p.images.length > 0 ? (
                                    <img src={p.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
                                 ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400">No images</div>
                                 )}
                             </div>
                             <div className="p-6">
                                <h3 className="text-xl font-bold mb-2 text-slate-800 group-hover:text-indigo-600 transition-colors">{p.name}</h3>
                                <p className="text-slate-500 line-clamp-2 text-sm">{p.description}</p>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                    <span className="text-sm font-bold text-indigo-600 flex items-center gap-1">View Details <ChevronRight size={16}/></span>
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
