import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, signOut } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc, writeBatch, orderBy } from 'firebase/firestore';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO, addDays } from 'date-fns';
import { cn } from '../lib/utils';
import { BlackoutDate, PricingRule, Booking, Property, PropertyManager, PropertyImage, getImageUrl, getImageRoomNumber, DiscountCode } from '../types';
import { Users, FileDown, TrendingUp, Settings, Plus, Image as ImageIcon, Trash2, Phone, Mail, Calendar as CalendarIcon, DollarSign, LogOut, ArrowLeft, ArrowRight, RefreshCw, MessageSquare, CheckCircle, Loader2, FileText, XCircle, HelpCircle, MapPin, Upload, Database, Ticket, Send, Clock, Bell, FileCheck, RotateCw, CheckSquare, Copy, Search, X, AlertTriangle, Video, Eraser } from 'lucide-react';
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
  const [editingBedrooms, setEditingBedrooms] = useState<{ roomNumber: string; roomLockNumber: string; type: 'Master Bed' | 'Guest Bedroom'; sqFt: number; fee: number; maxCapacity?: number }[]>([]);
  const [createPromoVideoUrl, setCreatePromoVideoUrl] = useState<string>('');
  const [editPromoVideoUrl, setEditPromoVideoUrl] = useState<string>('');

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
          alert("Video file size is too large (max 50MB). Please enter a YouTube, Vimeo, or Hosted Video URL instead, or upload a smaller clip.");
          return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
          const result = evt.target?.result as string;
          if (result) {
              if (isEdit) {
                  setEditPromoVideoUrl(result);
              } else {
                  setCreatePromoVideoUrl(result);
              }
          }
      };
      reader.readAsDataURL(file);
  };

  const renderAdminVideoPreview = (url: string) => {
      if (!url) return null;
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (ytMatch && ytMatch[1]) {
          return (
              <iframe
                  src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                  title="Video Preview"
                  className="w-full h-40 rounded-xl border-0"
              />
          );
      }
      const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)/);
      if (vimeoMatch && vimeoMatch[1]) {
          return (
              <iframe
                  src={`https://player.vimeo.com/video/${vimeoMatch[1]}`}
                  title="Video Preview"
                  className="w-full h-40 rounded-xl border-0"
              />
          );
      }
      return (
          <video src={url} controls className="w-full h-40 rounded-xl object-cover bg-black" />
      );
  };
  
  // Manual booking states
  const [manualBookingPropId, setManualBookingPropId] = useState<string>('');
  const [manualBookingRooms, setManualBookingRooms] = useState<string[]>([]);
  const [manualBookingCheckIn, setManualBookingCheckIn] = useState<string>('');
  const [manualBookingCheckOut, setManualBookingCheckOut] = useState<string>('');
  const [manualGuestName, setManualGuestName] = useState<string>('');
  const [manualGuestEmail, setManualGuestEmail] = useState<string>('');
  const [manualGuestPhone, setManualGuestPhone] = useState<string>('');
  const [manualTotalPrice, setManualTotalPrice] = useState<string>('');
  const [manualAccessCode, setManualAccessCode] = useState<string>('');
  const [editingAccessCodeId, setEditingAccessCodeId] = useState<string | null>(null);
  const [editHasSmartLock, setEditHasSmartLock] = useState<boolean>(false);
  const [createHasSmartLock, setCreateHasSmartLock] = useState<boolean>(false);

  // Duplicate Previous Invoice states
  const [showDuplicateInvoiceModal, setShowDuplicateInvoiceModal] = useState<boolean>(false);
  const [duplicateSearchTerm, setDuplicateSearchTerm] = useState<string>('');

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
  const [invoiceDaysLate, setInvoiceDaysLate] = useState<number>(0);
  const [invoiceLateFeePerDay, setInvoiceLateFeePerDay] = useState<number>(25);
  const [sendingInvoice, setSendingInvoice] = useState<boolean>(false);
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<string | null>(null);
  const [viewingInvoiceBooking, setViewingInvoiceBooking] = useState<any | null>(null);

  // Invoice Cancellation States
  const [cancellingInvoiceBooking, setCancellingInvoiceBooking] = useState<any | null>(null);
  const [invoiceCancelNote, setInvoiceCancelNote] = useState<string>('');
  const [invoiceCancelFee, setInvoiceCancelFee] = useState<number>(0);
  const [invoiceCancelNotifySponsor, setInvoiceCancelNotifySponsor] = useState<boolean>(true);
  const [invoiceCancelNotifyGuest, setInvoiceCancelNotifyGuest] = useState<boolean>(true);
  const [invoiceCancelNotifyManagers, setInvoiceCancelNotifyManagers] = useState<boolean>(true);
  const [cancellingInvoiceLoading, setCancellingInvoiceLoading] = useState<boolean>(false);

  // Paid confirmation resend states
  const [resendingConfirmationBooking, setResendingConfirmationBooking] = useState<Booking | null>(null);
  const [resendNotifyAdmins, setResendNotifyAdmins] = useState(true);
  const [resendNotifyGuest, setResendNotifyGuest] = useState(true);
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);

  // Manual Lease Creation & Management States
  const [showManualLeaseForm, setShowManualLeaseForm] = useState<boolean>(false);
  const [selectedInvoiceBookingId, setSelectedInvoiceBookingId] = useState<string>('');
  const [manualLeaseCode, setManualLeaseCode] = useState<string>('LSE-' + Math.random().toString(36).substring(2, 7).toUpperCase());
  const [manualLeaseType, setManualLeaseType] = useState<'month_to_month' | 'fixed'>('month_to_month');
  const [manualTenantName, setManualTenantName] = useState<string>('');
  const [manualTenantEmail, setManualTenantEmail] = useState<string>('');
  const [manualTenantPhone, setManualTenantPhone] = useState<string>('');
  const [manualPropertyName, setManualPropertyName] = useState<string>('');
  const [manualStartDate, setManualStartDate] = useState<string>('');
  const [manualEndDate, setManualEndDate] = useState<string>('');
  const [manualMonthlyRent, setManualMonthlyRent] = useState<string>('');
  const [isCreatingManualLease, setIsCreatingManualLease] = useState<boolean>(false);
  const [sendingReminderLeaseId, setSendingReminderLeaseId] = useState<string | null>(null);

  // User profile editing states
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserRole, setEditUserRole] = useState<'user' | 'admin'>('user');
  const [editUserDisplayName, setEditUserDisplayName] = useState('');
  const [editUserPhotoURL, setEditUserPhotoURL] = useState('');
  const [editUserTollFreeAccept, setEditUserTollFreeAccept] = useState(false);
  const [updatingUser, setUpdatingUser] = useState(false);

  const [globalSettings, setGlobalSettings] = useState<any>(null);
  
  // CEO, Property Manager and FAQ Contact state variables
  const [ceoName, setCeoName] = useState('');
  const [ceoImage, setCeoImage] = useState('');
  const [ceoContact, setCeoContact] = useState('');
  const [pmName, setPmName] = useState('');
  const [pmImage, setPmImage] = useState('');
  const [pmContact, setPmContact] = useState('');
  const [contactUsEmail, setContactUsEmail] = useState('');
  const [contactUsPhone, setContactUsPhone] = useState('');
  const [contactUsAddress, setContactUsAddress] = useState('');
  const [contactUsText, setContactUsText] = useState('');
  const [cleaningFee, setCleaningFee] = useState<number>(100);
  const [allowLongTermRentals, setAllowLongTermRentals] = useState<boolean>(true);
  
  // Backup Import/Export states
  const [importingBackup, setImportingBackup] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  
  // Image uploader state
  const [uploadingProperty, setUploadingProperty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImages, setPreviewImages] = useState<PropertyImage[]>([]);
  const [selectedCreateImageIndex, setSelectedCreateImageIndex] = useState<number | null>(null);
  const [selectedEditImageIndex, setSelectedEditImageIndex] = useState<number | null>(null);

  // Discount Booking Rate Codes states
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newDiscountType, setNewDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [newDiscountValue, setNewDiscountValue] = useState<number>(10);
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [newPropertyId, setNewPropertyId] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [submittingDiscount, setSubmittingDiscount] = useState(false);

  const moveImageInArray = (arr: any[], fromIndex: number, toIndex: number): any[] => {
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
    onSnapshot(query(collection(db, 'bookings')), (snap) => setBookings(snap.docs.map(d => ({id: d.id, ...d.data() } as Booking)).filter(b => b.status !== 'pending_payment')), (error) => {
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
    onSnapshot(query(collection(db, 'discount_codes')), (snap) => setDiscountCodes(snap.docs.map(d => ({id: d.id, ...d.data() } as DiscountCode))), (error) => {
      console.error("Admin discount codes snapshot error:", error);
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
    if (globalSettings) {
      setCeoName(globalSettings.ceoName || '');
      setCeoImage(globalSettings.ceoImage || '');
      setCeoContact(globalSettings.ceoContact || '');
      setPmName(globalSettings.pmName || '');
      setPmImage(globalSettings.pmImage || '');
      setPmContact(globalSettings.pmContact || '');
      setContactUsEmail(globalSettings.contactUsEmail || '');
      setContactUsPhone(globalSettings.contactUsPhone || '');
      setContactUsAddress(globalSettings.contactUsAddress || '');
      setContactUsText(globalSettings.contactUsText || '');
      setCleaningFee(globalSettings.cleaningFee !== undefined ? globalSettings.cleaningFee : 100);
      setAllowLongTermRentals(globalSettings.allowLongTermRentals !== false);
    }
  }, [globalSettings]);

  useEffect(() => {
    if (activePropertyId) {
        const prop = properties.find(p => p.id === activePropertyId);
        if (prop) {
            setEditingBedrooms(prop.bedrooms || []);
            setEditHasSmartLock(prop.hasSmartLock || false);
            setEditPromoVideoUrl(prop.promoVideoUrl || '');
        } else {
            setEditingBedrooms([]);
            setEditHasSmartLock(false);
            setEditPromoVideoUrl('');
        }
    } else {
        setEditingBedrooms([]);
        setEditHasSmartLock(false);
        setEditPromoVideoUrl('');
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

  let totalCollected = 0;
  let totalPending = 0;

  bookings.forEach(b => {
    if (b.status === 'cancelled') {
      if (b.cancellationFee && b.cancellationFee > 0) {
        totalCollected += b.cancellationFee;
      }
      return;
    }

    if (b.paymentSchedule && Array.isArray(b.paymentSchedule) && b.paymentSchedule.length > 0) {
      b.paymentSchedule.forEach((sched: any) => {
        const schedAmountCents = Math.round((sched.amount || 0) * 100);
        if (sched.status === 'paid') {
          totalCollected += schedAmountCents;
        } else {
          totalPending += schedAmountCents;
        }
      });
      if (b.lateCheckoutFee && b.lateCheckoutFee > 0) {
        totalCollected += b.lateCheckoutFee;
      }
      return;
    }

    if (b.invoiceDetails) {
      const invAmountCents = Math.round((b.invoiceDetails.grandTotal !== undefined ? b.invoiceDetails.grandTotal : (b.totalPrice / 100)) * 100);
      if (b.invoiceDetails.paid) {
        totalCollected += invAmountCents;
      } else {
        totalPending += invAmountCents;
      }
      if (b.lateCheckoutFee && b.lateCheckoutFee > 0) {
        totalCollected += b.lateCheckoutFee;
      }
      return;
    }

    if (b.status === 'confirmed') {
      totalCollected += b.totalPrice;
      if (b.lateCheckoutFee && b.lateCheckoutFee > 0) {
        totalCollected += b.lateCheckoutFee;
      }
    } else if (b.status === 'pending' || b.status === 'pending_payment') {
      totalPending += b.totalPrice;
    }
  });

  const totalRevenue = totalCollected + totalPending;
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
          let maxDimension = 500;
          let quality = 0.5;
          let dataUrl = '';
          let attempts = 0;
          
          do {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > height) {
              if (width > maxDimension) { height *= maxDimension / width; width = maxDimension; }
            } else {
              if (height > maxDimension) { width *= maxDimension / height; height = maxDimension; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            dataUrl = canvas.toDataURL('image/jpeg', quality);
            
            if (dataUrl.length <= 22000 || attempts >= 5) {
              break;
            }
            
            maxDimension = Math.max(200, Math.floor(maxDimension * 0.8));
            quality = Math.max(0.15, quality * 0.8);
            attempts++;
          } while (attempts < 5);
          
          resolve(dataUrl);
        };
        img.onerror = () => reject("Image load error");
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject("File read error");
      reader.readAsDataURL(file);
    });
  };

  const optimizeBase64Image = (base64Str: string): Promise<string> => {
    if (!base64Str || base64Str.length <= 22000) {
      return Promise.resolve(base64Str);
    }
    if (!base64Str.startsWith('data:image/')) {
      return Promise.resolve(base64Str);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let maxDimension = 500;
        let quality = 0.5;
        let dataUrl = '';
        let attempts = 0;
        
        do {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height) {
            if (width > maxDimension) { height *= maxDimension / width; width = maxDimension; }
          } else {
            if (height > maxDimension) { width *= maxDimension / height; height = maxDimension; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          
          if (dataUrl.length <= 22000 || attempts >= 5) {
            break;
          }
          
          maxDimension = Math.max(200, Math.floor(maxDimension * 0.8));
          quality = Math.max(0.15, quality * 0.8);
          attempts++;
        } while (attempts < 5);
        
        resolve(dataUrl);
      };
      img.onerror = () => {
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  };

  const optimizeImageItem = async (img: string | PropertyImage): Promise<string | PropertyImage> => {
    if (!img) return img;
    if (typeof img === 'string') {
      return await optimizeBase64Image(img);
    }
    const optimizedUrl = await optimizeBase64Image(img.url);
    return { ...img, url: optimizedUrl };
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const files = Array.from(e.target.files);
      const remainingSlots = 35 - previewImages.length;
      if (files.length > remainingSlots) {
          alert(`You can only upload up to 35 images. (${remainingSlots} slots remaining)`);
      }
      
      const allowedFiles = files.slice(0, remainingSlots);
      setUploadingProperty(true);
      try {
          const compressed = await Promise.all(allowedFiles.map(f => compressImage(f as File)));
          const imageObjects: PropertyImage[] = compressed.map(url => ({ url, roomNumber: '' }));
          setPreviewImages(prev => [...prev, ...imageObjects]);
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
          const promoVideoUrl = (fd.get('promoVideoUrl') as string) || createPromoVideoUrl || '';
          const docRef = await addDoc(collection(db, 'properties'), {
              name: fd.get('name') as string,
              location: fd.get('location') as string,
              description: fd.get('description') as string,
              promoVideoUrl,
              images: previewImages,
              hasSmartLock,
              frontDoorCode: hasSmartLock ? (fd.get('frontDoorCode') as string || '') : '',
              allowIndividualRoomRental: fd.get('allowIndividualRoomRental') === 'on',
              bedrooms: [],
              createdAt: serverTimestamp()
          });
          (e.target as HTMLFormElement).reset();
          setPreviewImages([]);
          setCreatePromoVideoUrl('');
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

  const handleRejectLeaseRequest = async (id: string) => {
    if (!db) return;
    if (window.confirm("Are you sure you want to reject this lease request? This will release the blocked dates.")) {
      try {
        await updateDoc(doc(db, 'lease_requests', id), {
          status: 'rejected'
        });
        alert("Lease request has been rejected, and the blocked dates are now released.");
      } catch (err: any) {
        alert(`Error rejecting lease request: ${err.message}`);
      }
    }
  };

  const handleDeleteActiveLease = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this active lease? Doing so will invalidate the lease code.")) {
      try {
        const res = await fetch('/api/delete-lease', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leaseId: id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete lease');
      } catch (err: any) {
        if (db) {
          try {
            await deleteDoc(doc(db, 'leases', id));
            return;
          } catch (e: any) {}
        }
        alert(`Error deleting lease: ${err.message}`);
      }
    }
  };

  const handleInvoiceSelectionForLease = (bookingId: string) => {
    setSelectedInvoiceBookingId(bookingId);
    if (!bookingId) return;
    const b = bookings.find(item => item.id === bookingId);
    if (b && b.invoiceDetails) {
      const inv = b.invoiceDetails;
      setManualTenantName(inv.sponsorName || b.guestName || '');
      setManualTenantEmail(inv.sponsorEmail || b.guestEmail || '');
      setManualTenantPhone(inv.sponsorPhone || b.guestPhone || '');
      setManualPropertyName(b.propertyName || (properties.find(p => p.id === b.propertyId)?.name) || 'Property');
      setManualStartDate(b.checkIn ? b.checkIn.split('T')[0] : '');
      setManualEndDate(b.checkOut ? b.checkOut.split('T')[0] : '');
      const rentAmt = inv.grandTotal !== undefined ? inv.grandTotal : (inv.baseAmount || (b.totalPrice / 100));
      setManualMonthlyRent(rentAmt ? rentAmt.toString() : '');
    }
  };

  const handleCreateManualLease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLeaseCode.trim()) {
      alert("Please enter or generate a valid Lease Agreement Code.");
      return;
    }
    if (!manualTenantName.trim() || !manualTenantEmail.trim()) {
      alert("Please enter Tenant Name and Email.");
      return;
    }

    setIsCreatingManualLease(true);
    try {
      const linkedBooking = bookings.find(b => b.id === selectedInvoiceBookingId);
      const invoiceNum = linkedBooking?.invoiceDetails?.invoiceNumber || 'Manual';

      const payload = {
        leaseCode: manualLeaseCode.trim(),
        invoiceNumber: invoiceNum,
        bookingId: selectedInvoiceBookingId || null,
        propertyId: linkedBooking?.propertyId || '',
        propertyNameOrRoom: manualPropertyName.trim() || linkedBooking?.propertyName || 'Property',
        startDate: manualStartDate,
        endDate: manualEndDate,
        tenantName: manualTenantName.trim(),
        tenantEmail: manualTenantEmail.trim(),
        tenantPhone: manualTenantPhone.trim(),
        leaseType: manualLeaseType,
        monthlyRent: manualMonthlyRent ? parseFloat(manualMonthlyRent) : 0
      };

      const res = await fetch('/api/create-manual-lease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create manual lease.');

      alert(`Manual Lease Agreement #${manualLeaseCode.trim()} created successfully!`);
      // Reset
      setManualLeaseCode('LSE-' + Math.random().toString(36).substring(2, 7).toUpperCase());
      setSelectedInvoiceBookingId('');
      setManualTenantName('');
      setManualTenantEmail('');
      setManualTenantPhone('');
      setManualPropertyName('');
      setManualStartDate('');
      setManualEndDate('');
      setManualMonthlyRent('');
      setShowManualLeaseForm(false);
    } catch (err: any) {
      console.error("Error creating manual lease:", err);
      // Fallback attempt with client SDK if API failed
      if (db) {
        try {
          const linkedBooking = bookings.find(b => b.id === selectedInvoiceBookingId);
          await setDoc(doc(db, 'leases', manualLeaseCode.trim()), {
            leaseCode: manualLeaseCode.trim(),
            invoiceNumber: linkedBooking?.invoiceDetails?.invoiceNumber || 'Manual',
            bookingId: selectedInvoiceBookingId || null,
            propertyId: linkedBooking?.propertyId || '',
            propertyNameOrRoom: manualPropertyName.trim() || linkedBooking?.propertyName || 'Property',
            startDate: manualStartDate,
            endDate: manualEndDate,
            tenantName: manualTenantName.trim(),
            tenantEmail: manualTenantEmail.trim(),
            tenantPhone: manualTenantPhone.trim(),
            leaseType: manualLeaseType,
            monthlyRent: manualMonthlyRent ? parseFloat(manualMonthlyRent) : 0,
            status: 'approved',
            createdAt: new Date().toISOString()
          });
          alert(`Manual Lease Agreement #${manualLeaseCode.trim()} created successfully!`);
          setShowManualLeaseForm(false);
          return;
        } catch (clientErr: any) {
          alert("Error creating manual lease: " + clientErr.message);
        }
      } else {
        alert("Error creating manual lease: " + err.message);
      }
    } finally {
      setIsCreatingManualLease(false);
    }
  };

  const handleUpdateLeaseType = async (leaseId: string, newType: 'month_to_month' | 'fixed') => {
    try {
      const res = await fetch('/api/update-lease-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaseId, leaseType: newType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update lease type');
      alert(`Lease type updated to ${newType === 'month_to_month' ? 'Month-to-Month' : 'Fixed Lease'}.`);
    } catch (err: any) {
      console.error("Error updating lease type:", err);
      if (db) {
        try {
          await updateDoc(doc(db, 'leases', leaseId), { leaseType: newType });
          alert(`Lease type updated to ${newType === 'month_to_month' ? 'Month-to-Month' : 'Fixed Lease'}.`);
          return;
        } catch (e: any) {}
      }
      alert("Failed to update lease type: " + err.message);
    }
  };

  const handleResendLeaseReminder = async (lease: any) => {
    setSendingReminderLeaseId(lease.id || lease.leaseCode);
    try {
      const res = await fetch('/api/resend-lease-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseId: lease.id,
          leaseCode: lease.leaseCode,
          tenantEmail: lease.tenantEmail,
          tenantName: lease.tenantName,
          propertyName: lease.propertyNameOrRoom,
          endDate: lease.endDate,
          monthlyRent: lease.monthlyRent,
          invoiceNumber: lease.invoiceNumber
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reminder email.');

      alert(`Lease Payment & Renewal Reminder sent successfully to ${lease.tenantEmail}!`);
    } catch (err: any) {
      console.error("Error resending lease reminder:", err);
      alert("Error sending lease payment reminder: " + err.message);
    } finally {
      setSendingReminderLeaseId(null);
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

  const handleCreateDiscountCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    if (!newCode.trim()) return alert("Code cannot be empty");
    
    setSubmittingDiscount(true);
    try {
      const sanitizedCode = newCode.toUpperCase().replace(/\s+/g, '');
      
      // Check if code already exists
      const codeExists = discountCodes.some(dc => dc.code === sanitizedCode);
      if (codeExists) {
        alert(`The discount code "${sanitizedCode}" already exists.`);
        setSubmittingDiscount(false);
        return;
      }

      await addDoc(collection(db, 'discount_codes'), {
        code: sanitizedCode,
        discountType: newDiscountType,
        discountValue: Number(newDiscountValue),
        guestEmailRestriction: newGuestEmail.trim().toLowerCase() || '',
        propertyRestriction: newPropertyId || '',
        maxUses: newMaxUses ? Number(newMaxUses) : null,
        useCount: 0,
        isActive: true,
        notes: newNotes.trim() || '',
        createdAt: serverTimestamp()
      });

      // Reset form
      setNewCode('');
      setNewDiscountType('percentage');
      setNewDiscountValue(10);
      setNewGuestEmail('');
      setNewPropertyId('');
      setNewMaxUses('');
      setNewNotes('');
      alert(`Discount code ${sanitizedCode} created successfully!`);
    } catch (err: any) {
      alert(`Error creating discount code: ${err.message}`);
    } finally {
      setSubmittingDiscount(false);
    }
  };

  const toggleDiscountCode = async (id: string, currentStatus: boolean) => {
    if (!db) return alert("Firebase not configured");
    try {
      await updateDoc(doc(db, 'discount_codes', id), { isActive: !currentStatus });
    } catch (err: any) {
      alert(`Error toggling code: ${err.message}`);
    }
  };

  const handleDeleteDiscountCode = async (id: string, code: string) => {
    if (!db) return alert("Firebase not configured");
    if (window.confirm(`Are you sure you want to delete discount code "${code}"?`)) {
      try {
        await deleteDoc(doc(db, 'discount_codes', id));
      } catch (err: any) {
        alert(`Error deleting code: ${err.message}`);
      }
    }
  };

  const handleUpdateProperty = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!db) return alert("Firebase not configured");
      if (!activePropertyId) return alert("Select a property first");
      const fd = new FormData(e.target as HTMLFormElement);
      try {
          const hasSmartLock = fd.get('hasSmartLock') === 'on';
          
          // Check for existing bloated images to optimize
          const activeProp = properties.find(p => p.id === activePropertyId);
          let optimizedImages = activeProp?.images || [];
          const hasBloatedImages = optimizedImages.some(img => {
              const url = typeof img === 'string' ? img : img?.url;
              return url && url.length > 22000;
          });
          
          if (hasBloatedImages) {
              optimizedImages = await Promise.all(optimizedImages.map(img => optimizeImageItem(img)));
          }

          await updateDoc(doc(db, 'properties', activePropertyId), {
              name: fd.get('name') as string,
              location: fd.get('location') as string,
              description: fd.get('description') as string,
              promoVideoUrl: (fd.get('promoVideoUrl') as string) || editPromoVideoUrl || '',
              hasSmartLock,
              frontDoorCode: hasSmartLock ? (fd.get('frontDoorCode') as string || '') : '',
              allowIndividualRoomRental: fd.get('allowIndividualRoomRental') === 'on',
              bedrooms: editingBedrooms,
              ...(hasBloatedImages ? { images: optimizedImages } : {})
          });
          alert("Property updated!");
      } catch (err: any) { alert(err.message); }
  }

  const handleUpdatePropertyImages = async (newImages: (string | PropertyImage)[]) => {
      if (!db || !activePropertyId) return;
      try {
          const optimized = await Promise.all(newImages.map(img => optimizeImageItem(img)));
          await updateDoc(doc(db, 'properties', activePropertyId), {
              images: optimized
          });
      } catch (err: any) { alert(err.message); }
  }

  const handleCeoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      try {
        const compressed = await compressImage(files[0]);
        setCeoImage(compressed);
      } catch (err) {
        alert("Failed to read/compress image.");
      }
    }
  };

  const handlePmImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      try {
        const compressed = await compressImage(files[0]);
        setPmImage(compressed);
      } catch (err) {
        alert("Failed to read/compress image.");
      }
    }
  };

  const handleSaveFaqSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    try {
        await setDoc(doc(db, 'global_settings', 'settings'), {
            ...globalSettings,
            ceoName,
            ceoImage,
            ceoContact,
            pmName,
            pmImage,
            pmContact,
            contactUsEmail,
            contactUsPhone,
            contactUsAddress,
            contactUsText,
            updatedAt: serverTimestamp()
        });
        alert("FAQ and Contact Information Saved Successfully!");
    } catch (err: any) {
        alert("Error saving FAQ Settings: " + err.message);
    }
  };

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
            allowLongTermRentals,
            updatedAt: serverTimestamp()
        });
        alert("Global Settings Saved!");
    } catch (e: any) {
        alert(e.message);
    }
  }

  const handleSaveCleaningFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured");
    try {
        await setDoc(doc(db, 'global_settings', 'settings'), {
            ...globalSettings,
            cleaningFee: Number(cleaningFee),
            updatedAt: serverTimestamp()
        });
        alert("Global Cleaning Rate Saved Successfully!");
    } catch (err: any) {
        alert("Error saving Cleaning Rate: " + err.message);
    }
  };

  const handleExportBackup = async () => {
    try {
      if (!db) throw new Error("Database not initialized");
      
      // Fetch Global Settings
      const gsSnap = await getDoc(doc(db, 'global_settings', 'settings'));
      const gsData = gsSnap.exists() ? gsSnap.data() : null;

      // Fetch Properties
      const propSnap = await getDocs(collection(db, 'properties'));
      const propertiesList = propSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Fetch Pricing Rules
      const prSnap = await getDocs(collection(db, 'pricing_rules'));
      const pricingRulesList = prSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Fetch Blackout Dates
      const boSnap = await getDocs(collection(db, 'blackout_dates'));
      const blackoutsList = boSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const backupData = {
        backupVersion: "1.0",
        exportedAt: new Date().toISOString(),
        globalSettings: gsData,
        properties: propertiesList,
        pricingRules: pricingRulesList,
        blackoutDates: blackoutsList
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `realcal_config_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Failed to export backup: " + err.message);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db) return;

    setImportingBackup(true);
    setImportStatus("Reading backup file...");

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      // Simple structural validation
      if (!backup || typeof backup !== 'object') {
        throw new Error("Invalid backup file: not a JSON object");
      }

      if (
        !('globalSettings' in backup) && 
        !('properties' in backup) && 
        !('pricingRules' in backup) && 
        !('blackoutDates' in backup)
      ) {
        throw new Error("Invalid backup file: missing required database configuration fields");
      }

      const confirmRestore = window.confirm(
        "⚠️ WARNING: Restoring this backup will replace existing configurations (Global Settings, Properties, Pricing Rules, and Blackout Dates) with the backup content.\n\n" +
        "This will NOT delete your bookings, user profiles, or leases.\n\n" +
        "Are you sure you want to proceed?"
      );

      if (!confirmRestore) {
        setImportingBackup(false);
        setImportStatus("");
        e.target.value = '';
        return;
      }

      // Step 1: Restore Global Settings if present
      if (backup.globalSettings) {
        setImportStatus("Restoring global settings...");
        await setDoc(doc(db, 'global_settings', 'settings'), {
          ...backup.globalSettings,
          updatedAt: serverTimestamp()
        });
      }

      // Step 2: Delete existing pricing rules and restore from backup
      setImportStatus("Cleaning existing pricing rules...");
      const prSnap = await getDocs(collection(db, 'pricing_rules'));
      const prBatch = writeBatch(db);
      prSnap.docs.forEach(doc => prBatch.delete(doc.ref));
      await prBatch.commit();

      if (Array.isArray(backup.pricingRules) || Array.isArray(backup.pricingRulesList)) {
        setImportStatus("Restoring pricing rules...");
        const rules = backup.pricingRules || backup.pricingRulesList;
        for (const rule of rules) {
          if (rule.id) {
            const data = { ...rule };
            delete data.id;
            await setDoc(doc(db, 'pricing_rules', rule.id), data);
          }
        }
      }

      // Step 3: Delete existing blackout dates and restore from backup
      setImportStatus("Cleaning existing blackout dates...");
      const boSnap = await getDocs(collection(db, 'blackout_dates'));
      const boBatch = writeBatch(db);
      boSnap.docs.forEach(doc => boBatch.delete(doc.ref));
      await boBatch.commit();

      if (Array.isArray(backup.blackoutDates) || Array.isArray(backup.blackoutsList)) {
        setImportStatus("Restoring blackout dates...");
        const blackouts = backup.blackoutDates || backup.blackoutsList;
        for (const bo of blackouts) {
          if (bo.id) {
            const data = { ...bo };
            delete data.id;
            await setDoc(doc(db, 'blackout_dates', bo.id), data);
          }
        }
      }

      // Step 4: Delete existing properties and restore from backup
      setImportStatus("Cleaning existing properties...");
      const propSnap = await getDocs(collection(db, 'properties'));
      const propBatch = writeBatch(db);
      propSnap.docs.forEach(doc => propBatch.delete(doc.ref));
      await propBatch.commit();

      if (Array.isArray(backup.properties)) {
        setImportStatus("Restoring properties...");
        for (const prop of backup.properties) {
          if (prop.id) {
            const data = { ...prop };
            delete data.id;
            await setDoc(doc(db, 'properties', prop.id), data);
          }
        }
      }

      setImportStatus("Backup restored successfully!");
      alert("Database configuration backup has been successfully imported and restored!");
      window.location.reload();
    } catch (err: any) {
      alert("Import failed: " + err.message);
    } finally {
      setImportingBackup(false);
      setImportStatus("");
      e.target.value = '';
    }
  };

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

  const handleDuplicateInvoiceSelect = (b: Booking) => {
     const inv = b.invoiceDetails || {};
     setManualBookingPropId(b.propertyId || '');
     if (b.checkIn) setManualBookingCheckIn(b.checkIn);
     if (b.checkOut) setManualBookingCheckOut(b.checkOut);

     if (b.selectedBedrooms && Array.isArray(b.selectedBedrooms)) {
        setManualBookingRooms(b.selectedBedrooms.map((r: any) => typeof r === 'string' ? r : (r.roomNumber || '')));
     } else if (b.selectedBedroom) {
        setManualBookingRooms([typeof b.selectedBedroom === 'object' ? b.selectedBedroom.roomNumber : b.selectedBedroom]);
     } else {
        setManualBookingRooms([]);
     }

     const gName = b.guestName || inv.sponsorName || '';
     const gEmail = b.guestEmail || inv.sponsorEmail || '';
     const gPhone = b.guestPhone || inv.sponsorPhone || '';
     const basePrice = inv.baseAmount !== undefined ? String(inv.baseAmount) : String((b.totalPrice || 0) / 100);

     setManualGuestName(gName);
     setManualGuestEmail(gEmail);
     setManualGuestPhone(gPhone);
     setManualTotalPrice(basePrice);
     setManualAccessCode(b.accessCode || '');

     setCreateInvoiceForPayment(true);

     setInvoiceSponsorName(inv.sponsorName || gName);
     setInvoiceSponsorEmail(inv.sponsorEmail || gEmail);
     setInvoiceSponsorPhone(inv.sponsorPhone || gPhone);
     setInvoiceSponsorAddress(inv.sponsorAddress || '');
     setInvoiceCustomNotes(inv.customNotes || `Lodging for ${gName} at REALCal Bookings.`);
     setInvoiceDaysLate(inv.daysLate || 0);
     setInvoiceLateFeePerDay(inv.lateFeePerDay || 25);

     setShowDuplicateInvoiceModal(false);
     alert(`Invoice data from #${inv.invoiceNumber || b.bookingRef || b.id} duplicated into Create Manual Booking form!`);
  };

  const handleRenewInvoice = (b: Booking) => {
     const inv = b.invoiceDetails || {};
     
     let stayDays = 1;
     const originalCheckOutStr = b.checkOut ? b.checkOut.split('T')[0] : '';
     const originalCheckInStr = b.checkIn ? b.checkIn.split('T')[0] : '';

     if (originalCheckInStr && originalCheckOutStr) {
       const inDate = new Date(originalCheckInStr + 'T12:00:00');
       const outDate = new Date(originalCheckOutStr + 'T12:00:00');
       const diffMs = outDate.getTime() - inDate.getTime();
       if (diffMs > 0) {
         stayDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
       }
     }

     const todayStr = new Date().toISOString().split('T')[0];
     const newCheckInDateStr = originalCheckOutStr || todayStr;
     
     const newCheckInObj = new Date(newCheckInDateStr + 'T12:00:00');
     const newCheckOutObj = new Date(newCheckInObj.getTime() + stayDays * 24 * 60 * 60 * 1000);
     const newCheckOutDateStr = newCheckOutObj.toISOString().split('T')[0];

     setManualBookingPropId(b.propertyId || '');
     setManualBookingCheckIn(newCheckInDateStr);
     setManualBookingCheckOut(newCheckOutDateStr);

     if (b.selectedBedrooms && Array.isArray(b.selectedBedrooms)) {
        setManualBookingRooms(b.selectedBedrooms.map((r: any) => typeof r === 'string' ? r : (r.roomNumber || '')));
     } else if (b.selectedBedroom) {
        setManualBookingRooms([typeof b.selectedBedroom === 'object' ? b.selectedBedroom.roomNumber : b.selectedBedroom]);
     } else {
        setManualBookingRooms([]);
     }

     const gName = b.guestName || inv.sponsorName || '';
     const gEmail = b.guestEmail || inv.sponsorEmail || '';
     const gPhone = b.guestPhone || inv.sponsorPhone || '';
     const basePrice = inv.baseAmount !== undefined ? String(inv.baseAmount) : String((b.totalPrice || 0) / 100);

     setManualGuestName(gName);
     setManualGuestEmail(gEmail);
     setManualGuestPhone(gPhone);
     setManualTotalPrice(basePrice);
     setManualAccessCode(b.accessCode || '');

     setCreateInvoiceForPayment(true);

     setInvoiceSponsorName(inv.sponsorName || gName);
     setInvoiceSponsorEmail(inv.sponsorEmail || gEmail);
     setInvoiceSponsorPhone(inv.sponsorPhone || gPhone);
     setInvoiceSponsorAddress(inv.sponsorAddress || '');
     setInvoiceCustomNotes(inv.customNotes || `Renewal invoice for ${gName} (${stayDays} days stay: ${newCheckInDateStr} to ${newCheckOutDateStr}).`);
     setInvoiceDaysLate(0);
     setInvoiceLateFeePerDay(inv.lateFeePerDay || 25);
     setInvoiceNumber(`INV-RNW-${Math.floor(100000 + Math.random() * 900000)}`);
     setInvoiceDueDate(newCheckInDateStr);

     setViewingInvoiceBooking(null);

     setTimeout(() => {
        const formElem = document.getElementById('create-manual-booking-form');
        if (formElem) {
           formElem.scrollIntoView({ behavior: 'smooth' });
        }
     }, 100);

     alert(`Invoice Renewal Initialized!\n\nOriginal Invoice: #${inv.invoiceNumber || b.bookingRef || b.id}\nStay Duration: ${stayDays} day(s)\n\n• New Check-In: ${newCheckInDateStr}\n• New Check-Out: ${newCheckOutDateStr}\n\nAll details loaded into Create Manual Booking form below. Review and click "Create Booking" or "Email Invoice & Complete Booking" to issue.`);
  };

  const handleClearManualBookingAndInvoice = () => {
     setManualBookingPropId('');
     setManualBookingRooms([]);
     setManualBookingCheckIn('');
     setManualBookingCheckOut('');
     setManualGuestName('');
     setManualGuestEmail('');
     setManualGuestPhone('');
     setManualTotalPrice('');
     setManualAccessCode('');

     setCreateInvoiceForPayment(false);
     setShowInvoiceTemplate(false);
     setPendingBookingData(null);

     setInvoiceSponsorName('');
     setInvoiceSponsorEmail('');
     setInvoiceSponsorPhone('');
     setInvoiceSponsorAddress('');
     setInvoiceNumber('');
     setInvoiceDueDate('');
     setInvoiceCustomNotes('');
     setInvoiceDaysLate(0);
     setInvoiceLateFeePerDay(25);
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
      const baseAmount = Number(totalAmountStr);
      const daysLate = Number(invoiceDaysLate) || 0;
      const lateFeePerDay = Number(invoiceLateFeePerDay) || 0;
      const lateFeeAmount = daysLate > 0 ? daysLate * lateFeePerDay : 0;
      const taxableSubtotal = baseAmount + lateFeeAmount;
      const grandTotalAmount = taxableSubtotal > 0
        ? Math.round((((taxableSubtotal + 0.30) / (1 - 0.029)) * (1 + 0.004)) * 100) / 100
        : 0;
      const stripeFee = taxableSubtotal > 0
        ? Math.round((grandTotalAmount - taxableSubtotal) * 100) / 100
        : 0;
      const finalPriceCents = Math.round(grandTotalAmount * 100);

      let stripePaymentUrl = '';
      let stripeSessionId = '';
      try {
         const payLinkRes = await fetch('/api/create-invoice-checkout-session', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 bookingId,
                 amount: grandTotalAmount,
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
             stripeSessionId = payLinkData.sessionId || '';
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
         daysLate: daysLate,
         lateFeePerDay: lateFeePerDay,
         lateFeeAmount: lateFeeAmount,
         sentAt: new Date().toISOString(),
         stripePaymentUrl: `${window.location.origin}/pay-invoice/${bookingId}`,
         stripeCheckoutUrl: stripePaymentUrl || null,
         stripeSessionId: stripeSessionId || null,
         baseAmount: baseAmount,
         stripeFee: stripeFee,
         grandTotal: grandTotalAmount
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
            ${lateFeeAmount > 0 ? `
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #fffbeb;">
                <td style="padding: 10px 8px; color: #b45309; font-weight: 500;">
                    Late Payment Fee<br/>
                    <span style="font-size: 11px; color: #d97706;">${daysLate} day(s) past due date @ $${lateFeePerDay}/day</span>
                </td>
                <td style="padding: 10px 8px; text-align: right; color: #b45309; font-weight: bold; font-family: Courier, monospace;">+$ ${lateFeeAmount.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #0f172a; font-weight: 500;">
                    Stripe Processing Fee<br/>
                    <span style="font-size: 11px; color: #64748b;">Processing fee ($0.30 / (1 - 2.9%) &times; 1.004)</span>
                </td>
                <td style="padding: 10px 0; text-align: right; color: #0f172a; font-weight: bold; font-family: Courier, monospace;">$ ${stripeFee.toFixed(2)}</td>
            </tr>
            <tr>
                <td style="padding: 12px 0 4px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Grand Total:</td>
                <td style="padding: 12px 0 4px 0; text-align: right; font-size: 16px; font-weight: bold; color: #4f46e5; font-family: Courier, monospace;">$ ${grandTotalAmount.toFixed(2)}</td>
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
Stripe Processing Fee: $${stripeFee.toFixed(2)}
Grand Total Due: $${grandTotalAmount.toFixed(2)}

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

  const handleSyncStripeStatus = async (bookingId: string) => {
    setSyncingInvoiceId(bookingId);
    try {
      const res = await fetch("/api/sync-invoice-stripe-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sync status");
      }
      if (data.updated) {
        alert("Success! Stripe checkout session is PAID. Booking invoice status updated to Paid.");
      } else {
        alert(`Status synced. Current Stripe payment status is: ${data.stripePaymentStatus || data.status || 'unpaid'}. (Stripe Session: ${data.stripeStatus || 'N/A'})`);
      }
    } catch (err: any) {
      alert("Error syncing with Stripe: " + err.message);
    } finally {
      setSyncingInvoiceId(null);
    }
  };

  const handleMarkInvoicePaidManual = async (bookingId: string) => {
    const confirmMark = window.confirm("Are you sure you want to manually mark this invoice as PAID? This should be used for offline or alternative payments.");
    if (!confirmMark) return;

    try {
      const res = await fetch("/api/mark-invoice-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to mark as paid");
      }
      alert("Success! Invoice marked as paid.");
    } catch (err: any) {
      alert("Error marking paid: " + err.message);
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
      const baseAmountVal = b.invoiceDetails.baseAmount !== undefined ? b.invoiceDetails.baseAmount : (b.totalPrice / 100);
      const stripeFeeVal = b.invoiceDetails.stripeFee !== undefined ? b.invoiceDetails.stripeFee : 0;
      const grandTotalVal = b.invoiceDetails.grandTotal !== undefined ? b.invoiceDetails.grandTotal : (b.totalPrice / 100);
      const stripePaymentUrl = (b.invoiceDetails.stripePaymentUrl && b.invoiceDetails.stripePaymentUrl.includes('/pay-invoice/')) 
        ? b.invoiceDetails.stripePaymentUrl 
        : `${window.location.origin}/pay-invoice/${b.id}`;

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
                <td style="padding: 10px 0; text-align: right; color: #0f172a; font-weight: bold; font-family: Courier, monospace;">$ ${Number(baseAmountVal).toFixed(2)}</td>
            </tr>
            ${stripeFeeVal > 0 ? `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #0f172a; font-weight: 500;">
                    Stripe Processing Fee<br/>
                    <span style="font-size: 11px; color: #64748b;">Processing fee</span>
                </td>
                <td style="padding: 10px 0; text-align: right; color: #0f172a; font-weight: bold; font-family: Courier, monospace;">$ ${stripeFeeVal.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
                <td style="padding: 12px 0 4px 0; font-size: 15px; font-weight: bold; color: #0f172a;">Grand Total:</td>
                <td style="padding: 12px 0 4px 0; text-align: right; font-size: 16px; font-weight: bold; color: #4f46e5; font-family: Courier, monospace;">$ ${Number(grandTotalVal).toFixed(2)}</td>
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

    <div style="font-size: 11px; text-align: center; color: #94a3b8; line-height: 1.5; margin-top: 24px;">
        This invoice is generated on behalf of the lodging provider.<br/>
        <strong>C.&S.H. Group Properties, LLC</strong>
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
Guest Rental Override Access Fee: $${Number(baseAmountVal).toFixed(2)}
${stripeFeeVal > 0 ? `Stripe Processing Fee: $${stripeFeeVal.toFixed(2)}\n` : ''}Grand Total Due: $${Number(grandTotalVal).toFixed(2)}

${stripePaymentUrl ? `SECURE ONLINE PAYMENT LINK:\nClick here to pay this invoice securely via Stripe:\n${stripePaymentUrl}\n` : ''}

Notes: ${invoiceCustomNotes}

Thank you,
C.&S.H. Group Properties, LLC
`;

      const emailRes = await fetch("/api/send-invoice-email", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           to: invoiceSponsorEmail.trim(),
           subject: `Invoice ${invoiceNumber} (Resend): Lodging for ${guestName} at ${propertyName}`,
           html: invoiceHtml,
           text: invoiceText
         })
      });

      if (!emailRes.ok) {
         const errText = await emailRes.text();
         throw new Error(`Failed to send invoice email: ${errText}`);
      }

      alert("Invoice resent successfully to " + invoiceSponsorEmail);
    } catch (err: any) {
      alert("Error resending invoice: " + err.message);
    } finally {
      setSendingInvoiceId(null);
    }
  };

  const handleResendPaidConfirmation = async () => {
    if (!resendingConfirmationBooking) return;
    setIsResendingConfirmation(true);
    try {
      const res = await fetch("/api/resend-invoice-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: resendingConfirmationBooking.id,
          notifyAdmins: resendNotifyAdmins,
          notifyGuest: resendNotifyGuest
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend confirmation notification.");
      }
      alert(`Success! Invoice confirmation resent. (Admins: ${data.sentToAdmins ? "Yes" : "No"}, Guest: ${data.sentToGuest ? "Yes" : "No"})`);
      setResendingConfirmationBooking(null);
    } catch (err: any) {
      alert("Error resending confirmation: " + err.message);
    } finally {
      setIsResendingConfirmation(false);
    }
  };

  const getInvoiceCancellationPolicyInfo = (b: any) => {
    if (!b || !b.checkIn) {
      return {
        isWithinNonCancelFeeDays: false,
        isFreeCancellation: true,
        isManualInvoice: false,
        isOutsideBookingStartDate: true,
        freeCancelHoursBefore: 48,
        lateCancelFeePercent: 100,
        hoursUntilCheckIn: 0,
        tripDays: 1,
        calculatedLateFee: 0,
        grandTotal: 0,
        policyDescription: "No booking dates provided."
      };
    }

    const checkInStr = b.checkIn.split('T')[0];
    const checkInDate = new Date(checkInStr + 'T15:00:00');
    const checkOutDate = new Date(b.checkOut ? b.checkOut.split('T')[0] + 'T11:00:00' : checkInStr + 'T11:00:00');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const isManualInvoice = !!(b.invoiceDetails || b.isManualOverride || b.userId === 'admin-override' || b.bookingRef?.startsWith('INV-'));
    
    // Check if cancellation date (today) is outside / before the booking start_date
    const isOutsideBookingStartDate = todayStr < checkInStr || now.getTime() < checkInDate.getTime();

    const inv = b.invoiceDetails || {};
    const grandTotal = inv.grandTotal !== undefined ? inv.grandTotal : (b.totalPrice ? b.totalPrice / 100 : 0);

    let freeCancelHoursBefore = 48;
    let lateCancelFeePercent = 100;
    const tripDays = Math.max(1, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));

    if (globalSettings?.cancellationRules && globalSettings.cancellationRules.length > 0) {
      const sortedRules = [...globalSettings.cancellationRules].sort((a: any, b: any) => b.minBookingDays - a.minBookingDays);
      const appliedRule = sortedRules.find((r: any) => tripDays >= r.minBookingDays);
      if (appliedRule) {
        freeCancelHoursBefore = appliedRule.freeCancelHoursBefore;
        lateCancelFeePercent = appliedRule.lateCancelFeePercent;
      }
    }

    const hoursUntilCheckIn = Math.round((checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    const isWithinNonCancelFeeDays = hoursUntilCheckIn < freeCancelHoursBefore;

    let isFreeCancellation = false;
    let calculatedLateFee = 0;
    let policyDescription = "";

    if (isManualInvoice && isOutsideBookingStartDate) {
      isFreeCancellation = true;
      calculatedLateFee = 0;
      policyDescription = `Manual Created Invoice: Cancel date (${todayStr}) is outside of the booking start date (${checkInStr}). $0.00 cancellation fee is charged to the guest/customer.`;
    } else if (isManualInvoice) {
      isFreeCancellation = false;
      calculatedLateFee = Math.round(grandTotal * (lateCancelFeePercent / 100) * 100) / 100;
      policyDescription = `Manual Created Invoice: Cancel date (${todayStr}) is on or after the booking start date (${checkInStr}). A ${lateCancelFeePercent}% cancellation fee ($${calculatedLateFee.toFixed(2)}) is assessed.`;
    } else if (!isWithinNonCancelFeeDays) {
      isFreeCancellation = true;
      calculatedLateFee = 0;
      policyDescription = `Check-in is in ${hoursUntilCheckIn} hours (outside the ${freeCancelHoursBefore}-hour non-cancellation window). Free cancellation window is active ($0.00 fee).`;
    } else {
      isFreeCancellation = false;
      calculatedLateFee = Math.round(grandTotal * (lateCancelFeePercent / 100) * 100) / 100;
      policyDescription = `Check-in is in ${hoursUntilCheckIn} hours (within the ${freeCancelHoursBefore}-hour non-cancellation window). A ${lateCancelFeePercent}% cancellation fee ($${calculatedLateFee.toFixed(2)}) is assessed.`;
    }

    return {
      isWithinNonCancelFeeDays,
      isFreeCancellation,
      isManualInvoice,
      isOutsideBookingStartDate,
      freeCancelHoursBefore,
      lateCancelFeePercent,
      hoursUntilCheckIn,
      tripDays,
      calculatedLateFee,
      grandTotal,
      policyDescription
    };
  };

  const handleOpenCancelInvoiceModal = (b: any) => {
    const policy = getInvoiceCancellationPolicyInfo(b);
    setCancellingInvoiceBooking(b);
    setInvoiceCancelNote('');
    setInvoiceCancelFee(policy.calculatedLateFee);
    setInvoiceCancelNotifySponsor(!!(b.invoiceDetails?.sponsorEmail || b.invoiceDetails?.sponsorPhone));
    setInvoiceCancelNotifyGuest(!!(b.guestEmail || b.guestPhone));
    setInvoiceCancelNotifyManagers(true);
  };

  const handleExecuteCancelInvoice = async () => {
    if (!cancellingInvoiceBooking) return;
    const b = cancellingInvoiceBooking;
    const inv = b.invoiceDetails || {};

    if (!invoiceCancelNote.trim()) {
      alert("Please enter a cancellation note / reason before proceeding.");
      return;
    }

    setCancellingInvoiceLoading(true);
    try {
      const cancelledAtIso = new Date().toISOString();
      const feeInDollars = Number(invoiceCancelFee) || 0;
      const feeInCents = Math.round(feeInDollars * 100);
      const noteText = invoiceCancelNote.trim();

      const updatedInvoiceDetails = {
        ...inv,
        cancelled: true,
        status: 'cancelled',
        paid: false,
        cancelledAt: cancelledAtIso,
        cancellationNote: noteText,
        cancellationFee: feeInDollars
      };

      const updatePayload: any = {
        status: 'cancelled',
        invoiceDetails: updatedInvoiceDetails,
        cancellationFee: feeInCents,
        cancellationNote: noteText,
        cancelledBy: 'admin',
        cancelledAt: cancelledAtIso,
        updatedAt: serverTimestamp()
      };

      if (db) {
        await updateDoc(doc(db, 'bookings', b.id), updatePayload);
      }

      // Remove maintenance blackout dates
      try {
        const rooms = b.selectedBedrooms || (b.selectedBedroom ? [b.selectedBedroom] : []);
        if (rooms.length > 0) {
          for (const room of rooms) {
            const rNum = typeof room === 'object' ? room.roomNumber : room;
            await deleteDoc(doc(db, 'blackout_dates', `maint-${b.id}-${rNum}`)).catch(() => {});
          }
        } else {
          await deleteDoc(doc(db, 'blackout_dates', `maint-${b.id}`)).catch(() => {});
        }
      } catch (err) {
        console.warn("Failed to remove blackout dates on invoice cancel:", err);
      }

      // Send Cancellation Email & SMS Notifications if requested
      const prop = properties.find(p => p.id === b.propertyId);
      const propName = prop?.name || 'REALCal Luxury Lodging';
      const invoiceNo = inv.invoiceNumber || b.bookingRef || 'Manual';
      const sponsorEmail = (inv.sponsorEmail || '').trim();
      const sponsorPhone = (inv.sponsorPhone || b.sponsorPhone || '').trim();
      const guestEmail = (b.guestEmail || '').trim();
      const guestPhone = (b.guestPhone || '').trim();

      const emailSubject = `[CANCELLED] Invoice #${invoiceNo}: Lodging Coverage for ${b.guestName || 'Guest'}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; line-height: 1.6;">
          <div style="background-color: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0 0 8px 0; color: #991b1b; font-size: 20px;">INVOICE & RESERVATION CANCELLED</h2>
            <p style="margin: 0; font-size: 14px; color: #7f1d1d;">Invoice <strong>#${invoiceNo}</strong> has been officially cancelled by the Administrator.</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Invoice Reference:</td>
              <td style="padding: 6px 0; font-weight: bold; text-align: right;">#${invoiceNo}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Property:</td>
              <td style="padding: 6px 0; font-weight: bold; text-align: right;">${propName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Guest Name:</td>
              <td style="padding: 6px 0; font-weight: bold; text-align: right;">${b.guestName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">Stay Dates:</td>
              <td style="padding: 6px 0; font-weight: bold; text-align: right;">${b.checkIn} to ${b.checkOut}</td>
            </tr>
            ${feeInDollars > 0 ? `
            <tr>
              <td style="padding: 6px 0; color: #991b1b; font-weight: bold;">Cancellation Fee Assessed:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #991b1b; text-align: right;">$${feeInDollars.toFixed(2)}</td>
            </tr>
            ` : ''}
          </table>

          ${noteText ? `
          <div style="background-color: #f8fafc; border-left: 4px solid #ef4444; padding: 14px; border-radius: 6px; margin-bottom: 24px;">
            <strong style="color: #0f172a; font-size: 12px; text-transform: uppercase; display: block; margin-bottom: 4px;">Administrator Cancellation Note:</strong>
            <span style="font-size: 13px; color: #334155; white-space: pre-wrap;">${noteText}</span>
          </div>
          ` : ''}

          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px;">
            C.&S.H. Group Properties, LLC &bull; REALCal Bookings Admin
          </p>
        </div>
      `;

      const emailText = `
INVOICE CANCELLED
-----------------
Invoice #${invoiceNo} for ${propName} (${b.checkIn} to ${b.checkOut}) has been cancelled by the Administrator.

Guest Name: ${b.guestName || 'N/A'}
${feeInDollars > 0 ? `Cancellation Fee Assessed: $${feeInDollars.toFixed(2)}\n` : ''}
${noteText ? `Administrator Cancellation Note:\n${noteText}\n` : ''}

Thank you,
C.&S.H. Group Properties, LLC
`;

      const smsText = `🚨 INVOICE CANCELLED ALERT 🚨\nInvoice #${invoiceNo} for ${b.guestName || 'Guest'} at ${propName} (${b.checkIn} to ${b.checkOut}) has been CANCELLED.\n${feeInDollars > 0 ? `Fee: $${feeInDollars.toFixed(2)}\n` : ''}${noteText ? `Note: ${noteText}` : ''}`;

      const sendPromises: Promise<any>[] = [];

      // 1. SPONSOR ALERTS (Email + SMS)
      if (invoiceCancelNotifySponsor) {
        if (sponsorEmail) {
          sendPromises.push(
            fetch("/api/send-invoice-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: sponsorEmail,
                subject: emailSubject,
                html: emailHtml,
                text: emailText
              })
            }).catch(err => console.error("Failed to email sponsor on cancellation:", err))
          );
        }
        if (sponsorPhone) {
          sendPromises.push(
            fetch("/api/send-sms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: sponsorPhone,
                message: smsText
              })
            }).catch(err => console.error("Failed to SMS sponsor on cancellation:", err))
          );
        }
      }

      // 2. GUEST ALERTS (Email + SMS)
      if (invoiceCancelNotifyGuest) {
        if (guestEmail && guestEmail !== sponsorEmail) {
          sendPromises.push(
            fetch("/api/send-invoice-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: guestEmail,
                subject: emailSubject,
                html: emailHtml,
                text: emailText
              })
            }).catch(err => console.error("Failed to email guest on cancellation:", err))
          );
        }
        if (guestPhone && guestPhone !== sponsorPhone) {
          sendPromises.push(
            fetch("/api/send-sms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: guestPhone,
                message: `🚨 RESERVATION & INVOICE CANCELLED 🚨\nYour invoice #${invoiceNo} & stay at ${propName} (${b.checkIn} to ${b.checkOut}) has been CANCELLED.\n${feeInDollars > 0 ? `Fee: $${feeInDollars.toFixed(2)}\n` : ''}${noteText ? `Note: ${noteText}` : ''}`
              })
            }).catch(err => console.error("Failed to SMS guest on cancellation:", err))
          );
        }
      }

      // 3. PROPERTY MANAGEMENT CONTACTS ALERTS (Email + SMS)
      if (invoiceCancelNotifyManagers) {
        const activeManagers = propertyManagers.filter(m => m.enabled);
        if (activeManagers.length > 0) {
          for (const mgr of activeManagers) {
            if (mgr.email) {
              sendPromises.push(
                fetch("/api/send-invoice-email", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: mgr.email,
                    subject: `[ADMIN ALERT] Invoice #${invoiceNo} CANCELLED - ${propName}`,
                    html: emailHtml,
                    text: emailText
                  })
                }).catch(err => console.error(`Failed to email manager ${mgr.name}:`, err))
              );
            }

            if (mgr.phone) {
              sendPromises.push(
                fetch("/api/send-sms", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    to: mgr.phone,
                    message: `🚨 INVOICE CANCELLED ALERT 🚨\nProp: ${propName}\nInvoice #${invoiceNo}\nGuest: ${b.guestName || 'N/A'}\nDates: ${b.checkIn} to ${b.checkOut}\nNote: ${noteText}`
                  })
                }).catch(err => console.error(`Failed to SMS manager ${mgr.name}:`, err))
              );
            }
          }

          // Backup manager endpoint call
          sendPromises.push(
            fetch("/api/notify-managers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                managers: activeManagers,
                bookingDetails: {
                  checkIn: b.checkIn,
                  checkOut: b.checkOut,
                  propertyName: propName,
                  totalAmount: feeInCents,
                  guestName: b.guestName,
                  guestEmail: b.guestEmail,
                  guestPhone: b.guestPhone,
                  isCancellation: true,
                  cancellationFee: feeInCents,
                  selectedBedrooms: b.selectedBedrooms || (b.selectedBedroom ? [b.selectedBedroom] : [])
                }
              })
            }).catch(err => console.error("Failed /api/notify-managers backup:", err))
          );
        }
      }

      await Promise.all(sendPromises);

      // Update local state in AdminDashboard
      setBookings(prev => prev.map(item => {
        if (item.id === b.id) {
          return {
            ...item,
            status: 'cancelled',
            cancellationFee: feeInCents,
            cancellationNote: noteText,
            invoiceDetails: updatedInvoiceDetails
          };
        }
        return item;
      }));

      alert(`Invoice #${invoiceNo} has been successfully cancelled. Cancellation alerts (Emails & SMS) have been sent.`);
      setCancellingInvoiceBooking(null);
    } catch (err: any) {
      alert(`Failed to cancel invoice: ${err.message}`);
    } finally {
      setCancellingInvoiceLoading(false);
    }
  };

  const handleAdminCancelBooking = async (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    if (booking.invoiceDetails) {
      handleOpenCancelInvoiceModal(booking);
      return;
    }

    const cancelNote = window.prompt("Enter cancellation note / reason for guest (optional):", "");
    if (cancelNote === null) return;

    if (!db) return;
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'cancelled',
        cancellationNote: cancelNote.trim(),
        cancelledBy: 'admin',
        cancelledAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      // Remove associated maintenance blackout
      try {
        const rooms = booking.selectedBedrooms || (booking.selectedBedroom ? [booking.selectedBedroom] : []);
        if (rooms.length > 0) {
          for (const room of rooms) {
            const rNum = typeof room === 'object' ? room.roomNumber : room;
            await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}-${rNum}`)).catch(() => {});
          }
        } else {
          await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}`)).catch(() => {});
        }
      } catch (err) {
        console.warn("Failed to remove blackout", err);
      }

      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled', cancellationNote: cancelNote.trim() } : b));
      alert("Booking cancelled successfully.");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAdminDeleteBooking = async (bookingId: string) => {
    if (!db || !window.confirm("Permanently delete this booking record? (Unrecoverable)")) return;
    try {
      const booking = bookings.find(b => b.id === bookingId);
      await deleteDoc(doc(db, 'bookings', bookingId));
      
      // Also delete any associated maintenance blackout
      try {
        if (booking) {
          const rooms = booking.selectedBedrooms || (booking.selectedBedroom ? [booking.selectedBedroom] : []);
          if (rooms.length > 0) {
            for (const room of rooms) {
              await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}-${room.roomNumber}`));
            }
          } else {
            await deleteDoc(doc(db, 'blackout_dates', `maint-${bookingId}`));
          }
        }
      } catch (err) {
        console.warn("Failed to remove blackout on delete", err);
      }

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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-emerald-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight flex items-center gap-1"><CheckCircle size={14} className="text-emerald-600"/> Total Collected</p>
                       <p className="text-xl font-bold text-emerald-700 mt-1">${(totalCollected / 100).toFixed(2)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight flex items-center gap-1"><Clock size={14} className="text-amber-500"/> Total Pending</p>
                       <p className="text-xl font-bold text-amber-700 mt-1">${(totalPending / 100).toFixed(2)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100">
                       <p className="text-xs text-slate-500 font-medium uppercase tracking-tight flex items-center gap-1"><Users size={14} className="text-indigo-600"/> Total Users</p>
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

                        <div className="border-t border-slate-200 pt-4 mt-2">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-tight block">Long-Term Renting (&gt; 30 Days)</label>
                            <p className="text-[11px] text-slate-500 mb-3">Allow or deny guests to request stays exceeding 30 days.</p>
                            <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm w-fit">
                                <button
                                    type="button"
                                    onClick={() => setAllowLongTermRentals(true)}
                                    className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                                        allowLongTermRentals 
                                            ? 'bg-emerald-600 text-white shadow-sm' 
                                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                    }`}
                                >
                                    Enabled
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAllowLongTermRentals(false)}
                                    className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                                        !allowLongTermRentals 
                                            ? 'bg-rose-600 text-white shadow-sm' 
                                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                    }`}
                                >
                                    Disabled
                                </button>
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

          {/* Discount Booking Rate Codes Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Ticket className="text-indigo-600" size={20}/> Discount Booking Rate Codes
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Create New Code Form */}
                  <form onSubmit={handleCreateDiscountCode} className="lg:col-span-5 border border-slate-200 p-6 rounded-2xl bg-slate-50/50 space-y-4 h-fit">
                      <h3 className="font-bold text-slate-800 text-md border-b border-slate-200 pb-2 flex items-center gap-1.5">
                          <Plus size={16} className="text-indigo-600" /> Create Special Rate Code
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Rate Code</label>
                              <input 
                                  type="text" 
                                  value={newCode}
                                  onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                                  placeholder="e.g. SPECIALARRANGEMENT20" 
                                  required
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm uppercase font-mono font-bold text-indigo-700 placeholder:normal-case placeholder:font-normal" 
                              />
                              <p className="text-[10px] text-slate-400 mt-1">Alphanumeric, no spaces. Guest enters this code on checkout.</p>
                          </div>
                          
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Discount Type</label>
                              <select 
                                  value={newDiscountType} 
                                  onChange={(e) => setNewDiscountType(e.target.value as 'percentage' | 'flat')} 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm font-semibold text-slate-700"
                              >
                                  <option value="percentage">Percentage (%)</option>
                                  <option value="flat">Flat Amount ($)</option>
                              </select>
                          </div>
                          
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">
                                  {newDiscountType === 'percentage' ? 'Discount Percent' : 'Discount Amount'}
                              </label>
                              <div className="relative flex items-center mt-1">
                                  {newDiscountType === 'flat' && (
                                      <span className="absolute left-3 text-slate-400 font-bold text-sm">$</span>
                                  )}
                                  <input 
                                      type="number" 
                                      min="1" 
                                      max={newDiscountType === 'percentage' ? 100 : undefined}
                                      value={newDiscountValue}
                                      onChange={(e) => setNewDiscountValue(Number(e.target.value))}
                                      required
                                      className={cn(
                                          "w-full border border-slate-200 rounded-xl p-2.5 bg-white shadow-sm text-sm font-mono font-bold text-slate-800",
                                          newDiscountType === 'flat' ? 'pl-7' : 'pr-7'
                                      )}
                                  />
                                  {newDiscountType === 'percentage' && (
                                      <span className="absolute right-3.5 text-slate-400 font-bold text-sm">%</span>
                                  )}
                              </div>
                          </div>
                      </div>

                      <div className="border-t border-slate-200 pt-4 mt-2 space-y-3">
                          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Arrangement Restrictions</h4>
                          
                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Restricted to Guest Email</label>
                              <input 
                                  type="email" 
                                  value={newGuestEmail} 
                                  onChange={(e) => setNewGuestEmail(e.target.value)}
                                  placeholder="e.g. guest@example.com" 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                              />
                              <p className="text-[10px] text-slate-400 mt-1">Leave blank for any guest who has the code.</p>
                          </div>

                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Restricted to Property</label>
                              <select 
                                  value={newPropertyId} 
                                  onChange={(e) => setNewPropertyId(e.target.value)}
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm text-slate-700"
                              >
                                  <option value="">All Properties</option>
                                  {properties.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                              </select>
                              <p className="text-[10px] text-slate-400 mt-1">Leave blank to allow use for any property.</p>
                          </div>

                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Max Uses Limit</label>
                              <input 
                                  type="number" 
                                  min="1" 
                                  value={newMaxUses} 
                                  onChange={(e) => setNewMaxUses(e.target.value)}
                                  placeholder="e.g. 1" 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                              />
                              <p className="text-[10px] text-slate-400 mt-1">Leave blank for unlimited uses.</p>
                          </div>

                          <div>
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Private Notes / Purpose</label>
                              <textarea 
                                  rows={2}
                                  value={newNotes} 
                                  onChange={(e) => setNewNotes(e.target.value)}
                                  placeholder="e.g. Agreed with guest John Doe due to flight cancellation last stay." 
                                  className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                              />
                          </div>
                      </div>

                      <button 
                          type="submit" 
                          disabled={submittingDiscount}
                          className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl font-bold hover:bg-indigo-600 disabled:bg-slate-400 transition-colors shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                      >
                          {submittingDiscount ? 'Creating...' : <><Plus size={16}/> Save Special Rate Code</>}
                      </button>
                  </form>

                  {/* Existing Saved Codes List */}
                  <div className="lg:col-span-7 flex flex-col space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                          <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5">
                              Saved Rate Codes ({discountCodes.length})
                          </h3>
                      </div>

                      {discountCodes.length === 0 ? (
                          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                              <Ticket className="text-slate-300 mx-auto mb-3" size={32} />
                              <p className="text-slate-500 text-sm font-medium">No discount booking rate codes found.</p>
                              <p className="text-slate-400 text-xs mt-1">Create one on the left to get started.</p>
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1">
                              {discountCodes.map((dc) => {
                                  const propName = properties.find(p => p.id === dc.propertyRestriction)?.name || 'All Properties';
                                  const isExpired = dc.maxUses ? dc.useCount >= dc.maxUses : false;
                                  
                                  return (
                                      <div 
                                          key={dc.id} 
                                          className={cn(
                                              "border rounded-2xl p-4 bg-white shadow-xs flex flex-col justify-between transition-all relative overflow-hidden",
                                              dc.isActive && !isExpired ? "border-slate-200" : "border-slate-100 opacity-60"
                                          )}
                                      >
                                          {/* Ticket outline header decorative element */}
                                          <div className="absolute top-1/2 -left-2 w-4 h-4 rounded-full bg-slate-50 border-r border-slate-200 -translate-y-1/2"></div>
                                          <div className="absolute top-1/2 -right-2 w-4 h-4 rounded-full bg-slate-50 border-l border-slate-200 -translate-y-1/2"></div>

                                          <div>
                                              <div className="flex justify-between items-start mb-3">
                                                  <div>
                                                      <span className="inline-block bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-mono font-extrabold tracking-wide px-2.5 py-1 rounded-lg">
                                                          {dc.code}
                                                      </span>
                                                      <div className="text-xs font-bold text-slate-800 mt-1">
                                                          {dc.discountType === 'percentage' ? `${dc.discountValue}% Off` : `$${dc.discountValue.toFixed(2)} Off`}
                                                      </div>
                                                  </div>
                                                  
                                                  <div className="flex items-center gap-1.5 z-10">
                                                      <button 
                                                          type="button"
                                                          onClick={() => toggleDiscountCode(dc.id, dc.isActive)}
                                                          className={cn(
                                                              "text-[10px] font-bold px-2 py-1 rounded-md transition-all cursor-pointer",
                                                              dc.isActive 
                                                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" 
                                                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                                          )}
                                                      >
                                                          {dc.isActive ? 'Active' : 'Inactive'}
                                                      </button>
                                                      <button 
                                                          type="button"
                                                          onClick={() => handleDeleteDiscountCode(dc.id, dc.code)}
                                                          className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                                                          title="Delete Code"
                                                      >
                                                          <Trash2 size={14} />
                                                      </button>
                                                  </div>
                                              </div>

                                              <div className="space-y-1.5 text-xs text-slate-600 mt-2 border-t border-slate-100 pt-2.5 pl-2">
                                                  {dc.guestEmailRestriction && (
                                                      <div className="flex items-center gap-1">
                                                          <span className="font-bold text-[10px] text-slate-400 uppercase tracking-tight block w-14">Guest:</span>
                                                          <span className="text-indigo-600 font-semibold truncate max-w-[150px]" title={dc.guestEmailRestriction}>
                                                              {dc.guestEmailRestriction}
                                                          </span>
                                                      </div>
                                                  )}
                                                  {dc.propertyRestriction && (
                                                      <div className="flex items-center gap-1">
                                                          <span className="font-bold text-[10px] text-slate-400 uppercase tracking-tight block w-14">Property:</span>
                                                          <span className="text-slate-700 font-medium truncate max-w-[150px]">
                                                              {propName}
                                                          </span>
                                                      </div>
                                                  )}
                                                  <div className="flex items-center gap-1">
                                                      <span className="font-bold text-[10px] text-slate-400 uppercase tracking-tight block w-14">Uses:</span>
                                                      <span className="font-semibold text-slate-800">
                                                          {dc.useCount} / {dc.maxUses || '∞'}
                                                      </span>
                                                      {isExpired && (
                                                          <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded font-extrabold ml-1 uppercase">Sold Out</span>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>

                                          {dc.notes && (
                                              <div className="mt-3 bg-slate-50/70 p-2 rounded-xl text-[11px] text-slate-500 italic border border-slate-100">
                                                  {dc.notes}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </div>
          </div>

          {/* FAQ & Executive Team Settings Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><HelpCircle className="text-indigo-600" size={20}/> FAQ & Corporate Team Configuration</h2>
              
              <form onSubmit={handleSaveFaqSettings} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      
                      {/* Left Column: CEO & PM Uploads */}
                      <div className="space-y-6">
                          
                          {/* CEO Settings */}
                          <div className="border border-slate-200 p-5 rounded-2xl bg-slate-50/50 space-y-4">
                              <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5 border-b border-slate-200 pb-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span> Chief Executive Officer (CEO)
                              </h3>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                                  <div className="sm:col-span-4 flex flex-col items-center">
                                      <div className="w-20 h-20 rounded-xl bg-indigo-100 border border-slate-200 overflow-hidden flex items-center justify-center relative shadow-sm">
                                          {ceoImage ? (
                                              <img src={ceoImage} alt="CEO Preview" className="w-full h-full object-cover" />
                                          ) : (
                                              <span className="text-indigo-700 font-extrabold text-xs">No Photo</span>
                                          )}
                                      </div>
                                      <label className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors shadow-sm inline-flex items-center gap-1">
                                          <Upload size={12} /> Upload File
                                          <input type="file" accept="image/*" onChange={handleCeoImageUpload} className="hidden" />
                                      </label>
                                  </div>
                                  
                                  <div className="sm:col-span-8 space-y-3">
                                      <div>
                                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">CEO Name</label>
                                          <input type="text" value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="e.g. Cynthia S. H. Robinson" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                                      </div>
                                      <div>
                                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">CEO Contact Email / Info</label>
                                          <input type="text" value={ceoContact} onChange={(e) => setCeoContact(e.target.value)} placeholder="e.g. cynthia@cshproperties.com" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                                      </div>
                                  </div>
                              </div>
                          </div>

                          {/* PM Settings */}
                          <div className="border border-slate-200 p-5 rounded-2xl bg-slate-50/50 space-y-4">
                              <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5 border-b border-slate-200 pb-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Property Manager
                              </h3>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                                  <div className="sm:col-span-4 flex flex-col items-center">
                                      <div className="w-20 h-20 rounded-xl bg-emerald-100 border border-slate-200 overflow-hidden flex items-center justify-center relative shadow-sm">
                                          {pmImage ? (
                                              <img src={pmImage} alt="PM Preview" className="w-full h-full object-cover" />
                                          ) : (
                                              <span className="text-emerald-700 font-extrabold text-xs">No Photo</span>
                                          )}
                                      </div>
                                      <label className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors shadow-sm inline-flex items-center gap-1">
                                          <Upload size={12} /> Upload File
                                          <input type="file" accept="image/*" onChange={handlePmImageUpload} className="hidden" />
                                      </label>
                                  </div>
                                  
                                  <div className="sm:col-span-8 space-y-3">
                                      <div>
                                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Manager Name</label>
                                          <input type="text" value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder="e.g. Markus Vance" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                                      </div>
                                      <div>
                                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Manager Contact Email / Info</label>
                                          <input type="text" value={pmContact} onChange={(e) => setPmContact(e.target.value)} placeholder="e.g. markus@cshproperties.com" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                                      </div>
                                  </div>
                              </div>
                          </div>

                      </div>

                      {/* Right Column: Contact Us & FAQ Footer Info */}
                      <div className="border border-slate-200 p-5 rounded-2xl bg-slate-50/50 space-y-4 flex flex-col justify-between">
                          <div className="space-y-4">
                              <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5 border-b border-slate-200 pb-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span> Contact Us Information (FAQ Page Footer)
                              </h3>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Support Email</label>
                                      <input type="email" value={contactUsEmail} onChange={(e) => setContactUsEmail(e.target.value)} placeholder="e.g. support@cshproperties.com" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                                  </div>
                                  <div>
                                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Support Phone</label>
                                      <input type="text" value={contactUsPhone} onChange={(e) => setContactUsPhone(e.target.value)} placeholder="e.g. (800) 555-0199" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                                  </div>
                              </div>

                              <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Corporate Headquarters / Office Address</label>
                                  <input type="text" value={contactUsAddress} onChange={(e) => setContactUsAddress(e.target.value)} placeholder="e.g. 100 Starling Blvd, Suite 400, Atlanta, GA 30309" className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" />
                              </div>

                              <div>
                                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight block">Custom Help Text / Subtitle</label>
                                  <textarea rows={3} value={contactUsText} onChange={(e) => setContactUsText(e.target.value)} placeholder="e.g. Our friendly support team is available 24/7 to assist you..." className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm resize-none" />
                              </div>
                          </div>

                          <div className="pt-4 mt-auto">
                              <button type="submit" className="w-full bg-slate-900 hover:bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-md">
                                  Save FAQ & Corporate Settings
                              </button>
                          </div>
                      </div>

                  </div>
              </form>
          </div>

          {/* Database Configuration Backup & Recovery Section */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Database className="text-indigo-600" size={20} /> Database Configuration Backup & Recovery
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                  Manage portable backups of your application's global configuration state. Use this panel to download a secure snapshot of your settings, properties, rooms, pricing structures, and blocked dates, or to restore from an existing config file.
              </p>

              {importingBackup && (
                  <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3 animate-pulse">
                      <RefreshCw className="animate-spin text-indigo-600" size={20} />
                      <div>
                          <p className="text-sm font-bold text-indigo-900">Restoring Database Configuration...</p>
                          <p className="text-xs text-indigo-700 mt-0.5">{importStatus}</p>
                      </div>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Export Column */}
                  <div className="border border-slate-100 p-5 rounded-2xl bg-slate-50/50 flex flex-col justify-between">
                      <div>
                          <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-3">
                              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span> Export Backup Configuration
                          </h3>
                          <p className="text-xs text-slate-500 leading-relaxed mb-4">
                              Creates and downloads a structured <strong>JSON config file</strong> containing:
                          </p>
                          <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 mb-6 leading-relaxed">
                              <li>Global Booking Settings & cancellation policies</li>
                              <li>Full Properties catalog (including rooms and amenities)</li>
                              <li>Special pricing rules & rates</li>
                              <li>Property blackout and maintenance dates</li>
                          </ul>
                      </div>
                      <div>
                          <button 
                              type="button" 
                              onClick={handleExportBackup}
                              disabled={importingBackup}
                              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md shadow-indigo-100 flex items-center justify-center gap-2 text-sm"
                          >
                              <FileDown size={16} /> Export Backup File (.json)
                          </button>
                      </div>
                  </div>

                  {/* Import Column */}
                  <div className="border border-slate-100 p-5 rounded-2xl bg-slate-50/50 flex flex-col justify-between">
                      <div>
                          <h3 className="font-bold text-slate-800 text-md flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-3">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Import & Restore Configuration
                          </h3>
                          <p className="text-xs text-slate-500 leading-relaxed mb-4">
                              Upload a valid configuration file to fully restore database settings. 
                          </p>
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 mb-6 leading-relaxed">
                              <strong>⚠️ Overwrite Notice:</strong> Restoring a backup replaces existing global configurations. It is non-destructive and will <strong>NOT</strong> delete, modify, or affect active guest bookings, leases, or user profiles.
                          </div>
                      </div>
                      <div>
                          <label className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm text-center">
                              <Upload size={16} /> Import & Restore Backup
                              <input 
                                  type="file" 
                                  accept=".json" 
                                  onChange={handleImportBackup} 
                                  disabled={importingBackup}
                                  className="hidden" 
                              />
                          </label>
                      </div>
                  </div>
              </div>
          </div>

          <div id="create-manual-booking-form" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><CalendarIcon size={20}/> Create Manual Booking</h2>
                <div className="flex items-center gap-2">
                   <button 
                      type="button" 
                      onClick={handleClearManualBookingAndInvoice} 
                      className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer w-fit"
                      title="Clear all form fields and reset New Invoice back to Null/Blank"
                   >
                      <Eraser size={15}/> Clear
                   </button>
                   <button 
                      type="button" 
                      onClick={() => setShowDuplicateInvoiceModal(true)} 
                      className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 shadow-sm cursor-pointer w-fit"
                   >
                      <Copy size={15}/> Duplicate Previous Invoice
                   </button>
                </div>
             </div>
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
                   <input 
                      name="guestName" 
                      required 
                      value={manualGuestName} 
                      onChange={e => setManualGuestName(e.target.value)} 
                      placeholder="Guest Name" 
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                   />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Guest Email</label>
                   <input 
                      name="guestEmail" 
                      type="email" 
                      required 
                      value={manualGuestEmail} 
                      onChange={e => setManualGuestEmail(e.target.value)} 
                      placeholder="guest@example.com" 
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                   />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Guest Phone</label>
                   <input 
                      name="guestPhone" 
                      value={manualGuestPhone} 
                      onChange={e => setManualGuestPhone(e.target.value)} 
                      placeholder="+1..." 
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                   />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">Total Price ($)</label>
                   <input 
                      name="totalPrice" 
                      type="number" 
                      step="0.01" 
                      required 
                      value={manualTotalPrice} 
                      onChange={e => setManualTotalPrice(e.target.value)} 
                      placeholder="0.00" 
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                   />
                </div>
                <div className="lg:col-span-1">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-tight">SmartLock Code</label>
                   <input 
                      name="accessCode" 
                      value={manualAccessCode} 
                      onChange={e => setManualAccessCode(e.target.value)} 
                      placeholder="Auto / Custom" 
                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm font-mono focus:ring-2 focus:ring-indigo-200 outline-none" 
                   />
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
                   <div className="flex items-center gap-2 w-full md:w-auto">
                      <button 
                         type="button"
                         onClick={handleClearManualBookingAndInvoice}
                         className="w-full md:w-auto bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 px-5 py-3 rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                         title="Clear all manual booking fields and reset invoice back to Null/Blank"
                      >
                         <Eraser size={16}/> Clear
                      </button>
                      <button type="submit" className="w-full md:w-auto bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-colors shadow-sm cursor-pointer">
                         {createInvoiceForPayment ? "Create & Open Invoice Template" : "Create Override Booking"}
                      </button>
                   </div>
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
             {/* Lease Agreements & Requests Manager Section */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-8">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100 text-left">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                     <FileText className="text-indigo-600" size={20} /> Lease Agreements & Requests Manager
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage lease requests, assign manual agreement numbers from invoices, set lease terms, and dispatch payment reminders.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                   <button
                     onClick={() => setShowManualLeaseForm(!showManualLeaseForm)}
                     className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                   >
                     <Plus size={15} /> {showManualLeaseForm ? "Close Form" : "Create Manual Lease"}
                   </button>
                   <span className="bg-amber-100 text-amber-700 px-2.5 py-2 rounded-xl uppercase">
                      {leaseRequests.filter(r => r.status === 'pending').length} Requests Pending
                   </span>
                   <span className="bg-indigo-100 text-indigo-700 px-2.5 py-2 rounded-xl uppercase">
                      {leases.length} Active Leases
                   </span>
                </div>
             </div>

             {/* Manual Lease Creation Form */}
             {showManualLeaseForm && (
               <div className="bg-slate-50 border border-indigo-200 rounded-2xl p-5 mb-8 text-left transition-all shadow-inner">
                 <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-200">
                   <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                     <FileCheck className="text-indigo-600" size={18} /> Create Manual Lease Agreement from Invoice Ledger
                   </h3>
                   <button 
                     type="button"
                     onClick={() => setShowManualLeaseForm(false)}
                     className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                   >
                     Close ✕
                   </button>
                 </div>

                 <form onSubmit={handleCreateManualLease} className="space-y-4">
                   <div>
                     <label className="block text-xs font-bold text-slate-700 mb-1">
                       Select Invoice # from "Invoice Transaction Ledger" (Auto-fills Lease Info):
                     </label>
                     <select
                       value={selectedInvoiceBookingId}
                       onChange={(e) => handleInvoiceSelectionForLease(e.target.value)}
                       className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                     >
                       <option value="">-- Select Invoice # from Transaction Ledger --</option>
                       {bookings
                         .filter(b => !!b.invoiceDetails)
                         .sort((a, b) => new Date(b.invoiceDetails.sentAt || b.createdAt).getTime() - new Date(a.invoiceDetails.sentAt || a.createdAt).getTime())
                         .map((b) => {
                           const inv = b.invoiceDetails;
                           const prop = properties.find(p => p.id === b.propertyId);
                           const invNum = inv.invoiceNumber || 'Manual';
                           const sponsor = inv.sponsorName || b.guestName || 'Guest';
                           const total = (inv.grandTotal !== undefined ? inv.grandTotal : (inv.baseAmount || (b.totalPrice / 100))).toFixed(2);
                           const propName = b.propertyName || prop?.name || 'Property';
                           return (
                             <option key={b.id} value={b.id}>
                               Invoice #{invNum} — {sponsor} (${total}) — {propName}
                             </option>
                           );
                         })}
                     </select>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div>
                       <div className="flex justify-between items-center mb-1">
                         <label className="text-xs font-bold text-slate-700">Lease Agreement Number # *</label>
                         <button
                           type="button"
                           onClick={() => setManualLeaseCode('LSE-' + Math.random().toString(36).substring(2, 7).toUpperCase())}
                           className="text-[10px] text-indigo-650 hover:underline font-bold"
                         >
                           Generate Random
                         </button>
                       </div>
                       <input
                         type="text"
                         required
                         value={manualLeaseCode}
                         onChange={(e) => setManualLeaseCode(e.target.value.toUpperCase())}
                         placeholder="e.g. LSE-9K2L1"
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-indigo-700 uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Lease Status / Type *</label>
                       <select
                         value={manualLeaseType}
                         onChange={(e) => setManualLeaseType(e.target.value as 'month_to_month' | 'fixed')}
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                       >
                         <option value="month_to_month">Month-to-Month Lease</option>
                         <option value="fixed">Fixed Lease</option>
                       </select>
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Property / Unit Name</label>
                       <input
                         type="text"
                         value={manualPropertyName}
                         onChange={(e) => setManualPropertyName(e.target.value)}
                         placeholder="Property Name"
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Tenant Name *</label>
                       <input
                         type="text"
                         required
                         value={manualTenantName}
                         onChange={(e) => setManualTenantName(e.target.value)}
                         placeholder="Tenant Full Name"
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Tenant Email *</label>
                       <input
                         type="email"
                         required
                         value={manualTenantEmail}
                         onChange={(e) => setManualTenantEmail(e.target.value)}
                         placeholder="tenant@example.com"
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Tenant Phone</label>
                       <input
                         type="tel"
                         value={manualTenantPhone}
                         onChange={(e) => setManualTenantPhone(e.target.value)}
                         placeholder="(555) 000-0000"
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Lease Start Date</label>
                       <input
                         type="date"
                         value={manualStartDate}
                         onChange={(e) => setManualStartDate(e.target.value)}
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Lease End Date</label>
                       <input
                         type="date"
                         value={manualEndDate}
                         onChange={(e) => setManualEndDate(e.target.value)}
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-bold text-slate-700 mb-1">Monthly Rent Amount ($ USD)</label>
                       <input
                         type="number"
                         step="0.01"
                         value={manualMonthlyRent}
                         onChange={(e) => setManualMonthlyRent(e.target.value)}
                         placeholder="1500.00"
                         className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                     </div>
                   </div>

                   <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                     <button
                       type="button"
                       onClick={() => setShowManualLeaseForm(false)}
                       className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 cursor-pointer"
                     >
                       Cancel
                     </button>
                     <button
                       type="submit"
                       disabled={isCreatingManualLease}
                       className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                     >
                       {isCreatingManualLease ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                       Create & Authorize Lease
                     </button>
                   </div>
                 </form>
               </div>
             )}

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
                                           {req.status === 'rejected' && (
                                              <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider">
                                                 Rejected
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
                                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                           <button
                                              type="button"
                                              onClick={() => handleRejectLeaseRequest(req.id)}
                                              className="w-full sm:w-auto bg-slate-50 hover:bg-red-50 text-red-605 hover:text-red-700 border border-slate-200 hover:border-red-200 font-bold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 text-xs cursor-pointer h-9 text-center whitespace-nowrap"
                                           >
                                              <XCircle size={13} />
                                              Reject Request
                                           </button>
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
                      <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                         {leases.map((l: any) => {
                            const isMonthToMonth = (l.leaseType || 'month_to_month') === 'month_to_month';
                            let paymentDueDateStr = "Day after term end";
                            let reminderDateStr = "5 days prior to end";

                            if (l.endDate && l.endDate.includes("-")) {
                               try {
                                  const endDt = new Date(l.endDate);
                                  if (!isNaN(endDt.getTime())) {
                                     const nextDay = new Date(endDt);
                                     nextDay.setDate(nextDay.getDate() + 1);
                                     paymentDueDateStr = nextDay.toISOString().split("T")[0];

                                     const remDay = new Date(endDt);
                                     remDay.setDate(remDay.getDate() - 5);
                                     reminderDateStr = remDay.toISOString().split("T")[0];
                                  }
                               } catch (e) {}
                            }

                            return (
                               <div key={l.id} className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all bg-white shadow-sm flex flex-col justify-between gap-3 text-left">
                                  <div>
                                     <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5 text-left">
                                        <div className="flex items-center gap-2">
                                           <span className="font-mono text-sm font-black text-indigo-600 tracking-wider select-all">{l.leaseCode}</span>
                                           {l.invoiceNumber && (
                                              <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold">
                                                 Inv #{l.invoiceNumber}
                                              </span>
                                           )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                           <label className="text-[10px] font-bold text-slate-400 uppercase">Status:</label>
                                           <select
                                              value={l.leaseType || 'month_to_month'}
                                              onChange={(e) => handleUpdateLeaseType(l.id, e.target.value as 'month_to_month' | 'fixed')}
                                              className="text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-0.5 outline-none cursor-pointer uppercase"
                                           >
                                              <option value="month_to_month">Month-to-Month</option>
                                              <option value="fixed">Fixed Lease</option>
                                           </select>
                                        </div>
                                     </div>

                                     <div className="space-y-1 text-xs text-slate-600 text-left mt-2">
                                        <div><strong className="text-slate-400">Tenant:</strong> <span className="font-semibold text-slate-800">{l.tenantName}</span></div>
                                        <div><strong className="text-slate-400">Email:</strong> {l.tenantEmail} {l.tenantPhone ? `• ${l.tenantPhone}` : ''}</div>
                                        <div><strong className="text-slate-400">Unit:</strong> <span className="text-slate-700 font-medium">{l.propertyNameOrRoom || "Property"}</span></div>
                                        <div className="font-mono text-[11px]"><strong className="text-slate-400">Lease Term:</strong> {l.startDate || "N/A"} to {l.endDate || "N/A"}</div>
                                        {l.monthlyRent ? (
                                           <div className="text-xs font-bold text-slate-700"><strong className="text-slate-400 font-normal">Monthly Rent:</strong> ${Number(l.monthlyRent).toFixed(2)}</div>
                                        ) : null}
                                     </div>

                                     {isMonthToMonth && (
                                        <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1 text-xs text-slate-700">
                                           <div className="flex justify-between items-center text-[11px]">
                                              <span className="text-slate-500 font-medium">⏰ 5-Day Reminder Date:</span>
                                              <span className="font-mono font-bold text-slate-800">{reminderDateStr}</span>
                                           </div>
                                           <div className="flex justify-between items-center text-[11px]">
                                              <span className="text-slate-500 font-medium">💳 Payment Due Date (Day After Term):</span>
                                              <span className="font-mono font-extrabold text-indigo-600">{paymentDueDateStr}</span>
                                           </div>
                                           <div className="flex justify-between items-center pt-1.5 border-t border-indigo-100 text-[11px]">
                                              <span className="text-slate-500 font-medium">Guest Validation Status:</span>
                                              {l.validatedForNextMonth ? (
                                                 <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                                                    <CheckCircle size={10} /> Validated & Renewed
                                                 </span>
                                              ) : (
                                                 <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                                    Pending Validation
                                                 </span>
                                              )}
                                           </div>
                                        </div>
                                     )}
                                  </div>

                                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                     <button
                                        onClick={() => handleResendLeaseReminder(l)}
                                        disabled={sendingReminderLeaseId === (l.id || l.leaseCode)}
                                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                                        title="Resend Lease Payment & Renewal Reminder Email to Guest"
                                     >
                                        {sendingReminderLeaseId === (l.id || l.leaseCode) ? (
                                           <Loader2 className="animate-spin" size={13} />
                                        ) : (
                                           <Send size={13} />
                                        )}
                                        Resend Payment Reminder
                                     </button>

                                     <button
                                        onClick={() => handleDeleteActiveLease(l.id)}
                                        className="text-red-500 hover:bg-red-50 p-1.5 rounded-xl transition-colors cursor-pointer"
                                        title="Delete Permanent Lease Record"
                                     >
                                        <Trash2 size={16} />
                                     </button>
                                  </div>
                               </div>
                            );
                         })}
                      </div>
                   )}
                </div>
             </div>
          </div>         </div>

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
                                            <div className="inline-flex gap-1.5 items-center">
                                               <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                                                  <CheckCircle size={12} className="text-emerald-550" /> Paid
                                               </span>
                                               <button
                                                  onClick={() => {
                                                     setResendingConfirmationBooking(b);
                                                     setResendNotifyAdmins(true);
                                                     setResendNotifyGuest(true);
                                                  }}
                                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-850 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                               >
                                                  <Mail size={12} /> Resend Receipt
                                               </button>
                                            </div>
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

                <hr className="my-8 border-slate-200" />

                <div className="mt-8">
                   <div className="flex justify-between items-center mb-6">
                      <div>
                         <h2 className="text-xl font-bold flex items-center gap-2"><FileText className="text-indigo-600" size={20}/> Invoice Transaction Ledger</h2>
                         <p className="text-xs text-slate-500 mt-1">Real-time status tracking of all created booking invoices. Sync with Stripe directly to verify transaction success.</p>
                      </div>
                      <div className="flex gap-2 text-xs font-semibold">
                         <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-bold uppercase">{bookings.filter(b => b.invoiceDetails?.paid && !b.invoiceDetails?.cancelled && b.status !== 'cancelled').length} Paid</span>
                         <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md font-bold uppercase">{bookings.filter(b => b.invoiceDetails && !b.invoiceDetails.paid && !b.invoiceDetails.cancelled && b.status !== 'cancelled').length} Unpaid</span>
                         <span className="bg-rose-100 text-rose-800 px-2.5 py-1 rounded-md font-bold uppercase">{bookings.filter(b => b.invoiceDetails && (b.invoiceDetails.cancelled || b.status === 'cancelled')).length} Cancelled</span>
                      </div>
                   </div>
                   
                   <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                         <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-100 sticky top-0 z-10">
                            <tr>
                               <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Invoice #</th>
                               <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Sponsor Name & Email</th>
                               <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Amount (USD)</th>
                               <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Invoice Sent Date</th>
                               <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest">Payment Status</th>
                               <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {bookings.filter(b => !!b.invoiceDetails).sort((a, b) => new Date(b.invoiceDetails.sentAt || b.createdAt).getTime() - new Date(a.invoiceDetails.sentAt || a.createdAt).getTime()).map((b) => {
                               const inv = b.invoiceDetails;
                               const prop = properties.find(p => p.id === b.propertyId);
                               const formattedSentDate = inv.sentAt ? new Date(inv.sentAt).toLocaleString() : 'N/A';
                               const formattedPaidDate = inv.paidAt ? new Date(inv.paidAt).toLocaleString() : '';
                               const isInvoiceCancelled = inv.cancelled || b.status === 'cancelled';
                               
                               return (
                                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                     <td className="px-4 py-4 font-mono text-xs font-bold text-indigo-600">
                                        <div className="flex flex-col items-start">
                                           <button
                                              onClick={() => setViewingInvoiceBooking(b)}
                                              className="text-left text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none font-bold font-mono transition-all inline-block cursor-pointer"
                                              title="Click to view full invoice details"
                                           >
                                              #{inv.invoiceNumber || 'Manual'}
                                           </button>
                                           <span className="text-[10px] text-slate-400 font-normal">Ref: {b.bookingRef || '—'}</span>
                                        </div>
                                     </td>
                                     <td className="px-4 py-4">
                                        <div className="font-semibold text-slate-800">{inv.sponsorName || 'Unknown Sponsor'}</div>
                                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                           <Mail size={12} className="text-slate-400" />
                                           {inv.sponsorEmail}
                                        </div>
                                        {inv.sponsorPhone && (
                                           <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                              <Phone size={12} className="text-slate-400" />
                                              {inv.sponsorPhone}
                                           </div>
                                        )}
                                     </td>
                                     <td className="px-4 py-4">
                                        <div className="font-bold text-slate-800">${(inv.grandTotal || b.totalPrice / 100).toFixed(2)}</div>
                                        <div className="text-[10px] text-slate-400 leading-normal mt-0.5">
                                           Base: ${(inv.baseAmount || (b.totalPrice / 100) - (inv.stripeFee || 0)).toFixed(2)} <br />
                                           Stripe Fee: ${(inv.stripeFee || 0).toFixed(2)}
                                        </div>
                                     </td>
                                     <td className="px-4 py-4 text-slate-600 text-xs font-mono">
                                        {formattedSentDate}
                                     </td>
                                     <td className="px-4 py-4 space-y-1">
                                        <div>
                                           {isInvoiceCancelled ? (
                                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 inline-flex items-center gap-1" title={inv.cancellationNote ? `Note: ${inv.cancellationNote}` : undefined}>
                                                 <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                 Cancelled
                                              </span>
                                           ) : inv.paid ? (
                                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                                                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                 Paid
                                              </span>
                                           ) : (
                                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                                                 <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                                 Pending
                                              </span>
                                           )}
                                        </div>
                                        {isInvoiceCancelled && inv.cancellationNote && (
                                           <div className="text-[10px] text-rose-600 font-medium italic truncate max-w-[150px]" title={inv.cancellationNote}>
                                              Note: {inv.cancellationNote}
                                           </div>
                                        )}
                                        {!isInvoiceCancelled && inv.paid && formattedPaidDate && (
                                           <div className="text-[9px] text-slate-400 font-mono">
                                              At: {formattedPaidDate}
                                           </div>
                                        )}
                                     </td>
                                     <td className="px-4 py-4 text-right">
                                        <div className="flex justify-end gap-2 flex-wrap items-center">
                                           {isInvoiceCancelled ? (
                                              <span className="text-[11px] text-slate-400 font-medium italic">Invoice Cancelled</span>
                                           ) : (
                                              <>
                                                 {inv.stripePaymentUrl && !inv.paid && (
                                                    <a
                                                       href={inv.stripePaymentUrl}
                                                       target="_blank"
                                                       rel="noopener noreferrer"
                                                       className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                                       title="View Stripe Checkout URL"
                                                    >
                                                       Checkout Link
                                                    </a>
                                                 )}
                                                 
                                                 {inv.stripeSessionId && !inv.paid && (
                                                    <button
                                                       onClick={() => handleSyncStripeStatus(b.id)}
                                                       disabled={syncingInvoiceId === b.id}
                                                       className="text-[10px] font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-300 hover:border-indigo-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                                       title="Sync live status directly from Stripe.com"
                                                    >
                                                       {syncingInvoiceId === b.id ? (
                                                          <>
                                                             <Loader2 size={12} className="animate-spin" /> Syncing...
                                                          </>
                                                       ) : (
                                                          <>
                                                             <RefreshCw size={12} /> Sync Stripe
                                                          </>
                                                       )}
                                                    </button>
                                                 )}

                                                 {!inv.paid && (
                                                    <button
                                                       onClick={() => handleMarkInvoicePaidManual(b.id)}
                                                       className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                                       title="Manually mark paid (e.g. offline pay)"
                                                    >
                                                       <CheckCircle size={12} /> Mark Paid
                                                    </button>
                                                 )}

                                                 {!inv.paid && (
                                                    <button
                                                       onClick={() => handleOpenCancelInvoiceModal(b)}
                                                       className="text-[10px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                                       title="Cancel this unpaid / pending invoice"
                                                    >
                                                       <XCircle size={12} /> Cancel Invoice
                                                    </button>
                                                 )}
                                                 
                                                 {inv.paid ? (
                                                    <button
                                                       onClick={() => {
                                                          setResendingConfirmationBooking(b);
                                                          setResendNotifyAdmins(true);
                                                          setResendNotifyGuest(true);
                                                       }}
                                                       className="text-[10px] font-bold text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                                    >
                                                       <Mail size={12} /> Resend Paid Receipt
                                                    </button>
                                                 ) : (
                                                    <button
                                                       onClick={() => handleResendInvoice(b)}
                                                       disabled={sendingInvoiceId === b.id}
                                                       className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                                    >
                                                       {sendingInvoiceId === b.id ? "Sending..." : "Resend Email"}
                                                    </button>
                                                 )}

                                                 <button
                                                    onClick={() => handleRenewInvoice(b)}
                                                    className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                                    title="Create a renewed invoice defaulting to the same stay length following current check-out"
                                                 >
                                                    <RotateCw size={12} /> Renew Invoice
                                                 </button>
                                              </>
                                           )}
                                        </div>
                                     </td>
                                  </tr>
                               );
                            })}
                         </tbody>
                      </table>
                      {bookings.filter(b => !!b.invoiceDetails).length === 0 && (
                         <p className="text-center py-8 text-slate-400 text-sm italic">No generated invoices found.</p>
                      )}
                   </div>
                </div>
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
             <div className={cn("overflow-x-auto", users.length > 10 && "max-h-[500px] overflow-y-auto")}>
                <table className="w-full text-sm text-left">
                   <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-y border-slate-100 sticky top-0 z-10">
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
                     
                     {/* Promotional Video Section */}
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                         <div className="flex justify-between items-center">
                             <label className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                 <Video size={16} className="text-indigo-600" /> Promotional Video (Optional)
                             </label>
                             {createPromoVideoUrl && (
                                 <button
                                     type="button"
                                     onClick={() => setCreatePromoVideoUrl('')}
                                     className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                                 >
                                     <X size={14} /> Clear Video
                                 </button>
                             )}
                         </div>

                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                             <div>
                                 <label className="text-[11px] font-semibold text-slate-500 block mb-1">Enter Video URL (YouTube, Vimeo, MP4 link)</label>
                                 <input
                                     type="text"
                                     name="promoVideoUrl"
                                     value={createPromoVideoUrl}
                                     onChange={(e) => setCreatePromoVideoUrl(e.target.value)}
                                     placeholder="e.g. https://www.youtube.com/watch?v=... or MP4 URL"
                                     className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white shadow-xs focus:ring-2 focus:ring-indigo-100 outline-none"
                                 />
                             </div>

                             <div>
                                 <label className="text-[11px] font-semibold text-slate-500 block mb-1">OR Upload Video File (MP4/WebM)</label>
                                 <label className="w-full border border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl p-2 text-xs font-bold text-indigo-700 flex items-center justify-center gap-2 cursor-pointer transition-colors h-[38px]">
                                     <Upload size={14} /> {createPromoVideoUrl ? 'Replace Video File' : 'Choose Video File'}
                                     <input
                                         type="file"
                                         accept="video/*"
                                         className="hidden"
                                         onChange={(e) => handleVideoFileUpload(e, false)}
                                     />
                                 </label>
                             </div>
                         </div>

                         {createPromoVideoUrl && (
                             <div className="mt-2 p-2 bg-slate-900 rounded-xl border border-slate-800">
                                 <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">Video Preview</div>
                                 {renderAdminVideoPreview(createPromoVideoUrl)}
                             </div>
                         )}
                     </div>
                     
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                         <div className="flex justify-between items-center mb-2">
                             <span className="font-medium text-slate-700">Images ({previewImages.length}/35)</span>
                             <label className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-lg cursor-pointer text-sm font-bold flex gap-2 items-center transition-colors">
                                 <ImageIcon size={16} /> Upload Photos
                                 <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} disabled={uploadingProperty || previewImages.length >= 35} />
                             </label>
                         </div>
                         <div className="flex flex-wrap gap-2">
                             {previewImages.map((imgObj, i) => (
                                 <div key={i} className="relative w-28 border border-slate-200 rounded-xl bg-slate-50 flex flex-col overflow-hidden group shadow-xs">
                                     <div className="h-16 w-full relative overflow-hidden bg-slate-100">
                                         <img src={getImageUrl(imgObj)} className="w-full h-full object-cover" />
                                         <button 
                                             type="button" 
                                             onClick={() => setPreviewImages(p => p.filter((_, idx)=>idx!==i))} 
                                             className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow z-10 transition-colors"
                                         >
                                             ✕
                                         </button>
                                     </div>
                                     <div className="p-1.5 flex flex-col gap-1">
                                         <label className="text-[9px] uppercase font-bold text-slate-400 block tracking-tight">Room #</label>
                                         <input 
                                             type="text" 
                                             placeholder="General" 
                                             value={imgObj.roomNumber || ''} 
                                             onChange={(e) => {
                                                 const newImgs = [...previewImages];
                                                 newImgs[i] = { ...newImgs[i], roomNumber: e.target.value };
                                                 setPreviewImages(newImgs);
                                             }}
                                             className="w-full text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 outline-none focus:border-indigo-400 font-semibold"
                                         />
                                     </div>
                                 </div>
                             ))}
                             {uploadingProperty && <div className="w-28 h-28 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-semibold shadow-xs">Processing...</div>}
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
                             
                             {/* Promotional Video Section */}
                             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                 <div className="flex justify-between items-center">
                                     <label className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                         <Video size={16} className="text-indigo-600" /> Promotional Video
                                     </label>
                                     {editPromoVideoUrl && (
                                         <button
                                             type="button"
                                             onClick={() => setEditPromoVideoUrl('')}
                                             className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                                         >
                                             <X size={14} /> Remove Video
                                         </button>
                                     )}
                                 </div>

                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                     <div>
                                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">Video URL (YouTube, Vimeo, MP4 link)</label>
                                         <input
                                             type="text"
                                             name="promoVideoUrl"
                                             value={editPromoVideoUrl}
                                             onChange={(e) => setEditPromoVideoUrl(e.target.value)}
                                             placeholder="e.g. https://www.youtube.com/watch?v=... or MP4 URL"
                                             className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white shadow-xs focus:ring-2 focus:ring-indigo-100 outline-none"
                                         />
                                     </div>

                                     <div>
                                         <label className="text-[11px] font-semibold text-slate-500 block mb-1">OR Upload Video File (MP4/WebM)</label>
                                         <label className="w-full border border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl p-2 text-xs font-bold text-indigo-700 flex items-center justify-center gap-2 cursor-pointer transition-colors h-[38px]">
                                             <Upload size={14} /> {editPromoVideoUrl ? 'Replace Video File' : 'Upload Video File'}
                                             <input
                                                 type="file"
                                                 accept="video/*"
                                                 className="hidden"
                                                 onChange={(e) => handleVideoFileUpload(e, true)}
                                             />
                                         </label>
                                     </div>
                                 </div>

                                 {editPromoVideoUrl ? (
                                     <div className="mt-2 p-2 bg-slate-900 rounded-xl border border-slate-800">
                                         <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">Current Video Preview</div>
                                         {renderAdminVideoPreview(editPromoVideoUrl)}
                                     </div>
                                 ) : (
                                     <p className="text-[11px] text-slate-400 italic">No promotional video set for this property.</p>
                                 )}
                             </div>
                             
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
                                            <div className="col-span-1">
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
                                            <div className="col-span-1">
                                                <label className="text-[10px] uppercase font-black text-slate-400 block mb-1.5 tracking-wider">Max Capacity</label>
                                                <input 
                                                    type="number" 
                                                    value={b.maxCapacity !== undefined ? b.maxCapacity : 2} 
                                                    onChange={(e) => {
                                                        const newRooms = [...editingBedrooms];
                                                        newRooms[i] = { ...newRooms[i], maxCapacity: parseInt(e.target.value) || 1 };
                                                        setEditingBedrooms(newRooms);
                                                    }}
                                                    className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all outline-none font-semibold text-slate-700" 
                                                />
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
                                      <input type="number" id="newRoomMaxCapacity" placeholder="Max Capacity" defaultValue={2} className="p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all" />
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
                                          const maxCapacity = parseInt((document.getElementById('newRoomMaxCapacity') as HTMLInputElement).value || '2');
                                         const type = (document.getElementById('newRoomType') as HTMLSelectElement).value as 'Master Bed' | 'Guest Bedroom';
                                         if(roomNumber && roomLockNumber) {
                                             setEditingBedrooms(prev => [...prev, { roomNumber, roomLockNumber, type, sqFt, fee, maxCapacity }]);
                                             // Reset inputs
                                             (document.getElementById('newRoomNumber') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomLock') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomSqFt') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomFee') as HTMLInputElement).value = '';
                                             (document.getElementById('newRoomMaxCapacity') as HTMLInputElement).value = '2';
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
                              <div className="flex flex-wrap gap-2 max-h-[340px] overflow-y-auto pr-2">
                                  {p.images.map((img, i) => {
                                      const isSelected = selectedEditImageIndex === i;
                                      const currentRoom = getImageRoomNumber(img) || '';
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
                                              className={cn(
                                                  "relative w-28 border rounded-xl bg-white flex flex-col overflow-hidden group shadow-xs transition-all duration-200 select-none",
                                                  isSelected 
                                                      ? "ring-4 ring-indigo-600 ring-offset-1 border-transparent z-10 shadow-md"
                                                      : "border-slate-200 hover:border-indigo-300"
                                              )}
                                          >
                                              <div 
                                                  className="h-16 w-full relative cursor-pointer overflow-hidden bg-slate-50"
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
                                              >
                                                  <img src={getImageUrl(img)} className="w-full h-full object-cover" />
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
                                                      className="absolute top-1 right-1 bg-red-500/90 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow-sm transition-colors z-30"
                                                  >
                                                      ✕
                                                  </button>
                                                  {isSelected && (
                                                      <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center z-10">
                                                          <span className="bg-indigo-600 text-white text-[8px] font-extrabold px-1 py-0.5 rounded shadow">SELECTED</span>
                                                      </div>
                                                  )}
                                                  {/* Reorder Arrows Over Image */}
                                                  <div className="absolute hidden group-hover:flex inset-x-0 bottom-1 justify-center gap-1.5 z-20">
                                                      {i > 0 && (
                                                         <button 
                                                             type="button" 
                                                             onClick={async (e) => { 
                                                                 e.stopPropagation(); 
                                                                 await handleMoveImage(p, i, "left"); 
                                                             }} 
                                                             className="bg-slate-900/90 text-white p-1 rounded-md hover:bg-slate-900 transition-colors shadow-sm"
                                                         >
                                                             <ArrowLeft size={10} />
                                                         </button>
                                                      )}
                                                      {i < p.images.length - 1 && (
                                                         <button 
                                                             type="button" 
                                                             onClick={async (e) => { 
                                                                 e.stopPropagation(); 
                                                                 await handleMoveImage(p, i, "right"); 
                                                             }} 
                                                             className="bg-slate-900/90 text-white p-1 rounded-md hover:bg-slate-900 transition-colors shadow-sm"
                                                         >
                                                             <ArrowRight size={10} />
                                                         </button>
                                                      )}
                                                  </div>
                                              </div>
                                              <div className="p-1.5 bg-slate-50 border-t border-slate-100 flex flex-col gap-0.5">
                                                  <label className="text-[8px] uppercase font-bold text-slate-400 block tracking-tight">Assign Room</label>
                                                  <select
                                                      value={editingBedrooms.some(b => b.roomNumber === currentRoom) ? currentRoom : (currentRoom ? 'custom' : '')}
                                                      onChange={async (e) => {
                                                          const val = e.target.value;
                                                          const newImages = [...p.images];
                                                          if (val === 'custom') {
                                                              const customNum = window.prompt("Enter Room Number:", currentRoom);
                                                              if (customNum !== null) {
                                                                  newImages[i] = typeof img === 'string' 
                                                                      ? { url: img, roomNumber: customNum }
                                                                      : { ...img, roomNumber: customNum };
                                                                  await handleUpdatePropertyImages(newImages);
                                                              }
                                                          } else {
                                                              newImages[i] = typeof img === 'string'
                                                                  ? { url: img, roomNumber: val }
                                                                  : { ...img, roomNumber: val };
                                                              await handleUpdatePropertyImages(newImages);
                                                          }
                                                      }}
                                                      className="w-full text-[10px] border border-slate-200 rounded bg-white text-slate-700 outline-none p-0.5 font-semibold focus:border-indigo-400"
                                                  >
                                                      <option value="">General</option>
                                                      {editingBedrooms.map(b => (
                                                          <option key={b.roomNumber} value={b.roomNumber}>Room {b.roomNumber}</option>
                                                      ))}
                                                      <option value="custom">Custom...</option>
                                                  </select>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  {uploadingProperty && <div className="w-28 h-28 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-xs text-slate-500 font-semibold shadow-xs animate-pulse">Wait...</div>}
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

                    {/* Global Cleaning Rate */}
                    <form onSubmit={handleSaveCleaningFee} className="mb-6 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex flex-col sm:flex-row sm:items-end justify-between gap-4 shadow-sm">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-indigo-900 uppercase tracking-wider block">Global Cleaning Rate</label>
                            <p className="text-xs text-slate-500 mt-0.5">Applied as a flat one-time service fee to all guest bookings.</p>
                            <div className="relative mt-2 max-w-[160px]">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input 
                                    type="number" 
                                    min="0" 
                                    value={cleaningFee} 
                                    onChange={(e) => setCleaningFee(Number(e.target.value))} 
                                    className="w-full border border-slate-200 rounded-xl py-2 pl-8 pr-4 bg-white shadow-sm font-semibold font-mono text-slate-800" 
                                    placeholder="100"
                                    required
                                />
                            </div>
                        </div>
                        <button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-indigo-100 transition-colors shrink-0 text-xs flex items-center gap-1.5"
                        >
                            Update Fee
                        </button>
                    </form>

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
                      <div className="flex items-center gap-2">
                         <button 
                            type="button"
                            onClick={handleClearManualBookingAndInvoice} 
                            className="text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                            title="Clear all fields and reset New Invoice back to Null/Blank"
                         >
                            <Eraser size={14} /> Clear All
                         </button>
                         <button 
                            type="button"
                            onClick={() => {
                               setShowInvoiceTemplate(false);
                               setPendingBookingData(null);
                            }} 
                            className="text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 hover:border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                         >
                            Cancel Override
                         </button>
                      </div>
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
                                                             value={invoiceDueDate || ''} onChange={e => setInvoiceDueDate(e.target.value)}
                                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                                   />
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Number of Days Late</label>
                                   <input 
                                      type="number" 
                                      min="0"
                                      value={invoiceDaysLate} 
                                      onChange={e => setInvoiceDaysLate(Math.max(0, parseInt(e.target.value) || 0))}
                                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                                      placeholder="0"
                                   />
                                </div>
                                <div>
                                   <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight text-left block">Late Fee ($ / Day)</label>
                                   <input 
                                      type="number" 
                                      min="0"
                                      step="0.01"
                                      value={invoiceLateFeePerDay} 
                                      onChange={e => setInvoiceLateFeePerDay(Math.max(0, parseFloat(e.target.value) || 0))}
                                      className="w-full border border-slate-200 rounded-xl p-2.5 mt-1 bg-white shadow-sm text-sm" 
                                      placeholder="25.00" 
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
                                   {(() => {
                                      const pBase = Number(pendingBookingData.totalPrice) || 0;
                                      const pGrand = pBase > 0 ? Math.round((((pBase + 0.30) / (1 - 0.029)) * (1 + 0.004)) * 100) / 100 : 0;
                                      const pFee = pBase > 0 ? Math.round((pGrand - pBase) * 100) / 100 : 0;
                                      return (
                                         <>
                                            <tr className="border-b border-slate-100">
                                               <td className="py-3">
                                                  <div className="font-bold text-slate-800">Stripe Processing Fee</div>
                                                  <div className="text-xs text-slate-400 mt-1">Stripe transaction fee ($0.30 / (1 - 2.9%) &times; 1.004)</div>
                                               </td>
                                               <td className="py-3 text-right font-mono font-bold text-slate-800">
                                                  ${pFee.toFixed(2)}
                                               </td>
                                            </tr>
                                            <tr>
                                               <td className="py-4 text-base font-black text-slate-800">Grand Total Due:</td>
                                               <td className="py-4 text-right text-lg font-black text-indigo-600 font-mono">
                                                  ${pGrand.toFixed(2)}
                                               </td>
                                            </tr>
                                         </>
                                      );
                                   })()}
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

          {viewingInvoiceBooking && (() => {
             const liveBooking = bookings.find(b => b.id === viewingInvoiceBooking.id) || viewingInvoiceBooking;
             const inv = liveBooking.invoiceDetails;
             if (!inv) return null;
             const prop = properties.find(p => p.id === liveBooking.propertyId);
             const formattedSentDate = inv.sentAt ? new Date(inv.sentAt).toLocaleString() : 'N/A';
             const formattedPaidDate = inv.paidAt ? new Date(inv.paidAt).toLocaleString() : '';
             const formattedDueDate = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A';

             return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                   <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
                      {/* Header */}
                      <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                         <div>
                            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                               <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center"><FileText size={18}/></span>
                               Invoice #{inv.invoiceNumber || 'Manual'} Details
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                               Ref Reference ID: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">{liveBooking.bookingRef || '—'}</span>
                            </p>
                         </div>
                         <button 
                            onClick={() => setViewingInvoiceBooking(null)} 
                            className="text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 hover:border-slate-300 p-2 rounded-full cursor-pointer flex items-center justify-center"
                            title="Close modal"
                         >
                            <XCircle size={20} />
                         </button>
                      </div>

                      {/* Content area */}
                      <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50">
                         {/* Live payment status hero section */}
                         <div className={cn(
                            "p-6 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4",
                            inv.paid 
                               ? "bg-emerald-50/50 border-emerald-100 text-emerald-900" 
                               : "bg-amber-50/50 border-amber-100 text-amber-900"
                         )}>
                            <div className="flex items-center gap-4 text-center sm:text-left">
                               <div className={cn(
                                  "p-3 rounded-xl flex items-center justify-center",
                                  inv.paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                               )}>
                                  {inv.paid ? <CheckCircle size={24} /> : <Loader2 size={24} className="animate-spin" />}
                               </div>
                               <div>
                                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment Status</div>
                                  <div className="text-xl font-black flex items-center gap-2 justify-center sm:justify-start">
                                     {inv.paid ? 'Fully Paid' : 'Pending Payment'}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                     {inv.paid && formattedPaidDate ? `Paid via Stripe on ${formattedPaidDate}` : 'Awaiting transfer/checkout process completion.'}
                                  </div>
                               </div>
                            </div>
                            <div className="text-center sm:text-right">
                               <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Grand Total Due</div>
                               <div className="text-2xl font-black text-indigo-600 font-mono">
                                  ${(inv.grandTotal || liveBooking.totalPrice / 100).toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                   Base: ${(inv.baseAmount || (liveBooking.totalPrice / 100) - (inv.stripeFee || 0)).toFixed(2)} + Stripe Fee: ${(inv.stripeFee || 0).toFixed(2)}
                                </div>
                            </div>
                         </div>

                         {/* Side-by-side Sponsor & Reservation */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Billing Sponsor info */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                               <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                                  Sponsor & Billing Entity
                               </h4>
                               <div className="space-y-3 text-sm">
                                  <div>
                                     <span className="text-xs text-slate-400">Sponsor Name / Company:</span>
                                     <div className="font-bold text-slate-800">{inv.sponsorName || 'Unknown Sponsor'}</div>
                                  </div>
                                  <div>
                                     <span className="text-xs text-slate-400">Billing Email:</span>
                                     <div className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                                        <Mail size={14} className="text-slate-400" />
                                        {inv.sponsorEmail}
                                     </div>
                                  </div>
                                  {inv.sponsorPhone && (
                                     <div>
                                        <span className="text-xs text-slate-400">Billing Phone:</span>
                                        <div className="font-medium text-slate-800 flex items-center gap-1.5 mt-0.5">
                                           <Phone size={14} className="text-slate-400" />
                                           {inv.sponsorPhone}
                                        </div>
                                     </div>
                                  )}
                                  {inv.sponsorAddress && (
                                     <div>
                                        <span className="text-xs text-slate-400">Billing Address:</span>
                                        <div className="text-slate-700 mt-0.5 whitespace-pre-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs leading-relaxed">
                                           {inv.sponsorAddress}
                                        </div>
                                     </div>
                                  )}
                               </div>
                            </div>

                            {/* Guest details recap */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                               <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                                  Guest Reservation Details
                               </h4>
                               <div className="space-y-3 text-sm">
                                  <div>
                                     <span className="text-xs text-slate-400">Guest Name:</span>
                                     <div className="font-bold text-slate-800">{liveBooking.guestName || 'Unknown Guest'}</div>
                                  </div>
                                  <div>
                                     <span className="text-xs text-slate-400">Contact Email & Phone:</span>
                                     <div className="font-medium text-slate-800 mt-0.5 flex flex-col gap-1">
                                         {liveBooking.guestEmail && (
                                            <span className="flex items-center gap-1.5 text-xs">
                                               <Mail size={12} className="text-slate-400" /> {liveBooking.guestEmail}
                                            </span>
                                         )}
                                         {liveBooking.guestPhone && (
                                            <span className="flex items-center gap-1.5 text-xs">
                                               <Phone size={12} className="text-slate-400" /> {liveBooking.guestPhone}
                                            </span>
                                         )}
                                     </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                                     <div>
                                        <span className="text-xs text-slate-400">Destination Property:</span>
                                        <div className="font-bold text-indigo-700 text-xs mt-0.5">{prop?.name || 'REALCal Luxury Lodging'}</div>
                                     </div>
                                     <div>
                                        <span className="text-xs text-slate-400">Stay Duration:</span>
                                        <div className="font-semibold text-slate-800 text-xs mt-0.5">{liveBooking.checkIn} to {liveBooking.checkOut}</div>
                                     </div>
                                  </div>
                                  {(liveBooking.selectedBedrooms && liveBooking.selectedBedrooms.length > 0) ? (
                                     <div>
                                        <span className="text-xs text-slate-400">Allocated Room(s):</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                           {liveBooking.selectedBedrooms.map((roomItem: any, idx: number) => {
                                              const rNum = typeof roomItem === 'object' && roomItem !== null ? roomItem.roomNumber : roomItem;
                                              return (
                                                 <span key={idx} className="font-mono text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                                    Room {rNum}
                                                 </span>
                                              );
                                           })}
                                        </div>
                                     </div>
                                  ) : liveBooking.selectedBedroom ? (
                                     <div>
                                        <span className="text-xs text-slate-400">Allocated Room:</span>
                                        <div className="mt-1">
                                           <span className="font-mono text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                              Room {typeof liveBooking.selectedBedroom === 'object' && liveBooking.selectedBedroom !== null ? liveBooking.selectedBedroom.roomNumber : liveBooking.selectedBedroom}
                                           </span>
                                        </div>
                                     </div>
                                  ) : (
                                     <div>
                                        <span className="text-xs text-slate-400">Allocated Room:</span>
                                        <div className="mt-1">
                                           <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">
                                              Entire Property
                                           </span>
                                        </div>
                                     </div>
                                  )}
                               </div>
                            </div>
                         </div>

                         {/* Dates, Notes & Session IDs block */}
                         <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                               <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                  Transaction Ledger & Metadata
                               </h4>
                               <button
                                  type="button"
                                  onClick={() => handleRenewInvoice(liveBooking)}
                                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                  title="Create a renewed invoice defaulting to the same stay length following current check-out"
                               >
                                  <RotateCw size={13} /> Renew Invoice
                               </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                               <div className="space-y-1">
                                  <span className="text-slate-400 font-bold">INVOICE SENT TIME</span>
                                  <div className="font-mono text-slate-700 font-medium">{formattedSentDate}</div>
                               </div>
                               <div className="space-y-1">
                                  <span className="text-slate-400 font-bold">PAYMENT DUE DATE</span>
                                  <div className="font-mono text-slate-700 font-bold">{formattedDueDate}</div>
                               </div>
                               <div className="space-y-1">
                                  <span className="text-slate-400 font-bold">BOOKING STATUS</span>
                                  <div className="font-bold capitalize">
                                     <span className={cn(
                                        "px-2 py-0.5 rounded text-[10px]",
                                        liveBooking.status === 'confirmed' ? "bg-emerald-100 text-emerald-800" :
                                        liveBooking.status === 'cancelled' ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                                     )}>
                                        {liveBooking.status}
                                     </span>
                                  </div>
                               </div>
                            </div>

                            {inv.stripePaymentUrl && (
                               <div className="pt-2 border-t border-slate-100 text-xs space-y-2">
                                  <div>
                                     <span className="text-slate-400 font-bold block mb-1">STRIPE CHECKOUT URL:</span>
                                     <div className="flex gap-2 items-center">
                                        <input 
                                           type="text" 
                                           readOnly 
                                           value={inv.stripePaymentUrl} 
                                           className="flex-1 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 font-mono text-xs select-all focus:outline-none"
                                        />
                                        <a 
                                           href={inv.stripePaymentUrl} 
                                           target="_blank" 
                                           rel="noopener noreferrer" 
                                           className="bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer text-xs font-sans inline-flex"
                                        >
                                           Open URL
                                        </a>
                                     </div>
                                  </div>
                               </div>
                            )}

                            {inv.stripeSessionId && (
                               <div className="text-xs space-y-1">
                                  <span className="text-slate-400 font-bold">STRIPE SESSION ID</span>
                                  <div className="font-mono text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 break-all select-all">
                                     {inv.stripeSessionId}
                                  </div>
                               </div>
                            )}
                         </div>

                         {/* Custom notes */}
                         {inv.customNotes && (
                            <div className="bg-indigo-50/40 border border-indigo-100/60 p-5 rounded-2xl">
                               <div className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-2">Administrator Special Custom Notes:</div>
                               <div className="text-xs text-slate-700 leading-relaxed italic whitespace-pre-wrap">{inv.customNotes}</div>
                            </div>
                         )}

                         {/* corporate disclaimer */}
                         <div className="text-center text-[10px] text-slate-400 pt-2 leading-relaxed">
                            <strong>Corporate Billing Management Invoicing Ledger Entity</strong> <br />
                            C.&S.H. Group Properties, LLC &bull; Atlanta, GA
                         </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 items-center">
                         <button 
                            type="button"
                            onClick={() => setViewingInvoiceBooking(null)} 
                            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm transition-all cursor-pointer"
                         >
                            Close Details
                         </button>
                         
                         {inv.stripeSessionId && !inv.paid && (
                            <button
                               type="button"
                               onClick={() => handleSyncStripeStatus(liveBooking.id)}
                               disabled={syncingInvoiceId === liveBooking.id}
                               className="text-sm font-bold text-slate-700 hover:text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-200 px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                               {syncingInvoiceId === liveBooking.id ? (
                                  <>
                                     <Loader2 size={14} className="animate-spin" /> Syncing...
                                  </>
                               ) : (
                                  <>
                                     <RefreshCw size={14} /> Sync Stripe Status
                                  </>
                               )}
                            </button>
                         )}

                         {!inv.paid && (
                            <button
                               type="button"
                               onClick={() => handleMarkInvoicePaidManual(liveBooking.id)}
                               className="text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-700 px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
                            >
                               <CheckCircle size={14} /> Mark Paid Manually
                            </button>
                         )}
                         
                         <button
                            type="button"
                            onClick={() => handleResendInvoice(liveBooking)}
                            disabled={sendingInvoiceId === liveBooking.id}
                            className="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-700 px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                         >
                            {sendingInvoiceId === liveBooking.id ? 'Sending...' : 'Resend Invoice Email'}
                         </button>

                         <button
                            type="button"
                            onClick={() => handleRenewInvoice(liveBooking)}
                            className="text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                         >
                            <RotateCw size={14} /> Renew Invoice
                         </button>
                      </div>
                   </div>
                </div>
             );
          })()}

          {resendingConfirmationBooking && (() => {
             const inv = resendingConfirmationBooking.invoiceDetails;
             if (!inv) return null;
             const guestName = resendingConfirmationBooking.guestName || inv.sponsorName || "Guest";
             return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                   <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
                      {/* Header */}
                      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                         <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center"><Mail size={16}/></span>
                            Resend Paid Confirmation
                         </h3>
                         <button 
                            onClick={() => setResendingConfirmationBooking(null)} 
                            className="text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 hover:border-slate-300 p-1.5 rounded-full cursor-pointer flex items-center justify-center"
                            title="Close modal"
                         >
                            <XCircle size={16} />
                         </button>
                      </div>

                      {/* Content */}
                      <div className="p-6 space-y-4">
                         <p className="text-xs text-slate-500">
                            Choose who should receive the invoice paid confirmation notification for Invoice <strong className="text-slate-700">#{inv.invoiceNumber || "Manual"}</strong> (Guest: {guestName}).
                         </p>

                         <div className="space-y-3">
                            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all">
                               <input 
                                  type="checkbox" 
                                  checked={resendNotifyAdmins} 
                                  onChange={(e) => setResendNotifyAdmins(e.target.checked)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                               />
                               <div className="text-xs">
                                  <span className="font-bold text-slate-800 block">Notify Enabled Admins</span>
                                  <span className="text-slate-500">Send confirmation alert (email/SMS) to all active property managers in the system.</span>
                               </div>
                            </label>

                            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-all">
                               <input 
                                  type="checkbox" 
                                  checked={resendNotifyGuest} 
                                  onChange={(e) => setResendNotifyGuest(e.target.checked)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                               />
                               <div className="text-xs">
                                  <span className="font-bold text-slate-800 block">Notify Guest / Sponsor</span>
                                  <span className="text-slate-500">Send confirmation email to guest/sponsor, and SMS if opted-in.</span>
                               </div>
                            </label>
                         </div>
                      </div>

                      {/* Footer */}
                      <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 items-center">
                         <button 
                            type="button"
                            onClick={() => setResendingConfirmationBooking(null)} 
                            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                         >
                            Cancel
                         </button>
                         <button 
                            type="button"
                            disabled={isResendingConfirmation || (!resendNotifyAdmins && !resendNotifyGuest)}
                            onClick={handleResendPaidConfirmation}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white px-5 py-2 rounded-xl font-bold flex items-center gap-2 text-xs transition-colors shadow-md shadow-indigo-100 cursor-pointer"
                         >
                            {isResendingConfirmation ? (
                               <>
                                  <Loader2 className="animate-spin" size={14}/> Resending...
                               </>
                            ) : (
                               <>
                                  <Mail size={14}/> Send Notification(s)
                               </>
                            )}
                         </button>
                      </div>
                   </div>
                </div>
             );
          })()}

          {/* Cancel Invoice & Booking Modal */}
          {cancellingInvoiceBooking && (() => {
             const b = cancellingInvoiceBooking;
             const inv = b.invoiceDetails || {};
             const policy = getInvoiceCancellationPolicyInfo(b);
             const prop = properties.find(p => p.id === b.propertyId);
             const propName = prop?.name || 'REALCal Luxury Lodging';
             const invoiceNo = inv.invoiceNumber || b.bookingRef || 'Manual';
             const activeManagers = propertyManagers.filter(m => m.enabled);

             return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                   <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
                      {/* Header */}
                      <div className="px-6 py-5 border-b border-rose-100 flex justify-between items-center bg-rose-50/70">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                               <AlertTriangle size={20} />
                            </div>
                            <div>
                               <h3 className="text-lg font-bold text-rose-950 flex items-center gap-2">
                                  Cancel Invoice #{invoiceNo}
                               </h3>
                               <p className="text-xs text-rose-700 font-medium">
                                  {propName} &bull; Guest: <span className="font-bold">{b.guestName || 'N/A'}</span>
                               </p>
                            </div>
                         </div>
                         <button 
                            onClick={() => setCancellingInvoiceBooking(null)} 
                            className="text-slate-400 hover:text-slate-600 transition-colors bg-white border border-slate-200 hover:border-slate-300 p-2 rounded-full cursor-pointer flex items-center justify-center"
                            title="Close modal"
                         >
                            <X size={18} />
                         </button>
                      </div>

                      {/* Modal Body */}
                      <div className="p-6 overflow-y-auto space-y-5 text-sm">
                         {/* Booking & Invoice Overview Summary */}
                         <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs">
                            <div>
                               <span className="text-slate-400 block font-bold uppercase text-[10px]">Stay Dates</span>
                               <span className="font-semibold text-slate-800">{b.checkIn} &rarr; {b.checkOut}</span>
                            </div>
                            <div>
                               <span className="text-slate-400 block font-bold uppercase text-[10px]">Invoice Total</span>
                               <span className="font-bold text-indigo-700">${(inv.amount || 0).toFixed(2)}</span>
                            </div>
                            <div>
                               <span className="text-slate-400 block font-bold uppercase text-[10px]">Sponsor</span>
                               <span className="font-semibold text-slate-800 truncate block">{inv.sponsorName || b.guestName || 'N/A'}</span>
                            </div>
                         </div>

                         {/* Policy & Fee Calculation Card */}
                         <div className="bg-amber-50/80 border border-amber-200/80 p-4 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                               <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                                  <Clock size={14} className="text-amber-600" /> Cancellation Policy Status
                               </span>
                               <span className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                  policy.isFreeCancellation ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                               )}>
                                  {policy.isFreeCancellation ? "Free Cancel Window Active" : "Outside Free Cancel Window"}
                               </span>
                            </div>
                            <p className="text-xs text-amber-900/80 leading-relaxed">
                               {policy.policyDescription}
                            </p>
                            <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-4">
                               <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                  Assessed Cancellation Fee ($):
                               </label>
                               <div className="relative w-36">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                  <input 
                                     type="number" 
                                     min="0"
                                     step="0.01"
                                     value={invoiceCancelFee} 
                                     onChange={(e) => setInvoiceCancelFee(parseFloat(e.target.value) || 0)} 
                                     className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold text-sm text-right focus:outline-none focus:ring-2 focus:ring-rose-500"
                                  />
                               </div>
                            </div>
                         </div>

                         {/* Mandatory Cancellation Note */}
                         <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1">
                               Reason / Cancellation Note <span className="text-rose-500">*</span>
                            </label>
                            <textarea 
                               rows={3}
                               value={invoiceCancelNote}
                               onChange={(e) => setInvoiceCancelNote(e.target.value)}
                               placeholder="Specify the reason for cancelling this invoice (e.g., Requested by sponsor, billing error, event postponed). This note will be included in all cancellation alerts..."
                               className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                            />
                         </div>

                         {/* Multi-Party Broadcast Section */}
                         <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                            <span className="text-xs font-bold text-slate-900 uppercase tracking-wide block">
                               Cancellation Notifications Broadcast (Email & SMS Alerts)
                            </span>

                            <div className="space-y-2 text-xs">
                               {/* Sponsor Alert Option */}
                               <label className="flex items-start gap-2.5 p-2.5 rounded-xl border bg-white border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
                                  <input 
                                     type="checkbox"
                                     checked={invoiceCancelNotifySponsor}
                                     onChange={(e) => setInvoiceCancelNotifySponsor(e.target.checked)}
                                     className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                                  />
                                  <div className="flex-1">
                                     <div className="font-bold text-slate-800 flex items-center justify-between">
                                        <span>Notify Sponsor</span>
                                        <span className="text-[10px] text-slate-400 font-normal">Email & SMS</span>
                                     </div>
                                     <div className="text-[11px] text-slate-500">
                                        {inv.sponsorEmail || 'No Email'} &bull; {inv.sponsorPhone || b.sponsorPhone || 'No Phone'}
                                     </div>
                                  </div>
                               </label>

                               {/* Guest Alert Option */}
                               <label className="flex items-start gap-2.5 p-2.5 rounded-xl border bg-white border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
                                  <input 
                                     type="checkbox"
                                     checked={invoiceCancelNotifyGuest}
                                     onChange={(e) => setInvoiceCancelNotifyGuest(e.target.checked)}
                                     className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                                  />
                                  <div className="flex-1">
                                     <div className="font-bold text-slate-800 flex items-center justify-between">
                                        <span>Notify Guest</span>
                                        <span className="text-[10px] text-slate-400 font-normal">Email & SMS</span>
                                     </div>
                                     <div className="text-[11px] text-slate-500">
                                        {b.guestEmail || 'No Email'} &bull; {b.guestPhone || 'No Phone'}
                                     </div>
                                  </div>
                               </label>

                               {/* Property Managers Option */}
                               <label className="flex items-start gap-2.5 p-2.5 rounded-xl border bg-white border-slate-200 hover:border-slate-300 cursor-pointer transition-all">
                                  <input 
                                     type="checkbox"
                                     checked={invoiceCancelNotifyManagers}
                                     onChange={(e) => setInvoiceCancelNotifyManagers(e.target.checked)}
                                     className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                                  />
                                  <div className="flex-1">
                                     <div className="font-bold text-slate-800 flex items-center justify-between">
                                        <span>Notify Property Management Contacts ({activeManagers.length})</span>
                                        <span className="text-[10px] text-slate-400 font-normal">Email & SMS</span>
                                     </div>
                                     <div className="text-[11px] text-slate-500">
                                        {activeManagers.length > 0 
                                           ? activeManagers.map(m => `${m.name} (${m.email || 'No email'}, ${m.phone || 'No phone'})`).join(', ')
                                           : 'No active property managers configured'}
                                     </div>
                                  </div>
                               </label>
                            </div>
                         </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                         <button 
                            type="button"
                            onClick={() => setCancellingInvoiceBooking(null)} 
                            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-white text-slate-700 font-bold text-xs transition-all cursor-pointer"
                         >
                            Keep Invoice Active
                         </button>
                         <button 
                            type="button"
                            disabled={cancellingInvoiceLoading}
                            onClick={handleExecuteCancelInvoice} 
                            className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-100 cursor-pointer"
                         >
                            {cancellingInvoiceLoading ? (
                               <>
                                  <Loader2 className="animate-spin" size={14}/> Cancelling & Sending Alerts...
                               </>
                            ) : (
                               <>
                                  <XCircle size={14}/> Confirm Invoice Cancellation & Alert All Parties
                               </>
                            )}
                         </button>
                      </div>
                   </div>
                </div>
             );
          })()}

          {/* Modal for Duplicate Previous Invoice */}
          {showDuplicateInvoiceModal && (
             <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
                   {/* Modal Header */}
                   <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <Copy size={20} />
                         </div>
                         <div>
                            <h3 className="text-lg font-bold text-slate-900">Duplicate Previous Invoice</h3>
                            <p className="text-xs text-slate-500">Select a past booking or invoice to copy details into the Create Manual Booking form.</p>
                         </div>
                      </div>
                      <button 
                         onClick={() => setShowDuplicateInvoiceModal(false)}
                         className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                      >
                         <X size={20} />
                      </button>
                   </div>

                   {/* Search Bar */}
                   <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-3">
                      <Search size={18} className="text-slate-400" />
                      <input 
                         type="text"
                         value={duplicateSearchTerm}
                         onChange={e => setDuplicateSearchTerm(e.target.value)}
                         placeholder="Search by Guest Name, Email, Invoice #, or Property..."
                         className="w-full text-sm outline-none bg-transparent placeholder:text-slate-400"
                      />
                      {duplicateSearchTerm && (
                         <button 
                            onClick={() => setDuplicateSearchTerm('')}
                            className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1 rounded bg-slate-100"
                         >
                            Clear
                         </button>
                      )}
                   </div>

                   {/* Invoices / Bookings List */}
                   <div className="p-6 overflow-y-auto space-y-3 flex-1">
                      {(() => {
                         const items = bookings.filter(b => {
                            if (!duplicateSearchTerm.trim()) return true;
                            const term = duplicateSearchTerm.toLowerCase();
                            const inv = b.invoiceDetails || {};
                            const gName = (b.guestName || inv.sponsorName || '').toLowerCase();
                            const gEmail = (b.guestEmail || inv.sponsorEmail || '').toLowerCase();
                            const invNum = (inv.invoiceNumber || b.bookingRef || b.id || '').toLowerCase();
                            const propName = (properties.find(p => p.id === b.propertyId)?.name || '').toLowerCase();
                            return gName.includes(term) || gEmail.includes(term) || invNum.includes(term) || propName.includes(term);
                         });

                         if (items.length === 0) {
                            return (
                               <div className="text-center py-12 text-slate-400">
                                  <FileText size={40} className="mx-auto mb-2 opacity-40" />
                                  <p className="text-sm font-medium">No previous invoices or bookings found.</p>
                               </div>
                            );
                         }

                         return items.map(b => {
                            const inv = b.invoiceDetails || {};
                            const prop = properties.find(p => p.id === b.propertyId);
                            const invoiceNo = inv.invoiceNumber || b.bookingRef || b.id;
                            const name = b.guestName || inv.sponsorName || 'Unnamed Guest';
                            const email = b.guestEmail || inv.sponsorEmail || 'No email';
                            const price = inv.baseAmount !== undefined ? inv.baseAmount : (b.totalPrice || 0) / 100;

                            return (
                               <div 
                                  key={b.id} 
                                  className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                               >
                                  <div className="space-y-1">
                                     <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                                           #{invoiceNo}
                                        </span>
                                        <span className="font-bold text-slate-800 text-sm">{name}</span>
                                        {inv.paid ? (
                                           <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Paid</span>
                                        ) : inv.invoiceNumber ? (
                                           <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Invoice Sent</span>
                                        ) : (
                                           <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Booking</span>
                                        )}
                                     </div>
                                     <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span>📧 {email}</span>
                                        {prop && <span>📍 {prop.name}</span>}
                                        {b.checkIn && <span>📅 {b.checkIn} - {b.checkOut}</span>}
                                     </div>
                                     <div className="text-xs font-semibold text-slate-700">
                                        Base Amount: <span className="font-mono font-bold text-slate-900">${Number(price).toFixed(2)}</span>
                                        {inv.daysLate ? <span className="ml-2 text-amber-600 font-normal">({inv.daysLate} days late fee applied)</span> : null}
                                     </div>
                                  </div>

                                  <button
                                     type="button"
                                     onClick={() => handleDuplicateInvoiceSelect(b)}
                                     className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow flex items-center gap-2 cursor-pointer"
                                  >
                                     <Copy size={14} /> Duplicate This
                                  </button>
                               </div>
                            );
                         });
                      })()}
                   </div>

                   {/* Footer */}
                   <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                      <button
                         type="button"
                         onClick={() => setShowDuplicateInvoiceModal(false)}
                         className="px-5 py-2 rounded-xl border border-slate-200 hover:bg-white text-slate-700 font-bold text-xs transition-all cursor-pointer"
                      >
                         Close
                      </button>
                   </div>
                </div>
             </div>
          )}

       </div>
    </div>
  )
}
