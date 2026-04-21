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
    const [property, setProperty] = useState<Property | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        getDoc(doc(db, 'properties', id)).then(snap => {
            if (snap.exists()) {
                setProperty({ id: snap.id, ...snap.data() } as Property);
            }
            setLoading(false);
        });
    }, [id]);

    if (loading) return <div>Loading...</div>;
    if (!property) return <div>Property not found</div>;

    const topImage = property.images[0] || 'https://picsum.photos/seed/villa1/1200/800';
    const subImages = property.images.slice(1, 3);
    while (subImages.length < 2) {
        subImages.push('https://picsum.photos/seed/villa/600/400');
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
             <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center">
                    <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-black font-medium">
                        <ChevronLeft size={20} /> Back to listing
                    </Link>
                </div>
            </header>

            <main className="flex-1 py-12">
               <div className="max-w-7xl mx-auto px-4 mb-12">
                   <h2 className="text-4xl font-bold tracking-tight mb-4">{property.name}</h2>
                   <p className="text-xl text-gray-500 mb-8 max-w-2xl">{property.description}</p>
                   
                   <div className="h-[400px] w-full rounded-2xl overflow-hidden mb-12 flex gap-4">
                       <img src={topImage} alt="Main Image" className="\${property.images.length === 1 ? 'w-full' : 'w-2/3'} h-full object-cover rounded-2xl" referrerPolicy="no-referrer" />
                       {property.images.length > 1 && (
                         <div className="w-1/3 flex flex-col gap-4">
                            <img src={subImages[0]} alt="Sub Image 1" className="w-full h-[calc(50%-0.5rem)] object-cover rounded-2xl" referrerPolicy="no-referrer" />
                            {property.images.length > 2 && <img src={subImages[1]} alt="Sub Image 2" className="w-full h-[calc(50%-0.5rem)] object-cover rounded-2xl" referrerPolicy="no-referrer" />}
                         </div>
                       )}
                   </div>

                   {/* Gallery preview if more than 3 images */}
                   {property.images.length > 3 && (
                       <div className="flex gap-4 overflow-x-auto pb-4 mb-8 snap-x">
                           {property.images.slice(3).map((img, idx) => (
                               <img key={idx} src={img} className="h-32 rounded-xl object-cover snap-start border" />
                           ))}
                       </div>
                   )}
               </div>
               
               <Calendar propertyId={property.id} />
            </main>
        </div>
    )
}
