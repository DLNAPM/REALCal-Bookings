import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { signIn, signOut, db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Key, LogOut } from 'lucide-react';
import { Property } from '../types';

export const Home: React.FC = () => {
    const { user, loading } = useAuth();
    const [properties, setProperties] = useState<Property[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, 'properties')), (snap) => {
            setProperties(snap.docs.map(d => ({id: d.id, ...d.data() } as Property)));
        });
        return unsub;
    }, []);
    
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
                            <CalendarIcon size={20} />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">REALCal Bookings</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        {!loading && user ? (
                            <div className="flex items-center gap-4">
                                {user.role === 'admin' && (
                                   <Link to="/admin" className="text-gray-600 hover:text-black font-medium flex items-center gap-2 text-sm">
                                       <Key size={16}/> Admin Dashboard
                                   </Link>
                                )}
                                <div className="flex items-center gap-2">
                                  {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />}
                                  <span className="text-sm font-medium">{user.displayName}</span>
                                </div>
                                <button onClick={signOut} className="text-gray-500 hover:text-red-600">
                                   <LogOut size={20} />
                                </button>
                            </div>
                        ) : (
                            <button onClick={signIn} className="px-4 py-2 bg-black text-white font-medium rounded-lg hover:bg-gray-800 text-sm">
                                Login to Book
                            </button>
                        )}
                    </div>
                </div>
            </header>
            
            <main className="flex-1 py-12 max-w-7xl mx-auto px-4 w-full">
               <h2 className="text-4xl font-bold tracking-tight mb-4">Available Properties</h2>
               <p className="text-xl text-gray-500 mb-8 max-w-2xl">Select a property below to view dates for instant pricing and secure booking.</p>
               
               {properties.length === 0 ? (
                 <div className="text-center p-12 bg-white rounded-xl border border-dashed text-gray-500">
                     No properties available yet. Admin needs to configure properties.
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                     {properties.map(p => (
                         <div key={p.id} className="bg-white rounded-2xl overflow-hidden border shadow-sm group cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate(`/property/\${p.id}`)}>
                             <div className="h-48 relative overflow-hidden bg-gray-100">
                                 {p.images && p.images.length > 0 ? (
                                    <img src={p.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                 ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">No images</div>
                                 )}
                             </div>
                             <div className="p-6">
                                <h3 className="text-xl font-bold mb-2">{p.name}</h3>
                                <p className="text-gray-600 line-clamp-2 text-sm">{p.description}</p>
                             </div>
                         </div>
                     ))}
                 </div>
               )}
            </main>
        </div>
    );
}
