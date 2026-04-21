import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { Navigate } from 'react-router-dom';
import { BlackoutDate, PricingRule, Booking, Property, PropertyManager } from '../types';
import { Users, FileDown, TrendingUp, Settings, Plus, Image as ImageIcon, Trash2, Phone, Mail, Calendar as CalendarIcon, DollarSign } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const AdminDashboard: React.FC = () => {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [propertyManagers, setPropertyManagers] = useState<PropertyManager[]>([]);
  
  // Image uploader state
  const [uploadingProperty, setUploadingProperty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  
  if (loading) return <div>Loading...</div>;
  if (!user || user.role !== 'admin') return <Navigate to="/" />;

  useEffect(() => {
    onSnapshot(query(collection(db, 'users')), (snap) => setUsers(snap.docs.map(d => d.data())));
    onSnapshot(query(collection(db, 'bookings')), (snap) => setBookings(snap.docs.map(d => ({id: d.id, ...d.data() } as Booking))));
    onSnapshot(query(collection(db, 'blackout_dates')), (snap) => setBlackouts(snap.docs.map(d => ({id: d.id, ...d.data() } as BlackoutDate))));
    onSnapshot(query(collection(db, 'pricing_rules')), (snap) => setPricingRules(snap.docs.map(d => ({id: d.id, ...d.data() } as PricingRule))));
    onSnapshot(query(collection(db, 'property_managers')), (snap) => setPropertyManagers(snap.docs.map(d => ({id: d.id, ...d.data() } as PropertyManager))));
    onSnapshot(query(collection(db, 'properties')), (snap) => {
        const props = snap.docs.map(d => ({id: d.id, ...d.data() } as Property));
        setProperties(props);
        if (props.length > 0 && !activePropertyId) setActivePropertyId(props[0].id);
    });
  }, []);

  const totalRevenue = bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + b.totalPrice, 0);
  const totalCancellations = bookings.filter(b => b.status === 'cancelled').length;

  const exportCSV = () => {
    const header = "Booking ID,Property ID,User ID,Check In,Check Out,Status,Total Price\n";
    const rows = bookings.map(b => `${b.id},${b.propertyId || ''},${b.userId},${b.checkIn},${b.checkOut},${b.status},${b.totalPrice}`).join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings_export_${new Date().toISOString()}.csv`;
    a.click();
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          const MAX_SIZE = 600;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6)); // compressed 60% jpeg fits ~30kb
        };
        img.onerror = () => reject("Image load error");
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject("File read error");
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files);
      const remainingSlots = 15 - previewImages.length;
      if (files.length > remainingSlots) {
          alert(`You can only upload up to 15 images. (\${remainingSlots} slots remaining)`);
      }
      
      const allowedFiles = files.slice(0, remainingSlots);
      setUploadingProperty(true);
      try {
          const compressed = await Promise.all(allowedFiles.map(f => compressImage(f as File)));
          setPreviewImages(prev => [...prev, ...compressed]);
      } catch (err) {
          console.error(err);
      }
      setUploadingProperty(false);
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      try {
          await addDoc(collection(db, 'properties'), {
              name: fd.get('name') as string,
              description: fd.get('description') as string,
              images: previewImages,
              createdAt: serverTimestamp()
          });
          (e.target as HTMLFormElement).reset();
          setPreviewImages([]);
      } catch (err: any) { alert(err.message); }
  }

  const handleDeleteProperty = async (id: string) => {
      if(window.confirm('Are you certain? This will orphans bookings...')){
          await deleteDoc(doc(db, 'properties', id));
          if (activePropertyId === id) setActivePropertyId(null);
      }
  }

  const handleCreatePricingRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!activePropertyId) return alert("Select a property first");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await addDoc(collection(db, 'pricing_rules'), {
         propertyId: activePropertyId,
         type: fd.get('type') as string,
         rate: Number(fd.get('rate')),
         name: fd.get('name') as string || '',
         startDate: fd.get('startDate') as string || '',
         endDate: fd.get('endDate') as string || '',
         createdAt: serverTimestamp()
      });
      (e.target as HTMLFormElement).reset();
    } catch (e: any) { alert(e.message); }
  }

  const handleCreateBlackout = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!activePropertyId) return alert("Select a property first");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await addDoc(collection(db, 'blackout_dates'), {
         propertyId: activePropertyId,
         date: fd.get('date') as string,
         reason: fd.get('reason') as string || '',
         createdAt: serverTimestamp()
      });
      (e.target as HTMLFormElement).reset();
    } catch (e: any) { alert(e.message); }
  }

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await addDoc(collection(db, 'property_managers'), {
         name: fd.get('name') as string,
         email: fd.get('email') as string,
         phone: fd.get('phone') as string,
         enabled: true,
         createdAt: serverTimestamp()
      });
      (e.target as HTMLFormElement).reset();
    } catch (err: any) { alert(err.message); }
  }

  const toggleManager = async (id: string, enabled: boolean) => {
    try {
      await updateDoc(doc(db, 'property_managers', id), { enabled: !enabled });
    } catch (err: any) { alert(err.message); }
  }

  const handleDeleteManager = async (id: string) => {
    if(window.confirm('Delete this contact?')) {
      await deleteDoc(doc(db, 'property_managers', id));
    }
  }

  const handleAdminCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const formPropId = fd.get('propertyId') as string;
    const checkIn = fd.get('checkIn') as string;
    const checkOut = fd.get('checkOut') as string;
    const guestName = fd.get('guestName') as string;
    const totalAmountStr = fd.get('totalPrice') as string;
    const bookingId = uuidv4();
    
    // For manual booking we mock a userId (admin uid or placeholder)
    const payloadUserId = user?.uid || 'admin-override';

    try {
        // Provision Lock Code
        const lockRes = await fetch('/api/provision-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkIn, checkOut, name: guestName })
        });
        
        let accessCode = '';
        if (lockRes.ok) {
           const data = await lockRes.json();
           accessCode = data.accessCode || '';
        }

        const payload: any = {
           userId: payloadUserId,
           propertyId: formPropId,
           checkIn: new Date(checkIn).toISOString(),
           checkOut: new Date(checkOut).toISOString(),
           status: 'confirmed',
           totalPrice: Number(totalAmountStr),
           guests: 1,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
        };

        if (accessCode) payload.accessCode = accessCode;

        // Save Booking
        await setDoc(doc(db, 'bookings', bookingId), payload);

        // Notify Managers
        try {
           const managers = propertyManagers.filter(m => m.enabled);
           let propertyName = "Villa";
           const prop = properties.find(p => p.id === formPropId);
           if (prop) propertyName = prop.name;

           if (managers.length > 0) {
              await fetch('/api/notify-managers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                   managers,
                   bookingDetails: {
                      checkIn: payload.checkIn,
                      checkOut: payload.checkOut,
                      totalAmount: Math.round(payload.totalPrice * 100),
                      propertyName: propertyName,
                      guestName: guestName
                   }
                })
              });
           }
        } catch (notifyErr) {
           console.error("Manager notification failed, but booking succeeded", notifyErr);
        }

        alert("Manual booking created successfully!");
        (e.target as HTMLFormElement).reset();

    } catch (err: any) { alert(err.message); }
  }

  const activeRules = pricingRules.filter(r => r.propertyId === activePropertyId);
  const activeBlackouts = blackouts.filter(b => b.propertyId === activePropertyId);

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
       <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex justify-between items-center bg-white p-6 rounded-xl border shadow-sm">
             <h1 className="text-3xl font-bold flex items-center gap-3"><Settings className="text-gray-400" /> Admin Dashboard</h1>
             <button onClick={exportCSV} className="bg-black text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-gray-800">
               <FileDown size={18}/> Export Bookings
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4">
                <div className="p-4 bg-gray-100 text-gray-700 rounded-full"><Users size={24}/></div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Users</p>
                  <p className="text-2xl font-bold">{users.length}</p>
                </div>
             </div>
             <div className="bg-white p-6 rounded-xl border shadow-sm flex items-center gap-4">
                <div className="p-4 bg-gray-100 text-gray-700 rounded-full"><TrendingUp size={24}/></div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Confirmed Revenue</p>
                  <p className="text-2xl font-bold">${(totalRevenue).toFixed(2)}</p>
                </div>
             </div>
             <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col justify-center">
                <p className="text-sm font-medium text-gray-500 mb-1">Bookings Overview</p>
                <div className="flex gap-4">
                  <span className="text-green-600 font-bold">{bookings.filter(b => b.status==='confirmed').length} Confirmed</span>
                  <span className="text-red-500 font-bold">{totalCancellations} Canceled</span>
                </div>
             </div>
          </div>

          <div className="bg-white p-6 rounded-xl border shadow-sm">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><CalendarIcon size={20}/> Create Manual Booking</h2>
             <form onSubmit={handleAdminCreateBooking} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end bg-gray-50 p-6 rounded-xl border border-dashed">
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase">Property</label>
                   <select name="propertyId" required className="w-full border rounded-lg p-2 mt-1 required bg-white">
                      <option value="">Select...</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase">Check In</label>
                   <input name="checkIn" type="date" required className="w-full border rounded-lg p-2 mt-1 bg-white" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase">Check Out</label>
                   <input name="checkOut" type="date" required className="w-full border rounded-lg p-2 mt-1 bg-white" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase">Guest Name</label>
                   <input name="guestName" required placeholder="Guest Name" className="w-full border rounded-lg p-2 mt-1 bg-white" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-gray-500 uppercase">Total Price ($)</label>
                   <input name="totalPrice" type="number" required placeholder="0.00" className="w-full border rounded-lg p-2 mt-1 bg-white" />
                </div>
                <div className="md:col-span-2 lg:col-span-5 flex justify-end">
                   <button type="submit" className="bg-black text-white px-6 py-3 rounded-lg font-bold hover:bg-gray-800">
                      Create Override Booking
                   </button>
                </div>
             </form>
          </div>

          <div className="bg-white p-6 rounded-xl border shadow-sm">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Phone size={20}/> Property Management Contacts</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="col-span-1 border p-4 rounded-xl bg-gray-50">
                    <h3 className="font-bold mb-4">Add Contact</h3>
                    <form onSubmit={handleCreateManager} className="space-y-4">
                       <input name="name" required placeholder="Name (e.g. John Doe)" className="w-full border rounded-lg p-2 bg-white" />
                       <input name="email" type="email" required placeholder="Email Address" className="w-full border rounded-lg p-2 bg-white" />
                       <input name="phone" required placeholder="Phone Number (e.g. +1...)" className="w-full border rounded-lg p-2 bg-white" />
                       <button type="submit" className="w-full bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800">Save Contact</button>
                    </form>
                 </div>
                 
                 <div className="col-span-1 md:col-span-2 space-y-3">
                    {propertyManagers.length === 0 && <div className="p-8 border border-dashed rounded-xl text-center text-gray-500 text-sm">No management contacts configured.</div>}
                    {propertyManagers.map(m => (
                       <div key={m.id} className="border p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white">
                          <div>
                             <h4 className="font-bold">{m.name}</h4>
                             <div className="flex gap-4 text-sm text-gray-600 mt-1">
                                <span className="flex items-center gap-1"><Mail size={14}/> {m.email}</span>
                                <span className="flex items-center gap-1"><Phone size={14}/> {m.phone}</span>
                             </div>
                          </div>
                          <div className="flex items-center gap-4">
                             <label className="flex items-center gap-2 cursor-pointer">
                               <input type="checkbox" checked={m.enabled} onChange={() => toggleManager(m.id, m.enabled)} className="w-4 h-4 rounded text-black" />
                               <span className="text-sm font-medium">{m.enabled ? 'Enabled' : 'Disabled'}</span>
                             </label>
                             <button type="button" onClick={() => handleDeleteManager(m.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18}/></button>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
          </div>

          <div className="bg-white p-6 rounded-xl border shadow-sm">
             <h2 className="text-2xl font-bold mb-6">Manage Properties</h2>
             
             <form onSubmit={handleCreateProperty} className="mb-8 p-6 bg-gray-50 rounded-xl border border-dashed">
                 <h3 className="font-bold mb-4">Add New Property</h3>
                 <div className="space-y-4">
                     <input name="name" required placeholder="Property Name" className="w-full border rounded-lg p-3 bg-white" />
                     <textarea name="description" required placeholder="Description..." rows={3} className="w-full border rounded-lg p-3 bg-white" />
                     
                     <div className="bg-white p-4 rounded-lg border">
                         <div className="flex justify-between items-center mb-2">
                             <span className="font-medium">Images ({previewImages.length}/15)</span>
                             <label className="bg-gray-200 hover:bg-gray-300 text-black px-4 py-2 rounded cursor-pointer text-sm font-bold flex gap-2 items-center">
                                 <ImageIcon size={16} /> Upload Photos
                                 <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} disabled={uploadingProperty || previewImages.length >= 15} />
                             </label>
                         </div>
                         <div className="flex flex-wrap gap-2">
                             {previewImages.map((src, i) => (
                                 <div key={i} className="relative w-20 h-20 group">
                                     <img src={src} className="w-full h-full object-cover rounded" />
                                     <button type="button" onClick={() => setPreviewImages(p => p.filter((_, idx)=>idx!==i))} className="absolute hidden group-hover:flex top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 items-center justify-center text-xs">x</button>
                                 </div>
                             ))}
                             {uploadingProperty && <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded text-xs text-gray-500">Processing...</div>}
                         </div>
                     </div>
                     <button type="submit" disabled={uploadingProperty} className="bg-black text-white px-6 py-3 rounded-lg font-bold">Save Property</button>
                 </div>
             </form>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {properties.map(p => (
                     <div key={p.id} className={`border p-4 rounded-xl cursor-pointer transition-colors ${activePropertyId === p.id ? 'ring-2 ring-black bg-gray-50' : 'hover:bg-gray-50'}`} onClick={() => setActivePropertyId(p.id)}>
                         {p.images.length > 0 && <img src={p.images[0]} className="w-full h-40 object-cover rounded-lg mb-3" />}
                         <div className="flex justify-between items-start">
                             <h4 className="font-bold text-lg">{p.name}</h4>
                             <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteProperty(p.id); }} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16}/></button>
                         </div>
                         <p className="text-sm text-gray-600 line-clamp-2">{p.description}</p>
                         <div className="mt-2 text-xs font-bold text-gray-400">{p.images.length} Photos</div>
                     </div>
                 ))}
                 {properties.length === 0 && <div className="col-span-full text-center text-gray-500 p-8 border border-dashed rounded-xl">No properties configured yet.</div>}
             </div>
          </div>
          
          {activePropertyId && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-8">
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                   <h2 className="text-xl font-bold mb-4 flex items-center gap-2">Pricing Rules ({properties.find(p => p.id === activePropertyId)?.name})</h2>
                   <form onSubmit={handleCreatePricingRule} className="space-y-4 mb-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                            <select name="type" className="w-full border rounded-lg p-2 mt-1 required">
                               <option value="default">Default Layer</option>
                               <option value="weekend">Weekend Override</option>
                               <option value="holiday">Holiday Promo/Surge</option>
                               <option value="custom">Custom Range</option>
                            </select>
                         </div>
                         <div>
                             <label className="text-xs font-bold text-gray-500 uppercase">Per Night ($)</label>
                             <input name="rate" type="number" required className="w-full border rounded-lg p-2 mt-1" placeholder="150" />
                         </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">Start Date</label>
                              <input name="startDate" type="date" className="w-full border rounded-lg p-2 mt-1" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-gray-500 uppercase">End Date</label>
                              <input name="endDate" type="date" className="w-full border rounded-lg p-2 mt-1" />
                          </div>
                      </div>
                      <button type="submit" className="w-full bg-black text-white font-medium py-2 rounded-lg hover:bg-gray-800">Add Rule</button>
                   </form>

                   <div className="space-y-2">
                       {activeRules.length === 0 && <p className="text-sm text-gray-500 text-center">No rules configured for this property.</p>}
                      {activeRules.map(r => (
                         <div key={r.id} className="border p-3 rounded-lg flex justify-between items-center text-sm">
                            <div>
                               <span className="font-bold capitalize">{r.type}</span>
                               {r.startDate && <span className="text-gray-500 ml-2">({r.startDate} to {r.endDate})</span>}
                            </div>
                            <span className="font-bold">${(r.rate)}/nt</span>
                         </div>
                      ))}
                   </div>
                </div>

                <div className="bg-white p-6 rounded-xl border shadow-sm">
                   <h2 className="text-xl font-bold mb-4 flex items-center gap-2">Blackout Dates ({properties.find(p => p.id === activePropertyId)?.name})</h2>
                   <form onSubmit={handleCreateBlackout} className="flex gap-4 mb-6">
                      <input name="date" type="date" required className="flex-1 border rounded-lg p-2" />
                      <input name="reason" type="text" placeholder="Reason (e.g. Maintenance)" className="flex-2 border rounded-lg p-2" />
                      <button type="submit" className="bg-black text-white px-4 rounded-lg font-medium hover:bg-gray-800">Add</button>
                   </form>

                   <div className="space-y-2 max-h-64 overflow-y-auto">
                       {activeBlackouts.length === 0 && <p className="text-sm text-gray-500 text-center">No blackouts configured for this property.</p>}
                      {activeBlackouts.map(b => (
                         <div key={b.id} className="border p-3 rounded-lg flex justify-between items-center text-sm">
                            <span className="font-bold">{b.date}</span>
                            <span className="text-gray-500">{b.reason || 'No reason'}</span>
                         </div>
                      ))}
                   </div>
                </div>
            </div>
          )}
       </div>
    </div>
  )
}
