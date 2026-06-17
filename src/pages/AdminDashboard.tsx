import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, signOut } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, writeBatch, orderBy } from 'firebase/firestore';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO, addDays } from 'date-fns';
import { cn } from '../lib/utils';
import { BlackoutDate, PricingRule, Booking, Property, PropertyManager } from '../types';
import { Users, FileDown, TrendingUp, Settings, Plus, Image as ImageIcon, Trash2, Phone, Mail, Calendar as CalendarIcon, DollarSign, LogOut, ArrowLeft, ArrowRight, RefreshCw, MessageSquare, CheckCircle, Loader2, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const formatPhoneE164 = (phone: string) => {
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, and it's 10 digits, assume US (+1)
  if (!cleaned.startsWith('+') && cleaned.length === 10) {
    cleaned = '+1' + cleaned;
  }
  
  return cleaned;
};

const formatBookedDateTime = (createdAt: any) => {
  if (!createdAt) return 'N/A';
  try {
    let date: Date;
    if (typeof createdAt.toDate === 'function') {
      date = createdAt.toDate();
    } else if (createdAt.seconds) {
      date = new Date(createdAt.seconds * 1000);
    } else if (typeof createdAt.toMillis === 'function') {
      date = new Date(createdAt.toMillis());
    } else {
      date = new Date(createdAt);
    }
    
    if (isNaN(date.getTime())) return 'N/A';
    
    return format(date, 'MMM d, yyyy h:mm a');
  } catch (e) {
    return 'N/A';
  }
};

export const AdminDashboard: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [leaseRequests, setLeaseRequests] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [approvingLeaseId, setApprovingLeaseId] = useState<string | null>(null);
  const [leaseGenerationError, setLeaseGenerationError] = useState<string | null>(null);
  const [leaseCodes, setLeaseCodes] = useState<Record<string, string>>({});
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [pricingTarget, setPricingTarget] = useState<'property' | 'room'>('property');
  const [selectedRoomForPricing, setSelectedRoomForPricing] = useState<string | null>(null);
  const [blackoutTarget, setBlackoutTarget] = useState<'property' | 'room'>('property');
  const [selectedRoomForBlackout, setSelectedRoomForBlackout] = useState<string | null>(null);
  const [selectedBlackoutIds, setSelectedBlackoutIds] = useState<string[]>([]);
  const [propertyManagers, setPropertyManagers] = useState<PropertyManager[]>([]);
  const [editingManagerId, setEditingManagerId] = useState<string | null>(null);
  const [editingBedrooms, setEditingBedrooms] = useState<{ roomNumber: string; roomLockNumber: string; type: 'Master Bed' | 'Guest Bedroom'; sqFt: number; fee: number }[]>([]);
  
  // Manual booking states
  const [manualBookingPropId, setManualBookingPropId] = useState<string>('');
  const [manualBookingRooms, setManualBookingRooms] = useState<string[]>([]);
  const [manualBookingCheckIn, setManualBookingCheckIn] = useState<string>('');
  const [manualBookingCheckOut, setManualBookingCheckOut] = useState<string>('');
  const [editingAccessCodeId, setEditingAccessCodeId] = useState<string | null>(null);
  const [editHasSmartLock, setEditHasSmartLock] = useState<boolean>(false);
  const [createHasSmartLock, setCreateHasSmartLock] = useState<boolean>(false);

  // Invoice-related states for Manual Booking
  const [createInvoiceForPayment, setCreateInvoiceForPayment] = useState<boolean>(false);
  const [showInvoiceTemplate, setShowInvoiceTemplate] = useState<boolean>(false);
  const [pendingBookingData, setPendingBookingData] = useState<any | null>(null);
  
  const [invoiceSponsorName, setInvoiceSponsorName] = useState<string>('');
  const [invoiceSponsorEmail, setInvoiceSponsorEmail] = useState<string>('');
  const [invoiceSponsorPhone, setInvoiceSponsorPhone] = useState<string>('');
  const [invoiceSponsorAddress, setInvoiceSponsorAddress] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>('');
  const [invoiceCustomNotes, setInvoiceCustomNotes] = useState<string>('');
  const [sendingInvoice, setSendingInvoice] = useState<boolean>(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);

  // User profile editing states
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserRole, setEditUserRole] = useState<'user' | 'admin'>('user');
  const [editUserDisplayName, setEditUserDisplayName] = useState('');
  const [editUserPhotoURL, setEditUserPhotoURL] = useState('');
  const [editUserTollFreeAccept, setEditUserTollFreeAccept] = useState(false);
  const [updatingUser, setUpdatingUser] = useState(false);

  const [globalSettings, setGlobalSettings] = useState<any>(null);
  
  // Image uploader state
  const [uploadingProperty, setUploadingProperty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [selectedCreateImageIndex, setSelectedCreateImageIndex] = useState<number | null>(null);
  const [selectedEditImageIndex, setSelectedEditImageIndex] = useState<number | null>(null);

  const moveImageInArray = (arr: string[], fromIndex: number, toIndex: number): string[] => {
      const result = [...arr];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
  };
  
  if (loading) return <div>Loading...</div>;
  if (!user || (user.role !== 'admin' && user.email !== 'dlaniger.napm.consulting@gmail.com')) return <Navigate to="/" />;

  useEffect(() => {
    if (!db) return;
    onSnapshot(query(collection(db, 'users')), (snap) => setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() }))), (error) => {
      console.error("Admin users snapshot error:", error);
    });
    onSnapshot(query(collection(db, 'bookings')), (snap) => setBookings(snap.docs.map(d => ({id: d.id, ...d.data() } as Booking))), (error) => {
      console.error("Admin bookings snapshot error:", error);
    });
    onSnapshot(query(collection(db, 'blackout_dates')), (snap) => setBlackouts(snap.docs.map(d => ({id: d.id, ...d.data() } as BlackoutDate))), (error) => {
      console.error("Admin blackout dates snapshot error:", error);
    });
    onSnapshot(query(collection(db, 'pricing_rules')), (snap) => setPricingRules(snap.docs.map(d => ({id: d.id, ...d.data() } as PricingRule))), (error) => {
      console.error("Admin pricing rules snapshot error:", error);
    });
    onSnapshot(query(collection(db, 'property_managers')), (snap) => setPropertyManagers(snap.docs.map(d => ({id: d.id, ...d.data() } as PropertyManager))), (error) => {
      console.error("Admin property managers snapshot error:", error);
    });
    onSnapshot(query(collection(db, 'lease_requests')), (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setLeaseRequests(reqs);
      setLeaseCodes(prev => {
        const copy = { ...prev };
        reqs.forEach(r => {
          if (r.status === 'pending' && !copy[r.id]) {
            copy[r.id] = 'LSE-' + Math.random().toString(36).substring(2, 7).toUpperCase();
          }
        });
        return copy;
      });
    }, (error) => {
      console.error("Admin lease_requests snapshot error:", error);
    });
    onSnapshot(query(collection(db, 'leases')), (snap) => {
      setLeases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Admin leases snapshot error:", error);
    });
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
    }, (error) => {
      console.error("Admin settings snapshot error:", error);
    });

    onSnapshot(query(collection(db, 'properties'), orderBy('createdAt', 'desc')), (snap) => {
        const props = snap.docs.map(d => ({id: d.id, ...d.data() } as Property));
        setProperties(props);
        if (props.length > 0 && !activePropertyId) setActivePropertyId(props[0].id);
    }, (error) => {
      console.error("Admin properties snapshot error:", error);
    });
  }, []);

  useEffect(() => {
    if (activePropertyId) {
        const prop = properties.find(p => p.id === activePropertyId);
        if (prop) {
            setEditingBedrooms(prop.bedrooms || []);
            setEditHasSmartLock(prop.hasSmartLock || false);
        } else {
            setEditingBedrooms([]);
            setEditHasSmartLock(false);
        }
    } else {
        setEditingBedrooms([]);
        setEditHasSmartLock(false);
    }
  }, [activePropertyId, properties]);

  const handleRefreshUsers = async () => {
    if (!db) return;
    setRefreshingUsers(true);
    try {
      const snap = await getDocs(query(collection(db, 'users')));
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch (error) {
      console.error("Manual refresh users error:", error);
    } finally {
      // Small timeout to give visual feedback
      setTimeout(() => setRefreshingUsers(false), 600);
    }
  };

  const handleStartEditUser = (u: any) => {
    setEditingUser(u);
    setEditUserRole(u.role || 'user');
    setEditUserDisplayName(u.displayName || '');
    setEditUserPhotoURL(u.photoURL || '');
    setEditUserTollFreeAccept(!!u.tollFreeAccept);
  };

  const handleUpdateUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !db) return;
    setUpdatingUser(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        role: editUserRole,
        displayName: editUserDisplayName,
        photoURL: editUserPhotoURL,
        tollFreeAccept: editUserTollFreeAccept,
      });
      setEditingUser(null);
    } catch (err: any) {
      alert(`Failed to update user profile: ${err.message}`);
    } finally {
      setUpdatingUser(false);
    }
  };

  const totalRevenue = bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + b.totalPrice, 0);
  const totalCancellations = bookings.filter(b => b.status === 'cancelled').length;

  const exportCSV = () => {
    const header = "Booking ID,Property ID,User ID,Check In,Check Out,Status,Total Price,Rooms\n";
    const rows = bookings.map(b => {
      const rooms = b.selectedBedrooms ? b.selectedBedrooms.map(r => r.roomNumber).join(";") : (b.selectedBedroom?.roomNumber || "Entire Property");
      return `${b.id},${b.propertyId || ''},${b.userId},${b.checkIn},${b.checkOut},${b.status},${(b.totalPrice / 100).toFixed(2)},${rooms}`;
    }).join("\n");
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
      const remainingSlots = 35 - previewImages.length;
      if (files.length > remainingSlots) {
          alert(`You can only upload up to 35 images. (\${remainingSlots} slots remaining)`);
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
          const hasSmartLock = fd.get('hasSmartLock') === 'on';
          const docRef = await addDoc(collection(db, 'properties'), {
              name: fd.get('name') as string,
              location: fd.get('location') as string,
              description: fd.get('description') as string,
              images: previewImages,
              hasSmartLock,
              frontDoorCode: hasSmartLock ? (fd.get('frontDoorCode') as string || '') : '',
              allowIndividualRoomRental: fd.get('allowIndividualRoomRental') === 'on',
              bedrooms: [],
              createdAt: serverTimestamp()
          });
          (e.target as HTMLFormElement).reset();
          setPreviewImages([]);
          setCreateHasSmartLock(false);
          setActivePropertyId(docRef.id);
          alert("Property created and selected for editing!");
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
         targetType: pricingTarget,
         roomNumber: pricingTarget === 'room' ? selectedRoomForPricing : null,
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
      const targetType = fd.get('targetType') as 'property' | 'room';
      const roomNumber = fd.get('roomNumber') as string || null;
      
      const start = parseISO(startDateStr);
      const end = endDateStr ? addDays(parseISO(endDateStr), 0) : start;
      
      const parsedEnd = endDateStr ? parseISO(endDateStr) : start;
      if (parsedEnd < start) {
         return alert("End date cannot be before start date.");
      }
      
      const days = eachDayOfInterval({ start, end: parsedEnd });
      const batch = writeBatch(db);
      
      const newDates = days.map(d => format(d, 'yyyy-MM-dd'));
      const existingBlackouts = blackouts.filter(b => 
        b.propertyId === activePropertyId && 
        b.targetType === targetType && 
        b.roomNumber === roomNumber
      );
      const existingDates = new Set(existingBlackouts.map(b => b.date));
      
      const datesToAdd = newDates.filter(d => !existingDates.has(d));
      
      if (datesToAdd.length === 0) {
        return alert("All selected dates are already blacked out for this target.");
      }

      datesToAdd.forEach(dateStr => {
          const docRef = doc(collection(db, 'blackout_dates'));
          batch.set(docRef, {
             propertyId: activePropertyId,
             date: dateStr,
             reason,
             targetType,
             roomNumber,
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

  const handleApproveLease = async (reqObj: any, customLeaseCode: string) => {
    if (!db) return;
    if (!customLeaseCode || !customLeaseCode.trim()) {
      alert("Please enter a valid Lease Code before approving.");
      return;
    }
    setApprovingLeaseId(reqObj.id);
    setLeaseGenerationError(null);
    try {
      const response = await fetch('/api/approve-lease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: reqObj.id,
          leaseCode: customLeaseCode.trim(),
          propertyId: reqObj.propertyId,
          propertyNameOrRoom: reqObj.propertyNameOrRoom,
          startDate: reqObj.startDate,
          endDate: reqObj.endDate,
          tenantName: reqObj.tenantName,
          tenantEmail: reqObj.tenantEmail,
          tenantPhone: reqObj.tenantPhone || ""
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Approval failed');
      }
      
      alert(`Lease request approved successfully! Code assigned: ${customLeaseCode}`);
      setLeaseCodes(prev => {
        const copy = { ...prev };
        delete copy[reqObj.id];
        return copy;
      });
    } catch (err: any) {
      console.error("Error approving lease:", err);
      setLeaseGenerationError(err.message || 'An error occurred during lease approval');
      alert(`Error approving lease: ${err.message}`);
    } finally {
      setApprovingLeaseId(null);
    }
  };
  
  const handleDeleteLeaseRequest = async (id: string) => {
    if (!db) return;
    if (window.confirm("Are you sure you want to delete this lease request?")) {
      try {
        await deleteDoc(doc(db, 'lease_requests', id));
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const handleDeleteActiveLease = async (id: string) => {
    if (!db) return;
    if (window.confirm("Are you sure you want to delete this active lease? Doing so will invalidate the lease code.")) {
      try {
        await deleteDoc(doc(db, 'leases', id));
      } catch (err: any) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await addDoc(collection(db, 'property_managers'), {
         name: fd.get('name') as string,
         email: fd.get('email') as string,
         phone: formatPhoneE164(fd.get('phone') as string),
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
         phone: formatPhoneE164(fd.get('phone') as string),
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
          const hasSmartLock = fd.get('hasSmartLock') === 'on';
          await updateDoc(doc(db, 'properties', activePropertyId), {
              name: fd.get('name') as string,
              location: fd.get('location') as string,
              description: fd.get('description') as string,
              hasSmartLock,
              frontDoorCode: hasSmartLock ? (fd.get('frontDoorCode') as string || '') : '',
              allowIndividualRoomRental: fd.get('allowIndividualRoomRental') === 'on',
              bedrooms: editingBedrooms,
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
        const lateCheckoutFeePercent = parseFloat(fd.get('lateCheckoutFeePercent') as string) || 0;
        
        await setDoc(doc(db, 'global_settings', 'settings'), {
            ...globalSettings,
            minDaysDefault,
            minDaysWeekend,
            lateCheckoutFeePercent,
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
      setSelectedBlackoutIds(prev => prev.filter(bid => bid !== id));
    }
  }

  const handleDeleteMultipleBlackouts = async () => {
    if (!db || selectedBlackoutIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedBlackoutIds.length} selected blackout dates?`)) {
      try {
        const batch = writeBatch(db);
        selectedBlackoutIds.forEach(id => {
          batch.delete(doc(db, 'blackout_dates', id));
        });
        await batch.commit();
        setSelectedBlackoutIds([]);
      } catch (err: any) {
        alert("Batch deletion failed: " + err.message);
      }
    }
  }

  const toggleBlackoutSelection = (id: string) => {
    setSelectedBlackoutIds(prev => 
      prev.includes(id) ? prev.filter(bid => bid !== id) : [...prev, id]
    );
  };

  const toggleSelectAllBlackouts = () => {
    if (selectedBlackoutIds.length === activeBlackouts.length) {
      setSelectedBlackoutIds([]);
    } else {
      setSelectedBlackoutIds(activeBlackouts.map(b => b.id));
    }
  };

  const handleSendInvoiceAndCompleteBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    if (!pendingBookingData) return alert("No pending reservation data");
    if (!invoiceSponsorName.trim() || !invoiceSponsorEmail.trim()) {
      return alert("Please fill in Sponsor Name and Sponsor Billing Email");
    }

    setSendingInvoice(true);

    try {
      const { propertyId, checkIn, checkOut, guestName, guestEmail, guestPhone, totalPrice: totalAmountStr, accessCode: manualAccessCode, manualBookingRooms, formElement } = pendingBookingData;
      const bookingId = uuidv4();
      const payloadUserId = user?.uid || 'admin-override';

      const prop = properties.find(p => p.id === propertyId);
      const propertyName = prop ? prop.name : "Premium Villa";
      let accessCode = manualAccessCode.trim();

      if (!accessCode) {
          if (prop?.hasSmartLock && prop?.frontDoorCode) {
              accessCode = prop.frontDoorCode;
          } else {
              try {
                  const lockRes = await fetch('/api/provision-lock', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ checkIn, checkOut, name: guestName })
                  });
                  if (lockRes.ok) {
                     const text = await lockRes.text();
                     if (text) {
                        const data = JSON.parse(text);
                        accessCode = data.accessCode || '';
                     }
                  }
              } catch (err) {
                  console.warn("API lock provisioning failed:", err);
              }
          }
      }

      const selectedBedroomObjects = (prop?.bedrooms || []).filter(b => manualBookingRooms.includes(b.roomNumber));
      const finalPriceCents = Math.round(Number(totalAmountStr) * 100);

      let stripePaymentUrl = '';
      try {
         const payLinkRes = await fetch('/api/create-invoice-checkout-session', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 bookingId,
                 amount: Number(totalAmountStr),
                 invoiceNumber,
                 guestName,
                 propertyName,
                 checkIn,
                 checkOut,
                 sponsorEmail: invoiceSponsorEmail
             })
         });
         if (payLinkRes.ok) {
             const payLinkData = await payLinkRes.json();
             stripePaymentUrl = payLinkData.url || '';
         } else {
             console.warn("Could not create Stripe Checkout Session, status code", payLinkRes.status);
         }
      } catch (err) {
         console.warn("Failed to generate stripe payment checkout session url:", err);
      }

      const invoiceDetails = {
         sponsorName: invoiceSponsorName,
         sponsorEmail: invoiceSponsorEmail,
         sponsorPhone: invoiceSponsorPhone,
         sponsorAddress: invoiceSponsorAddress,
         invoiceNumber: invoiceNumber,
         dueDate: invoiceDueDate,
         customNotes: invoiceCustomNotes,
         sentAt: new Date().toISOString(),
         stripePaymentUrl: stripePaymentUrl || null
      };

      const payload: any = {
         userId: payloadUserId,
         propertyId,
         checkIn,
         checkOut,
         status: 'confirmed',
         totalPrice: finalPriceCents,
         guestName: guestName || '',
         guestEmail: guestEmail,
         guestPhone: guestPhone,
         guests: 1,
         selectedBedrooms: selectedBedroomObjects.length > 0 ? selectedBedroomObjects : null,
         createdAt: serverTimestamp(),
         updatedAt: serverTimestamp(),
         invoiceDetails,
         invoiceEmailed: true
      };

      if (accessCode) payload.accessCode = accessCode;

      let totalNights = 1;
      try {
        const d1 = new Date(checkIn);
        const d2 = new Date(checkOut);
        const diff = d2.getTime() - d1.getTime();
        totalNights = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
      } catch(e) {}

      const invoiceHtml = `
<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px; color: #1e293b; background-color: #ffffff;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
            <td style="vertical-align: middle;">
                <div style="font-size: 26px; font-weight: bold; color: #4f46e5; letter-spacing: -0.05em; display: inline-block;">
                    REALCal <span style="font-weight: 300; color: #0f172a;">Bookings</span>
                </div>
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; font-weight: bold; margin-top: 4px;">
                    Premium Luxury Lodging & Hospitality
                </div>
            </td>
            <td style="text-align: right; vertical-align: middle;">
                <div style="font-size: 18px; font-weight: bold; color: #1e293b;">INVOICE</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">No: <strong>${invoiceNumber}</strong></div>
                <div style="font-size: 12px; color: #64748b;">Due Date: ${invoiceDueDate}</div>
            </td>
        </tr>
    </table>
    
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;" />

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
            <td style="width: 50%; padding-right: 12px; vertical-align: top;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #4f46e5; margin-bottom: 6px;">Bill From</div>
                <div style="font-size: 14px; font-weight: bold; color: #0f172a;">REALCal Bookings</div>
                <div style="font-size: 12px; color: #475569; margin-top: 2px;">
                    C.&S.H. Group Properties, LLC
                </div>
                <div style="font-size: 12px; color: #475569;">
                    billing@cashgroupproperties.com
                </div>
            </td>
            <td style="width: 50%; padding-left: 12px; vertical-align: top;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #4f46e5; margin-bottom: 6px;">Bill To (Sponsor / Agency / 3rd Party)</div>
                <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${invoiceSponsorName}</div>
                <div style="font-size: 12px; color: #475569; margin-top: 2px;">${invoiceSponsorEmail}</div>
                ${invoiceSponsorPhone ? `<div style="font-size: 12px; color: #475569;">${invoiceSponsorPhone}</div>` : ''}
                ${invoiceSponsorAddress ? `<div style="font-size: 12px; color: #475569; white-space: pre-wrap; margin-top: 4px;">${invoiceSponsorAddress}</div>` : ''}
            </td>
        </tr>
    </table>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #475569; margin-bottom: 10px;">Lodging Details & Guest Coverage</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Guest Name:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">${guestName}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Property:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">${propertyName}</td>
            </tr>
            ${manualBookingRooms.length > 0 ? `
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Room(s):</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">Rooms ${manualBookingRooms.join(', ')}</td>
            </tr>
            ` : ''}
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Stay Dates:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">${checkIn} to ${checkOut}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Stay Duration:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">${totalNights} Night(s)</td>
            </tr>
        </table>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
            <tr style="border-bottom: 2px solid #cbd5e1;">
                <th style="text-align: left; padding: 8px 0; color: #475569;">Description</th>
                <th style="text-align: right; padding: 8px 0; color: #475569;">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #0f172a; font-weight: 500;">
                    Guest Rental Override Access Fee<br/>
                    <span style="font-size: 11px; color: #64748b;">Lodging charge for the entire stay interval</span>
                </td>
                <td style="padding: 10px 0; text-align: right; color: #0f172a; font-weight: bold; font-family: Courier, monospace;">$ ${Number(totalAmountStr).toFixed(2)}</td>
            </tr>
            <tr>
                <td style="padding: 12px 0 4px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Grand Total:</td>
                <td style="padding: 12px 0 4px 0; text-align: right; font-size: 16px; font-weight: bold; color: #4f46e5; font-family: Courier, monospace;">$ ${Number(totalAmountStr).toFixed(2)}</td>
            </tr>
        </tbody>
    </table>

    ${stripePaymentUrl ? `
    <div style="background-color: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 15px; font-weight: bold; color: #166534; margin-bottom: 6px;">
            Secure Online Payment
        </div>
        <div style="font-size: 12px; color: #1e7040; margin-bottom: 14px; line-height: 1.5;">
            You can pay this invoice safely online using your credit / debit card via Stripe.
        </div>
        <a href="${stripePaymentUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); transition: background-color 0.2s;">
            Pay Invoice with Stripe &rarr;
        </a>
    </div>
    ` : ''}

    ${invoiceCustomNotes ? `
    <div style="border-left: 3px solid #cbd5e1; padding-left: 12px; margin-bottom: 24px; font-size: 12px; color: #475569; font-style: italic;">
        ${invoiceCustomNotes}
    </div>
    ` : ''}

    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;" />

    <div style="text-align: center; font-size: 11px; color: #94a3b8; font-weight: 500;">
        This invoice is generated on behalf of the lodging provider.
        <br />
        <strong style="color: #64748b; margin-top: 4px; display: inline-block;">C.&S.H. Group Properties, LLC</strong>
    </div>
</div>
`;

      const invoiceText = `
INVOICE
-------
Invoice Number: ${invoiceNumber}
Due Date: ${invoiceDueDate}
From: REALCal Bookings (C.&S.H. Group Properties, LLC)
To (Sponsor): ${invoiceSponsorName} (${invoiceSponsorEmail})

Guest Details:
Guest Name: ${guestName}
Property: ${propertyName}
Dates: ${checkIn} to ${checkOut} (${totalNights} Night(s))

Summary of Charges:
Guest Rental Override Access Fee: $${Number(totalAmountStr).toFixed(2)}
Grand Total Due: $${Number(totalAmountStr).toFixed(2)}

${stripePaymentUrl ? `SECURE ONLINE PAYMENT LINK:\nClick here to pay this invoice securely via Stripe:\n${stripePaymentUrl}\n` : ''}

Notes: ${invoiceCustomNotes}

Thank you,
C.&S.H. Group Properties, LLC
`;

      console.log("[Admin] Sending Email to Sponsor:", invoiceSponsorEmail);
      const emailRes = await fetch("/api/send-invoice-email", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           to: invoiceSponsorEmail.trim(),
           subject: `Invoice ${invoiceNumber}: Lodging for ${guestName} at ${propertyName}`,
           html: invoiceHtml,
           text: invoiceText
         })
      });

      if (!emailRes.ok) {
         const errText = await emailRes.text();
         throw new Error(`Failed to send invoice email: ${errText}`);
      }

      await setDoc(doc(db, 'bookings', bookingId), payload);

      try {
          const checkOutDate = new Date(checkOut + 'T12:00:00');
          const dayAfterDate = new Date(checkOutDate);
          dayAfterDate.setDate(dayAfterDate.getDate() + 1);
          const blackoutDateString = dayAfterDate.toISOString().split('T')[0];
          
          if (manualBookingRooms.length > 0) {
              const batch = writeBatch(db);
              manualBookingRooms.forEach(roomNum => {
                  batch.set(doc(db, 'blackout_dates', `maint-${bookingId}-${roomNum}`), {
                      propertyId,
                      date: blackoutDateString,
                      targetType: 'room',
                      roomNumber: roomNum,
                      reason: `Maintenance/Cleaning for Booking Override (Room ${roomNum})`,
                      createdAt: serverTimestamp()
                  });
              });
              await batch.commit();
          } else {
              await setDoc(doc(db, 'blackout_dates', `maint-${bookingId}`), {
                  propertyId,
                  date: blackoutDateString,
                  targetType: 'property',
                  roomNumber: null,
                  reason: `Maintenance/Cleaning for Booking Override`,
                  createdAt: serverTimestamp()
              });
          }
      } catch (blackoutErr) {
          console.warn("Failed to create auto-blackout on invoice create", blackoutErr);
      }

      try {
         const managers = propertyManagers.filter(m => m.enabled);
         if (managers.length > 0 || guestPhone || guestEmail) {
            await fetch('/api/notify-managers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                 managers,
                 bookingDetails: {
                    checkIn: checkIn,
                    checkOut: checkOut,
                    totalAmount: finalPriceCents,
                    propertyName: propertyName,
                    guestName: guestName,
                    guestPhone: guestPhone,
                    guestEmail: guestEmail,
                    accessCode: accessCode,
                    selectedBedrooms: selectedBedroomObjects
                 }
              })
            });
         }
      } catch (notifyErr) {
         console.error("Manager notification failed, but booking succeeded", notifyErr);
      }

      alert(`Success! Invoice ${invoiceNumber} sent automatically to ${invoiceSponsorEmail}. Manual booking is now Completely Booked!`);
      
      if (formElement) formElement.reset();
      setManualBookingPropId('');
      setManualBookingRooms([]);
      setManualBookingCheckIn('');
      setManualBookingCheckOut('');
      setCreateInvoiceForPayment(false);
      setShowInvoiceTemplate(false);
      setPendingBookingData(null);

    } catch(err: any) {
      alert("Error generating invoice or creating booking: " + err.message);
    } finally {
      setSendingInvoice(false);
    }
  };

  const handleAdminCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    const fd = new FormData(e.target as HTMLFormElement);
    const formPropId = fd.get('propertyId') as string;
    const checkIn = fd.get('checkIn') as string;
    const checkOut = fd.get('checkOut') as string;
    const guestName = fd.get('guestName') as string;
    const guestEmail = fd.get('guestEmail') as string || '';
    const guestPhoneInput = fd.get('guestPhone') as string;
    const guestPhone = guestPhoneInput ? formatPhoneE164(guestPhoneInput) : "";
    const totalAmountStr = fd.get('totalPrice') as string;
    const manualAccessCode = fd.get('accessCode') as string || '';

    if (checkIn && checkOut) {
       const start = parseISO(checkIn);
       const end = parseISO(checkOut);
       if (end <= start) {
          return alert("Check-out date must be after Check-in date.");
       }
    }

    if (createInvoiceForPayment) {
        if (!formPropId || !checkIn || !checkOut || !guestName || !totalAmountStr) {
            return alert("Please fill out all required manual booking fields before creating an invoice.");
        }
        setPendingBookingData({
            propertyId: formPropId,
            checkIn,
            checkOut,
            guestName,
            guestEmail,
            guestPhone,
            totalPrice: totalAmountStr,
            accessCode: manualAccessCode,
            manualBookingRooms,
            formElement: e.target as HTMLFormElement
        });

        setInvoiceSponsorName('');
        setInvoiceSponsorEmail('');
        setInvoiceSponsorPhone('');
        setInvoiceSponsorAddress('');
        setInvoiceNumber('REALCAL-INV-' + Math.floor(100000 + Math.random() * 900000));
        setInvoiceDueDate(checkIn);
        setInvoiceCustomNotes(`Lodging for ${guestName} at REALCal Bookings. Standard payment responsibility by sponsor.`);
        setShowInvoiceTemplate(true);
        return;
    }

    const bookingId = uuidv4();
    const payloadUserId = user?.uid || 'admin-override';

    try {
        const prop = properties.find(p => p.id === formPropId);
        let accessCode = manualAccessCode.trim();
        if (!accessCode) {
            if (prop?.hasSmartLock && prop?.frontDoorCode) {
                accessCode = prop.frontDoorCode;
            } else {
                try {
                    // Provision Lock Code
                    const lockRes = await fetch('/api/provision-lock', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ checkIn, checkOut, name: guestName })
                    });
                    
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
                } catch (err) {
                    console.warn("API lock provisioning failed:", err);
                }
            }
        }

        const selectedBedroomObjects = (prop?.bedrooms || []).filter(b => manualBookingRooms.includes(b.roomNumber));

        const payload: any = {
           userId: payloadUserId,
           propertyId: formPropId,
           checkIn,
           checkOut,
           status: 'confirmed',
           totalPrice: Math.round(Number(totalAmountStr) * 100),
           guestName: guestName || '',
           guestEmail: guestEmail,
           guestPhone: guestPhone,
           guests: 1,
           selectedBedrooms: selectedBedroomObjects.length > 0 ? selectedBedroomObjects : null,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
        };

        if (accessCode) payload.accessCode = accessCode;

        // Save Booking
        await setDoc(doc(db, 'bookings', bookingId), payload);

        // Auto-add Blackout for the day after checkout for maintenance/cleaning
        try {
            const checkOutDate = new Date(checkOut + 'T12:00:00'); // Use noon to avoid TZ issues
            const dayAfterDate = new Date(checkOutDate);
            dayAfterDate.setDate(dayAfterDate.getDate() + 1);
            const blackoutDateString = dayAfterDate.toISOString().split('T')[0];
            
            if (manualBookingRooms.length > 0) {
                // Create blackouts for each selected room
                const batch = writeBatch(db);
                manualBookingRooms.forEach(roomNum => {
                    batch.set(doc(db, 'blackout_dates', `maint-${bookingId}-${roomNum}`), {
                        propertyId: formPropId,
                        date: blackoutDateString,
                        targetType: 'room',
                        roomNumber: roomNum,
                        reason: `Maintenance/Cleaning for Booking Override (Room ${roomNum})`,
                        createdAt: serverTimestamp()
                    });
                });
                await batch.commit();
            } else {
                // Create blackout for entire property
                await setDoc(doc(db, 'blackout_dates', `maint-${bookingId}`), {
                    propertyId: formPropId,
                    date: blackoutDateString,
                    targetType: 'property', // Admin override usually for entire property
                    roomNumber: null,
                    reason: `Maintenance/Cleaning for Booking Override`,
                    createdAt: serverTimestamp()
                });
            }
            console.log(`[Admin] Auto-blackout created for ${blackoutDateString}`);
        } catch (blackoutErr) {
            console.warn("Failed to create auto-blackout in admin", blackoutErr);
        }

        // Notify Managers and Guest
        try {
           const managers = propertyManagers.filter(m => m.enabled);
           let propertyName = "Villa";
           const prop = properties.find(p => p.id === formPropId);
           if (prop) propertyName = prop.name;
 
           if (managers.length > 0 || guestPhone || guestEmail) {
              await fetch('/api/notify-managers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                   managers,
                   bookingDetails: {
                      checkIn: payload.checkIn,
                      checkOut: payload.checkOut,
                      totalAmount: payload.totalPrice,
                      propertyName: propertyName,
                      guestName: guestName,
                      guestPhone: guestPhone,
                      guestEmail: guestEmail,
                      accessCode: accessCode,
                      selectedBedrooms: selectedBedroomObjects
                   }
                })
              });
           }
        } catch (notifyErr) {
           console.error("Manager notification failed, but booking succeeded", notifyErr);
        }

        alert("Manual booking created successfully!");
        (e.target as HTMLFormElement).reset();
        setManualBookingPropId('');
        setManualBookingRooms([]);
        setManualBookingCheckIn('');
        setManualBookingCheckOut('');

    } catch (err: any) { alert(err.message); }
  }

  const handleUpdateBookingAccessCode = async (bookingId: string, newCode: string) => {
    if (!db) return alert("Firebase not configured");
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
         accessCode: newCode,
         updatedAt: serverTimestamp()
      });
      setEditingAccessCodeId(null);
      alert("SmartLock code updated!");
    } catch (err: any) {
      alert("Error updating SmartLock code: " + err.message);
    }
  };

  const handleResendInvoice = async (b: Booking) => {
    if (!b.invoiceDetails) return alert("Booking does not have invoice details associated.");
    
    const confirmResend = window.confirm(`Are you sure you want to resend Invoice #${b.invoiceDetails.invoiceNumber || 'Manual'} to ${b.invoiceDetails.sponsorEmail}?`);
    if (!confirmResend) return;

    setSendingInvoiceId(b.id);
    try {
      const prop = properties.find(p => p.id === b.propertyId);
      const propertyName = prop ? prop.name : 'Unknown Property';

      let totalNights = 1;
      try {
        const d1 = new Date(b.checkIn);
        const d2 = new Date(b.checkOut);
        const diff = d2.getTime() - d1.getTime();
        totalNights = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
      } catch(e) {}

      const manualBookingRooms = b.selectedBedrooms ? b.selectedBedrooms.map(r => r.roomNumber) : (b.selectedBedroom ? [b.selectedBedroom.roomNumber] : []);
      const totalAmountStr = (b.totalPrice / 100).toFixed(2);
      const stripePaymentUrl = b.invoiceDetails.stripePaymentUrl || '';

      const invoiceNumber = b.invoiceDetails.invoiceNumber || 'Manual';
      const invoiceDueDate = b.invoiceDetails.dueDate || '';
      const invoiceSponsorName = b.invoiceDetails.sponsorName || '';
      const invoiceSponsorEmail = b.invoiceDetails.sponsorEmail || '';
      const invoiceSponsorPhone = b.invoiceDetails.sponsorPhone || '';
      const invoiceSponsorAddress = b.invoiceDetails.sponsorAddress || '';
      const invoiceCustomNotes = b.invoiceDetails.customNotes || '';
      const guestName = b.guestName || 'Guest';
      const checkIn = b.checkIn;
      const checkOut = b.checkOut;

      const invoiceHtml = `
<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 24px; border-radius: 12px; color: #1e293b; background-color: #ffffff;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
            <td style="vertical-align: middle;">
                <div style="font-size: 26px; font-weight: bold; color: #4f46e5; letter-spacing: -0.05em; display: inline-block;">
                    REALCal <span style="font-weight: 300; color: #0f172a;">Bookings</span>
                </div>
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #64748b; font-weight: bold; margin-top: 4px;">
                    Premium Luxury Lodging & Hospitality
                </div>
            </td>
            <td style="text-align: right; vertical-align: middle;">
                <div style="font-size: 18px; font-weight: bold; color: #1e293b;">INVOICE</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 4px;">No: <strong>\${invoiceNumber}</strong></div>
                <div style="font-size: 12px; color: #64748b;">Due Date: \${invoiceDueDate}</div>
            </td>
        </tr>
    </table>
    
    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;" />

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
            <td style="width: 50%; padding-right: 12px; vertical-align: top;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #4f46e5; margin-bottom: 6px;">Bill From</div>
                <div style="font-size: 14px; font-weight: bold; color: #0f172a;">REALCal Bookings</div>
                <div style="font-size: 12px; color: #475569; margin-top: 2px;">
                    C.&S.H. Group Properties, LLC
                </div>
                <div style="font-size: 12px; color: #475569;">
                    billing@cashgroupproperties.com
                </div>
            </td>
            <td style="width: 50%; padding-left: 12px; vertical-align: top;">
                <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #4f46e5; margin-bottom: 6px;">Bill To (Sponsor / Agency / 3rd Party)</div>
                <div style="font-size: 14px; font-weight: bold; color: #0f172a;">\${invoiceSponsorName}</div>
                <div style="font-size: 12px; color: #475569; margin-top: 2px;">\${invoiceSponsorEmail}</div>
                \${invoiceSponsorPhone ? \`<div style="font-size: 12px; color: #475569;">\${invoiceSponsorPhone}</div>\` : ''}
                \${invoiceSponsorAddress ? \`<div style="font-size: 12px; color: #475569; white-space: pre-wrap; margin-top: 4px;">\${invoiceSponsorAddress}</div>\` : ''}
            </td>
        </tr>
    </table>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #475569; margin-bottom: 10px;">Lodging Details & Guest Coverage</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Guest Name:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">\${guestName}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Property:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">\${propertyName}</td>
            </tr>
            \${manualBookingRooms.length > 0 ? \`
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Room(s):</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">Rooms \${manualBookingRooms.join(', ')}</td>
            </tr>
            \` : ''}
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Stay Dates:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">\${checkIn} to \${checkOut}</td>
            </tr>
            <tr>
                <td style="padding: 4px 0; color: #64748b; font-weight: 500;">Stay Duration:</td>
                <td style="padding: 4px 0; text-align: right; color: #0f172a; font-weight: bold;">\${totalNights} Night(s)</td>
            </tr>
        </table>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
        <thead>
            <tr style="border-bottom: 2px solid #cbd5e1;">
                <th style="text-align: left; padding: 8px 0; color: #475569;">Description</th>
                <th style="text-align: right; padding: 8px 0; color: #475569;">Amount</th>
            </tr>
        </thead>
        <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #0f172a; font-weight: 500;">
                    Guest Rental Override Access Fee<br/>
                    <span style="font-size: 11px; color: #64748b;">Lodging charge for the entire stay interval</span>
                </td>
                <td style="padding: 10px 0; text-align: right; color: #0f172a; font-weight: bold; font-family: Courier, monospace;">$ \${Number(totalAmountStr).toFixed(2)}</td>
            </tr>
            <tr>
                <td style="padding: 12px 0 4px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Grand Total:</td>
                <td style="padding: 12px 0 4px 0; text-align: right; font-size: 16px; font-weight: bold; color: #4f46e5; font-family: Courier, monospace;">$ \${Number(totalAmountStr).toFixed(2)}</td>
            </tr>
        </tbody>
    </table>

    \${stripePaymentUrl ? \`
    <div style="background-color: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 15px; font-weight: bold; color: #166534; margin-bottom: 6px;">
            Secure Online Payment
        </div>
        <div style="font-size: 12px; color: #1e7040; margin-bottom: 14px; line-height: 1.5;">
            You can pay this invoice safely online using your credit / debit card via Stripe.
        </div>
        <a href="\${stripePaymentUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); transition: background-color 0.2s;">
            Pay Invoice with Stripe &rarr;
        </a>
    </div>
    \` : ''}

    \${invoiceCustomNotes ? \`
    <div style="border-left: 3px solid #cbd5e1; padding-left: 12px; margin-bottom: 24px; font-size: 12px; color: #475569; font-style: italic;">
        \${invoiceCustomNotes}
    </div>
    \` : ''}

    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;" />

    <div style="font-size: 11px; text-align: center; color: #94a3b8; line-height: 1.5; margin-top: 24px;">
        This invoice is generated on behalf of the lodging provider.<br/>
        <strong>C.&S.H. Group Properties, LLC</strong>
    </div>
</div>
`;

      const invoiceText = `
INVOICE
-------
Invoice Number: \${invoiceNumber}
Due Date: \${invoiceDueDate}
From: REALCal Bookings (C.&S.H. Group Properties, LLC)
To (Sponsor): \${invoiceSponsorName} (\${invoiceSponsorEmail})

Guest Details:
Guest Name: \${guestName}
Property: \${propertyName}
Dates: \${checkIn} to \${checkOut} (\${totalNights} Night(s))

Summary of Charges:
Guest Rental Override Access Fee: $\${Number(totalAmountStr).toFixed(2)}
Grand Total Due: $\${Number(totalAmountStr).toFixed(2)}

\${stripePaymentUrl ? \`SECURE ONLINE PAYMENT LINK:\\nClick here to pay this invoice securely via Stripe:\\n\${stripePaymentUrl}\\n\` : ''}

Notes: \${invoiceCustomNotes}

Thank you,
C.&S.H. Group Properties, LLC
`;

      const emailRes = await fetch("/api/send-invoice-email", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           to: invoiceSponsorEmail.trim(),
           subject: `Invoice \${invoiceNumber} (Resend): Lodging for \${guestName} at \${propertyName}`,
           html: invoiceHtml,
           text: invoiceText
         })
      });

      if (!emailRes.ok) {
         const errText = await emailRes.text();
         throw new Error(`Failed to send invoice email: \${errText}`);
      }

      alert("Invoice resent successfully to " + invoiceSponsorEmail);
    } catch (err: any) {
      alert("Error resending invoice: " + err.message);
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const handleAdminCancelBooking = async (bookingId: string) => {
    if (!db || !window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      // Remove associated maintenance blackout
      try {
        const rooms = booking.selectedBedrooms || (booking.selectedBedroom ? [booking.selectedBedroom] : []);
        if (rooms.length > 0) {
          for (const room of rooms) {
            await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}-${room.roomNumber}`));
          }
        } else {
          await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}`));
        }
      } catch (err) {
        console.warn("Failed to remove blackout", err);
      }

      alert("Booking cancelled.");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdminDeleteBooking = async (bookingId: string) => {
    if (!db || !window.confirm("Permanently delete this booking record? (Unrecoverable)")) return;
    try {
      await deleteDoc(doc(db, 'bookings', bookingId));
      alert("Booking deleted.");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const [testSmsTarget, setTestSmsTarget] = useState("");
  const [testSmsMessage, setTestSmsMessage] = useState("Testing Twilio SMS from REALCal Bookings!");
  const [sendingTestSms, setSendingTestSms] = useState(false);

  const handleTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSmsTarget) return;
    setSendingTestSms(true);
    try {
      console.log("Sending Test SMS to", testSmsTarget);
      const res = await fetch("/api/test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: formatPhoneE164(testSmsTarget), message: testSmsMessage })
      });
      
      console.log("Response status:", res.status);
      const text = await res.text();
      console.log("Raw SMS Response Body:", text);
      
      if (!text) {
        alert("Server returned EMPTY body. Status: " + res.status);
        throw new Error("Empty response body");
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse SMS response:", text);
        alert("Parse Error. Raw text: " + text + "\nStatus: " + res.status);
        throw new Error("Invalid JSON response");
      }

      if (res.ok) {
        alert("Success! Status: " + res.status + "\nData: " + JSON.stringify(data));
      } else {
        const errorMsg = data.error || "Unknown error";
        const details = data.details ? ("\n\nAction Required: " + data.details) : "";
        alert("SMS Failed (Status " + res.status + ")\nError: " + errorMsg + details);
      }
    } catch (err: any) {
      alert("Fetch Error: " + err.message);
    } finally {
      setSendingTestSms(false);
    }
  };

  const [testEmailTarget, setTestEmailTarget] = useState("");
  const [testEmailSubject, setTestEmailSubject] = useState("Testing IONOS SMTP Email from REALCal Bookings!");
  const [testEmailMessage, setTestEmailMessage] = useState("Hi! This is a test email confirmation sent from the REALCal Admin Dashboard using IONOS SMTP outgoing server.");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTarget) return;
    setSendingTestEmail(true);
    try {
      console.log("Sending Test Email to", testEmailTarget);
      const res = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          to: testEmailTarget, 
          subject: testEmailSubject, 
          message: testEmailMessage 
        })
      });
      
      console.log("Email Response status:", res.status);
      const text = await res.text();
      console.log("Raw Email Response Body:", text);
      
      if (!text) {
        alert("Server returned EMPTY body. Status: " + res.status);
        throw new Error("Empty response body");
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse Email response:", text);
        alert("Parse Error. Raw text: " + text + "\nStatus: " + res.status);
        throw new Error("Invalid JSON response");
      }

      if (res.ok) {
        alert("Success! Status: " + res.status + "\nData: " + JSON.stringify(data));
      } else {
        const errorMsg = data.error || "Unknown error";
        alert("Email Failed (Status " + res.status + ")\nError: " + errorMsg);
      }
    } catch (err: any) {
      alert("Fetch Error: " + err.message);
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handlePing = async () => {
    try {
      const res = await fetch("/api/ping");
      const text = await res.text();
      alert("Ping! (v2.7)\nStatus: " + res.status + "\nResponse: " + text);
    } catch (err: any) {
      alert("Ping failed: " + err.message + "\nCheck browser console for details.");
    }
  };

  const activeRules = pricingRules.filter(r => r.propertyId === activePropertyId);
  const activeBlackouts = blackouts
    .filter(b => b.propertyId === activePropertyId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="bg-slate-50 min-h-screen p-6 font-sans text-slate-900 overflow-hidden">
       <div className="max-w-7xl mx-auto space-y-5">
          {/* Header Navigation Bento Style */}
          <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-85 transition-opacity flex-shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                 <Settings size={18} />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">REALCal <span className="text-indigo-600">Admin</span></h1>
            </Link>
            
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
              <div className="flex items-center gap-2 bg-white py-1 pl-1 pr-2 sm:pr-4 rounded-full border border-slate-200 shadow-sm">
                  {user?.photoURL && <img src={user.photoURL} alt="Avatar" className="w-6 h-6 sm:w-8 sm:h-8 rounded-full" referrerPolicy="no-referrer" />}
                  <div className="text-left hidden xs:block">
                    <p className="font-semibold text-xs leading-none text-slate-800 truncate max-w-[90px]">{user?.displayName ? user.displayName.split(' ')[0] : 'Admin'}</p>
                    <p className="text-[9px] text-indigo-600 font-medium leading-none mt-0.5">Control</p>
                  </div>
              </div>
              <button 
                onClick={async () => {
                  try {
                    await signOut();
                    window.location.href = '/';
                  } catch (err) {
                    console.error("Logout error", err);
                    window.location.reload();
                  }
                }} 
                className="text-slate-400 hover:text-red-500 transition-colors p-1.5 sm:p-2 bg-white rounded-full border border-slate-200 shadow-sm outline-none w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95"
                title="Logout"
              >
                 <LogOut size={15} />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-1 gap-5">
             <div className="col-span-1 md:col-span-12 bg-indigo-50 rounded-3xl border border-indigo-100 p-6 flex flex-col md:flex-row gap-6 shadow-sm">
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-indigo-900">Admin Quick Stats</h3>
                    <div className="flex gap-2">
                        <div className="relative group">
                            <button onClick={handleSeedTestData} className="text-xs bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1">
                               Seed Test Data
                            </button>
                            <div className="absolute right-0 top-full mt-2 hidden group-hover:block bg-slate-900 text-white text-xs rounded-xl p-4 w-72 shadow-xl z-50 border border-slate-700 animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                               <p className="font-bold text-indigo-400 mb-1.5 flex items-center gap-1">
                                  <span>🌱</span> Seeding Test Data:
                               </p>
                               <ul className="space-y-1.5 text-[11px] text-slate-200 leading-normal list-disc pl-3">
                                  <li>Creates **Oceanview Paradise Villa** test property.</li>
                                  <li>Creates **Mountain Retreat Cabin** test property.</li>
                                  <li>Registers **Test Manager** (<span className="text-indigo-300 font-mono font-bold">reach_dlaniger@hotmail.com</span>) to receive automated email/SMS alerts.</li>
                                  <li>Commits all records atomically to Firestore.</li>
                               </ul>
                            </div>
                        </div>
                        <button onClick={exportCSV} className="text-xs bg-white text-indigo-600 border border-indigo-200 font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-1">
                           <FileDown size={14}/> Export CSV
                        </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight flex items-center gap-1"><TrendingUp size={14}/> Total Revenue</p>
                       <p className="text-xl font-bold text-slate-900 mt-1">${(totalRevenue / 100).toFixed(2)}</p>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Standard (Default) Days</label>
                                <input name="minDaysDefault" type="number" min="1" defaultValue={globalSettings?.minDaysDefault || 1} required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Weekend Minimum Days</label>
                                <input name="minDaysWeekend" type="number" min="1" defaultValue={globalSettings?.minDaysWeekend || 1} required className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm" />
                            </div>
                        </div>

                        <div className="border-t border-slate-200 pt-4 mt-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-tight block">Late Check-Out Hour Fee Rate</label>
                            <p className="text-[11px] text-slate-500 mb-2">Hourly fee rate as a percent of total booking price charged when checked out past 11:00 AM.</p>
                            <div className="relative flex items-center w-36">
                                <input name="lateCheckoutFeePercent" type="number" step="0.1" min="0" max="100" defaultValue={globalSettings?.lateCheckoutFeePercent !== undefined ? globalSettings.lateCheckoutFeePercent : 5.0} required className="w-full border border-slate-200 rounded-xl p-2.5 pr-8 bg-white shadow-sm font-semibold font-mono text-slate-800" />
                                <span className="absolute right-3.5 text-slate-400 font-bold text-xs">% / hr</span>
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
             <form onSubmit={handleAdminCreateBooking} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4 items-end bg-slate-50 p-6 rounded-2xl border border-slate-300 border-dashed">
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Property</label>
                   <select 
                     name="propertyId" 
                     required 
                     value={manualBookingPropId}
                     onChange={(e) => {
                       setManualBookingPropId(e.target.value);
                       setManualBookingRooms([]);
                     }}
                     className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 required bg-white shadow-sm text-sm"
                   >
                      <option value="">Select...</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                </div>
                {manualBookingPropId && properties.find(p => p.id === manualBookingPropId)?.allowIndividualRoomRental && (
                   <div className="lg:col-span-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Select Rooms</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                         {properties.find(p => p.id === manualBookingPropId)?.bedrooms?.map(room => (
                            <label key={room.roomNumber} className={cn(
                               "cursor-pointer px-3 py-1.5 rounded-lg border text-xs font-bold transition-all",
                               manualBookingRooms.includes(room.roomNumber) 
                                 ? "bg-indigo-600 border-indigo-600 text-white" 
                                 : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            )}>
                               <input 
                                 type="checkbox" 
                                 className="hidden" 
                                 checked={manualBookingRooms.includes(room.roomNumber)}
                                 onChange={() => {
                                   setManualBookingRooms(prev => 
                                     prev.includes(room.roomNumber) 
                                       ? prev.filter(r => r !== room.roomNumber) 
                                       : [...prev, room.roomNumber]
                                   );
                                 }}
                               />
                               {room.roomNumber} ({room.type})
                            </label>
                         ))}
                      </div>
                   </div>
                )}
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Check In</label>
                   <input 
                      name="checkIn" 
                      type="date" 
                      required 
                      value={manualBookingCheckIn}
                      onChange={(e) => {
                         const val = e.target.value;
                         setManualBookingCheckIn(val);
                         if (manualBookingCheckOut && val && manualBookingCheckOut <= val) {
                            try {
                               setManualBookingCheckOut(format(addDays(parseISO(val), 1), 'yyyy-MM-dd'));
                            } catch (err) {
                               setManualBookingCheckOut('');
                            }
                         }
                      }}
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                   />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Check Out</label>
                   <input 
                      name="checkOut" 
                      type="date" 
                      required 
                      value={manualBookingCheckOut}
                      onChange={(e) => setManualBookingCheckOut(e.target.value)}
                      min={manualBookingCheckIn ? format(addDays(parseISO(manualBookingCheckIn), 1), 'yyyy-MM-dd') : undefined}
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                   />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Guest Name</label>
                   <input name="guestName" required placeholder="Guest Name" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Guest Email</label>
                   <input name="guestEmail" type="email" required placeholder="guest@example.com" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Guest Phone</label>
                   <input name="guestPhone" placeholder="+1..." className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Total Price ($)</label>
                   <input name="totalPrice" type="number" required placeholder="0.00" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">SmartLock Code</label>
                   <input name="accessCode" placeholder="Auto / Custom" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm font-mono focus:ring-2 focus:ring-indigo-200 outline-none" />
                </div>
                <div className="md:col-span-2 lg:col-span-8 flex flex-col md:flex-row justify-between items-center gap-4 mt-2">
                   <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer bg-white hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold transition-all select-none shadow-sm">
                         <input 
                            type="checkbox" 
                            checked={createInvoiceForPayment} 
                            onChange={(e) => setCreateInvoiceForPayment(e.target.checked)} 
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer" 
                         />
                         <span className="text-slate-700">Create Invoice for Payment</span>
                      </label>
                      {createInvoiceForPayment && (
                         <span className="text-xs text-indigo-600 font-bold bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg animate-pulse">
                            ⚡ Submission will open Invoice Template Customizer
                         </span>
                      )}
                   </div>
                   <button type="submit" className="w-full md:w-auto bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-colors shadow-sm">
                      {createInvoiceForPayment ? "Create & Open Invoice Template" : "Create Override Booking"}
                   </button>
                </div>
             </form>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8 border-indigo-200 border-2 shadow-indigo-50">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-900">
                <MessageSquare className="text-indigo-600" size={20}/> Test Twilio SMS
                <button onClick={handlePing} className="ml-auto text-xs bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded transition-colors text-slate-700">Ping API</button>
             </h2>
             <form onSubmit={handleTestSms} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                <div className="md:col-span-1">
                   <label className="text-xs font-bold text-indigo-400 uppercase tracking-tight mb-1.5 block italic">Destination Number (E.164)</label>
                   <input 
                      type="tel"
                      value={testSmsTarget}
                      onChange={e => setTestSmsTarget(e.target.value)}
                      placeholder="+14155552671"
                      className="w-full border border-indigo-200 rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                   />
                </div>
                <div className="md:col-span-1">
                   <label className="text-xs font-bold text-indigo-400 uppercase tracking-tight mb-1.5 block italic">Message Body</label>
                   <input 
                      type="text"
                      value={testSmsMessage}
                      onChange={e => setTestSmsMessage(e.target.value)}
                      className="w-full border border-indigo-200 rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                   />
                </div>
                <div className="md:col-span-1">
                   <button 
                      type="submit" 
                      disabled={sendingTestSms || !testSmsTarget}
                      className="w-full bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                   >
                      {sendingTestSms ? 'Sending...' : 'Send Live Test SMS'}
                   </button>
                </div>
             </form>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8 border-indigo-200 border-2 shadow-indigo-50">
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-indigo-900">
                <Mail className="text-indigo-600" size={20}/> Test IONOS SMTP Email
             </h2>
             <form onSubmit={handleTestEmail} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100">
                <div className="md:col-span-1">
                   <label className="text-xs font-bold text-indigo-400 uppercase tracking-tight mb-1.5 block italic">Destination Email Address</label>
                   <input 
                      type="email"
                      value={testEmailTarget}
                      onChange={e => setTestEmailTarget(e.target.value)}
                      placeholder="guest@example.com"
                      required
                      className="w-full border border-indigo-200 rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 outline-none text-sm"
                   />
                </div>
                <div className="md:col-span-1">
                   <label className="text-xs font-bold text-indigo-400 uppercase tracking-tight mb-1.5 block italic">Subject</label>
                   <input 
                      type="text"
                      value={testEmailSubject}
                      onChange={e => setTestEmailSubject(e.target.value)}
                      placeholder="Test Booking Confirmation"
                      className="w-full border border-indigo-200 rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 outline-none text-sm"
                   />
                </div>
                <div className="md:col-span-2 lg:col-span-1">
                   <label className="text-xs font-bold text-indigo-400 uppercase tracking-tight mb-1.5 block italic">Message Body</label>
                   <input 
                      type="text"
                      value={testEmailMessage}
                      onChange={e => setTestEmailMessage(e.target.value)}
                      placeholder="Hi! This is a test email confirmation..."
                      className="w-full border border-indigo-200 rounded-xl p-3 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 outline-none text-sm"
                   />
                </div>
                <div className="md:col-span-1 col-span-1">
                   <button 
                      type="submit" 
                      disabled={sendingTestEmail || !testEmailTarget}
                      className="w-full bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 text-sm"
                   >
                      {sendingTestEmail ? 'Sending...' : 'Send Live IONOS SMTP'}
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
                       <div className="flex items-center gap-1.5 mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400 italic">
                           <span>*</span>
                           <span>E.164 Format Required (e.g., +14155552671)</span>
                        </div>
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
                                     <div className="flex-1 flex flex-col gap-1">
                                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 italic leading-none mb-1">* E.164 Format Required</div>
                                      <input name="phone" defaultValue={m.phone} required placeholder="Phone" className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white shadow-sm" />
                                   </div>
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

          {/* Lease Agreements & Requests Manager Section */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 text-left">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                   <FileText className="text-indigo-600" size={20} /> Lease Agreements & Requests Manager
                </h2>
                <div className="flex gap-2 text-xs font-bold">
                   <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-md uppercase">
                      {leaseRequests.filter(r => r.status === 'pending').length} Requests Pending
                   </span>
                   <span className="bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-md uppercase">
                      {leases.length} Active Leases
                   </span>
                </div>
             </div>

             <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Incoming Requests Column */}
                <div className="space-y-4">
                   <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 text-left">Incoming Lease Requests</h3>
                   {leaseRequests.length === 0 ? (
                      <div className="p-8 border border-dashed rounded-2xl text-center text-slate-500 text-sm bg-slate-50">
                         No incoming lease requests found.
                      </div>
                   ) : (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                         {leaseRequests.map((req) => {
                            const isPending = req.status === 'pending';
                            const durationDays = req.startDate && req.endDate ? 
                               Math.round((new Date(req.endDate).getTime() - new Date(req.startDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                            const isLongTerm = durationDays > 180;

                            return (
                               <div key={req.id} className={cn("p-4 rounded-2xl border transition-all relative flex flex-col justify-between gap-4", isPending ? "border-amber-200 bg-amber-50/20" : req.status === 'approved' ? "border-emerald-200 bg-emerald-50/10" : "border-slate-200 bg-slate-50/50")}>
                                  <div className="flex flex-col md:flex-row justify-between gap-4 w-full text-left">
                                     <div className="flex-1 text-left">
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                           <span className="font-extrabold text-slate-800 text-sm line-clamp-1">{req.tenantName}</span>
                                           <span className={cn("text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider", isLongTerm ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700")}>
                                              {isLongTerm ? 'Long-Term' : 'Short-Term'} ({durationDays} Nights)
                                           </span>
                                           {req.status === 'approved' && (
                                              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                                                 Approved
                                              </span>
                                           )}
                                        </div>
                                        <div className="space-y-1 text-xs text-slate-600">
                                           <div><strong className="text-slate-400">Unit:</strong> <span className="font-semibold text-slate-700">{req.propertyNameOrRoom}</span></div>
                                           <div><strong className="text-slate-400">Email:</strong> {req.tenantEmail}</div>
                                           <div><strong className="text-slate-400">Phone:</strong> {req.tenantPhone || "N/A"}</div>
                                           <div><strong className="text-slate-400">Term:</strong> <span className="font-mono text-slate-700">{req.startDate} to {req.endDate}</span></div>
                                           {req.approvedLeaseCode && (
                                              <div className="mt-2 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg py-1 px-2.5 font-mono text-xs font-bold inline-block">
                                                 Code: {req.approvedLeaseCode}
                                              </div>
                                           )}
                                        </div>
                                     </div>

                                     <div className="flex md:flex-col justify-end items-end gap-2.5 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                                        <button
                                           onClick={() => handleDeleteLeaseRequest(req.id)}
                                           className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors self-end"
                                           title="Delete Lease Request"
                                        >
                                           <Trash2 size={16} />
                                        </button>
                                     </div>
                                  </div>

                                  {isPending && (
                                     <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row items-end sm:items-center gap-3 w-full">
                                        <div className="flex-1 w-full text-left">
                                           <div className="flex justify-between items-center mb-1">
                                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0">
                                                 Assign Lease Code #
                                              </label>
                                              <button
                                                 type="button"
                                                 onClick={() => setLeaseCodes({ ...leaseCodes, [req.id]: 'LSE-' + Math.random().toString(36).substring(2, 7).toUpperCase() })}
                                                 className="text-[9px] text-indigo-650 hover:text-indigo-850 underline font-bold focus:outline-none"
                                              >
                                                 Generate Random Code
                                              </button>
                                           </div>
                                           <label className="hidden block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                              Assign Lease Code #
                                           </label>
                                           <input
                                              type="text"
                                              placeholder="e.g. LSE-7S3J9"
                                              value={leaseCodes[req.id] || ""}
                                              onChange={(e) => setLeaseCodes({ ...leaseCodes, [req.id]: e.target.value.toUpperCase() })}
                                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-xs font-mono uppercase tracking-wider focus:outline-none focus:border-indigo-500 font-bold"
                                           />
                                        </div>
                                        <button
                                           onClick={() => handleApproveLease(req, leaseCodes[req.id] || "")}
                                           disabled={approvingLeaseId === req.id || !leaseCodes[req.id]?.trim()}
                                           className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 text-xs cursor-pointer h-9 text-center whitespace-nowrap"
                                        >
                                           {approvingLeaseId === req.id ? (
                                              <Loader2 className="animate-spin" size={13} />
                                           ) : (
                                              <CheckCircle size={13} />
                                           )}
                                           Approve & Send Code
                                        </button>
                                     </div>
                                  )}
                               </div>
                            );
                         })}
                      </div>
                   )}
                </div>

                {/* Active Authorized Leases Column */}
                <div className="space-y-4 border-t xl:border-t-0 xl:border-l border-slate-100 pt-6 xl:pt-0 xl:pl-6">
                   <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 text-left">Active Authorized Leases</h3>
                   {leases.length === 0 ? (
                      <div className="p-8 border border-dashed rounded-2xl text-center text-slate-500 text-sm bg-slate-50">
                         No active authorized leases in database.
                      </div>
                   ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                         {leases.map((l) => (
                            <div key={l.id} className="p-4 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors bg-white shadow-sm flex justify-between items-center gap-4 text-left">
                               <div>
                                  <div className="flex items-center gap-2 flex-wrap mb-1 text-left">
                                     <span className="font-mono text-sm font-black text-indigo-600 tracking-wider select-all">{l.leaseCode}</span>
                                     <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase select-none">
                                        {l.bookingType === 'long-term' ? 'Long-Term' : 'Short-Term'}
                                     </span>
                                  </div>
                                  <div className="space-y-0.5 text-xs text-slate-500 text-left">
                                     <div><strong className="text-slate-400">Tenant:</strong> {l.tenantName}</div>
                                     <div><strong className="text-slate-400">Email:</strong> {l.tenantEmail}</div>
                                     <div className="font-mono text-[11px]"><strong className="text-slate-400">Term:</strong> {l.startDate} to {l.endDate}</div>
                                  </div>
                               </div>
                               <button
                                  onClick={() => handleDeleteActiveLease(l.id)}
                                  className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors"
                                  title="Delete Permanent Lease Record"
                               >
                                  <Trash2 size={16} />
                               </button>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><CalendarIcon className="text-indigo-600" size={20}/> Booking Management</h2>
                <div className="flex gap-2 text-xs">
                   <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md font-bold uppercase">{bookings.filter(b => b.status === 'confirmed').length} Confirmed</span>
                   <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md font-bold uppercase">{bookings.filter(b => b.status === 'cancelled').length} Cancelled</span>
                </div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                   <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-100">
                      <tr>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Ref#</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Guest</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Property / Rooms</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Dates</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-indigo-600 font-extrabold">SmartLock Code</th>
                          <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Booked Date & Time</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Status</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {[...bookings].sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()).map((b) => {
                         const prop = properties.find(p => p.id === b.propertyId);
                         const userObj = users.find(u => u.uid === b.userId);
                         const rooms = b.selectedBedrooms ? b.selectedBedrooms.map(r => r.roomNumber).join(", ") : (b.selectedBedroom?.roomNumber || "Full Property");
                         
                         return (
                            <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-4 py-4">
                                  <Link 
                                     to={`/itinerary/${b.id}`}
                                     className="font-mono text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 inline-flex items-center gap-1 transition-all hover:scale-[1.03] shadow-sm"
                                     title="Click to view full Guest itinerary"
                                  >
                                     🎫 {b.bookingRef || 'View'}
                                  </Link>
                               </td>
                               <td className="px-4 py-4">
                                  <p className="font-semibold text-slate-800">{userObj?.displayName || 'Unknown Guest'}</p>
                                  <p className="text-xs text-slate-500">{userObj?.email || b.guestPhone || ''}</p>
                               </td>
                               <td className="px-4 py-4">
                                  <p className="font-medium text-slate-700">{prop?.name || 'Unknown Property'}</p>
                                  <p className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold inline-block mt-1">Rooms: {rooms}</p>
                               </td>
                               <td className="px-4 py-4 text-slate-600 text-xs">
                                  <p>{b.checkIn} to</p>
                                  <p>{b.checkOut}</p>
                               </td>
                               <td className="px-4 py-4">
                                  {editingAccessCodeId === b.id ? (
                                     <div className="flex items-center gap-1.5 p-1 border border-indigo-200 rounded-xl bg-slate-50 shadow-inner inline-flex">
                                        <input 
                                           type="text" 
                                           defaultValue={b.accessCode || ''}
                                           id={`access-code-input-${b.id}`}
                                           placeholder="Code"
                                           className="w-20 border border-indigo-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <button 
                                           onClick={async () => {
                                              const inputEl = document.getElementById(`access-code-input-${b.id}`) as HTMLInputElement;
                                              await handleUpdateBookingAccessCode(b.id, inputEl?.value || '');
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-colors"
                                         >
                                            Save
                                         </button>
                                         <button 
                                            onClick={() => setEditingAccessCodeId(null)}
                                            className="border border-slate-200 hover:bg-white text-slate-500 rounded px-2 py-0.5 text-[10px] font-medium bg-slate-100 cursor-pointer"
                                         >
                                            Cancel
                                         </button>
                                      </div>
                                   ) : (
                                      <div className="flex items-center gap-2">
                                         <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200 select-all tracking-wider inline-block text-center min-w-[60px]">
                                            {b.accessCode || '—'}
                                         </span>
                                         <button 
                                            onClick={() => setEditingAccessCodeId(b.id)}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-850 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                         >
                                            Set
                                         </button>
                                      </div>
                                   )}
                                </td>
                               <td className="px-4 py-4 text-slate-600 text-xs font-mono">
                                  {formatBookedDateTime(b.createdAt)}
                               </td>
                               <td className="px-4 py-4 space-y-1.5">
                                  <div>
                                     <span className={cn(
                                       "px-2 py-1 rounded-md text-[10px] font-bold uppercase inline-block",
                                       b.status === 'confirmed' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700 shadow-sm"
                                     )}>
                                        {b.status}
                                     </span>
                                  </div>
                                  {b.status !== 'cancelled' && (
                                     <div className="pt-1">
                                        {b.checkedOut ? (
                                           <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-indigo-100 text-indigo-700 uppercase tracking-wider inline-block">
                                              Checked Out
                                           </span>
                                        ) : b.checkedIn ? (
                                           <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-200/50 uppercase tracking-wider inline-block animate-pulse">
                                              Checked In
                                           </span>
                                        ) : (
                                           <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-slate-100 text-slate-500 uppercase tracking-wider inline-block">
                                              Scheduled
                                           </span>
                                        )}
                                     </div>
                                  )}
                               </td>
                               <td className="px-4 py-4 text-right space-x-2">
                                  {b.invoiceDetails && (
                                     <span className="inline-block mr-2 align-middle font-sans">
                                        {b.invoiceDetails.paid ? (
                                           <button
                                              disabled={true}
                                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 opacity-80 cursor-not-allowed"
                                           >
                                              <CheckCircle size={12} className="text-emerald-550" /> Invoice Paid
                                           </button>
                                        ) : (
                                           <button
                                              onClick={() => handleResendInvoice(b)}
                                              disabled={sendingInvoiceId === b.id}
                                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-805 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                           >
                                              {sendingInvoiceId === b.id ? 'Sending...' : 'Resend Invoice'}
                                           </button>
                                        )}
                                     </span>
                                  )}
                                  {b.status === 'confirmed' && (
                                     <button 
                                       onClick={() => handleAdminCancelBooking(b.id)}
                                       className="text-[10px] font-bold text-amber-600 hover:text-amber-700 align-middle"
                                     >
                                        Cancel
                                     </button>
                                  )}
                                  <button 
                                    onClick={() => handleAdminDeleteBooking(b.id)}
                                    className="text-slate-300 hover:text-red-500 transition-colors inline-block align-middle"
                                  >
                                     <Trash2 size={16}/>
                                  </button>
                               </td>
                            </tr>
                         );
                      })}
                   </tbody>
                </table>
                {bookings.length === 0 && <p className="text-center py-8 text-slate-400 text-sm italic">No bookings found.</p>}
             </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><Users className="text-indigo-600" size={20}/> User Directory & Consent</h2>
                <button 
                  onClick={handleRefreshUsers}
                  disabled={refreshingUsers}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    refreshingUsers 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : "bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white"
                  )}
                >
                  <RefreshCw size={16} className={cn(refreshingUsers && "animate-spin")} />
                  {refreshingUsers ? 'Refreshing...' : 'Refresh Directory'}
                </button>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                   <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-100">
                      <tr>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">User</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Email</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Role</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-right">Toll-free-accept</th>
                         <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-center">Actions</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {users.map((u, i) => (
                         <tr key={u.uid || i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4 flex items-center gap-3">
                               <img src={u.photoURL || `https://ui-avatars.com/api/?name=${u.displayName}`} className="w-8 h-8 rounded-full border border-slate-200" />
                               <span className="font-semibold text-slate-800">{u.displayName}</span>
                            </td>
                            <td className="px-4 py-4 text-slate-600">{u.email}</td>
                            <td className="px-4 py-4">
                               <span className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase", u.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600")}>
                                  {u.role}
                               </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                               {u.tollFreeAccept ? (
                                  <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                     Accepted
                                  </span>
                               ) : (
                                  <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-400">
                                     <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                     Pending
                                  </span>
                               )}
                            </td>
                            <td className="px-4 py-4 text-center">
                               <button
                                  onClick={() => handleStartEditUser(u)}
                                  className="text-indigo-600 hover:text-indigo-800 font-bold text-xs bg-indigo-50 hover:bg-indigo-100 py-1.5 px-3 rounded-lg transition-colors border border-indigo-100"
                               >
                                  Edit Profile
                               </button>
                            </td>
                         </tr>
                      ))}
                   </tbody>
                </table>
                {users.length === 0 && <p className="text-center py-8 text-slate-400 text-sm italic">No users found in directory.</p>}
             </div>
          </div>

          {editingUser && (
             <div id="edit-user-modal" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-xl animate-in fade-in zoom-in duration-200">
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         <h3 className="text-lg font-bold text-slate-900">Edit User Profile</h3>
                         <p className="text-xs text-slate-500 mt-0.5">{editingUser.email}</p>
                      </div>
                      <button 
                         onClick={() => setEditingUser(null)}
                         className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                         ✕
                      </button>
                   </div>

                   <form onSubmit={handleUpdateUserProfile} className="space-y-4">
                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Display Name</label>
                         <input 
                            type="text" 
                            required
                            value={editUserDisplayName}
                            onChange={(e) => setEditUserDisplayName(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm"
                         />
                      </div>

                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Photo URL</label>
                         <input 
                            type="text" 
                            value={editUserPhotoURL}
                            onChange={(e) => setEditUserPhotoURL(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm"
                            placeholder="https://example.com/photo.jpg"
                         />
                      </div>

                      <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">User Role</label>
                         <select 
                            value={editUserRole}
                            onChange={(e) => setEditUserRole(e.target.value as 'user' | 'admin')}
                            className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm"
                         >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                         </select>
                      </div>

                      <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-150">
                         <input 
                            type="checkbox" 
                            id="tollFreeCheckbox"
                            checked={editUserTollFreeAccept}
                            onChange={(e) => setEditUserTollFreeAccept(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                         />
                         <label htmlFor="tollFreeCheckbox" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                            Toll-free Consent Accepted
                         </label>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                         <button 
                            type="button"
                            onClick={() => setEditingUser(null)}
                            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                         >
                            Cancel
                         </button>
                         <button 
                            type="submit"
                            disabled={updatingUser}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                         >
                            {updatingUser ? 'Saving...' : 'Save Changes'}
                         </button>
                      </div>
                   </form>
                </div>
             </div>
          )}

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <h2 className="text-2xl font-bold mb-6 text-slate-800">Manage Properties</h2>
             
             <form onSubmit={handleCreateProperty} className="mb-8 p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                 <h3 className="font-bold mb-4 text-slate-800">Add New Property</h3>
                 <div className="space-y-4">
                     <input name="name" required placeholder="Property Name" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                      <input name="location" required placeholder="Location (City, State)" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                     <textarea name="description" required placeholder="Description..." rows={3} className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                     
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                         <div className="flex justify-between items-center mb-2">
                             <span className="font-medium text-slate-700">Images ({previewImages.length}/35)</span>
                             <label className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-lg cursor-pointer text-sm font-bold flex gap-2 items-center transition-colors">
                                 <ImageIcon size={16} /> Upload Photos
                                 <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} disabled={uploadingProperty || previewImages.length >= 35} />
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
                     <div className="flex flex-wrap gap-6 items-center p-1">
                         <label className="flex items-center gap-2 font-medium cursor-pointer text-slate-600">
                            <input 
                              type="checkbox" 
                              name="hasSmartLock" 
                              checked={createHasSmartLock} 
                              onChange={(e) => setCreateHasSmartLock(e.target.checked)}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300" 
                            />
                            <span className="text-sm font-semibold">Has SmartLock</span>
                         </label>
                     </div>

                     {createHasSmartLock && (
                       <div className="p-1">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-tight block mb-1">Front Door SmartLock Code (Manual)</label>
                          <input name="frontDoorCode" placeholder="Auto / Custom" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm text-sm font-mono focus:ring-2 focus:ring-indigo-100 outline-none" />
                       </div>
                     )}
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
                      <form key={activePropertyId} onSubmit={handleUpdateProperty} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-4">
                             <input name="name" defaultValue={p.name} required placeholder="Property Name" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                              <input name="location" defaultValue={p.location} required placeholder="Location (City, State)" className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                             <textarea name="description" defaultValue={p.description} required placeholder="Description..." rows={5} className="w-full border border-slate-200 rounded-xl p-3 bg-white shadow-sm" />
                             
                             <div className="flex flex-wrap gap-6 items-center">
                                 <label className="flex items-center gap-2 font-medium cursor-pointer text-slate-600">
                                    <input 
                                       type="checkbox" 
                                       name="hasSmartLock" 
                                       checked={editHasSmartLock} 
                                       onChange={(e) => setEditHasSmartLock(e.target.checked)}
                                       className="w-4 h-4 text-indigo-600 rounded" 
                                    />
                                    <span className="text-sm font-semibold">Has SmartLock</span>
                                 </label>
                                 <label className="flex items-center gap-2 font-medium cursor-pointer text-slate-600">
                                    <input type="checkbox" name="allowIndividualRoomRental" defaultChecked={p.allowIndividualRoomRental} className="w-4 h-4 text-indigo-600 rounded" />
                                    <span className="text-sm font-semibold">Allow Individual Room rentals</span>
                                 </label>
                             </div>

                             {editHasSmartLock && (
                                <div className="p-4 bg-indigo-50 border border-indigo-200 border-dashed rounded-2xl space-y-2 mt-4">
                                   <label className="text-xs font-bold text-indigo-750 uppercase tracking-tight block">Front Door SmartLock Code (Manual)</label>
                                   <input 
                                      type="text" 
                                      name="frontDoorCode" 
                                      defaultValue={p.frontDoorCode || ''} 
                                      placeholder="e.g. 1234 or 4321 / leave blank for random" 
                                      className="w-full border border-indigo-200 rounded-xl p-3 bg-white shadow-sm text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-indigo-100 outline-none" 
                                   />
                                </div>
                             )}

                             <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-colors">Update Info</button>
                         </div>
                         <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                             <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm mb-2">
                                <h4 className="font-bold text-slate-800">Bedrooms Configuration</h4>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">{editingBedrooms.length} Rooms Total</span>
                             </div>
                             
                             <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                 {editingBedrooms.map((b, i) => (
                                     <div key={i} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group">
                                         <button 
                                            type="button" 
                                            onClick={() => setEditingBedrooms(prev => prev.filter((_, idx) => idx !== i))} 
                                            className="absolute top-3 right-3 text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                                         >
                                             <Trash2 size={16} />
                                         </button>

                                         <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                                            <div className="col-span-1">
                                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5 tracking-wider">Room Number</label>
                                                <input 
                                                    type="text" 
                                                    value={b.roomNumber} 
                                                    onChange={(e) => {
                                                        const newRooms = [...editingBedrooms];
                                                        newRooms[i] = { ...newRooms[i], roomNumber: e.target.value };
                                                        setEditingBedrooms(newRooms);
                                                    }}
                                                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none font-semibold text-slate-700" 
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5 tracking-wider">Lock #</label>
                                                <input 
                                                    type="text" 
                                                    value={b.roomLockNumber} 
                                                    onChange={(e) => {
                                                        const newRooms = [...editingBedrooms];
                                                        newRooms[i] = { ...newRooms[i], roomLockNumber: e.target.value };
                                                        setEditingBedrooms(newRooms);
                                                    }}
                                                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none font-semibold text-slate-700" 
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5 tracking-wider">Sq Ft</label>
                                                <input 
                                                    type="number" 
                                                    value={b.sqFt} 
                                                    onChange={(e) => {
                                                        const newRooms = [...editingBedrooms];
                                                        newRooms[i] = { ...newRooms[i], sqFt: parseInt(e.target.value) || 0 };
                                                        setEditingBedrooms(newRooms);
                                                    }}
                                                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none font-semibold text-slate-700" 
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5 tracking-wider">Per Night Fee ($)</label>
                                                <input 
                                                    type="number" 
                                                    value={b.fee} 
                                                    onChange={(e) => {
                                                        const newRooms = [...editingBedrooms];
                                                        newRooms[i] = { ...newRooms[i], fee: parseInt(e.target.value) || 0 };
                                                        setEditingBedrooms(newRooms);
                                                    }}
                                                    className="w-full border border-indigo-100 rounded-xl p-2.5 text-sm bg-indigo-50/30 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all outline-none font-bold text-indigo-600" 
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5 tracking-wider">Room Type</label>
                                                <select 
                                                    value={b.type} 
                                                    onChange={(e) => {
                                                        const newRooms = [...editingBedrooms];
                                                        newRooms[i] = { ...newRooms[i], type: e.target.value as 'Master Bed' | 'Guest Bedroom' };
                                                        setEditingBedrooms(newRooms);
                                                    }}
                                                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none font-semibold text-slate-700"
                                                >
                                                    <option value="Master Bed">Master Bed</option>
                                                    <option value="Guest Bedroom">Guest Bedroom</option>
                                                </select>
                                            </div>
                                         </div>
                                     </div>
                                 ))}
                                 {editingBedrooms.length === 0 && (
                                     <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm italic">
                                         No rooms added yet. Use the tool below to add bedrooms.
                                     </div>
                                 )}
                             </div>
                             
                             <div className="bg-white p-6 rounded-2xl border-2 border-indigo-100 shadow-lg shadow-indigo-100/20 space-y-4">
                                 <h5 className="text-xs font-black uppercase text-indigo-500 tracking-widest flex items-center gap-2">
                                     <Plus size={14} /> Add New Bedroom
                                 </h5>
                                 <div className="grid grid-cols-2 gap-3">
                                     <input type="text" id="newRoomNumber" placeholder="Room #" className="p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" />
                                     <input type="text" id="newRoomLock" placeholder="Lock #" className="p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" />
                                     <input type="number" id="newRoomSqFt" placeholder="Sq Ft" className="p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" />
                                     <input type="number" id="newRoomFee" placeholder="Fee ($)" className="p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" />
                                 </div>
                                 <select id="newRoomType" className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all">
                                     <option value="Master Bed">Master Bed</option>
                                     <option value="Guest Bedroom">Guest Bedroom</option>
                                 </select>
                                 <button 
                                     type="button" 
                                     onClick={() => {
                                         const roomNumber = (document.getElementById('newRoomNumber') as HTMLInputElement).value;
                                         const roomLockNumber = (document.getElementById('newRoomLock') as HTMLInputElement).value;
                                         const sqFt = parseInt((document.getElementById('newRoomSqFt') as HTMLInputElement).value || '0');
                                         const fee = parseInt((document.getElementById('newRoomFee') as HTMLInputElement).value || '0');
                                         const type = (document.getElementById('newRoomType') as HTMLSelectElement).value as 'Master Bed' | 'Guest Bedroom';
                                         if(roomNumber && roomLockNumber) {
                                             setEditingBedrooms(prev => [...prev, { roomNumber, roomLockNumber, type, sqFt, fee }]);
                                             // Reset inputs
                                             (document.getElementById('newRoomNumber') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomLock') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomSqFt') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomFee') as HTMLInputElement).value = '';
                                         }
                                     }} 
                                     className="w-full bg-indigo-600 hover:bg-slate-900 text-white p-3.5 rounded-xl font-bold shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                                 >
                                     <Plus size={18} /> Add Room to List
                                 </button>
                             </div>
                         </div>
                         <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                             <div className="flex justify-between items-center mb-4">
                                 <span className="font-medium text-slate-700">Images ({p.images.length}/35)</span>
                                 <label className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg cursor-pointer text-sm font-bold flex gap-2 items-center transition-colors">
                                     <ImageIcon size={14} /> Add Photos
                                     <input type="file" multiple accept="image/*" className="hidden" disabled={uploadingProperty || p.images.length >= 35} onChange={async (e) => {
                                         if (!e.target.files) return;
                                         setUploadingProperty(true);
                                         try {
                                             const files = Array.from(e.target.files).slice(0, 35 - p.images.length);
                                             const compressed = await Promise.all(files.map(f => compressImage(f as File)));
                                             await handleUpdatePropertyImages([...p.images, ...compressed]);
                                         } catch (err) { console.error(err); }
                                         setUploadingProperty(false);
                                     }} />
                                 </label>
                             </div>
                             {p.images.length > 0 && (
                                  <p className="text-[11px] text-slate-500 mb-2 font-medium">
                                      💡 Click on an image to select it, then click another space/image to move it. Or drag and drop to reorder.
                                  </p>
                              )}
                              <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto pr-2">
                                  {p.images.map((src, i) => {
                                      const isSelected = selectedEditImageIndex === i;
                                      return (
                                          <div 
                                              key={i} 
                                              draggable
                                              onDragStart={(e) => {
                                                  e.dataTransfer.setData("text/plain", i.toString());
                                                  setSelectedEditImageIndex(i);
                                              }}
                                              onDragOver={(e) => e.preventDefault()}
                                              onDrop={async (e) => {
                                                  e.preventDefault();
                                                  const fromIdxStr = e.dataTransfer.getData("text/plain");
                                                  if (fromIdxStr !== "") {
                                                      const fromIdx = parseInt(fromIdxStr, 10);
                                                      if (fromIdx !== i) {
                                                          const newImages = moveImageInArray(p.images, fromIdx, i);
                                                          await handleUpdatePropertyImages(newImages);
                                                      }
                                                  }
                                                  setSelectedEditImageIndex(null);
                                              }}
                                              onClick={async () => {
                                                  if (selectedEditImageIndex === null) {
                                                      setSelectedEditImageIndex(i);
                                                  } else if (selectedEditImageIndex === i) {
                                                      setSelectedEditImageIndex(null);
                                                  } else {
                                                      const newImages = moveImageInArray(p.images, selectedEditImageIndex, i);
                                                      await handleUpdatePropertyImages(newImages);
                                                      setSelectedEditImageIndex(null);
                                                  }
                                              }}
                                              className={cn(
                                                  "relative w-20 h-20 group rounded-lg border cursor-pointer overflow-hidden transition-all duration-200 select-none",
                                                  isSelected 
                                                      ? "ring-4 ring-indigo-600 ring-offset-1 scale-105 border-transparent z-10 shadow-md"
                                                      : "border-slate-200 hover:scale-105 hover:border-indigo-300"
                                              )}
                                          >
                                              <img src={src} className="w-full h-full object-cover" />
                                              <button 
                                                  type="button" 
                                                  onClick={async (e) => {
                                                      e.stopPropagation();
                                                      await handleUpdatePropertyImages(p.images.filter((_, idx)=>idx!==i));
                                                      if (selectedEditImageIndex === i) setSelectedEditImageIndex(null);
                                                      else if (selectedEditImageIndex !== null && selectedEditImageIndex > i) {
                                                          setSelectedEditImageIndex(selectedEditImageIndex - 1);
                                                      }
                                                  }} 
                                                  className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow-sm transition-colors z-20"
                                              >
                                                  x
                                              </button>
                                              {isSelected && (
                                                  <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center">
                                                      <span className="bg-indigo-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow">SELECTED</span>
                                                  </div>
                                              )}
                                              <div className="absolute hidden group-hover:flex bottom-1 left-0 right-0 justify-center gap-1 z-20">
                                                  {i > 0 && (
                                                     <button 
                                                         type="button" 
                                                         onClick={async (e) => { 
                                                             e.stopPropagation(); 
                                                             await handleMoveImage(p, i, "left"); 
                                                         }} 
                                                         className="bg-slate-800/80 text-white p-1 rounded hover:bg-slate-800 transition-colors"
                                                     >
                                                         <ArrowLeft size={12} />
                                                     </button>
                                                  )}
                                                  {i < p.images.length - 1 && (
                                                     <button 
                                                         type="button" 
                                                         onClick={async (e) => { 
                                                             e.stopPropagation(); 
                                                             await handleMoveImage(p, i, "right"); 
                                                         }} 
                                                         className="bg-slate-800/80 text-white p-1 rounded hover:bg-slate-800 transition-colors"
                                                     >
                                                         <ArrowRight size={12} />
                                                     </button>
                                                  )}
                                              </div>
                                          </div>
                                      );
                                  })}
                                  {uploadingProperty && <div className="w-20 h-20 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-xs text-slate-500 animate-pulse">Wait...</div>}
                              </div>
                             </div>
                      </form>
                   </div>
                 );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">Pricing Rules <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-md">{properties.find(p => p.id === activePropertyId)?.name}</span></h2>
                        
                        {properties.find(p => p.id === activePropertyId)?.allowIndividualRoomRental && (
                            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                               <button 
                                 onClick={() => { setPricingTarget('property'); setSelectedRoomForPricing(null); }}
                                 className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", pricingTarget === 'property' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700")}
                               >
                                 Rent Property
                               </button>
                               <button 
                                 onClick={() => setPricingTarget('room')}
                                 className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", pricingTarget === 'room' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700")}
                               >
                                 Rent Rooms
                               </button>
                            </div>
                        )}
                    </div>
                   <form onSubmit={handleCreatePricingRule} className="space-y-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                       {pricingTarget === 'room' && (
                          <div>
                             <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Select Room</label>
                             <select 
                                value={selectedRoomForPricing || ''} 
                                onChange={(e) => setSelectedRoomForPricing(e.target.value)}
                                required 
                                className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm"
                             >
                                <option value="">Choose a room...</option>
                                {properties.find(p => p.id === activePropertyId)?.bedrooms?.map(room => (
                                   <option key={room.roomNumber} value={room.roomNumber}>{room.type} {room.roomNumber}</option>
                                ))}
                             </select>
                          </div>
                       )}
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Type</label>
                            <select name="type" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 required bg-white shadow-sm">
                               <option value="default">Default Layer</option>
                               <option value="daily">Daily Pricing Rule</option>
                               <option value="five_day">5-Day Pricing Rule</option>
                               <option value="weekly">Weekly Pricing Rule</option>
                               <option value="monthly">Monthly Pricing Rule</option>
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

                   <div className="space-y-4">
                        {pricingTarget === 'room' && (
                             <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                                 <button 
                                    type="button"
                                    onClick={() => setSelectedRoomForPricing(null)}
                                    className={cn("px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all", !selectedRoomForPricing ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}
                                 >
                                     All Rooms
                                 </button>
                                 {properties.find(p => p.id === activePropertyId)?.bedrooms?.map(room => (
                                     <button 
                                        type="button"
                                        key={room.roomNumber}
                                        onClick={() => setSelectedRoomForPricing(room.roomNumber)}
                                        className={cn("px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all", selectedRoomForPricing === room.roomNumber ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}
                                     >
                                         Room {room.roomNumber}
                                     </button>
                                 ))}
                             </div>
                        )}
                       {activeRules.filter(r => {
                           if (pricingTarget === 'property') return !r.targetType || r.targetType === 'property';
                           if (pricingTarget === 'room') {
                               if (!selectedRoomForPricing) return r.targetType === 'room';
                               return r.targetType === 'room' && r.roomNumber === selectedRoomForPricing;
                           }
                           return true;
                       }).length === 0 && <p className="text-sm text-slate-500 text-center py-4">No rules configured for this selection.</p>}
                       
                       {activeRules.filter(r => {
                           if (pricingTarget === 'property') return !r.targetType || r.targetType === 'property';
                           if (pricingTarget === 'room') {
                               if (!selectedRoomForPricing) return r.targetType === 'room';
                               return r.targetType === 'room' && r.roomNumber === selectedRoomForPricing;
                           }
                           return true;
                       }).map(r => (
                          <div key={r.id} className="border border-slate-200 p-3 rounded-xl flex justify-between items-center text-sm shadow-sm bg-white group">
                             <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-800">
                                       {r.type === 'five_day' ? '5-Day Rate' : r.type === 'daily' ? 'Daily Rate' : r.type === 'weekly' ? 'Weekly Rate' : r.type === 'monthly' ? 'Monthly Rate' : (r.type === 'default' ? 'Default Layer' : r.type)}
                                    </span>
                                    {r.targetType === 'room' && (
                                        <span className="text-[10px] bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">Room {r.roomNumber}</span>
                                    )}
                                </div>
                                {r.startDate && <span className="text-xs text-slate-500">({r.startDate} to {r.endDate})</span>}
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
                   <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">Blackout Dates <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-md">{properties.find(p => p.id === activePropertyId)?.name}</span></h2>
                      
                      {activeBlackouts.length > 0 && (
                         <div className="flex items-center gap-3">
                            {selectedBlackoutIds.length > 0 && (
                               <button 
                                 onClick={handleDeleteMultipleBlackouts}
                                 className="text-xs bg-red-50 text-red-600 font-bold px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
                               >
                                  <Trash2 size={14}/> Delete {selectedBlackoutIds.length}
                               </button>
                            )}
                            <button 
                              onClick={toggleSelectAllBlackouts}
                              className="text-xs bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                            >
                               {selectedBlackoutIds.length === activeBlackouts.length ? 'Unselect All' : 'Select All'}
                            </button>
                         </div>
                      )}
                   </div>
                   <form onSubmit={handleCreateBlackout} className="flex flex-col gap-4 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex gap-2">
                              <input name="startDate" type="date" required className="w-1/2 border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                              <input name="endDate" type="date" className="w-1/2 border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" title="Optional end date for multi-day blackouts" />
                          </div>
                          <input name="reason" type="text" placeholder="Reason/Details" className="border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm" />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-4 items-center">
                         <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-2 px-2">
                               <input 
                                 type="radio" 
                                 id="blackout_prop" 
                                 name="targetType" 
                                 value="property" 
                                 checked={blackoutTarget === 'property'} 
                                 onChange={() => setBlackoutTarget('property')} 
                               />
                               <label htmlFor="blackout_prop" className="text-sm font-bold text-slate-700">Entire Property</label>
                            </div>
                            <div className="flex items-center gap-2 px-2 border-l border-slate-100">
                               <input 
                                 type="radio" 
                                 id="blackout_room" 
                                 name="targetType" 
                                 value="room" 
                                 disabled={!properties.find(p => p.id === activePropertyId)?.allowIndividualRoomRental}
                                 checked={blackoutTarget === 'room'} 
                                 onChange={() => setBlackoutTarget('room')} 
                               />
                               <label htmlFor="blackout_room" className={cn("text-sm font-bold", properties.find(p => p.id === activePropertyId)?.allowIndividualRoomRental ? "text-slate-700" : "text-slate-300")}>Specific Room</label>
                            </div>
                         </div>

                         {blackoutTarget === 'room' && (
                            <select name="roomNumber" required value={selectedRoomForBlackout || ''} onChange={e => setSelectedRoomForBlackout(e.target.value)} className="border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm text-sm">
                               <option value="">Select Room</option>
                               {properties.find(p => p.id === activePropertyId)?.bedrooms?.map(room => (
                                   <option key={room.roomNumber} value={room.roomNumber}>{room.type} ({room.roomNumber})</option>
                               ))}
                            </select>
                         )}

                         <button type="submit" className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-indigo-500 transition-colors ml-auto shadow-md">Add Blackout</button>
                      </div>
                   </form>

                   <div className="space-y-2 max-h-[340px] overflow-y-auto pr-2">
                       {activeBlackouts.length === 0 && <p className="text-sm text-slate-500 text-center">No blackouts configured for this property.</p>}
                      {activeBlackouts.map(b => (
                         <div key={b.id} className={cn("border p-3 rounded-xl flex justify-between items-center text-sm shadow-sm transition-colors group", selectedBlackoutIds.includes(b.id) ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-200")}>
                            <div className="flex gap-3 items-center">
                               <input 
                                 type="checkbox" 
                                 checked={selectedBlackoutIds.includes(b.id)} 
                                 onChange={() => toggleBlackoutSelection(b.id)}
                                 className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                               />
                               <div className="flex gap-4 items-center">
                                  <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", b.targetType === 'room' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700")}>
                                      {b.targetType === 'room' ? `Room ${b.roomNumber}` : 'Full Property'}
                                  </span>
                                  <span className="font-bold text-slate-800">{b.date}</span>
                                  <span className="text-slate-500">{b.reason || 'No reason'}</span>
                               </div>
                            </div>
                            <button type="button" onClick={() => handleDeleteBlackout(b.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                         </div>
                      ))}
                   </div>
                </div>
              </div>
            </div>
          )}

          {showInvoiceTemplate && pendingBookingData && (
             <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                   {/* Header Row */}
                   <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                         <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg"><FileDown size={18}/></span>
                            Admin Invoice Customizer Template Page
                         </h3>
                         <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 text-left">
                            Review and update billing details below. The invoice will be automatically emailed to the responsible party to complete this booking override.
                         </p>
                      </div>
                      <button 
                         onClick={() => {
                            setShowInvoiceTemplate(false);
                            setPendingBookingData(null);
                         }} 
                         className="text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold"
                      >
                         Cancel Override
                      </button>
                   </div>

                   {/* Main Content (Split Side-by-Side: Left fields, Right Preview) */}
                   <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-100/40">
                      
                      {/* Left: Input Customizer fields */}
                      <form id="invoiceCustForm" onSubmit={handleSendInvoiceAndCompleteBooking} className="lg:col-span-5 space-y-6">
                         <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h4 className="text-sm font-bold text-indigo-900 border-b border-indigo-50 pb-2 mb-2 flex items-center gap-2">
                               Sponsor / Billing Party Info
                            </h4>
                            <div>
                               <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Sponsor Name <span className="text-red-500">*</span></label>
                               <input 
                                  type="text" 
                                  required 
                                  value={invoiceSponsorName || ''} 
                                  onChange={e => setInvoiceSponsorName(e.target.value)}
                                  placeholder="e.g. FEMA, Department of Defense, King County Sponsor" 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                               />
                            </div>
                            <div>
                               <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Sponsor Billing Email <span className="text-red-500">*</span></label>
                               <input 
                                  type="email" 
                                  required 
                                  value={invoiceSponsorEmail || ''} 
                                  onChange={e => setInvoiceSponsorEmail(e.target.value)}
                                  placeholder="finance@agency.gov" 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                               />
                            </div>
                            <div>
                               <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Sponsor Phone (Optional)</label>
                               <input 
                                  type="text" 
                                  value={invoiceSponsorPhone || ''} 
                                  onChange={e => setInvoiceSponsorPhone(e.target.value)}
                                  placeholder="+1 (555) 012-3456" 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                               />
                            </div>
                            <div>
                               <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Sponsor Billing Address (Optional)</label>
                               <textarea 
                                  rows={2}
                                  value={invoiceSponsorAddress || ''} 
                                  onChange={e => setInvoiceSponsorAddress(e.target.value)}
                                  placeholder="123 Gov Plaza, Suite 400&#10;Seattle, WA 98101" 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm resize-none" 
                               />
                            </div>
                         </div>

                         <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <h4 className="text-sm font-bold text-indigo-900 border-b border-indigo-50 pb-2 mb-2">
                               Invoice Configuration
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Invoice No.</label>
                                  <input 
                                     type="text" 
                                     required 
                                     value={invoiceNumber || ''} 
                                     onChange={e => setInvoiceNumber(e.target.value)}
                                     className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-slate-50 shadow-sm text-sm font-mono text-slate-600" 
                                  />
                               </div>
                               <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Payment Due</label>
                                  <input 
                                     type="date" 
                                     required 
                                     value={invoiceDueDate || ''} 
                                     onChange={e => setInvoiceDueDate(e.target.value)}
                                     className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                                  />
                               </div>
                            </div>
                            <div>
                               <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Custom Notes / Letterhead Message</label>
                               <textarea 
                                  rows={3}
                                  value={invoiceCustomNotes || ''} 
                                  onChange={e => setInvoiceCustomNotes(e.target.value)}
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm resize-none" 
                               />
                            </div>
                         </div>
                      </form>

                      {/* Right: Live Interactive Layout Letter/Invoice Preview */}
                      <div className="lg:col-span-7 flex flex-col">
                         <div className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider flex items-center justify-between">
                            <span>Live Email Letterhead Preview</span>
                            <span className="text-indigo-600">REALCal Bookings System Template</span>
                         </div>
                         <div className="flex-1 bg-white p-8 rounded-3xl border border-slate-200 shadow-lg overflow-y-auto max-h-[500px] text-left">
                            {/* REALCal Logo Letterhead */}
                            <div className="flex flex-col md:flex-row justify-between items-start mb-6">
                               <div>
                                  <div className="text-2xl font-black text-indigo-600 tracking-tight">
                                     REALCal <span className="font-light text-slate-800">Bookings</span>
                                  </div>
                                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">
                                     Premium Lodging & Luxury Residential Housing
                                  </div>
                               </div>
                               <div className="mt-4 md:mt-0 text-right">
                                  <div className="text-lg font-black text-slate-800">INVOICE</div>
                                  <div className="text-xs font-mono text-slate-500">No: <strong className="text-slate-800">{invoiceNumber || 'NEW-INV'}</strong></div>
                                  <div className="text-xs text-slate-500">Date: {format(new Date(), 'yyyy-MM-dd')}</div>
                               </div>
                            </div>

                            <hr className="border-slate-100 my-4" />

                            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                               <div>
                                  <div className="text-[10px] uppercase font-extrabold text-indigo-600 mb-1">Bill From</div>
                                  <div className="font-bold text-slate-800">REALCal Bookings</div>
                                  <div className="text-xs text-slate-500 mt-1">
                                     C.&S.H. Group Properties, LLC
                                  </div>
                                  <div className="text-xs text-slate-500">
                                     billing@cashgroupproperties.com
                                  </div>
                               </div>
                               <div>
                                  <div className="text-[10px] uppercase font-extrabold text-indigo-600 mb-1">Bill To (Sponsor)</div>
                                  {invoiceSponsorName ? (
                                     <>
                                        <div className="font-bold text-slate-800">{invoiceSponsorName}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">{invoiceSponsorEmail}</div>
                                        {invoiceSponsorPhone && <div className="text-xs text-slate-500">{invoiceSponsorPhone}</div>}
                                        {invoiceSponsorAddress && <div className="text-xs text-slate-500 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100 whitespace-pre-wrap">{invoiceSponsorAddress}</div>}
                                     </>
                                  ) : (
                                     <div className="text-xs italic text-red-400 bg-red-50 p-3 rounded-xl border border-dashed border-red-200">
                                        ⚠️ Please specify Sponsor Name first to preview live
                                     </div>
                                  )}
                               </div>
                            </div>

                            {/* Main booking content recap */}
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6 text-sm space-y-2">
                               <div className="text-[10px] uppercase font-extrabold text-slate-400">Covered Guest Reservation Details</div>
                               <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                  <div>
                                     <span className="text-xs text-slate-400">Guest Name:</span>
                                     <div className="font-bold text-slate-800">{pendingBookingData.guestName}</div>
                                  </div>
                                  <div>
                                     <span className="text-xs text-slate-400">Destination:</span>
                                     <div className="font-bold text-slate-800">
                                        {properties.find(p => p.id === pendingBookingData.propertyId)?.name || 'REALCal Property'}
                                     </div>
                                  </div>
                                  {pendingBookingData.manualBookingRooms && pendingBookingData.manualBookingRooms.length > 0 && (
                                     <div>
                                        <span className="text-xs text-slate-400">Allocated Room(s):</span>
                                        <div className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded w-max">
                                           Rooms {pendingBookingData.manualBookingRooms.join(', ')}
                                        </div>
                                     </div>
                                  )}
                                  <div>
                                     <span className="text-xs text-slate-400">Stay Interval:</span>
                                     <div className="font-bold text-slate-800 text-xs">
                                        {pendingBookingData.checkIn} to {pendingBookingData.checkOut}
                                     </div>
                                  </div>
                               </div>
                            </div>

                            {/* Line items pricing */}
                            <table className="w-full text-sm mb-6">
                               <thead>
                                  <tr className="border-b-2 border-slate-100 text-slate-400 text-xs text-left">
                                     <th className="py-2 font-bold uppercase">Description</th>
                                     <th className="py-2 text-right font-bold uppercase">Amount</th>
                                  </tr>
                               </thead>
                               <tbody>
                                  <tr className="border-b border-slate-100">
                                     <td className="py-3">
                                        <div className="font-bold text-slate-800">Guest Rental Override Access Fee</div>
                                        <div className="text-xs text-slate-400 mt-1">Lodging coverage override booked manually by Administrator</div>
                                     </td>
                                     <td className="py-3 text-right font-mono font-bold text-slate-800">
                                        ${Number(pendingBookingData.totalPrice).toFixed(2)}
                                     </td>
                                  </tr>
                                  <tr>
                                     <td className="py-4 text-base font-black text-slate-800">Grand Total Due:</td>
                                     <td className="py-4 text-right text-lg font-black text-indigo-600 font-mono">
                                        ${Number(pendingBookingData.totalPrice).toFixed(2)}
                                     </td>
                                  </tr>
                                </tbody>
                            </table>

                            {/* Custom notes box preview */}
                            {invoiceCustomNotes && (
                               <div className="border-l-4 border-indigo-400 bg-indigo-50/50 p-3.5 rounded-r-2xl text-xs text-slate-600 italic whitespace-pre-wrap mb-6 text-left">
                                  {invoiceCustomNotes}
                                </div>
                            )}

                            <hr className="border-slate-100 my-4" />

                            {/* Footer Branding required! C.&S.H. Group Properties, LLC */}
                            <div className="text-center">
                               <div className="text-[10px] text-slate-400 font-bold uppercase">Corporate Management & Invoicing Entity</div>
                               <div className="text-sm font-black text-slate-700 mt-1">C.&S.H. Group Properties, LLC</div>
                               <div className="text-[9px] text-slate-400 mt-1">REALCal Bookings &bull; Luxury Lodging Solutions &bull; Atlanta, GA</div>
                            </div>
                         </div>
                      </div>

                   </div>

                   {/* Footer Actions */}
                   <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 items-center">
                      <span className="text-xs text-slate-500 font-bold mr-auto flex items-center gap-1.5 pb-0.5">
                         <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse inline-block"></span> Complete booking & emit automatically on click
                      </span>
                      <button 
                         type="button"
                         onClick={() => {
                            setShowInvoiceTemplate(false);
                            setPendingBookingData(null);
                         }} 
                         className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm transition-all"
                      >
                         Cancel
                      </button>
                      <button 
                         type="submit"
                         form="invoiceCustForm"
                         disabled={sendingInvoice}
                         className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 text-sm transition-colors shadow-md shadow-indigo-100"
                      >
                         {sendingInvoice ? (
                            <>
                               <RefreshCw className="animate-spin" size={16}/> Sending & Booking...
                            </>
                         ) : (
                            <>
                               <Mail size={16}/> Email Invoice & Complete Booking
                            </>
                         )}
                      </button>
                   </div>
                </div>
             </div>
          )}

       </div>
    </div>
  )
}
