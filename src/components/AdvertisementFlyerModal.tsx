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

  // Trigger browser print for 8x10 2-Page layout
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=850,height=1100');
    if (!printWindow) {
      window.print();
      return;
    }

    const propertyName = selectedProperty?.name || 'Stonewall Villa';
    const htmlToPrint = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${propertyName} - 8x10 2-Page Artist Lodging Flyer</title>
  <style>
    @page {
      size: 8in 10in;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.35;
    }
    .page {
      width: 8in;
      height: 10in;
      max-height: 10in;
      margin: 0 auto 20px auto;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.32in 0.38in;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      position: relative;
    }
    @media print {
      body {
        background: #ffffff;
        margin: 0;
        padding: 0;
      }
      .page {
        width: 8in !important;
        height: 10in !important;
        max-height: 10in !important;
        margin: 0 !important;
        padding: 0.32in 0.38in !important;
        box-shadow: none !important;
        border: none !important;
        overflow: hidden !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .page-1 {
        page-break-after: always !important;
        break-after: page !important;
      }
      .page-2 {
        page-break-before: always !important;
        break-before: page !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
    .header-banner {
      background: linear-gradient(135deg, #090d16 0%, #17153b 100%);
      color: #ffffff;
      padding: 14px 18px;
      border-radius: 12px;
      margin-bottom: 10px;
    }
    .badge-top {
      display: inline-block;
      background: #4f46e5;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 2px 8px;
      border-radius: 999px;
      margin-bottom: 4px;
    }
    .title-main {
      font-size: 20px;
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.01em;
      color: #ffffff;
    }
    .subtitle-main {
      font-size: 10.5px;
      color: #cbd5e1;
      margin: 3px 0 0 0;
      font-weight: 500;
      line-height: 1.3;
    }
    .venues-strip {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 9.5px;
    }
    .venue-pill {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #1e1b4b;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 6px;
    }
    .section-heading {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
    .rooms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }
    .room-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .room-card img {
      width: 100%;
      height: 98px;
      object-fit: cover;
      background: #e2e8f0;
    }
    .room-content {
      padding: 7px 9px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex: 1;
    }
    .room-name-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2px;
    }
    .room-title {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.15;
    }
    .room-rate-badge {
      background: #4f46e5;
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 5px;
      white-space: nowrap;
    }
    .room-sub {
      font-size: 9px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .room-features-list {
      margin: 0;
      padding-left: 12px;
      font-size: 8.5px;
      color: #475569;
      line-height: 1.35;
    }
    .page-footer-strip {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 6px 12px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      color: #64748b;
      font-weight: 600;
      margin-top: 6px;
    }
    .page-2-header {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .reviews-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }
    .review-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .review-quote {
      font-size: 9px;
      color: #334155;
      font-style: italic;
      line-height: 1.35;
      margin: 0 0 6px 0;
    }
    .review-author-row {
      font-size: 8.5px;
      font-weight: 800;
      color: #0f172a;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amenities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 7px;
      margin-bottom: 10px;
    }
    .amenity-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 7px 9px;
    }
    .amenity-title {
      font-size: 9.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .amenity-desc {
      font-size: 8px;
      color: #64748b;
      line-height: 1.25;
      margin: 0;
    }
    .booking-callout {
      background: linear-gradient(135deg, #090d16 0%, #1e1b4b 100%);
      color: #ffffff;
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
    }
    .promo-pill {
      display: inline-block;
      background: rgba(79, 70, 229, 0.35);
      border: 1px solid #818cf8;
      color: #e0e7ff;
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <!-- PAGE 1: FRONT COVER (SIDE A) -->
  <div class="page page-1">
    <div>
      <div class="header-banner">
        <div class="badge-top">8x10 Professional Digital 1-Pager • Side A</div>
        <h1 class="title-main">${propertyName} | Atlanta, GA</h1>
        <p class="subtitle-main">${flyerSubheadline}</p>
      </div>

      <div class="venues-strip">
        <span style="font-weight: 800; color: #475569; text-transform: uppercase; font-size: 8.5px;">📍 Venue Proximity:</span>
        <span class="venue-pill">St. James Live (8 mins / 4.5 mi)</span>
        <span class="venue-pill">Wolf Creek Amphitheater (10 mins / 6.2 mi)</span>
        <span class="venue-pill">ATL Airport (15 mins)</span>
      </div>

      <div class="section-heading">
        <span>✨ Luxury Suites, Photo Gallery & Rates</span>
        <span style="font-size: 9px; font-weight: 600; color: #64748b;">Individual Rooms & Full Villa Buyouts</span>
      </div>

      <div class="rooms-grid">
        ${roomRates.map(r => `
          <div class="room-card">
            <img src="${r.photoUrl}" alt="${r.name}" />
            <div class="room-content">
              <div>
                <div class="room-name-row">
                  <span class="room-title">${r.name}</span>
                  <span class="room-rate-badge">$${r.rate}/nt</span>
                </div>
                <div class="room-sub">${r.bedType} &bull; ${r.sqFt} sq ft</div>
              </div>
              <ul class="room-features-list">
                ${r.features.slice(0, 3).map(f => `<li>${f}</li>`).join('')}
              </ul>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="page-footer-strip">
      <span>★ Preferred Venue Rates with Promo Code: <strong style="color: #4f46e5;">${promoCode}</strong></span>
      <span>Turn Over for Amenities, Reviews & Direct Booking (Side B) ➔</span>
    </div>
  </div>

  <!-- PAGE 2: BACK COVER (SIDE B - TWO-SIDED REVERSE) -->
  <div class="page page-2">
    <div>
      <div class="page-2-header">
        <div>
          <span style="font-size: 8.5px; font-weight: 800; color: #818cf8; text-transform: uppercase;">8x10 Two-Sided Print Edition • Side B</span>
          <div style="font-size: 14px; font-weight: 800; color: #ffffff;">${propertyName} • Artist Accommodations & Guest Reviews</div>
        </div>
        <div style="font-size: 9px; color: #94a3b8; text-align: right;">
          Atlanta, Georgia &bull; Direct Management
        </div>
      </div>

      <div class="section-heading">
        <span>⭐️ Verified Touring Guest & Artist Survey Reviews</span>
        <span style="font-size: 9px; color: #16a34a; font-weight: 700;">100% 5-Star Hospitality</span>
      </div>

      <div class="reviews-grid">
        ${surveys.filter(s => selectedSurveyIds.includes(s.id)).slice(0, 2).map(s => `
          <div class="review-card">
            <div style="color: #f59e0b; font-size: 10px; margin-bottom: 3px;">★★★★★ <span style="color: #64748b; font-size: 8px; font-weight: 700;">(${s.venueMentioned})</span></div>
            <p class="review-quote">"${s.comment}"</p>
            <div class="review-author-row">
              <span>${s.author}</span>
              <span style="color: #64748b; font-weight: 500;">${s.role}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-heading">
        <span>🎸 Tailored Amenities for Performing Artists & Production Teams</span>
      </div>

      <div class="amenities-grid">
        <div class="amenity-card">
          <div class="amenity-title">🔐 Keyless Smart Locks</div>
          <p class="amenity-desc">Individual YAMIRY digital PIN codes for main estate & private bedroom suites.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">🚐 Tour Van Parking</div>
          <p class="amenity-desc">Secure private driveway accommodating SUVs, trailers & tour sprinter vans.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">📶 Gigabit Fiber WiFi</div>
          <p class="amenity-desc">Ultra-fast upload speeds for stems, live-streaming, setlists & HD video.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">🍳 Gourmet Chef Kitchen</div>
          <p class="amenity-desc">Complete premium cookware, appliances, and 24/7 espresso & coffee bar.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">🕒 Late Show Flexibility</div>
          <p class="amenity-desc">Flexible check-in / check-out times aligned with concert soundcheck & encores.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">📋 Itemized Direct Billing</div>
          <p class="amenity-desc">Clean corporate billing & receipts for tour management accounting.</p>
        </div>
      </div>
    </div>

    <div>
      <div class="booking-callout">
        <div>
          <div style="font-size: 13px; font-weight: 800; color: #ffffff;">Reserve Artist Suites Direct</div>
          <div style="font-size: 9.5px; color: #cbd5e1; margin-top: 2px;">
            Phone: <strong>${contactPhone}</strong> &bull; Email: <strong>${contactEmail}</strong>
          </div>
          <div class="promo-pill">
            Promo Code: <strong>${promoCode}</strong> (${discountDesc})
          </div>
        </div>
        <div style="text-align: right;">
          <div style="background: #4f46e5; color: #ffffff; font-size: 10px; font-weight: 800; padding: 6px 14px; border-radius: 8px; text-transform: uppercase;">
            ${bookingWebsite.replace(/^https?:\/\//, '')}
          </div>
          <div style="font-size: 7.5px; color: #94a3b8; margin-top: 3px;">Book Online with Instant Confirmation</div>
        </div>
      </div>

      <div class="page-footer-strip" style="margin-top: 6px;">
        <span>Stonewall Villa VIP Tour Lodging &bull; ${propertyName}</span>
        <span>Double-Sided 8x10 Print Edition &bull; 2-Pages Exact</span>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(htmlToPrint);
    printWindow.document.close();
  };

  // Trigger 8x10 HTML/PDF Download
  const handleDownloadHtml = () => {
    const propertyName = selectedProperty?.name || 'Stonewall Villa';
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${propertyName} - 8x10 2-Page Professional Artist & Tour Lodging Flyer</title>
  <style>
    @page {
      size: 8in 10in;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 24px 0;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      line-height: 1.35;
    }
    .print-controls-bar {
      max-width: 8in;
      margin: 0 auto 16px auto;
      background: #1e293b;
      padding: 12px 20px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }
    .print-btn {
      background: #4f46e5;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .print-btn:hover {
      background: #4338ca;
    }
    .page {
      width: 8in;
      height: 10in;
      max-height: 10in;
      margin: 0 auto 24px auto;
      background: #ffffff;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.32in 0.38in;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      position: relative;
      border-radius: 12px;
    }
    @media print {
      body {
        background: #ffffff;
        margin: 0;
        padding: 0;
      }
      .print-controls-bar {
        display: none !important;
      }
      .page {
        width: 8in !important;
        height: 10in !important;
        max-height: 10in !important;
        margin: 0 !important;
        padding: 0.32in 0.38in !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        overflow: hidden !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .page-1 {
        page-break-after: always !important;
        break-after: page !important;
      }
      .page-2 {
        page-break-before: always !important;
        break-before: page !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
    }
    .header-banner {
      background: linear-gradient(135deg, #090d16 0%, #17153b 100%);
      color: #ffffff;
      padding: 14px 18px;
      border-radius: 12px;
      margin-bottom: 10px;
    }
    .badge-top {
      display: inline-block;
      background: #4f46e5;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 2px 8px;
      border-radius: 999px;
      margin-bottom: 4px;
    }
    .title-main {
      font-size: 20px;
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.01em;
      color: #ffffff;
    }
    .subtitle-main {
      font-size: 10.5px;
      color: #cbd5e1;
      margin: 3px 0 0 0;
      font-weight: 500;
      line-height: 1.3;
    }
    .venues-strip {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      font-size: 9.5px;
    }
    .venue-pill {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #1e1b4b;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 6px;
    }
    .section-heading {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
    .rooms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }
    .room-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .room-card img {
      width: 100%;
      height: 98px;
      object-fit: cover;
      background: #e2e8f0;
    }
    .room-content {
      padding: 7px 9px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      flex: 1;
    }
    .room-name-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2px;
    }
    .room-title {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.15;
    }
    .room-rate-badge {
      background: #4f46e5;
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 5px;
      white-space: nowrap;
    }
    .room-sub {
      font-size: 9px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .room-features-list {
      margin: 0;
      padding-left: 12px;
      font-size: 8.5px;
      color: #475569;
      line-height: 1.35;
    }
    .page-footer-strip {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 6px 12px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      color: #64748b;
      font-weight: 600;
      margin-top: 6px;
    }
    .page-2-header {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .reviews-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }
    .review-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .review-quote {
      font-size: 9px;
      color: #334155;
      font-style: italic;
      line-height: 1.35;
      margin: 0 0 6px 0;
    }
    .review-author-row {
      font-size: 8.5px;
      font-weight: 800;
      color: #0f172a;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .amenities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 7px;
      margin-bottom: 10px;
    }
    .amenity-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 7px 9px;
    }
    .amenity-title {
      font-size: 9.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .amenity-desc {
      font-size: 8px;
      color: #64748b;
      line-height: 1.25;
      margin: 0;
    }
    .booking-callout {
      background: linear-gradient(135deg, #090d16 0%, #1e1b4b 100%);
      color: #ffffff;
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
    }
    .promo-pill {
      display: inline-block;
      background: rgba(79, 70, 229, 0.35);
      border: 1px solid #818cf8;
      color: #e0e7ff;
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <div class="print-controls-bar">
    <div>
      <strong style="font-size: 14px;">📄 8x10 Two-Sided Digital Flyer</strong>
      <div style="font-size: 11px; color: #94a3b8;">Formatted strictly for 8x10 PDF download and double-sided printing (2-Pages exact).</div>
    </div>
    <button class="print-btn" onclick="window.print()">
      🖨️ Print / Save 8x10 PDF
    </button>
  </div>

  <!-- PAGE 1: FRONT COVER (SIDE A) -->
  <div class="page page-1">
    <div>
      <div class="header-banner">
        <div class="badge-top">8x10 Professional Digital 1-Pager • Side A</div>
        <h1 class="title-main">${propertyName} | Atlanta, GA</h1>
        <p class="subtitle-main">${flyerSubheadline}</p>
      </div>

      <div class="venues-strip">
        <span style="font-weight: 800; color: #475569; text-transform: uppercase; font-size: 8.5px;">📍 Venue Proximity:</span>
        <span class="venue-pill">St. James Live (8 mins / 4.5 mi)</span>
        <span class="venue-pill">Wolf Creek Amphitheater (10 mins / 6.2 mi)</span>
        <span class="venue-pill">ATL Airport (15 mins)</span>
      </div>

      <div class="section-heading">
        <span>✨ Luxury Suites, Photo Gallery & Rates</span>
        <span style="font-size: 9px; font-weight: 600; color: #64748b;">Individual Rooms & Full Villa Buyouts</span>
      </div>

      <div class="rooms-grid">
        ${roomRates.map(r => `
          <div class="room-card">
            <img src="${r.photoUrl}" alt="${r.name}" />
            <div class="room-content">
              <div>
                <div class="room-name-row">
                  <span class="room-title">${r.name}</span>
                  <span class="room-rate-badge">$${r.rate}/nt</span>
                </div>
                <div class="room-sub">${r.bedType} &bull; ${r.sqFt} sq ft</div>
              </div>
              <ul class="room-features-list">
                ${r.features.slice(0, 3).map(f => `<li>${f}</li>`).join('')}
              </ul>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="page-footer-strip">
      <span>★ Preferred Venue Rates with Promo Code: <strong style="color: #4f46e5;">${promoCode}</strong></span>
      <span>Turn Over for Amenities, Reviews & Direct Booking (Side B) ➔</span>
    </div>
  </div>

  <!-- PAGE 2: BACK COVER (SIDE B - TWO-SIDED REVERSE) -->
  <div class="page page-2">
    <div>
      <div class="page-2-header">
        <div>
          <span style="font-size: 8.5px; font-weight: 800; color: #818cf8; text-transform: uppercase;">8x10 Two-Sided Print Edition • Side B</span>
          <div style="font-size: 14px; font-weight: 800; color: #ffffff;">${propertyName} • Artist Accommodations & Guest Reviews</div>
        </div>
        <div style="font-size: 9px; color: #94a3b8; text-align: right;">
          Atlanta, Georgia &bull; Direct Management
        </div>
      </div>

      <div class="section-heading">
        <span>⭐️ Verified Touring Guest & Artist Survey Reviews</span>
        <span style="font-size: 9px; color: #16a34a; font-weight: 700;">100% 5-Star Hospitality</span>
      </div>

      <div class="reviews-grid">
        ${surveys.filter(s => selectedSurveyIds.includes(s.id)).slice(0, 2).map(s => `
          <div class="review-card">
            <div style="color: #f59e0b; font-size: 10px; margin-bottom: 3px;">★★★★★ <span style="color: #64748b; font-size: 8px; font-weight: 700;">(${s.venueMentioned})</span></div>
            <p class="review-quote">"${s.comment}"</p>
            <div class="review-author-row">
              <span>${s.author}</span>
              <span style="color: #64748b; font-weight: 500;">${s.role}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-heading">
        <span>🎸 Tailored Amenities for Performing Artists & Production Teams</span>
      </div>

      <div class="amenities-grid">
        <div class="amenity-card">
          <div class="amenity-title">🔐 Keyless Smart Locks</div>
          <p class="amenity-desc">Individual YAMIRY digital PIN codes for main estate & private bedroom suites.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">🚐 Tour Van Parking</div>
          <p class="amenity-desc">Secure private driveway accommodating SUVs, trailers & tour sprinter vans.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">📶 Gigabit Fiber WiFi</div>
          <p class="amenity-desc">Ultra-fast upload speeds for stems, live-streaming, setlists & HD video.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">🍳 Gourmet Chef Kitchen</div>
          <p class="amenity-desc">Complete premium cookware, appliances, and 24/7 espresso & coffee bar.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">🕒 Late Show Flexibility</div>
          <p class="amenity-desc">Flexible check-in / check-out times aligned with concert soundcheck & encores.</p>
        </div>
        <div class="amenity-card">
          <div class="amenity-title">📋 Itemized Direct Billing</div>
          <p class="amenity-desc">Clean corporate billing & receipts for tour management accounting.</p>
        </div>
      </div>
    </div>

    <div>
      <div class="booking-callout">
        <div>
          <div style="font-size: 13px; font-weight: 800; color: #ffffff;">Reserve Artist Suites Direct</div>
          <div style="font-size: 9.5px; color: #cbd5e1; margin-top: 2px;">
            Phone: <strong>${contactPhone}</strong> &bull; Email: <strong>${contactEmail}</strong>
          </div>
          <div class="promo-pill">
            Promo Code: <strong>${promoCode}</strong> (${discountDesc})
          </div>
        </div>
        <div style="text-align: right;">
          <div style="background: #4f46e5; color: #ffffff; font-size: 10px; font-weight: 800; padding: 6px 14px; border-radius: 8px; text-transform: uppercase;">
            ${bookingWebsite.replace(/^https?:\/\//, '')}
          </div>
          <div style="font-size: 7.5px; color: #94a3b8; margin-top: 3px;">Book Online with Instant Confirmation</div>
        </div>
      </div>

      <div class="page-footer-strip" style="margin-top: 6px;">
        <span>Stonewall Villa VIP Tour Lodging &bull; ${propertyName}</span>
        <span>Double-Sided 8x10 Print Edition &bull; 2-Pages Exact</span>
      </div>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${propertyName.replace(/\s+/g, '_')}_8x10_2Page_Artist_Lodging_Flyer.html`;
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
          
          {/* TAB 1: LIVE 8x10 2-PAGE PREVIEW & PRINTABLE VIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-bold text-sm">
                    📄
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">8x10 Format Advertisement (2-Pages Exact)</span>
                      <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                        Two-Sided Ready
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Formatted strictly to print or download in 8&times;10 PDF across 2 pages (Side A front &amp; Side B reverse) for venues and performing artists.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPitch}
                    className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPitch ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copiedPitch ? 'Copied Pitch!' : 'Copy Pitch'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} /> Print 8x10 (2-Pages)
                  </button>
                </div>
              </div>

              {/* The 2-Page 8x10 Printable Presentation Canvas */}
              <div ref={printAreaRef} className="space-y-6 print:space-y-0">
                
                {/* PAGE 1 (FRONT COVER / SIDE A) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-w-4xl mx-auto flex flex-col justify-between p-6 sm:p-8 relative print:max-w-none print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:h-[10in] print:w-[8in] print:overflow-hidden print:break-after-page">
                  
                  <div>
                    {/* Header Banner */}
                    <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-7 rounded-2xl relative overflow-hidden mb-4 shadow-sm">
                      <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2">
                          <Music size={12} className="text-indigo-400" /> 8x10 Artist &amp; Tour Lodging &bull; Side A
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                          {propertyName} <span className="text-indigo-400 font-light">| Atlanta, GA</span>
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-medium leading-relaxed">
                          {flyerSubheadline}
                        </p>
                      </div>
                    </div>

                    {/* Proximity Strip */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs mb-4">
                      <div className="flex items-center gap-1.5 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <MapPin size={13} className="text-indigo-600" /> Atlanta Venue Proximity:
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="bg-white border border-indigo-100 text-indigo-900 font-bold px-2.5 py-1 rounded-lg shadow-xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          St. James Live (~8 mins / 4.5 mi)
                        </span>
                        <span className="bg-white border border-indigo-100 text-indigo-900 font-bold px-2.5 py-1 rounded-lg shadow-xs flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Wolf Creek Amphitheater (~10 mins / 6.2 mi)
                        </span>
                        <span className="bg-white border border-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg shadow-xs">
                          ✈️ ATL Airport (~15 mins)
                        </span>
                      </div>
                    </div>

                    {/* Section 1: Room Types & Photos & Rates */}
                    <div>
                      <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          <BedDouble className="text-indigo-600" size={17} />
                          Luxury Room Types, Photo Gallery &amp; Rates
                        </h2>
                        <span className="text-[11px] text-slate-500 font-semibold">Individual Rooms &amp; Full Villa Buyouts</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {roomRates.map((room) => (
                          <div 
                            key={room.id}
                            className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                          >
                            <div className="relative h-28 sm:h-32 bg-slate-200 overflow-hidden">
                              <img 
                                src={room.photoUrl} 
                                alt={room.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                                {room.type}
                              </div>
                              <div className="absolute bottom-2 right-2 bg-indigo-600 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg shadow-md">
                                ${room.rate}<span className="text-[10px] font-normal opacity-80">/nt</span>
                              </div>
                            </div>
                            
                            <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1.5">
                              <div>
                                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{room.name}</h3>
                                <p className="text-[10px] text-slate-500 font-medium">{room.bedType} &bull; {room.sqFt} sq ft</p>
                              </div>
                              
                              <ul className="grid grid-cols-2 gap-1 text-[10px] text-slate-600">
                                {room.features.slice(0, 4).map((feat, idx) => (
                                  <li key={idx} className="flex items-center gap-1 font-medium truncate">
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
                  </div>

                  {/* Page 1 Bottom Transition Strip */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl">
                    <span className="font-semibold">
                      ★ Preferred Venue Promo Code: <strong className="text-indigo-600 font-mono">{promoCode}</strong>
                    </span>
                    <span className="font-bold text-indigo-700 flex items-center gap-1">
                      Side A (Page 1) &bull; Turn Over for Reviews &amp; Booking ➔
                    </span>
                  </div>
                </div>

                {/* PAGE 2 (BACK COVER / SIDE B - REVERSE SIDE FOR TWO-SIDED PRINTING) */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-w-4xl mx-auto flex flex-col justify-between p-6 sm:p-8 relative print:max-w-none print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:h-[10in] print:w-[8in] print:overflow-hidden print:break-before-page">
                  
                  <div>
                    {/* Header Page 2 */}
                    <div className="bg-slate-900 text-white px-5 py-3 rounded-xl flex items-center justify-between mb-4">
                      <div>
                        <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-wider">
                          8x10 Two-Sided Print Edition &bull; Side B
                        </span>
                        <h2 className="text-base sm:text-lg font-bold text-white">
                          {propertyName} &bull; Artist Accommodations &amp; Guest Reviews
                        </h2>
                      </div>
                      <div className="text-right text-[11px] text-slate-400 font-medium">
                        Atlanta, Georgia &bull; Direct Management
                      </div>
                    </div>

                    {/* Section 2: Verified Survey Feedback */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2.5 border-b border-slate-200 pb-1.5">
                        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          <Star className="text-amber-500 fill-amber-500" size={17} />
                          Verified Guest &amp; Artist Survey Reviews
                        </h3>
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <CheckCircle size={11} /> 100% 5-Star Ratings
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {surveys.filter(s => selectedSurveyIds.includes(s.id)).slice(0, 2).map((survey) => (
                          <div 
                            key={survey.id}
                            className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 relative flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-0.5 text-amber-500">
                                  {[...Array(survey.rating)].map((_, i) => (
                                    <Star key={i} size={12} className="fill-amber-400" />
                                  ))}
                                </div>
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                  {survey.venueMentioned}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-700 leading-relaxed italic mb-2 font-medium">
                                "{survey.comment}"
                              </p>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-[10px] flex items-center justify-center">
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

                    {/* Section 3: Tailored Tour & Production Amenities */}
                    <div>
                      <div className="mb-2.5 border-b border-slate-200 pb-1.5">
                        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          <ShieldCheck className="text-indigo-600" size={17} />
                          Tailored Tour &amp; Artist Accommodations
                        </h3>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <ShieldCheck size={15} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Keyless Smart Locks</p>
                            <p className="text-[10px] text-slate-500 leading-tight">YAMIRY digital PIN codes for main door &amp; private rooms</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Car size={15} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Tour Van Parking</p>
                            <p className="text-[10px] text-slate-500 leading-tight">Secure private driveway for SUVs &amp; sprinter vans</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Wifi size={15} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Gigabit Fiber WiFi</p>
                            <p className="text-[10px] text-slate-500 leading-tight">Ultra-fast upload speeds for stems, setlists &amp; streaming</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Coffee size={15} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Gourmet Kitchen</p>
                            <p className="text-[10px] text-slate-500 leading-tight">Full cookware &amp; 24/7 coffee / espresso staging bar</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Calendar size={15} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Late Show Check-In</p>
                            <p className="text-[10px] text-slate-500 leading-tight">Flexible schedules aligned with soundchecks &amp; encores</p>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-start gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Tag size={15} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Itemized Invoicing</p>
                            <p className="text-[10px] text-slate-500 leading-tight">Direct receipts for production &amp; tour accounting</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: VIP Booking & Exclusive Venue Discount Box */}
                  <div className="mt-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/40 px-3 py-0.5 rounded-lg text-xs font-bold text-indigo-300">
                        <Tag size={12} /> Venue Promo: <strong className="text-white font-mono">{promoCode}</strong>
                      </div>
                      <p className="text-xs text-slate-400 font-medium">
                        {discountDesc} &bull; Preferred Rates for Concert Artists
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-300 font-semibold pt-1 flex-wrap justify-center sm:justify-start">
                        <span className="flex items-center gap-1"><Phone size={12} className="text-indigo-400" /> {contactPhone}</span>
                        <span className="flex items-center gap-1"><Mail size={12} className="text-indigo-400" /> {contactEmail}</span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-center sm:text-right">
                      <a
                        href={bookingWebsite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles size={14} /> Reserve Direct Online
                      </a>
                      <div className="text-[9px] text-slate-400 mt-1 font-mono">{bookingWebsite.replace(/^https?:\/\//, '')}</div>
                    </div>
                  </div>

                  {/* Page 2 Bottom Subtext */}
                  <div className="mt-2 text-center text-[10px] text-slate-400">
                    Stonewall Villa &bull; Official 8x10 Double-Sided Digital Advertisement (Side B) &bull; 2-Pages Exact
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
