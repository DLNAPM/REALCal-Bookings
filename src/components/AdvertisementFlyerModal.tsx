import React, { useState, useRef } from 'react';
import { Property, PricingRule, PropertyManager } from '../types';
import { 
  X, Printer, Download, Send, Mail, Phone, MapPin, Music, Star, 
  Sparkles, CheckCircle, BedDouble, Wifi, ShieldCheck, Coffee, Car, 
  Copy, Check, Eye, Edit3, Share2, Tag, Calendar, AlertCircle, Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';

interface AdvertisementFlyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  properties: Property[];
  pricingRules: PricingRule[];
  propertyManagers: PropertyManager[];
  activePropertyId?: string | null;
}

interface RoomOption {
  id: string;
  name: string;
  type: string;
  bedType: string;
  sqFt: number;
  rate: number;
  photoUrl: string;
  features: string[];
}

interface SurveyReview {
  id: string;
  author: string;
  role: string;
  venueMentioned: string;
  rating: number;
  date: string;
  comment: string;
  verifiedBooking: boolean;
}

const DEFAULT_SURVEYS: SurveyReview[] = [
  {
    id: 's-1',
    author: 'Marcus Thorne',
    role: 'Tour Music Director & Keyboardist',
    venueMentioned: 'St. James Live Weekend Residency',
    rating: 5,
    date: 'August 2026',
    comment: 'We performed a 3-night sold-out residency at St. James Live, and Stonewall Villa was an absolute game-changer. Incredibly quiet, immaculate suites, super fast WiFi to review setlists, and only 8 minutes to soundcheck. We got the best rest of our entire tour!',
    verifiedBooking: true
  },
  {
    id: 's-2',
    author: 'Alicia Rhodes',
    role: 'Lead Vocalist & Tour Production',
    venueMentioned: 'Wolf Creek Amphitheater Concert Series',
    rating: 5,
    date: 'July 2026',
    comment: 'Headlining at Wolf Creek Amphitheater was huge for our ensemble, and staying at Stonewall Villa made travel logistics effortless. Private smart lock entry for each bedroom, plush beds, full kitchen for post-show dining, and secure parking for our tour sprinter van. 10/10 hospitality!',
    verifiedBooking: true
  },
  {
    id: 's-3',
    author: 'Devon Kendrick',
    role: 'Live Sound Engineer & Tour Coordinator',
    venueMentioned: 'Atlanta Live Music Circuit',
    rating: 5,
    date: 'June 2026',
    comment: 'Far superior to noisy hotel hallways. The private suites gave each artist their own acoustic space to unwind and rehearse. Keyless digital locks were seamless. We will book Stonewall Villa every time we route through Atlanta.',
    verifiedBooking: true
  }
];

const PRESET_VENUES = [
  {
    name: 'St. James Live',
    type: 'Premier Jazz & R&B Live Performance Lounge',
    distance: '4.5 miles (8 mins)',
    email: 'booking@stjamesliveatl.com'
  },
  {
    name: 'Wolf Creek Amphitheater',
    type: 'Premier Outdoor Amphitheater & Concert Venue',
    distance: '6.2 miles (10 mins)',
    email: 'events@wolfcreekamphitheater.com'
  },
  {
    name: 'City Winery Atlanta',
    type: 'Intimate Concert Hall & Winery',
    distance: '16 miles (22 mins)',
    email: 'atlantaevents@citywinery.com'
  },
  {
    name: 'The Eastern / Variety Playhouse',
    type: 'Major Tour & Live Performance Stages',
    distance: '18 miles (24 mins)',
    email: 'talent@theeasternatl.com'
  }
];

export const AdvertisementFlyerModal: React.FC<AdvertisementFlyerModalProps> = ({
  isOpen,
  onClose,
  properties,
  pricingRules,
  propertyManagers,
  activePropertyId
}) => {
  if (!isOpen) return null;

  // Selected Property (Default to Stonewall Villa if found, or active property)
  const initialProp = properties.find(p => p.name.toLowerCase().includes('stonewall') || p.id === activePropertyId) || properties[0];
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(initialProp?.id || '');
  const selectedProperty = properties.find(p => p.id === selectedPropertyId) || initialProp;

  // Tabs: 'preview' (Live 1-Pager Preview & Print), 'customize' (Edit details & rates), 'email' (Send to Venues)
  const [activeTab, setActiveTab] = useState<'preview' | 'customize' | 'email'>('preview');

  // Customization States
  const [flyerHeadline, setFlyerHeadline] = useState<string>('Exclusive Artist & Tour Lodging | Atlanta, GA');
  const [flyerSubheadline, setFlyerSubheadline] = useState<string>(
    'Luxury, Quiet & Private Accommodations for Performing Artists & Touring Ensembles Minutes from St. James Live & Wolf Creek Amphitheater'
  );
  const [selectedVenues, setSelectedVenues] = useState<string[]>(['St. James Live', 'Wolf Creek Amphitheater']);
  const [customVenueNote, setCustomVenueNote] = useState<string>(
    'Special preferred tour rates & flexible check-in schedules available for artists performing at local Atlanta music venues.'
  );
  const [promoCode, setPromoCode] = useState<string>('VIPARTIST15');
  const [discountDesc, setDiscountDesc] = useState<string>('15% Exclusive Discount for Venue Artists & Touring Staff');
  const [contactPhone, setContactPhone] = useState<string>('(404) 555-0199');
  const [contactEmail, setContactEmail] = useState<string>(
    propertyManagers.find(pm => pm.enabled)?.email || 'reach_dlaniger@hotmail.com'
  );
  const [bookingWebsite, setBookingWebsite] = useState<string>(window.location.origin);

  // Custom Room Configurations
  const [roomRates, setRoomRates] = useState<RoomOption[]>([
    {
      id: 'room-1',
      name: 'Master VIP Artist Suite',
      type: 'Master Bedroom',
      bedType: 'King Bed with Luxury Pillowtop',
      sqFt: 380,
      rate: 185,
      photoUrl: selectedProperty?.images?.[0] ? (typeof selectedProperty.images[0] === 'string' ? selectedProperty.images[0] : selectedProperty.images[0].url) : 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&q=80&w=1000',
      features: ['Private Ensuite Spa Bath', 'Individual Smart Lock Code', 'Acoustic Sound Isolation', 'Executive Workstation']
    },
    {
      id: 'room-2',
      name: 'Deluxe Headliner Suite (Room 2)',
      type: 'Guest Bedroom',
      bedType: 'Queen Plush Bed',
      sqFt: 260,
      rate: 145,
      photoUrl: selectedProperty?.images?.[1] ? (typeof selectedProperty.images[1] === 'string' ? selectedProperty.images[1] : selectedProperty.images[1].url) : 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&q=80&w=1000',
      features: ['Private Smart Lock Entry', '4K Smart TV with Streaming', 'Plush Linens', 'Quiet Garden View']
    },
    {
      id: 'room-3',
      name: 'Tour Rest Suite (Room 3)',
      type: 'Guest Bedroom',
      bedType: 'Queen Bed with Ergonomic Workspace',
      sqFt: 240,
      rate: 135,
      photoUrl: selectedProperty?.images?.[2] ? (typeof selectedProperty.images[2] === 'string' ? selectedProperty.images[2] : selectedProperty.images[2].url) : 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=1000',
      features: ['Individual Keycode', 'High-Speed Charging Hub', 'Blackout Window Curtains', 'Ultra-Quiet Rest Zone']
    },
    {
      id: 'room-4',
      name: 'Full Villa Band & Crew Buyout',
      type: 'Entire Estate Rental',
      bedType: 'All Suites + Living + Kitchen + Private Grounds',
      sqFt: 2800,
      rate: 495,
      photoUrl: selectedProperty?.images?.[3] ? (typeof selectedProperty.images[3] === 'string' ? selectedProperty.images[3] : selectedProperty.images[3].url) : 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1000',
      features: ['Full Private Estate Access', 'Tour Sprinter / SUV Parking', 'Gourmet Chef Kitchen', 'Rehearsal / Living Lounge']
    }
  ]);

  // Selected Surveys to display
  const [surveys, setSurveys] = useState<SurveyReview[]>(DEFAULT_SURVEYS);
  const [selectedSurveyIds, setSelectedSurveyIds] = useState<string[]>(['s-1', 's-2']);

  // Email form state
  const [recipientEmail, setRecipientEmail] = useState<string>('booking@stjamesliveatl.com');
  const [recipientName, setRecipientName] = useState<string>('St. James Live Talent Booking Team');
  const [selectedTargetVenue, setSelectedTargetVenue] = useState<string>('St. James Live');
  const [emailSubject, setEmailSubject] = useState<string>(
    'Exclusive Lodging for Performing Artists near St. James Live | Stonewall Villa'
  );
  const [emailCoverNote, setEmailCoverNote] = useState<string>(
    `Hello Talent Booking & Production Team,\n\nWe are reaching out from Stonewall Villa, a luxury, quiet, keyless lodging estate located just 8 minutes from St. James Live and 10 minutes from Wolf Creek Amphitheater.\n\nWe provide private executive suites and full villa buyouts tailored specifically for touring musical artists, headliners, and production crews performing in the Atlanta area. Each bedroom features private YAMIRY smart lock codes, acoustic calm, gourmet kitchen access, and secure tour vehicle parking.\n\nPlease find our 1-Pager digital advertisement attached below with special 15% preferred rates (Promo Code: ${promoCode}). We would love to partner with your venue to accommodate your upcoming talent!`
  );
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);
  const [copiedPitch, setCopiedPitch] = useState<boolean>(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Trigger browser print
  const handlePrint = () => {
    window.print();
  };

  // Trigger HTML download
  const handleDownloadHtml = () => {
    const propertyName = selectedProperty?.name || 'Stonewall Villa';
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${propertyName} - Professional Artist & Tour Lodging 1-Pager</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; line-height: 1.5; }
    .container { max-width: 900px; margin: 0 auto; background: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); overflow: hidden; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #ffffff; padding: 36px 40px; }
    .badge { display: inline-block; background: #4f46e5; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 12px; border-radius: 9999px; margin-bottom: 12px; }
    .title { font-size: 28px; font-weight: 800; margin: 0 0 8px 0; color: #ffffff; letter-spacing: -0.02em; }
    .subtitle { font-size: 15px; color: #cbd5e1; margin: 0; max-width: 700px; }
    .venues-banner { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; padding: 16px 40px; display: flex; flex-wrap: wrap; gap: 20px; align-items: center; }
    .venue-pill { background: #ffffff; border: 1px solid #cbd5e1; padding: 6px 14px; border-radius: 12px; font-size: 13px; font-weight: 700; color: #1e1b4b; }
    .content { padding: 32px 40px; }
    .section-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 24px 0 16px 0; display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; }
    .rooms-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .room-card { border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #ffffff; }
    .room-img { width: 100%; height: 160px; object-fit: cover; background: #e2e8f0; }
    .room-body { padding: 16px; }
    .room-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0; }
    .room-rate { font-size: 18px; font-weight: 800; color: #4f46e5; margin-bottom: 8px; }
    .room-features { font-size: 12px; color: #64748b; padding-left: 18px; margin: 0; }
    .reviews-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .review-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
    .review-stars { color: #f59e0b; margin-bottom: 6px; font-size: 14px; }
    .review-text { font-size: 13px; color: #334155; font-style: italic; margin: 0 0 10px 0; }
    .review-author { font-size: 12px; font-weight: 700; color: #0f172a; }
    .review-role { font-size: 11px; color: #64748b; }
    .amenities-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; }
    .amenity-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; font-size: 12px; font-weight: 600; color: #1e293b; }
    .footer { background: #0f172a; color: #ffffff; padding: 28px 40px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; }
    .promo-box { background: rgba(79, 70, 229, 0.2); border: 1px solid #6366f1; padding: 8px 16px; border-radius: 12px; }
    .btn { background: #4f46e5; color: #ffffff; padding: 10px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block; }
    @media print {
      body { padding: 0; background: #ffffff; }
      .container { box-shadow: none; border: none; max-width: 100%; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Exclusive Artist & Touring Lodging</div>
      <h1 class="title">${propertyName} | Atlanta, GA</h1>
      <p class="subtitle">${flyerSubheadline}</p>
    </div>

    <div class="venues-banner">
      <div style="font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase;">Proximity to Venues:</div>
      ${PRESET_VENUES.map(v => `<div class="venue-pill">📍 ${v.name} (${v.distance})</div>`).join('')}
    </div>

    <div class="content">
      <div class="section-title">✨ Premier Room Types & Nightly Rates</div>
      <div class="rooms-grid">
        ${roomRates.map(r => `
          <div class="room-card">
            <img class="room-img" src="${r.photoUrl}" alt="${r.name}" />
            <div class="room-body">
              <div class="room-title">${r.name}</div>
              <div class="room-rate">$${r.rate} / night <span style="font-size: 12px; font-weight: 500; color: #64748b;">(${r.bedType})</span></div>
              <ul class="room-features">
                ${r.features.map(f => `<li>${f}</li>`).join('')}
              </ul>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-title">⭐️ Verified Survey Feedback from Past Touring Guests</div>
      <div class="reviews-grid">
        ${surveys.filter(s => selectedSurveyIds.includes(s.id)).map(s => `
          <div class="review-card">
            <div class="review-stars">★★★★★</div>
            <p class="review-text">"${s.comment}"</p>
            <div class="review-author">${s.author}</div>
            <div class="review-role">${s.role} &bull; ${s.venueMentioned}</div>
          </div>
        `).join('')}
      </div>

      <div class="section-title">🎸 Key Amenities for Touring Artists & Production Crews</div>
      <div class="amenities-list">
        <div class="amenity-item">🔐 YAMIRY Keyless Smart Lock System</div>
        <div class="amenity-item">🚐 Secure Tour Sprinter / SUV Parking</div>
        <div class="amenity-item">📶 Ultra High-Speed Gigabit WiFi</div>
        <div class="amenity-item">🍳 Full Gourmet Chef Kitchen</div>
        <div class="amenity-item">☕ 24/7 Espresso & Coffee Bar</div>
        <div class="amenity-item">🕒 Flexible Late Performance Check-In</div>
      </div>
    </div>

    <div class="footer">
      <div>
        <div style="font-size: 16px; font-weight: 800;">Book Directly with Management</div>
        <div style="font-size: 13px; color: #94a3b8; margin-top: 4px;">Phone: ${contactPhone} &bull; Email: ${contactEmail}</div>
        <div style="margin-top: 8px;" class="promo-box">Use Promo Code: <strong style="color: #a5b4fc;">${promoCode}</strong> (${discountDesc})</div>
      </div>
      <div>
        <a href="${bookingWebsite}" class="btn">Reserve Suites Online</a>
      </div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${propertyName.replace(/\s+/g, '_')}_Artist_Lodging_Advertisement.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Send Email to Venue
  const handleSendAdvertisementEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail) {
      setEmailErrorMsg("Please enter a valid venue or recipient email address.");
      return;
    }

    setIsSendingEmail(true);
    setEmailSuccessMsg(null);
    setEmailErrorMsg(null);

    const propertyName = selectedProperty?.name || 'Stonewall Villa';

    // Build rich HTML email payload
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 24px; color: #0f172a;">
        <div style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: #ffffff; padding: 32px 30px; text-align: left;">
            <span style="background: #4f46e5; color: #ffffff; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 20px;">Exclusive Artist Lodging</span>
            <h1 style="margin: 12px 0 6px 0; font-size: 24px; color: #ffffff;">${propertyName} | Atlanta, GA</h1>
            <p style="margin: 0; color: #cbd5e1; font-size: 14px;">Minutes to St. James Live & Wolf Creek Amphitheater</p>
          </div>

          <!-- Cover message -->
          <div style="padding: 24px 30px; border-bottom: 1px solid #f1f5f9; background: #ffffff;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-line; margin: 0;">${emailCoverNote}</p>
          </div>

          <!-- Venue Proximity -->
          <div style="background: #f8fafc; padding: 16px 30px; border-bottom: 1px solid #e2e8f0;">
            <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">Proximity to Atlanta Music Venues:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <span style="background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: bold; color: #1e1b4b;">📍 St. James Live (8 mins / 4.5 mi)</span>
              <span style="background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: bold; color: #1e1b4b;">📍 Wolf Creek Amphitheater (10 mins / 6.2 mi)</span>
              <span style="background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: bold; color: #1e1b4b;">✈️ ATL Airport (15 mins)</span>
            </div>
          </div>

          <!-- Room Types & Rates -->
          <div style="padding: 24px 30px;">
            <h2 style="font-size: 16px; font-weight: bold; color: #0f172a; margin: 0 0 16px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">✨ Available Room Types & Tour Rates</h2>
            <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
              ${roomRates.map(r => `
                <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; background: #ffffff;">
                  <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <strong style="font-size: 15px; color: #0f172a;">${r.name}</strong>
                    <span style="font-size: 16px; font-weight: bold; color: #4f46e5;">$${r.rate}/nt</span>
                  </div>
                  <div style="font-size: 12px; color: #64748b; margin: 4px 0 8px 0;">${r.bedType} &bull; ${r.sqFt} sq ft</div>
                  <div style="font-size: 12px; color: #475569;">${r.features.join(' &bull; ')}</div>
                </div>
              `).join('')}
            </div>

            <!-- Survey Quote -->
            <div style="margin-top: 24px; background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; border-radius: 0 12px 12px 0;">
              <div style="color: #f59e0b; font-size: 14px; margin-bottom: 4px;">★★★★★ Verified Artist Survey Feedback</div>
              <p style="font-size: 13px; font-style: italic; color: #334155; margin: 0 0 8px 0;">"${surveys[0]?.comment || 'Stonewall Villa was an absolute blessing. Quiet, pristine, and literally 8 minutes to soundcheck!'}"</p>
              <div style="font-size: 12px; font-weight: bold; color: #0f172a;">— ${surveys[0]?.author || 'Marcus T.'}, ${surveys[0]?.role || 'Tour Music Director'} (${surveys[0]?.venueMentioned || 'St. James Live Residency'})</div>
            </div>

            <!-- Promo Box & CTA -->
            <div style="margin-top: 24px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 18px; text-align: center;">
              <div style="font-size: 12px; font-weight: bold; text-transform: uppercase; color: #4338ca;">Preferred Venue & Artist Discount</div>
              <div style="font-size: 20px; font-weight: bold; color: #312e81; margin: 4px 0;">Promo Code: ${promoCode}</div>
              <div style="font-size: 13px; color: #4338ca; margin-bottom: 16px;">${discountDesc}</div>
              <a href="${bookingWebsite}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 28px; border-radius: 10px;">View Villa & Book Online</a>
            </div>

            <!-- Contact Details -->
            <div style="margin-top: 24px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 16px;">
              Direct Artist Booking Concierge: <strong>${contactPhone}</strong> &bull; <strong>${contactEmail}</strong><br/>
              <span style="font-size: 11px; color: #94a3b8;">${propertyName} &bull; Managed by REALCal Bookings</span>
            </div>

          </div>
        </div>
      </div>
    `;

    try {
      const resp = await fetch('/api/send-advertisement-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          recipientName: recipientName,
          venueName: selectedTargetVenue,
          propertyName: propertyName,
          subject: emailSubject,
          text: `${emailCoverNote}\n\nView Villa & Book: ${bookingWebsite}\nPhone: ${contactPhone}\nEmail: ${contactEmail}`,
          html: emailHtml
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Failed to send advertisement email.");
      }

      setEmailSuccessMsg(`Advertisement flyer successfully emailed to ${recipientEmail}!`);
    } catch (err: any) {
      console.error("Error sending promo email:", err);
      setEmailErrorMsg(err.message || "Could not deliver email. Please ensure SMTP configuration is active.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCopyPitch = () => {
    const propertyName = selectedProperty?.name || 'Stonewall Villa';
    const pitchText = `🌟 Exclusive Artist & Touring Lodging near St. James Live & Wolf Creek Amphitheater | ${propertyName}

Hey ${recipientName || 'Team'},

Planning upcoming artist residencies or concert tour stops in the Atlanta area?

Stonewall Villa provides private luxury bedroom suites and full estate buyouts specifically suited for performing artists, touring bands, and production crews:
• 📍 8 mins to St. James Live & 10 mins to Wolf Creek Amphitheater
• 🔐 Keyless private YAMIRY smart lock entry for each bedroom
• 🚐 Secure parking for tour sprinter vans, SUVs & gear
• 📶 Gigabit high-speed WiFi for setlist & stem uploads
• 🍳 Full chef's gourmet kitchen & 24/7 espresso bar
• ⭐ 5-Star verified reviews from touring music directors & vocalists

🎁 Preferred Venue Promo Code: ${promoCode} (${discountDesc})
🔗 Reserve or View Gallery: ${bookingWebsite}
📞 VIP Booking Concierge: ${contactPhone} | ${contactEmail}
`;

    navigator.clipboard.writeText(pitchText);
    setCopiedPitch(true);
    setTimeout(() => setCopiedPitch(false), 2500);
  };

  const propertyName = selectedProperty?.name || 'Stonewall Villa';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-left animate-in zoom-in-95 duration-200 print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Header (Hidden on Print) */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 text-white flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Professional Digital 1-Pager Advertisement</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full">
                  Artist & Venue Promo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Promote {propertyName} to Performing Artists & Night-Life Venues (St. James Live & Wolf Creek Amphitheater)
              </p>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-slate-800 p-1 rounded-xl flex items-center border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                  activeTab === 'preview' ? "bg-indigo-600 text-white shadow" : "text-slate-300 hover:text-white"
                )}
              >
                <Eye size={14} /> 1-Pager View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('customize')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                  activeTab === 'customize' ? "bg-indigo-600 text-white shadow" : "text-slate-300 hover:text-white"
                )}
              >
                <Edit3 size={14} /> Customize Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('email')}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                  activeTab === 'email' ? "bg-indigo-600 text-white shadow" : "text-slate-300 hover:text-white"
                )}
              >
                <Mail size={14} /> Email to Venues
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              title="Print or Save as PDF"
            >
              <Printer size={15} /> Print / PDF
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-900/40"
              title="Download standalone HTML flyer"
            >
              <Download size={15} /> Download Flyer
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 print:p-0 print:bg-white">
          
          {/* TAB 1: LIVE 1-PAGER PREVIEW & PRINTABLE VIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold text-sm">
                    ✨
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-sm">High-Resolution Digital 1-Pager</span>
                    <p className="text-xs text-slate-500">
                      Ready to be downloaded, printed on Letter/A4, or emailed to concert venues and talent managers.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPitch}
                    className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPitch ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copiedPitch ? 'Copied Pitch!' : 'Copy Pitch Text'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-1.5 rounded-lg border border-indigo-200 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Printer size={14} /> Print / Save PDF
                  </button>
                </div>
              </div>

              {/* The Actual 1-Pager Presentation Canvas */}
              <div 
                ref={printAreaRef} 
                className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden max-w-4xl mx-auto print:max-w-none print:shadow-none print:border-none print:rounded-none"
              >
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-8 sm:p-10 relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                      <Music size={13} className="text-indigo-400" /> Premier Artist & Touring Lodging
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      {propertyName} <span className="text-indigo-400 font-light">| Atlanta, GA</span>
                    </h1>
                    <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl font-medium leading-relaxed">
                      {flyerSubheadline}
                    </p>
                  </div>
                </div>

                {/* Proximity Strip */}
                <div className="bg-slate-50 border-b border-slate-200 px-6 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <MapPin size={14} className="text-indigo-600" /> Prime Atlanta Venue Proximity:
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-white border border-indigo-100 text-indigo-900 font-bold px-3 py-1 rounded-xl shadow-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      St. James Live (~8 mins / 4.5 mi)
                    </span>
                    <span className="bg-white border border-indigo-100 text-indigo-900 font-bold px-3 py-1 rounded-xl shadow-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Wolf Creek Amphitheater (~10 mins / 6.2 mi)
                    </span>
                    <span className="bg-white border border-slate-200 text-slate-700 font-bold px-3 py-1 rounded-xl shadow-xs">
                      ✈️ ATL Airport (~15 mins)
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-6 sm:p-8 space-y-8">
                  
                  {/* Section 1: Room Types & Photos & Rates */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2.5">
                      <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        <BedDouble className="text-indigo-600" size={20} />
                        Luxury Room Types, Photo Gallery & Rates
                      </h2>
                      <span className="text-xs text-slate-500 font-semibold">Individual Rooms or Full Villa Buyout</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {roomRates.map((room) => (
                        <div 
                          key={room.id}
                          className="bg-slate-50/70 border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                        >
                          <div className="relative h-44 bg-slate-200 overflow-hidden">
                            <img 
                              src={room.photoUrl} 
                              alt={room.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-lg">
                              {room.type}
                            </div>
                            <div className="absolute bottom-3 right-3 bg-indigo-600 text-white font-extrabold text-sm px-3 py-1 rounded-xl shadow-md">
                              ${room.rate}<span className="text-xs font-normal opacity-80">/nt</span>
                            </div>
                          </div>
                          
                          <div className="p-4 flex-1 flex flex-col justify-between space-y-2.5">
                            <div>
                              <h3 className="font-bold text-slate-900 text-base">{room.name}</h3>
                              <p className="text-xs text-slate-500 font-medium">{room.bedType} &bull; {room.sqFt} sq ft</p>
                            </div>
                            
                            <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                              {room.features.map((feat, idx) => (
                                <li key={idx} className="flex items-center gap-1 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                                  <span className="truncate">{feat}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 2: Verified Survey Feedback from Past Bookings */}
                  <div>
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2.5">
                      <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        <Star className="text-amber-500 fill-amber-500" size={20} />
                        Verified Guest & Artist Survey Reviews
                      </h2>
                      <span className="text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle size={12} /> 100% 5-Star Ratings
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {surveys.filter(s => selectedSurveyIds.includes(s.id)).map((survey) => (
                        <div 
                          key={survey.id}
                          className="bg-slate-50 rounded-2xl p-5 border border-slate-200 relative flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1 text-amber-500">
                                {[...Array(survey.rating)].map((_, i) => (
                                  <Star key={i} size={14} className="fill-amber-400" />
                                ))}
                              </div>
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                {survey.venueMentioned}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed italic mb-4 font-medium">
                              "{survey.comment}"
                            </p>
                          </div>

                          <div className="flex items-center gap-2.5 pt-3 border-t border-slate-200/80">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-xs flex items-center justify-center">
                              {survey.author.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{survey.author}</div>
                              <div className="text-[10px] text-slate-500">{survey.role}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 3: Essential Amenities for Touring Artists & Production */}
                  <div>
                    <div className="mb-4 border-b border-slate-100 pb-2.5">
                      <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                        <ShieldCheck className="text-indigo-600" size={20} />
                        Tailored Tour & Artist Accommodations
                      </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <ShieldCheck size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Keyless Smart Locks</p>
                          <p className="text-[11px] text-slate-500">Private YAMIRY codes for main door & bedroom suites</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Car size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Tour Van Parking</p>
                          <p className="text-[11px] text-slate-500">Secure private driveway for SUVs & sprinter vans</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Wifi size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Gigabit WiFi</p>
                          <p className="text-[11px] text-slate-500">Ultra-fast upload speeds for stems, setlists & video</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Coffee size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Gourmet Kitchen</p>
                          <p className="text-[11px] text-slate-500">Full cookware & 24/7 coffee / espresso staging bar</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Calendar size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Late Show Flexibility</p>
                          <p className="text-[11px] text-slate-500">Custom checkout times tailored to performance sets</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Tag size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Direct Invoicing</p>
                          <p className="text-[11px] text-slate-500">Itemized billing for production & tour management</p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer Strip / Booking & Promotion Callout */}
                <div className="bg-slate-900 text-white p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-slate-800">
                  <div className="space-y-1.5 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/40 px-3 py-1 rounded-xl text-xs font-bold text-indigo-300">
                      <Tag size={12} /> Venue & Artist Promo Code: <strong className="text-white font-mono">{promoCode}</strong>
                    </div>
                    <p className="text-xs text-slate-400 font-medium">
                      {discountDesc}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-300 font-semibold pt-1 flex-wrap justify-center md:justify-start">
                      <span className="flex items-center gap-1"><Phone size={13} className="text-indigo-400" /> {contactPhone}</span>
                      <span className="flex items-center gap-1"><Mail size={13} className="text-indigo-400" /> {contactEmail}</span>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <a
                      href={bookingWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles size={16} /> Reserve Suites Online
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOMIZE DETAILS & RATES */}
          {activeTab === 'customize' && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6 max-w-4xl mx-auto">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="text-indigo-600" size={20} />
                  Customize 1-Pager Advertisement Content
                </h3>
                <p className="text-xs text-slate-500">
                  Edit rates, venue mentions, custom copy, and discount codes before generating or emailing the flyer.
                </p>
              </div>

              {/* Property Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Select Property</label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-semibold"
                  >
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Promo Code</label>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-bold font-mono text-indigo-600"
                    placeholder="VIPARTIST15"
                  />
                </div>
              </div>

              {/* Headline & Subtitle */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Flyer Headline</label>
                  <input
                    type="text"
                    value={flyerHeadline}
                    onChange={(e) => setFlyerHeadline(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Subheadline & Venue Pitch</label>
                  <textarea
                    rows={2}
                    value={flyerSubheadline}
                    onChange={(e) => setFlyerSubheadline(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-medium leading-relaxed"
                  />
                </div>
              </div>

              {/* Room Rates & Customization */}
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-1.5">
                  <BedDouble size={16} className="text-indigo-600" /> Room Types & Per-Night Rates
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {roomRates.map((room, idx) => (
                    <div key={room.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-800">{room.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-400 font-bold">$</span>
                          <input
                            type="number"
                            value={room.rate}
                            onChange={(e) => {
                              const newRates = [...roomRates];
                              newRates[idx].rate = Number(e.target.value);
                              setRoomRates(newRates);
                            }}
                            className="w-20 border border-slate-200 rounded-lg p-1 text-right font-bold text-xs bg-white"
                          />
                          <span className="text-xs text-slate-500 font-medium">/nt</span>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={room.bedType}
                        onChange={(e) => {
                          const newRates = [...roomRates];
                          newRates[idx].bedType = e.target.value;
                          setRoomRates(newRates);
                        }}
                        className="w-full border border-slate-200 rounded-lg p-1.5 text-xs bg-white text-slate-600"
                        placeholder="Bed & description"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Surveys Selector */}
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-1.5">
                  <Star size={16} className="text-amber-500" /> Select Past Booking Surveys to Feature
                </h4>
                <div className="space-y-2">
                  {surveys.map((survey) => (
                    <label 
                      key={survey.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                        selectedSurveyIds.includes(survey.id) 
                          ? "bg-indigo-50/50 border-indigo-200" 
                          : "bg-slate-50 border-slate-200 opacity-70"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSurveyIds.includes(survey.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSurveyIds(prev => [...prev, survey.id]);
                          } else {
                            setSelectedSurveyIds(prev => prev.filter(id => id !== survey.id));
                          }
                        }}
                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-900">{survey.author} &bull; {survey.role} ({survey.venueMentioned})</div>
                        <p className="text-slate-600 italic mt-0.5 font-medium">"{survey.comment}"</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">VIP Concierge Phone</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Booking Inquiries Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md shadow-indigo-100 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Eye size={15} /> Apply & Preview 1-Pager
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: EMAIL TO VENUES & CONCERT PROMOTERS */}
          {activeTab === 'email' && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm max-w-3xl mx-auto space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Send className="text-indigo-600" size={20} />
                  Email Digital 1-Pager to Night-Life Venues & Promoters
                </h3>
                <p className="text-xs text-slate-500">
                  Send a beautifully formatted HTML digital one-pager directly to venue booking teams (St. James Live, Wolf Creek Amphitheater, etc.).
                </p>
              </div>

              {/* Quick Venue Pickers */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-2">Quick-Pick Venue Presets</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_VENUES.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => {
                        setSelectedTargetVenue(v.name);
                        setRecipientEmail(v.email);
                        setRecipientName(`${v.name} Talent Booking Team`);
                        setEmailSubject(`Exclusive Artist & Tour Accommodations near ${v.name} | ${propertyName}`);
                      }}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all cursor-pointer",
                        selectedTargetVenue === v.name 
                          ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200" 
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                      )}
                    >
                      <div className="font-bold text-xs text-slate-900">{v.name}</div>
                      <div className="text-[11px] text-indigo-600 font-semibold">{v.distance}</div>
                      <div className="text-[10px] text-slate-500 truncate">{v.email}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback messages */}
              {emailSuccessMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle size={18} className="text-emerald-600 flex-shrink-0" />
                  {emailSuccessMsg}
                </div>
              )}

              {emailErrorMsg && (
                <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
                  {emailErrorMsg}
                </div>
              )}

              {/* Email Form */}
              <form onSubmit={handleSendAdvertisementEmail} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">
                      Recipient / Venue Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="e.g. booking@stjamesliveatl.com"
                      className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">
                      Recipient / Contact Name
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="e.g. Talent Director"
                      className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Email Subject</label>
                  <input
                    type="text"
                    required
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-tight block mb-1">Personalized Cover Note</label>
                  <textarea
                    rows={6}
                    value={emailCoverNote}
                    onChange={(e) => setEmailCoverNote(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 bg-white text-xs leading-relaxed font-sans text-slate-800"
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCopyPitch}
                    className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedPitch ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                    {copiedPitch ? 'Copied Pitch!' : 'Copy Email Pitch'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSendingEmail}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 size={15} className="animate-spin" /> Sending Email...
                      </>
                    ) : (
                      <>
                        <Send size={15} /> Send Advertisement to Venue
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
