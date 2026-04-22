import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar } from '../components/Calendar';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, Calendar as CalendarIcon } from 'lucide-react';
import { Property } from '../types';

export const PropertyDetail: React.FC = () => {
    const { id } = useParams<{id: string}>();
    const { user } = useAuth();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id || !db) return;
        getDoc(doc(db, 'properties', id)).then(snap => {
            if (snap.exists()) {
                const propData = { id: snap.id, ...snap.data() } as Property;
                const allowedTestEmails = ['reach_dlaniger@hotmail.com', 'candshproperties@gmail.com', 'dlaniger.napm.consulting@gmail.com'];
                const canViewTestProps = user && user.email && allowedTestEmails.includes(user.email);
                
                if (propData.isTestProperty && !canViewTestProps) {
                    setProperty(null); // Access denied
                } else {
                    setProperty(propData);
                }
            } else {
                setProperty(null);
            }
            setLoading(false);
        }).catch(err => {
            console.error("Failed to load property:", err);
            setLoading(false);
        });
    }, [id, user]);

    if (loading) return <div>Loading...</div>;
    if (!property) return <div>Property not found</div>;

    const topImage = property.images[0] || 'https://picsum.photos/seed/villa1/1200/800';
    const subImages = property.images.slice(1, 3);
    while (subImages.length < 2) {
        subImages.push('https://picsum.photos/seed/villa/600/400');
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans overflow-hidden text-slate-900 border-none">
             <header className="pt-6 px-6 max-w-7xl mx-auto w-full mb-6">
                <div className="flex justify-between items-center bg-white rounded-2xl shadow-sm border border-slate-200 py-3 px-4">
                    <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-colors">
                        <div className="bg-slate-100 p-1.5 rounded-lg"><ChevronLeft size={18} /></div> Back to properties
                    </Link>
                </div>
            </header>

            <main className="flex-1 pb-12 w-full">
               <div className="max-w-7xl mx-auto px-6 mb-8 pt-6">
                   {property.isTestProperty && (
                       <div className="mb-4 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center gap-2 w-fit">
                           TEST ENVIRONMENT METADATA
                       </div>
                   )}
                   <h2 className="text-4xl font-bold tracking-tight mb-4 text-slate-800">{property.name}</h2>
                   <p className="text-xl text-slate-500 mb-8 max-w-3xl">{property.description}</p>
                   
                   <div className="h-[460px] w-full rounded-3xl overflow-hidden mb-12 flex gap-4 p-2 bg-white border border-slate-200 shadow-sm">
                       <img src={topImage} alt="Main Image" className={`${property.images.length === 1 ? 'w-full' : 'w-2/3'} h-full object-cover rounded-2xl shadow-sm`} referrerPolicy="no-referrer" />
                       {property.images.length > 1 && (
                         <div className="w-1/3 flex flex-col gap-4">
                            <img src={subImages[0]} alt="Sub Image 1" className="w-full h-[calc(50%-0.5rem)] object-cover rounded-2xl shadow-sm" referrerPolicy="no-referrer" />
                            {property.images.length > 2 && <img src={subImages[1]} alt="Sub Image 2" className="w-full h-[calc(50%-0.5rem)] object-cover rounded-2xl shadow-sm" referrerPolicy="no-referrer" />}
                         </div>
                       )}
                   </div>

                   {/* Gallery preview if more than 3 images */}
                   {property.images.length > 3 && (
                       <div className="flex gap-4 overflow-x-auto pb-4 mb-8 snap-x px-2">
                           {property.images.slice(3).map((img, idx) => (
                               <img key={idx} src={img} className="h-32 w-48 rounded-2xl object-cover snap-start border border-slate-200 shadow-sm" referrerPolicy="no-referrer" />
                           ))}
                       </div>
                   )}
               </div>
               
               <Calendar propertyId={property.id} />
            </main>
        </div>
    )
}
