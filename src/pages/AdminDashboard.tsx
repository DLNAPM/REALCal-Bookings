import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, signOut } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { Navigate, useNavigate } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { BlackoutDate, PricingRule, Booking, Property, PropertyManager } from '../types';
import { Users, FileDown, TrendingUp, Settings, Plus, Image as ImageIcon, Trash2, Phone, Mail, Calendar as CalendarIcon, DollarSign, LogOut, ArrowLeft, ArrowRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const AdminDashboard: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [propertyManagers, setPropertyManagers] = useState<PropertyManager[]>([]);
  const [editingManagerId, setEditingManagerId] = useState<string | null>(null);
  const [editingBedrooms, setEditingBedrooms] = useState<{ roomNumber: string; roomLockNumber: string; type: 'Master Bed' | 'Guest Bedroom' }[]>([]);
  
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  
  // Image uploader state
  const [uploadingProperty, setUploadingProperty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  
  if (loading) return <div>Loading...</div>;
  if (!user || user.role !== 'admin') return <Navigate to="/" />;

  useEffect(() => {
    if (!db) return;
    onSnapshot(query(collection(db, 'users')), (snap) => setUsers(snap.docs.map(d => d.data())));
    onSnapshot(query(collection(db, 'bookings')), (snap) => setBookings(snap.docs.map(d => ({id: d.id, ...d.data() } as Booking))));
    onSnapshot(query(collection(db, 'blackout_dates')), (snap) => setBlackouts(snap.docs.map(d => ({id: d.id, ...d.data() } as BlackoutDate))));
    onSnapshot(query(collection(db, 'pricing_rules')), (snap) => setPricingRules(snap.docs.map(d => ({id: d.id, ...d.data() } as PricingRule))));
    onSnapshot(query(collection(db, 'property_managers')), (snap) => setPropertyManagers(snap.docs.map(d => ({id: d.id, ...d.data() } as PropertyManager))));
    onSnapshot(doc(db, 'global_settings', 'settings'), (snap) => {
        if (snap.exists()) {
            setGlobalSettings(snap.data());
        } else {
            setGlobalSettings({
                minDaysDefault: 1,
                minDaysWeekend: 2,
                cancellationRules: [
                    { id: '1', minBookingDays: 1, freeCancelHoursBefore: 48, lateCancelFeePercent: 100 }
                ]
            });
        }
    });

    onSnapshot(query(collection(db, 'properties')), (snap) => {
        const props = snap.docs.map(d => ({id: d.id, ...d.data() } as Property));
        setProperties(props);
        if (props.length > 0 && !activePropertyId) setActivePropertyId(props[0].id);
    });
  }, []);

  useEffect(() => {
    if (activePropertyId) {
        const prop = properties.find(p => p.id === activePropertyId);
        if (prop) {
            setEditingBedrooms(prop.bedrooms || []);
        } else {
            setEditingBedrooms([]);
        }
    } else {
        setEditingBedrooms([]);
    }
  }, [activePropertyId, properties]);

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
      if (!db) return alert("Firebase not configured");
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
      if (!db) return alert("Firebase not configured");
      if(window.confirm('Are you certain? This will orphans bookings...')){
          await deleteDoc(doc(db, 'properties', id));
          if (activePropertyId === id) setActivePropertyId(null);
      }
  }

  const handleCreatePricingRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
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
    if (!db) return alert("Firebase not configured");
    if(!activePropertyId) return alert("Select a property first");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      const startDateStr = fd.get('startDate') as string;
      const endDateStr = fd.get('endDate') as string;
      const reason = fd.get('reason') as string || '';
      
      const start = parseISO(startDateStr);
      const end = endDateStr ? parseISO(endDateStr) : start;
      
      if (end < start) {
         return alert("End date cannot be before start date.");
      }
      
      const days = eachDayOfInterval({ start, end });
      const batch = writeBatch(db);
      
      const newDates = days.map(d => format(d, 'yyyy-MM-dd'));
      const existingBlackouts = blackouts.filter(b => b.propertyId === activePropertyId);
      const existingDates = new Set(existingBlackouts.map(b => b.date));
      
      const datesToAdd = newDates.filter(d => !existingDates.has(d));
      
      if (datesToAdd.length === 0) {
        return alert("All selected dates are already blacked out.");
      }

      datesToAdd.forEach(dateStr => {
          const docRef = doc(collection(db, 'blackout_dates'));
          batch.set(docRef, {
             propertyId: activePropertyId,
             date: dateStr,
             reason,
             createdAt: serverTimestamp()
          });
      });
      await batch.commit();
      
      if (datesToAdd.length < newDates.length) {
          alert(`Added ${datesToAdd.length} dates. Skipped ${newDates.length - datesToAdd.length} dates that were already blacked out.`);
      }
      
      (e.target as HTMLFormElement).reset();
    } catch (e: any) { alert(e.message); }
  }

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
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
    if (!db) return alert("Firebase not configured");
    try {
      await updateDoc(doc(db, 'property_managers', id), { enabled: !enabled });
    } catch (err: any) { alert(err.message); }
  }

  const handleUpdateManager = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await updateDoc(doc(db, 'property_managers', id), {
         name: fd.get('name') as string,
         email: fd.get('email') as string,
         phone: fd.get('phone') as string,
      });
      setEditingManagerId(null);
    } catch (err: any) { alert(err.message); }
  }

  const handleDeleteManager = async (id: string) => {
    if (!db) return alert("Firebase not configured");
    if(window.confirm('Delete this contact?')) {
      await deleteDoc(doc(db, 'property_managers', id));
    }
  }

  const handleUpdateProperty = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!db) return alert("Firebase not configured");
      if (!activePropertyId) return alert("Select a property first");
      const fd = new FormData(e.target as HTMLFormElement);
      try {
          await updateDoc(doc(db, 'properties', activePropertyId), {
              name: fd.get('name') as string,
              description: fd.get('description') as string,
              // Note: images updating requires a separate flow or overriding
          });
          alert("Property updated!");
      } catch (err: any) { alert(err.message); }
  }

  const handleUpdatePropertyImages = async (newImages: string[]) => {
      if (!db || !activePropertyId) return;
      try {
          await updateDoc(doc(db, 'properties', activePropertyId), {
              images: newImages
          });
      } catch (err: any) { alert(err.message); }
  }

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
        const minDaysDefault = parseInt(fd.get('minDaysDefault') as string) || 1;
        const minDaysWeekend = parseInt(fd.get('minDaysWeekend') as string) || 1;
        
        // We will preserve the current cancellation rules or extract them from state
        // For simplicity, we are binding the rules state directly to `globalSettings`
        await setDoc(doc(db, 'global_settings', 'settings'), {
            ...globalSettings,
            minDaysDefault,
            minDaysWeekend,
            updatedAt: serverTimestamp()
        });
        alert("Global Settings Saved!");
    } catch (e: any) {
        alert(e.message);
    }
  }

  const handleUpdateCancellationRule = async (index: number, field: string, value: number) => {
      if (!db) return;
      try {
          const newRules = [...(globalSettings?.cancellationRules || [])];
          newRules[index] = { ...newRules[index], [field]: value };
          
          await setDoc(doc(db, 'global_settings', 'settings'), {
              ...globalSettings,
              cancellationRules: newRules,
              updatedAt: serverTimestamp()
          });
      } catch (e: any) {
          alert(e.message);
      }
  }

  const handleAddCancellationRule = async () => {
      if (!db) return;
      try {
          const newRules = [...(globalSettings?.cancellationRules || []), { id: uuidv4(), minBookingDays: 1, freeCancelHoursBefore: 48, lateCancelFeePercent: 100 }];
          await setDoc(doc(db, 'global_settings', 'settings'), {
              ...globalSettings,
              cancellationRules: newRules,
              updatedAt: serverTimestamp()
          });
      } catch (e: any) {
          alert(e.message);
      }
  }
  
  const handleDeleteCancellationRule = async (id: string) => {
      if (!db) return;
      try {
          const newRules = (globalSettings?.cancellationRules || []).filter((r: any) => r.id !== id);
          await setDoc(doc(db, 'global_settings', 'settings'), {
              ...globalSettings,
              cancellationRules: newRules,
              updatedAt: serverTimestamp()
          });
      } catch (e: any) {
          alert(e.message);
      }
  }

  const handleMoveImage = async (p: Property, currentIndex: number, direction: 'left' | 'right') => {
      if (!db || !activePropertyId) return;
      if (direction === 'left' && currentIndex === 0) return;
      if (direction === 'right' && currentIndex === p.images.length - 1) return;
      
      const newImages = [...p.images];
      const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
      
      // Swap
      [newImages[currentIndex], newImages[targetIndex]] = [newImages[targetIndex], newImages[currentIndex]];
      
      await handleUpdatePropertyImages(newImages);
  };

  const handleSeedTestData = async () => {
    if (!db) return;
    try {
       // Create dummy properties
       const batch = writeBatch(db);
       
       const propRef1 = doc(collection(db, 'properties'));
       batch.set(propRef1, {
           name: "Oceanview Paradise Villa",
           description: "A stunning oceanfront villa with panoramic views, private pool, and luxury detailing.",
           images: ["https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&q=80&w=2000"],
           isTestProperty: true,
           createdAt: serverTimestamp()
       });

       const propRef2 = doc(collection(db, 'properties'));
       batch.set(propRef2, {
           name: "Mountain Retreat Cabin",
           description: "Quiet and cozy cabin nested in the woods, perfect for a relaxing getaway.",
           images: ["https://images.unsplash.com/photo-1542314831-c6a4d14effca?auto=format&fit=crop&q=80&w=2000"],
           isTestProperty: true,
           createdAt: serverTimestamp()
       });

       // Create test manager
       const managerRef = doc(collection(db, 'property_managers'));
       batch.set(managerRef, {
           name: "Test Manager",
           email: "reach_dlaniger@hotmail.com",
           phone: "+15555555555",
           enabled: true,
           createdAt: serverTimestamp()
       });

       await batch.commit();
       alert("Test Database Seeded! reach_dlaniger@hotmail.com added as Manager and demo properties generated.");
    } catch (e: any) {
       alert("Seeding failed: " + e.message);
    }
  };

  const handleDeletePricingRule = async (id: string) => {
    if (!db) return alert("Firebase not configured");
    if(window.confirm('Delete this rule?')) {
      await deleteDoc(doc(db, 'pricing_rules', id));
    }
  }

  const handleDeleteBlackout = async (id: string) => {
    if (!db) return alert("Firebase not configured");
    if(window.confirm('Delete this blackout date?')) {
      await deleteDoc(doc(db, 'blackout_dates', id));
    }
  }

  const handleAdminCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
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
           try {
              const text = await lockRes.text();
              if (text) {
                 const data = JSON.parse(text);
                 accessCode = data.accessCode || '';
              }
           } catch(err) {
              console.warn("Failed to parse provision-lock response", err);
           }
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
  const activeBlackouts = blackouts
    .filter(b => b.propertyId === activePropertyId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="bg-slate-50 min-h-screen p-6 font-sans text-slate-900 overflow-hidden">
       <div className="max-w-7xl mx-auto space-y-5">
          {/* Header Navigation Bento Style */}
          <header className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                 <Settings size={20} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Admin</span></h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 bg-white py-1.5 pl-3 pr-4 rounded-full border border-slate-200 shadow-sm">
                  <div className="text-sm text-right leading-tight">
                    <p className="font-semibold text-slate-800">{user?.displayName || 'Administrator'}</p>
                    <p className="text-xs text-indigo-600 font-medium">Dashboard Control</p>
                  </div>
              </div>
              <button 
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }} 
                className="text-slate-400 hover:text-red-500 transition-colors p-2 bg-white rounded-full border border-slate-200 shadow-sm outline-none w-10 h-10 flex items-center justify-center cursor-pointer"
                title="Logout"
              >
                 <LogOut size={16} />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-1 gap-5">
             <div className="col-span-1 md:col-span-12 bg-indigo-50 rounded-3xl border border-indigo-100 p-6 flex flex-col md:flex-row gap-6 shadow-sm">
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-indigo-900">Admin Quick Stats</h3>
                    <div className="flex gap-2">
                        <button onClick={handleSeedTestData} className="text-xs bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1">
                           Seed Test Data
                        </button>
                        <button onClick={exportCSV} className="text-xs bg-white text-indigo-600 border border-indigo-200 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-1">
                           <FileDown size={14}/> Export CSV
                        </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight flex items-center gap-1"><TrendingUp size={14}/> Total Revenue</p>
                       <p className="text-xl font-bold text-slate-900 mt-1">${(totalRevenue).toFixed(2)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight flex items-center gap-1"><Users size={14}/> Total Users</p>
                       <p className="text-xl font-bold text-slate-900 mt-1">{users.length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight">Active Bookings</p>
                       <p className="text-xl font-bold text-slate-900 mt-1">
                          <span className="text-indigo-600">{bookings.filter(b => b.status==='confirmed').length}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-red-400 text-sm">{totalCancellations} Cancels</span>
                       </p>
                    </div>
                  </div>
                </div>
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Settings className="text-indigo-600" size={20}/> Global Booking Settings</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Minimum Days Config */}
                 <div className="border border-slate-200 p-6 rounded-2xl bg-slate-50">
                    <h3 className="font-bold mb-1 text-slate-800 text-lg">Minimum Required Booking Days</h3>
                    <p className="text-sm text-slate-500 mb-6">Set the default minimum length of stay.</p>
                    
                    <form onSubmit={handleSaveGlobalSettings} className="space-y-4">
                       <div className="flex items-center gap-4">
                           <div className="flex-1">
                               <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Standard (Default) Days</label>
                               <input name="minDaysDefault" type="number" min="1" defaultValue={globalSettings?.minDaysDefault || 1} required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                           </div>
                           <div className="flex-1">
                               <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Weekend Minimum Days</label>
                               <input name="minDaysWeekend" type="number" min="1" defaultValue={globalSettings?.minDaysWeekend || 1} required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                           </div>
                       </div>
                       
                       <button type="submit" className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">Save Global Settings</button>
                    </form>
                 </div>

                 {/* Cancellation Policies */}
                 <div className="border border-slate-200 p-6 rounded-2xl bg-white shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-slate-800 text-lg">Cancellation Policies</h3>
                        <button onClick={handleAddCancellationRule} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-sm font-bold">
                            <Plus size={16}/> Add Rule
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mb-6">Configure late fees based on total length of stay.</p>
                    
                    <div className="space-y-3">
                        {globalSettings?.cancellationRules?.map((rule: any, i: number) => (
                            <div key={rule.id} className="relative bg-slate-50 border border-slate-200 p-4 rounded-xl">
                               <button onClick={() => handleDeleteCancellationRule(rule.id)} className="absolute top-3 right-3 text-red-400 hover:text-red-500 font-bold p-1">X</button>
                               <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                   <div>
                                       <label className="text-[10px] uppercase font-bold text-slate-500 block">Applies to Stays &ge;</label>
                                       <div className="flex items-center gap-1">
                                           <input type="number" min="1" value={rule.minBookingDays} onChange={(e) => handleUpdateCancellationRule(i, 'minBookingDays', parseInt(e.target.value))} className="w-16 border border-slate-200 rounded md p-1 text-sm bg-white" />
                                           <span className="text-xs text-slate-600">days</span>
                                       </div>
                                   </div>
                                   <div>
                                       <label className="text-[10px] uppercase font-bold text-slate-500 block">Free Cancel Untl</label>
                                       <div className="flex items-center gap-1">
                                           <input type="number" min="0" value={rule.freeCancelHoursBefore} onChange={(e) => handleUpdateCancellationRule(i, 'freeCancelHoursBefore', parseInt(e.target.value))} className="w-16 border border-slate-200 rounded md p-1 text-sm bg-white" />
                                           <span className="text-xs text-slate-600">hrs prior</span>
                                       </div>
                                   </div>
                                   <div className="col-span-2 md:col-span-1 border-t border-slate-200 pt-3 md:border-none md:pt-0 mt-2 md:mt-0">
                                       <label className="text-[10px] uppercase font-bold text-slate-500 block">Late Cancel Fee</label>
                                       <div className="flex items-center gap-1 font-bold text-amber-600">
                                           <input type="number" min="0" max="100" value={rule.lateCancelFeePercent} onChange={(e) => handleUpdateCancellationRule(i, 'lateCancelFeePercent', parseInt(e.target.value))} className="w-16 border border-amber-200 rounded md p-1 text-sm bg-amber-50 text-amber-700" />
                                           <span>%</span>
                                       </div>
                                   </div>
                               </div>
                            </div>
                        ))}
                        {(!globalSettings?.cancellationRules || globalSettings.cancellationRules.length === 0) && (
                            <div className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-slate-100">No cancellation rules configured. All cancellations are free at any time.</div>
                        )}
                    </div>
                 </div>
              </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><CalendarIcon size={20}/> Create Manual Booking</h2>
             <form onSubmit={handleAdminCreateBooking} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end bg-slate-50 p-6 rounded-2xl border border-slate-300 border-dashed">
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Property</label>
                   <select name="propertyId" required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 required bg-white shadow-sm">
                      <option value="">Select...</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Check In</label>
                   <input name="checkIn" type="date" required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Check Out</label>
                   <input name="checkOut" type="date" required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Guest Name</label>
                   <input name="guestName" required placeholder="Guest Name" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Total Price ($)</label>
                   <input name="totalPrice" type="number" required placeholder="0.00" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                </div>
                <div className="md:col-span-2 lg:col-span-5 flex justify-end">
                   <button type="submit" className="w-full bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-colors">
                      Create Override Booking
                   </button>
                </div>
             </form>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Phone className="text-indigo-600" size={20}/> Property Management Contacts</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="col-span-1 border border-slate-200 p-4 rounded-2xl bg-slate-50">
                    <h3 className="font-bold mb-4 text-slate-800">Add Contact</h3>
                    <form onSubmit={handleCreateManager} className="space-y-4">
                       <input name="name" required placeholder="Name (e.g. John Doe)" className="w-full border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                       <input name="email" type="email" required placeholder="Email Address" className="w-full border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                       <input name="phone" required placeholder="Phone Number (e.g. +1...)" className="w-full border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                       <button type="submit" className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-500 transition-colors">Save Contact</button>
                    </form>
                 </div>
                 
                 <div className="col-span-1 md:col-span-2 space-y-3">
                    {propertyManagers.length === 0 && <div className="p-8 border border-dashed rounded-2xl text-center text-slate-500 text-sm">No management contacts configured.</div>}
                    {propertyManagers.map(m => (
                       <div key={m.id} className="border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white shadow-sm transition-all h-auto">
                          {editingManagerId === m.id ? (
                              <form onSubmit={(e) => handleUpdateManager(e, m.id)} className="flex-1 flex flex-col gap-3 w-full">
                                  <div className="flex gap-2">
                                     <input name="name" defaultValue={m.name} required placeholder="Name" className="flex-1 border border-slate-200 rounded-lg p-2 text-sm bg-white shadow-sm" />
                                     <input name="phone" defaultValue={m.phone} required placeholder="Phone" className="flex-1 border border-slate-200 rounded-lg p-2 text-sm bg-white shadow-sm" />
                                  </div>
                                  <input name="email" type="email" defaultValue={m.email} required placeholder="Email Address" className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white shadow-sm" />
                                  <div className="flex gap-2 justify-end mt-1">
                                      <button type="button" onClick={() => setEditingManagerId(null)} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                                      <button type="submit" className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-500 transition-colors">Save</button>
                                  </div>
                              </form>
                          ) : (
                              <>
                                  <div className="flex-1 cursor-pointer group" onClick={() => setEditingManagerId(m.id)}>
                                     <h4 className="font-bold text-slate-800 flex items-center gap-2 group-hover:text-indigo-600 transition-colors">
                                        {m.name}
                                        <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                                     </h4>
                                     <div className="flex gap-4 text-sm text-slate-500 mt-1">
                                        <span className="flex items-center gap-1"><Mail size={14}/> {m.email}</span>
                                        <span className="flex items-center gap-1"><Phone size={14}/> {m.phone}</span>
                                     </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                     <label className="flex items-center gap-2 cursor-pointer">
                                       <input type="checkbox" checked={m.enabled} onChange={() => toggleManager(m.id, m.enabled)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
                                       <span className="text-sm font-medium text-slate-700">{m.enabled ? 'Enabled' : 'Disabled'}</span>
                                     </label>
                                     <button type="button" onClick={() => handleDeleteManager(m.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors"><Trash2 size={18}/></button>
                                  </div>
                              </>
                          )}
                       </div>
                    ))}
                 </div>
              </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
             <h2 className="text-2xl font-bold mb-6 text-slate-800">Manage Properties</h2>
             
             <form onSubmit={handleCreateProperty} className="mb-8 p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                 <h3 className="font-bold mb-4 text-slate-800">Add New Property</h3>
                 <div className="space-y-4">
                     <input name="name" required placeholder="Property Name" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                     <textarea name="description" required placeholder="Description..." rows={3} className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                     
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                         <div className="flex justify-between items-center mb-2">
                             <span className="font-medium text-slate-700">Images ({previewImages.length}/15)</span>
                             <label className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-lg cursor-pointer text-sm font-bold flex gap-2 items-center transition-colors">
                                 <ImageIcon size={16} /> Upload Photos
                                 <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} disabled={uploadingProperty || previewImages.length >= 15} />
                             </label>
                         </div>
                         <div className="flex flex-wrap gap-2">
                             {previewImages.map((src, i) => (
                                 <div key={i} className="relative w-20 h-20 group">
                                     <img src={src} className="w-full h-full object-cover rounded-lg" />
                                     <button type="button" onClick={() => setPreviewImages(p => p.filter((_, idx)=>idx!==i))} className="absolute hidden group-hover:flex top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 items-center justify-center text-xs">x</button>
                                 </div>
                             ))}
                             {uploadingProperty && <div className="w-20 h-20 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">Processing...</div>}
                         </div>
                     </div>
                     <button type="submit" disabled={uploadingProperty} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-colors">Save Property</button>
                 </div>
             </form>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {properties.map(p => (
                     <div key={p.id} className={`border p-4 rounded-2xl cursor-pointer transition-colors shadow-sm ${activePropertyId === p.id ? 'ring-2 ring-indigo-600 bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50 border-slate-200 bg-white'}`} onClick={() => setActivePropertyId(p.id)}>
                         {p.images.length > 0 && <img src={p.images[0]} className="w-full h-40 object-cover rounded-xl mb-3 shadow-sm" />}
                         <div className="flex justify-between items-start">
                             <h4 className="font-bold text-lg text-slate-800">{p.name}</h4>
                             <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteProperty(p.id); }} className="text-slate-400 hover:text-red-500 p-1 transition-colors"><Trash2 size={16}/></button>
                         </div>
                         <p className="text-sm text-slate-500 line-clamp-2 mt-1">{p.description}</p>
                         <div className="mt-3 text-xs font-bold text-slate-400 uppercase tracking-widest">{p.images.length} Photos</div>
                     </div>
                 ))}
                 {properties.length === 0 && <div className="col-span-full text-center text-slate-400 p-8 border border-dashed rounded-2xl">No properties configured yet.</div>}
             </div>
          </div>
          
          {activePropertyId && (
            <div className="flex flex-col gap-6 mt-8">
              {/* Edit Property Block */}
              {(() => {
                 const p = properties.find(prop => prop.id === activePropertyId);
                 if (!p) return null;
                 return (
                   <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                      <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">Edit Property Details <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-md">{p.name}</span></h2>
                      <form onSubmit={handleUpdateProperty} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-4">
                             <input name="name" defaultValue={p.name} required placeholder="Property Name" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                             <textarea name="description" defaultValue={p.description} required placeholder="Description..." rows={5} className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                             <label className="flex items-center gap-2 font-medium">
                                <input type="checkbox" name="hasSmartLock" defaultChecked={p.hasSmartLock} className="w-4 h-4 text-indigo-600" />
                                Has SmartLock
                             </label>
                             <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-colors">Update Info</button>
                         </div>
                         <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                             <h4 className="font-bold">Bedrooms</h4>
                             {editingBedrooms.map((b, i) => (
                                 <div key={i} className="flex gap-2 text-sm bg-white p-2 rounded border border-slate-200">
                                     <span>{b.type}: {b.roomNumber} (Lock: {b.roomLockNumber}, {b.sqFt} sq ft)</span>
                                     <button type="button" onClick={() => setEditingBedrooms(prev => prev.filter((_, idx) => idx !== i))} className="text-red-500 ml-auto">X</button>
                                 </div>
                             ))}
                             <input type="text" id="newRoomNumber" placeholder="Room #" className="w-full p-2 border rounded" />
                             <input type="text" id="newRoomLock" placeholder="Lock #" className="w-full p-2 border rounded" />
                             <input type="number" id="newRoomSqFt" placeholder="Sq ft." className="w-full p-2 border rounded" />
                             <select id="newRoomType" className="w-full p-2 border rounded">
                                 <option value="Master Bed">Master Bed</option>
                                 <option value="Guest Bedroom">Guest Bedroom</option>
                             </select>
                             <button type="button" onClick={() => {
                                 const roomNumber = (document.getElementById('newRoomNumber') as HTMLInputElement).value;
                                 const roomLockNumber = (document.getElementById('newRoomLock') as HTMLInputElement).value;
                                 const sqFt = parseInt((document.getElementById('newRoomSqFt') as HTMLInputElement).value || '0');
                                 const type = (document.getElementById('newRoomType') as HTMLSelectElement).value as 'Master Bed' | 'Guest Bedroom';
                                 if(roomNumber && roomLockNumber) {
                                     setEditingBedrooms(prev => [...prev, { roomNumber, roomLockNumber, type, sqFt }]);
                                 }
                             }} className="w-full bg-slate-800 text-white p-2 rounded font-bold">Add Room</button>
                         </div>
                         <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                             <div className="flex justify-between items-center mb-4">
                                 <span className="font-medium text-slate-700">Images ({p.images.length}/15)</span>
                                 <label className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg cursor-pointer text-sm font-bold flex gap-2 items-center transition-colors">
                                     <ImageIcon size={14} /> Add Photos
                                     <input type="file" multiple accept="image/*" className="hidden" disabled={uploadingProperty || p.images.length >= 15} onChange={async (e) => {
                                         if (!e.target.files) return;
                                         setUploadingProperty(true);
                                         try {
                                             const files = Array.from(e.target.files).slice(0, 15 - p.images.length);
                                             const compressed = await Promise.all(files.map(f => compressImage(f as File)));
                                             await handleUpdatePropertyImages([...p.images, ...compressed]);
                                         } catch (err) { console.error(err); }
                                         setUploadingProperty(false);
                                     }} />
                                 </label>
                             </div>
                             <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto pr-2">
                                 {p.images.map((src, i) => (
                                     <div key={i} className="relative w-20 h-20 group">
                                         <img src={src} className="w-full h-full object-cover rounded-lg border border-slate-200" />
                                         <button type="button" onClick={() => handleUpdatePropertyImages(p.images.filter((_, idx)=>idx!==i))} className="absolute hidden group-hover:flex top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 items-center justify-center text-xs shadow-sm">x</button>
                                         <div className="absolute hidden group-hover:flex bottom-1 left-0 right-0 justify-center gap-1">
                                             {i > 0 && (
                                                <button type="button" onClick={() => handleMoveImage(p, i, 'left')} className="bg-slate-800/80 text-white p-1 rounded hover:bg-slate-800 transition-colors">
                                                    <ArrowLeft size={12} />
                                                </button>
                                             )}
                                             {i < p.images.length - 1 && (
                                                <button type="button" onClick={() => handleMoveImage(p, i, 'right')} className="bg-slate-800/80 text-white p-1 rounded hover:bg-slate-800 transition-colors">
                                                    <ArrowRight size={12} />
                                                </button>
                                             )}
                                         </div>
                                     </div>
                                 ))}
                                 {uploadingProperty && <div className="w-20 h-20 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500">Wait...</div>}
                             </div>
                         </div>
                      </form>
                   </div>
                 );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                   <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">Pricing Rules <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-md">{properties.find(p => p.id === activePropertyId)?.name}</span></h2>
                   <form onSubmit={handleCreatePricingRule} className="space-y-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Type</label>
                            <select name="type" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 required bg-white shadow-sm">
                               <option value="default">Default Layer</option>
                               <option value="weekend">Weekend Override</option>
                               <option value="holiday">Holiday Promo/Surge</option>
                               <option value="custom">Custom Range</option>
                            </select>
                         </div>
                         <div>
                             <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Per Night ($)</label>
                             <input name="rate" type="number" required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" placeholder="150" />
                         </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Start Date</label>
                              <input name="startDate" type="date" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">End Date</label>
                              <input name="endDate" type="date" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                          </div>
                      </div>
                      <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 transition-colors">Add Rule</button>
                   </form>

                   <div className="space-y-2">
                       {activeRules.length === 0 && <p className="text-sm text-slate-500 text-center">No rules configured for this property.</p>}
                      {activeRules.map(r => (
                         <div key={r.id} className="border border-slate-200 p-3 rounded-xl flex justify-between items-center text-sm shadow-sm bg-white group">
                            <div>
                               <span className="font-bold capitalize text-slate-800">{r.type}</span>
                               {r.startDate && <span className="text-slate-500 ml-2">({r.startDate} to {r.endDate})</span>}
                            </div>
                            <div className="flex items-center gap-3">
                               <span className="font-bold text-indigo-600">${(r.rate)}/nt</span>
                               <button type="button" onClick={() => handleDeletePricingRule(r.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                   <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">Blackout Dates <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-md">{properties.find(p => p.id === activePropertyId)?.name}</span></h2>
                   <form onSubmit={handleCreateBlackout} className="flex flex-col sm:flex-row gap-2 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="flex-1 flex gap-2">
                          <input name="startDate" type="date" required className="w-1/2 border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                          <input name="endDate" type="date" className="w-1/2 border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" title="Optional end date for multi-day blackouts" />
                      </div>
                      <input name="reason" type="text" placeholder="Reason (e.g. Maintenance)" className="flex-1 md:flex-2 border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                      <button type="submit" className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-500 transition-colors">Add</button>
                   </form>

                   <div className="space-y-2 max-h-[340px] overflow-y-auto pr-2">
                       {activeBlackouts.length === 0 && <p className="text-sm text-slate-500 text-center">No blackouts configured for this property.</p>}
                      {activeBlackouts.map(b => (
                         <div key={b.id} className="border border-slate-200 p-3 rounded-xl flex justify-between items-center text-sm shadow-sm bg-white group">
                            <div>
                               <span className="font-bold text-slate-800">{b.date}</span>
                               <span className="text-slate-500 ml-3">{b.reason || 'No reason'}</span>
                            </div>
                            <button type="button" onClick={() => handleDeleteBlackout(b.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                         </div>
                      ))}
                   </div>
                </div>
              </div>
            </div>
          )}
       </div>
    </div>
  )
}
