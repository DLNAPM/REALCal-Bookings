import React, { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Calendar } from '../components/Calendar';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, MapPin, Home, Shield, Sparkles } from 'lucide-react';
import { Property } from '../types';
import { isAppleOS, getMapLink } from '../lib/utils';

import { LegalFooter } from '../components/LegalFooter';

export const PropertyDetail: React.FC = () => {
    const { id } = useParams<{id: string}>();
    const { user, loading: authLoading } = useAuth();
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);
    const [enlargedImageIndex, setEnlargedImageIndex] = useState<number | null>(null);

    useEffect(() => {
        if (enlargedImageIndex === null || !property) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setEnlargedImageIndex(null);
            } else if (e.key === 'ArrowLeft') {
                setEnlargedImageIndex((prev) => 
                    prev !== null 
                        ? (prev === 0 ? property.images.length - 1 : prev - 1) 
                        : null
                );
            } else if (e.key === 'ArrowRight') {
                setEnlargedImageIndex((prev) => 
                    prev !== null 
                        ? (prev === property.images.length - 1 ? 0 : prev + 1) 
                        : null
                );
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enlargedImageIndex, property]);

    useEffect(() => {
        if (!id || !db) return;
        getDoc(doc(db, 'properties', id)).then(snap => {
            if (snap.exists()) {
                const propData = { id: snap.id, ...snap.data() } as Property;
                const allowedTestEmails = ['reach_dlaniger@hotmail.com', 'dlaniger.napm.consulting@gmail.com', 'monnib30228@gmail.com'];
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
                    {user && (
                        <Link to="/my-bookings" className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-2 text-sm transition-colors rounded-lg px-3 py-2 hover:bg-slate-50">
                            <CalendarIcon size={16}/> My Bookings
                        </Link>
                    )}
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
                       <img src={topImage} alt="Main Image" onClick={() => { if (property.images.length > 0) { setEnlargedImageIndex(0); } }} className={`${property.images.length === 1 ? 'w-full' : 'w-2/3'} h-full object-cover rounded-2xl shadow-sm cursor-pointer hover:opacity-95 transition-opacity duration-200`} referrerPolicy="no-referrer" />
                       {property.images.length > 1 && (
                         <div className="w-1/3 flex flex-col gap-4">
                            <img src={subImages[0]} alt="Sub Image 1" onClick={() => setEnlargedImageIndex(1)} className="w-full h-[calc(50%-0.5rem)] object-cover rounded-2xl shadow-sm cursor-pointer hover:opacity-95 transition-opacity duration-200" referrerPolicy="no-referrer" />
                            {property.images.length > 2 && <img src={subImages[1]} alt="Sub Image 2" onClick={() => setEnlargedImageIndex(2)} className="w-full h-[calc(50%-0.5rem)] object-cover rounded-2xl shadow-sm cursor-pointer hover:opacity-95 transition-opacity duration-200" referrerPolicy="no-referrer" />}
                         </div>
                       )}
                   </div>

                   {/* Gallery preview if more than 3 images */}
                   {property.images.length > 3 && (
                       <div className="flex gap-4 overflow-x-auto pb-4 mb-8 snap-x px-2">
                           {property.images.slice(3).map((img, idx) => (
                               <img key={idx} src={img} onClick={() => setEnlargedImageIndex(idx + 3)} className="h-32 w-48 rounded-2xl object-cover snap-start border border-slate-200 shadow-sm cursor-pointer hover:opacity-95 transition-opacity duration-200 flex-shrink-0" referrerPolicy="no-referrer" />
                           ))}
                       </div>
                   )}
               </div>
               
                {/* Property Details card (with Address as the Last line of details) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 mt-4 mb-4 text-left">
                    <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Sparkles className="text-indigo-600 animate-pulse" size={20} /> Property Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm mb-6">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Accommodation Type</span>
                            <span className="font-semibold text-slate-800 text-base">
                                {property.allowIndividualRoomRental ? 'Entire Home & Room Rentals' : 'Entire Home Rental'}
                            </span>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Bedrooms Layout</span>
                            <span className="font-semibold text-slate-800 text-base">
                                {property.bedrooms && property.bedrooms.length > 0 
                                    ? `${property.bedrooms.length} Configured Bedroom${property.bedrooms.length > 1 ? 's' : ''}` 
                                    : 'Comfortable Family Layout'}
                            </span>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Access Method</span>
                            <span className="font-semibold text-slate-800 text-base flex items-center gap-1.5">
                                {property.hasSmartLock ? 'SmartLock Keyless' : 'Standard Key Access'}
                            </span>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Standard Schedule</span>
                            <span className="font-semibold text-slate-800 text-base">
                                4:00 PM In / 11:00 AM Out
                            </span>
                        </div>
                    </div>

                    {property.bedrooms && property.bedrooms.length > 0 && (
                        <div className="mb-6 pb-6 border-b border-slate-100">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">Room Specifications</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {property.bedrooms.map((room, idx) => (
                                    <div key={idx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/80 flex items-center justify-between text-xs font-medium">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-slate-800">Room {room.roomNumber}</span>
                                            <span className="text-slate-400 text-[10px] uppercase font-semibold">{room.type} • Max {room.maxCapacity || 2} Guests</span>
                                        </div>
                                        {room.sqFt > 0 && (
                                            <span className="font-mono text-indigo-600 bg-indigo-50/50 border border-indigo-100/30 px-2 py-0.5 rounded text-[10px]">{room.sqFt} sq ft</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Property Address - THE LAST LINE IN PROPERTY DETAILS */}
                    <div className="pt-4 border-t border-slate-100 flex items-start sm:items-center gap-2 text-base md:text-lg text-slate-800">
                        <span className="font-bold text-slate-900 shrink-0">Address:</span>
                        {property.location ? (
                            <a 
                                href={getMapLink(property.location)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-indigo-600 underline decoration-indigo-300 decoration-2 underline-offset-4 hover:text-indigo-700 hover:decoration-indigo-500 transition-all cursor-pointer text-left"
                                title={`Open in ${isAppleOS() ? 'Apple Maps' : 'Google Maps'} for directions`}
                            >
                                {property.location}
                            </a>
                        ) : (
                            <span className="text-slate-500 italic">Not configured</span>
                        )}
                    </div>
                </div>

               <Calendar propertyId={property.id} property={property} />
            </main>
            <LegalFooter />
        
             {/* Lightbox / Enlarged View Modal */}
             {enlargedImageIndex !== null && property.images.length > 0 && (
                 <div 
                     className="fixed inset-0 bg-slate-950/95 z-50 flex flex-col justify-between items-center p-4 md:p-8 backdrop-blur-sm animate-in fade-in duration-200"
                     onClick={() => setEnlargedImageIndex(null)}
                 >
                     {/* Header */}
                     <div className="w-full max-w-7xl flex justify-between items-center text-white py-2 z-10 select-none">
                         <span className="text-sm font-semibold tracking-wide text-slate-300">
                             Image {enlargedImageIndex + 1} of {property.images.length}
                         </span>
                         <button 
                             onClick={() => setEnlargedImageIndex(null)}
                             className="bg-white/10 hover:bg-white/20 hover:scale-105 active:scale-95 text-white p-2.5 rounded-full transition-all duration-200 cursor-pointer shadow-lg"
                             title="Close (Esc)"
                         >
                             <X size={20} />
                         </button>
                     </div>

                     {/* Image Body / Main Content with Navigation Side Buttons */}
                     <div className="flex-1 w-full flex items-center justify-between gap-4 max-w-7xl relative my-auto">
                         {/* Previous Indicator / Button */}
                         <button 
                             disabled={property.images.length <= 1}
                             onClick={(e) => {
                                 e.stopPropagation();
                                 setEnlargedImageIndex((prev) => 
                                     prev !== null 
                                         ? (prev === 0 ? property.images.length - 1 : prev - 1) 
                                         : null
                                 );
                             }}
                             className="bg-white/10 hover:bg-indigo-650/90 hover:bg-white/20 active:scale-95 text-white p-3 md:p-4 rounded-full transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed z-10 shadow-lg"
                             title="Previous"
                         >
                             <ChevronLeft size={24} />
                         </button>

                         {/* Enlarged image */}
                         <div className="flex-1 h-full max-h-[70vh] flex items-center justify-center p-2">
                             <img 
                                 src={property.images[enlargedImageIndex]} 
                                 alt={`Enlarged property display ${enlargedImageIndex + 1}`} 
                                 className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl select-none animate-in zoom-in-95 duration-200"
                                 onClick={(e) => e.stopPropagation()}
                                 referrerPolicy="no-referrer"
                             />
                         </div>

                         {/* Next Indicator / Button */}
                         <button 
                             disabled={property.images.length <= 1}
                             onClick={(e) => {
                                 e.stopPropagation();
                                 setEnlargedImageIndex((prev) => 
                                     prev !== null 
                                         ? (prev === property.images.length - 1 ? 0 : prev + 1) 
                                         : null
                                 );
                             }}
                             className="bg-white/10 hover:bg-indigo-650/90 hover:bg-white/20 active:scale-95 text-white p-3 md:p-4 rounded-full transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed z-10 shadow-lg"
                             title="Next"
                         >
                             <ChevronRight size={24} />
                         </button>
                     </div>

                     {/* Thumbnail Slider Navigation */}
                     <div className="w-full max-w-4xl py-4 overflow-x-auto flex gap-3.5 justify-start md:justify-center items-center px-4 custom-scrollbar">
                         {property.images.map((img, i) => (
                             <button
                                 key={i}
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     setEnlargedImageIndex(i);
                                 }}
                                 className={`relative h-14 w-20 rounded-xl overflow-hidden border-2 transition-all duration-200 flex-shrink-0 cursor-pointer shadow-sm ${
                                     enlargedImageIndex === i 
                                         ? "border-indigo-500 scale-105 ring-2 ring-indigo-500/20" 
                                         : "border-transparent opacity-50 hover:opacity-100"
                                 }`}
                             >
                                 <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                             </button>
                         ))}
                     </div>
                 </div>
             )}
</div>
    )
}
