import express from "express";
import { type ViteDevServer } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import Stripe from "stripe";
import * as dotenv from "dotenv";
import fs from "fs";
import cors from "cors";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { calculatePriceDetails } from "./src/lib/pricing";
import PDFDocument from "pdfkit";

// Load environment variables from .env file if present
dotenv.config();

// Initialize Firebase Admin
let db: admin.firestore.Firestore;
try {
  console.log(`[Server] Initializing Firebase Admin...`);
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  let firebaseConfig: any = {};
  if (fs.existsSync(configPath)) {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.error("[Server] Error reading firebase-applet-config.json:", e);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
  const dbId = process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || "(default)";
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (admin.apps.length === 0) {
    if (serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: sa.project_id || projectId
        });
        console.log(`[Server] Firebase Admin initialized using Service Account JSON. Project: ${sa.project_id || projectId}, DB: ${dbId}`);
      } catch (saErr) {
        console.error("[Server] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON, falling back to projectId:", saErr);
        admin.initializeApp({ projectId });
        console.log(`[Server] Firebase Admin initialized with projectId fallback. Project: ${projectId}, DB: ${dbId}`);
      }
    } else if (projectId) {
      admin.initializeApp({ projectId });
      console.log(`[Server] Firebase Admin initialized using Project ID: ${projectId}. DB: ${dbId} (Warning: Local sandbox runs may require service account credentials for server-side write operations)`);
    } else {
      console.warn(`[Server] No Firebase configuration found. Use AI Studio setup or set FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_JSON.`);
    }
  }

  if (admin.apps.length > 0) {
    db = getFirestore(admin.app(), dbId);
  }
} catch (e) {
  console.error("[Server] Critical failure during Firebase initialization:", e);
}

let __filename: string;
let __dirname: string;

// ESM / CJS compatibility
try {
  // @ts-ignore
  if (typeof __filename !== 'undefined') {
    // @ts-ignore
    __filename = __filename;
    // @ts-ignore
    __dirname = __dirname;
  } else {
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  }
} catch (e) {
  __filename = "";
  __dirname = process.cwd();
}

// SMTP Outgoing Email Helper via Nodemailer
async function sendSmtpEmail({ to, subject, text, html, attachments }: { to: string; subject: string; text: string; html?: string; attachments?: any[] }) {
  const nodemailer = await import("nodemailer");
  
  const host = process.env.SMTP_HOST || "smtp.mailgun.org";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "donotreply@cashgroupproperties.com";
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true"; // normally false for 587, true for 465
  // IONOS and similar providers require fromEmail to match SMTP_USER exactly
  const fromEmail = process.env.SMTP_FROM_EMAIL || user;
  const fromName = process.env.SMTP_FROM_NAME || "REALCal Bookings";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions: any = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    html
  };

  if (attachments) {
    mailOptions.attachments = attachments;
  }

  console.log(`[SMTP] Sending email. Host: ${host}:${port}, From: ${fromEmail}, To: ${to}, Subject: ${subject}`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`[SMTP] Email sent successfully. MessageId: ${info.messageId}`);
  return {
    success: true,
    messageId: info.messageId || "",
    response: info.response || "",
    accepted: info.accepted || [],
    rejected: info.rejected || []
  };
}

function formatPhoneToE164(phone: string | undefined): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+1' + cleaned;
    }
  }
  return cleaned;
}

async function sendInvoicePaymentAdminNotification(bookingId: string, bookingData: any, activeDb: any) {
  try {
    const invoiceDetails = bookingData.invoiceDetails || {};
    const invoiceNumber = invoiceDetails.invoiceNumber || 'Manual';
    const amount = invoiceDetails.grandTotal !== undefined ? invoiceDetails.grandTotal : (bookingData.totalPrice ? (bookingData.totalPrice / 100) : 0);
    const guestName = bookingData.guestName || invoiceDetails.sponsorName || "Guest";
    const sponsorEmail = invoiceDetails.sponsorEmail || bookingData.guestEmail || "";
    
    // Fetch property name
    let propertyName = "Lodging Property";
    if (bookingData.propertyId) {
      try {
        const propSnap = await activeDb.collection('properties').doc(bookingData.propertyId).get();
        if (propSnap.exists) {
          propertyName = propSnap.data().name;
        }
      } catch (err) {
        console.error("[Notification] Failed to fetch property name for invoice notification:", err);
      }
    }

    // Build the message
    const message = `ALERT: Guest/Sponsor ${guestName} (${sponsorEmail}) has PAID invoice #${invoiceNumber} in full for property "${propertyName}".\n\n` +
                    `Amount Paid: $${Number(amount).toFixed(2)}\n` +
                    `Check-in: ${bookingData.checkIn || 'N/A'}\n` +
                    `Check-out: ${bookingData.checkOut || 'N/A'}\n` +
                    `Booking Ref: ${bookingData.bookingRef || 'N/A'}`;

    console.log(`[Notification] Preparing to send invoice paid notifications to enabled admins: "${message.replace(/\n/g, ' ')}"`);

    // Setup Notification Services
    const useSmtpEmail = !!process.env.SMTP_HOST;

    let twilioClient: any = null;
    const tSid = process.env.TWILIO_ACCOUNT_SID;
    const tTok = process.env.TWILIO_AUTH_TOKEN;
    const tFrom = process.env.TWILIO_PHONE_NUMBER;
    
    if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
      try {
        const twilioPkg = await import('twilio');
        const twilio = twilioPkg.default || twilioPkg;
        twilioClient = (twilio as any)(tSid, tTok);
      } catch (e) {
        console.error("[Notification] Error loading Twilio client:", e);
      }
    }

    // Fetch enabled admins (property_managers)
    const managersSnap = await activeDb.collection("property_managers").where("enabled", "==", true).get();
    if (!managersSnap.empty) {
      for (const mDoc of managersSnap.docs) {
        const m = mDoc.data();
        // Send email if configured
        if (useSmtpEmail && m.email) {
          try {
            await sendSmtpEmail({
              to: m.email,
              subject: `Invoice Paid: #${invoiceNumber} for ${propertyName}`,
              text: message
            });
            console.log(`[Notification] Invoice paid email notification sent to Admin ${m.email}`);
          } catch (e: any) {
            console.error(`[Notification] Failed to send email to Admin ${m.email}:`, e);
          }
        }
        // Send SMS if configured
        if (twilioClient && m.phone && tFrom) {
          try {
            await twilioClient.messages.create({
              body: message,
              from: tFrom,
              to: formatPhoneToE164(m.phone)
            });
            console.log(`[Notification] Invoice paid SMS notification sent to Admin ${m.phone}`);
          } catch (e: any) {
            console.error(`[Notification] Failed to send SMS to Admin ${m.phone}:`, e);
          }
        }
      }
    } else {
      console.log("[Notification] No enabled property managers (Admins) found to notify.");
    }
  } catch (err) {
    console.error("[Notification] Error inside sendInvoicePaymentAdminNotification:", err);
  }
}

async function sendInvoicePaymentGuestNotification(bookingId: string, bookingData: any, activeDb: any) {
  try {
    const invoiceDetails = bookingData.invoiceDetails || {};
    const invoiceNumber = invoiceDetails.invoiceNumber || 'Manual';
    const amount = invoiceDetails.grandTotal !== undefined ? invoiceDetails.grandTotal : (bookingData.totalPrice ? (bookingData.totalPrice / 100) : 0);
    const guestName = bookingData.guestName || invoiceDetails.sponsorName || "Guest";
    const guestEmail = bookingData.guestEmail || invoiceDetails.sponsorEmail || "";
    const guestPhone = bookingData.guestPhone || invoiceDetails.sponsorPhone || "";
    const sponsorEmail = invoiceDetails.sponsorEmail || "";
    const sponsorPhone = invoiceDetails.sponsorPhone || "";

    // Fetch property name
    let propertyName = "Lodging Property";
    if (bookingData.propertyId) {
      try {
        const propSnap = await activeDb.collection('properties').doc(bookingData.propertyId).get();
        if (propSnap.exists) {
          propertyName = propSnap.data().name;
        }
      } catch (err) {
        console.error("[Notification] Failed to fetch property name for guest invoice notification:", err);
      }
    }

    const message = `Dear ${guestName},\n\n` +
                    `We are pleased to confirm that payment has been RECEIVED IN FULL for Invoice #${invoiceNumber} for your upcoming stay at "${propertyName}".\n\n` +
                    `Amount Paid: $${Number(amount).toFixed(2)}\n` +
                    `Check-in Date: ${bookingData.checkIn || 'N/A'}\n` +
                    `Check-out Date: ${bookingData.checkOut || 'N/A'}\n` +
                    `Booking Reference: ${bookingData.bookingRef || 'N/A'}\n\n` +
                    `Thank you for your business!\n\n` +
                    `Best regards,\n` +
                    `REALCal Bookings\n` +
                    `C.&S.H. Group Properties, LLC`;

    console.log(`[Notification] Preparing to send invoice payment confirmation to Guest: "${message.replace(/\n/g, ' ')}"`);

    // Setup Notification Services
    const useSmtpEmail = !!process.env.SMTP_HOST;

    let twilioClient: any = null;
    const tSid = process.env.TWILIO_ACCOUNT_SID;
    const tTok = process.env.TWILIO_AUTH_TOKEN;
    const tFrom = process.env.TWILIO_PHONE_NUMBER;
    
    if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
      try {
        const twilioPkg = await import('twilio');
        const twilio = twilioPkg.default || twilioPkg;
        twilioClient = (twilio as any)(tSid, tTok);
      } catch (e) {
        console.error("[Notification] Error loading Twilio client for guest confirmation:", e);
      }
    }

    // Send email to sponsor if they are different from guest, and to guest
    const emailsToNotify = new Set<string>();
    if (guestEmail) emailsToNotify.add(guestEmail.trim().toLowerCase());
    if (sponsorEmail) emailsToNotify.add(sponsorEmail.trim().toLowerCase());

    if (useSmtpEmail) {
      for (const email of emailsToNotify) {
        try {
          await sendSmtpEmail({
            to: email,
            subject: `Payment Confirmed: Invoice #${invoiceNumber} for ${propertyName}`,
            text: message
          });
          console.log(`[Notification] Invoice paid confirmation email sent to ${email}`);
        } catch (e: any) {
          console.error(`[Notification] Failed to send email to ${email}:`, e);
        }
      }
    }

    // Send SMS to Guest/Sponsor if opt-in / configured
    // Check user tollFreeAccept status
    let userSmsAllowed = true;
    if (bookingData.userId) {
      try {
        const userSnap = await activeDb.collection('users').doc(bookingData.userId).get();
        if (userSnap.exists) {
          const uData = userSnap.data() || {};
          // If explicitly opted out (false), we respect it. Since we just updated it to true (ACCEPTED) upon payment,
          // they should be opted in now. Let's still check.
          if (uData.tollFreeAccept === false) {
            userSmsAllowed = false;
          }
        }
      } catch (err) {
        console.error("[Notification] Failed to fetch guest toll-free status for confirmation SMS:", err);
      }
    }

    if (twilioClient && tFrom && userSmsAllowed) {
      const smsBody = `Payment Received! Invoice #${invoiceNumber} for stay at ${propertyName} (${bookingData.checkIn} to ${bookingData.checkOut}) is paid in full. Thank you!`;
      const phonesToNotify = new Set<string>();
      if (guestPhone) phonesToNotify.add(formatPhoneToE164(guestPhone));
      if (sponsorPhone) phonesToNotify.add(formatPhoneToE164(sponsorPhone));

      for (const phone of phonesToNotify) {
        try {
          await twilioClient.messages.create({
            body: smsBody,
            from: tFrom,
            to: phone
          });
          console.log(`[Notification] Invoice paid confirmation SMS sent to ${phone}`);
        } catch (e: any) {
          console.error(`[Notification] Failed to send SMS to ${phone}:`, e);
        }
      }
    }
  } catch (err) {
    console.error("[Notification] Error inside sendInvoicePaymentGuestNotification:", err);
  }
}

async function updateGuestTollFreeAcceptIfNeeded(bookingData: any, activeDb: any) {
  try {
    const userId = bookingData.userId;
    if (!userId) {
      console.log("[TollFreeAccept] No userId associated with this booking data.");
      return;
    }

    const userRef = activeDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.log(`[TollFreeAccept] User document for ${userId} does not exist.`);
      return;
    }

    const userData = userSnap.data() || {};
    // "their 'TOLL-FREE-ACCEPT' is pending, update their 'TOLL-FREE-ACCEPT' status to 'ACCEPTED'"
    // Pending means u.tollFreeAccept is undefined, null, or false, or maybe string 'PENDING'
    const currentAccept = userData.tollFreeAccept;
    const isPending = currentAccept === undefined || currentAccept === null || currentAccept === false || String(currentAccept).toUpperCase() === 'PENDING';

    if (isPending) {
      console.log(`[TollFreeAccept] Guest ${userId}'s TOLL-FREE-ACCEPT is currently pending/not accepted. Updating to ACCEPTED (true).`);
      await userRef.update({
        tollFreeAccept: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[TollFreeAccept] Guest ${userId} tollFreeAccept set to true (ACCEPTED).`);
    } else {
      console.log(`[TollFreeAccept] Guest ${userId}'s TOLL-FREE-ACCEPT status is not pending (${currentAccept}). Skipping update.`);
    }
  } catch (err) {
    console.error("[TollFreeAccept] Error updating tollFreeAccept for guest:", err);
  }
}

function getCheckoutDeadline(checkOutDate: string): Date {
  const [year, month, day] = checkOutDate.split("-").map(Number);
  
  // Create a UTC date representation for 11:00 AM on that day
  const utcDate = new Date(Date.UTC(year, month - 1, day, 11, 0, 0));
  
  // Format that UTC date in "America/New_York" (EST/EDT) to find its local hour representation
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  });
  
  const formattedHour = parseInt(formatter.format(utcDate), 10);
  
  // The hour difference between 11:00 AM local target and the local representation of the UTC 11:00 AM
  const hourDiff = 11 - formattedHour;
  
  // Return the adjusted UTC date which corresponds exactly to 11:00 AM local Eastern time
  return new Date(utcDate.getTime() + hourDiff * 60 * 60 * 1000);
}

async function createInvoicePDF(booking: any, propertyName: string, priceDetails: any, lateFee: number, overdueHours: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      // Colors
      const primaryColor = '#4f46e5'; // Indigo
      const secondaryColor = '#1e293b'; // Slate 800
      const accentColor = '#64748b'; // Slate 500

      // Title & Header
      doc.fillColor(primaryColor).fontSize(22).font('Helvetica-Bold').text('Invoice & Final Statement', { align: 'right' });
      doc.fillColor(secondaryColor).fontSize(14).font('Helvetica-Bold').text('REALCal Bookings', 50, 50);
      doc.fontSize(9).font('Helvetica').fillColor(accentColor).text('Your Automated Luxury Stay Platform', 50, 68);
      
      doc.moveDown(2.5);

      // Horizontal separator line
      doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, 95).lineTo(545, 95).stroke();

      // Details Block
      const topInfoY = 110;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(secondaryColor).text('BILL TO:', 50, topInfoY);
      doc.font('Helvetica').fontSize(10).fillColor(secondaryColor).text(booking.guestName || 'Valued Guest', 50, topInfoY + 15);
      if (booking.guestEmail) {
        doc.fillColor(accentColor).text(booking.guestEmail, 50, topInfoY + 28);
      }
      if (booking.guestPhone) {
        doc.fillColor(accentColor).text(booking.guestPhone, 50, topInfoY + 41);
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor(secondaryColor).text('RESERVATION DETAILS:', 320, topInfoY);
      doc.font('Helvetica').fontSize(10).fillColor(secondaryColor).text(`Booking Ref: ${booking.bookingRef || 'N/A'}`, 320, topInfoY + 15);
      doc.text(`Property: ${propertyName}`, 320, topInfoY + 28);
      doc.text(`Check-In Date: ${booking.checkIn}`, 320, topInfoY + 41);
      doc.text(`Check-Out Date: ${booking.checkOut}`, 320, topInfoY + 54);
      if (booking.selectedBedrooms && booking.selectedBedrooms.length > 0) {
        const roomsStr = booking.selectedBedrooms.map((r: any) => `Room ${r.roomNumber}`).join(', ');
        doc.text(`Selected Room(s): ${roomsStr}`, 320, topInfoY + 67);
      }

      // Charges Table Header
      const tableY = 215;
      doc.rect(50, tableY, 495, 20).fill(primaryColor);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
      doc.text('Charge Description', 60, tableY + 6);
      doc.text('Details', 280, tableY + 6);
      doc.text('Charged Amount', 440, tableY + 6, { width: 100, align: 'right' });

      let currentY = tableY + 20;

      const drawRow = (desc: string, details: string, amount: string, isAccent: boolean = false) => {
        if (isAccent) {
          doc.rect(50, currentY, 495, 20).fill('#f8fafc');
        }
        doc.fillColor(secondaryColor).font('Helvetica').fontSize(9);
        doc.text(desc, 60, currentY + 6);
        doc.fillColor(accentColor).text(details, 280, currentY + 6);
        doc.fillColor(secondaryColor).font('Helvetica-Bold').text(amount, 440, currentY + 6, { width: 100, align: 'right' });
        doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, currentY + 20).lineTo(545, currentY + 20).stroke();
        currentY += 21;
      };

      // Base Cost
      const baseNightly = (priceDetails.baseTotal || 0);
      drawRow(
        'Base Room / Property Rental', 
        `${priceDetails.nights || 0} Night(s) Stay`, 
        `$${baseNightly.toFixed(2)}`,
        false
      );

      // Cleaning Fee
      drawRow(
        'Cleaning Service Fee', 
        'One-time sanitization service', 
        `$${(priceDetails.cleaningFee || 0).toFixed(2)}`,
        true
      );

      // Discount
      if (priceDetails.discount && priceDetails.discount > 0) {
        drawRow(
          'Long-term Stay Discount', 
          '10% off for weekly stay (7+ nights)', 
          `-$${(priceDetails.discount).toFixed(2)}`,
          false
        );
      }

      // Same day change fee if any
      if (priceDetails.sameDayModificationFee && priceDetails.sameDayModificationFee > 0) {
        drawRow(
          'Same-Day Change Surcharge', 
          'Booking change penalty', 
          `$${(priceDetails.sameDayModificationFee).toFixed(2)}`,
          true
        );
      }

      // Taxes
      drawRow(
        'Lodging Taxes & Fees', 
        'State tourism tax (12%)', 
        `$${(priceDetails.taxes || 0).toFixed(2)}`,
        false
      );

      // Late checkout fee
      if (lateFee > 0) {
        drawRow(
          'Late Check-out Surcharge', 
          `${overdueHours} hour(s) past 11:00 AM deadline`, 
          `$${(lateFee / 100).toFixed(2)}`,
          true
        );
      }

      // Grand Total Card
      const grandTotalVal = (priceDetails.grandTotal || 0) + (lateFee / 100);
      currentY += 10;
      doc.rect(345, currentY, 200, 30).fill('#e0e7ff');
      doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(10).text('TOTAL PAID BILL:', 355, currentY + 11);
      doc.text(`$${grandTotalVal.toFixed(2)}`, 440, currentY + 11, { width: 100, align: 'right' });

      // Footer
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(accentColor).text(
        'Thank you for your business. For any billing inquiries, contact payments@cashgroupproperties.com.',
        50,
        740,
        { align: 'center', width: 495 }
      );
      doc.font('Helvetica-Bold').fillColor(primaryColor).text(
        'Your security and comfort is our highest priority.',
        50,
        755,
        { align: 'center', width: 495 }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  const isProd = process.env.NODE_ENV === "production";
  const rootDir = process.cwd();
  const distPath = path.resolve(rootDir, "dist");
  console.log(`[Server] Starting in ${isProd ? "production" : "development"} mode.`);
  console.log(`[Server] Root: ${rootDir}, Dist: ${distPath}`);

  // Base Middlewares
  app.use('/api', cors()); // Only apply CORS to API routes to avoid collisions with static assets or infrastructure
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    next();
  });

  // API Logging
  app.use((req, res, next) => {
    console.log(`[Server] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    if (req.path.startsWith('/api')) {
      console.log(`[API Request] Found API path: ${req.path}`);
    }
    next();
  });

  // Check Secrets
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripePublishable = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  
  // Debug logging - explicitly checking for presence without leaking keys
  console.log(`[Server] --- Environment Check ---`);
  console.log(`[Server] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[Server] STRIPE_SECRET_KEY: ${stripeKey ? (stripeKey.startsWith('sk_test') ? 'Present (Test Key)' : 'Present (Live Key?)') : 'MISSING'}`);
  console.log(`[Server] VITE_STRIPE_PUBLISHABLE_KEY: ${stripePublishable ? 'Present' : 'MISSING'}`);
  console.log(`[Server] --------------------------`);

  app.get("/server-debug", (req, res) => {
    res.json({
      message: "Server is alive",
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        PWD: process.cwd()
      },
      routes: app._router.stack
        .filter((r: any) => r.route)
        .map((r: any) => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`)
    });
  });

  app.get("/api/bookings/:id/invoice.pdf", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).send("Booking ID is required.");
      }
      if (!db) {
        return res.status(500).send("Database not initialized.");
      }

      const bookingDoc = await db.collection("bookings").doc(id).get();
      if (!bookingDoc.exists) {
        return res.status(404).send("Booking not found.");
      }

      const booking = bookingDoc.data();
      if (!booking) {
        return res.status(404).send("No data found for this booking.");
      }

      const propertySnap = await db.collection("properties").doc(booking.propertyId).get();
      const propertyName = propertySnap.exists ? propertySnap.data().name : "Property";

      const settingsSnap = await db.collection("global_settings").doc("settings").get();
      const globalSettings = settingsSnap.exists ? settingsSnap.data() : null;

      const pricingRulesSnap = await db.collection("pricing_rules").where("propertyId", "==", booking.propertyId).get();
      const pricingRules = pricingRulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const rentalMode = (booking.selectedBedrooms && booking.selectedBedrooms.length > 0) ? 'room' : 'entire';

      const priceDetails = calculatePriceDetails(
        booking.checkIn,
        booking.checkOut,
        pricingRules,
        globalSettings,
        booking.selectedBedrooms || null,
        rentalMode,
        booking.sameDayModificationFee || 0,
        booking.dailySelections
      );

      const lateFee = booking.lateCheckoutFee || 0;
      const overdueHours = booking.overdueHours || 0;

      const pdfBuffer = await createInvoicePDF(booking, propertyName, priceDetails, lateFee, overdueHours);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Invoice-${booking.bookingRef || 'Booking'}.pdf"`);
      res.send(pdfBuffer);
    } catch (e: any) {
      console.error("[API] Failed to generate PDF:", e);
      res.status(500).send(`Error generating invoice PDF: ${e.message}`);
    }
  });

  app.get("/api/config", (req, res) => {
    console.log("[Server] HIT: /api/config");
    const publicEnv: Record<string, string> = {};
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VITE_') || key === 'STRIPE_SECRET_KEY') {
        // We don't return the secret key, just the publishable one
        if (key.startsWith('VITE_')) {
          publicEnv[key] = process.env[key] || '';
        }
      }
    });

    res.json({
      ...publicEnv,
      stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
      environment: process.env.NODE_ENV || 'development',
      hasStripeSecret: !!process.env.STRIPE_SECRET_KEY,
      timestamp: Date.now()
    });
  });

  app.get("/api/ping", (req, res) => {
    console.log("[API] Ping hit");
    res.json({ 
      pong: true, 
      version: "2.7", 
      env: process.env.NODE_ENV,
      time: Date.now() 
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      uptime: process.uptime(),
      envKeys: Object.keys(process.env)
    });
  });

  app.get("/api/debug-booking", async (req, res) => {
    try {
      // Load environment variables via Vite's loadEnv to match exactly how client gets secrets
      let viteEnv: any = {};
      try {
        const { loadEnv } = await import('vite');
        viteEnv = loadEnv('development', process.cwd(), '');
      } catch (e: any) {
        console.error("Failed to import/loadEnv from vite:", e.message);
      }

      // Merge viteEnv values into process.env to make them accessible
      Object.keys(viteEnv).forEach(key => {
        if (!process.env[key] && viteEnv[key]) {
          process.env[key] = viteEnv[key];
        }
      });

      const pathsToCheck = [
        path.resolve(process.cwd(), "firebase-applet-config.json"),
        path.resolve(process.cwd(), "../firebase-applet-config.json"),
        path.resolve(process.cwd(), "../../firebase-applet-config.json"),
        "/firebase-applet-config.json",
        "/app/firebase-applet-config.json",
        "/app/applet/firebase-applet-config.json"
      ];
      
      let foundPath = "";
      let foundContent: any = null;
      for (const p of pathsToCheck) {
        if (fs.existsSync(p)) {
          foundPath = p;
          foundContent = JSON.parse(fs.readFileSync(p, "utf-8"));
          break;
        }
      }

      // Check if we can initialize Firebase Admin using loaded environment variables
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
      const dbId = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || "(default)";

      if (!db) {
        if (foundContent) {
          console.log(`[Debug DB] Initializing Firestore dynamically using config file ${foundPath}`);
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: foundContent.projectId });
          }
          const fdbId = foundContent.firestoreDatabaseId || "(default)";
          db = getFirestore(admin.app(), fdbId);
        } else if (projectId) {
          console.log(`[Debug DB] Initializing Firestore dynamically using Env Project ID: ${projectId}, DB: ${dbId}`);
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId });
          }
          db = getFirestore(admin.app(), dbId);
        }
      }

      if (!db) {
        return res.status(500).json({
          error: "Firestore db is not initialized",
          checkedPaths: pathsToCheck,
          envKeys: Object.keys(process.env).filter(k => k.includes("FIREBASE") || k.includes("VITE")),
          viteEnvKeys: Object.keys(viteEnv).filter(k => k.includes("FIREBASE") || k.includes("VITE")),
          processCwd: process.cwd(),
          parentDirs: fs.existsSync("../") ? fs.readdirSync("../") : null
        });
      }

      const bookingsSnap = await db.collection("bookings").get();
      const docs = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const queryRef = (req.query.ref as string || "HLFA1L").toUpperCase();
      const matches = docs.filter((b: any) => 
        b.bookingRef === queryRef || 
        b.id === queryRef || 
        (b.bookingRef && b.bookingRef.toUpperCase().includes(queryRef)) ||
        (b.bookingRef && b.bookingRef.toUpperCase().includes("RU7JNH"))
      );
      
      const settingsSnap = await db.collection("global_settings").doc("settings").get();
      const settings = settingsSnap.exists ? settingsSnap.data() : null;
      
      res.json({
        totalBookings: docs.length,
        matches,
        settings,
        foundPath,
        foundProjectId: foundContent?.projectId,
        projectIdUsed: projectId,
        dbIdUsed: dbId,
        firstFewBookings: docs.slice(0, 10).map((b: any) => ({
          id: b.id,
          bookingRef: b.bookingRef,
          guestName: b.guestName,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          checkedOut: b.checkedOut,
          status: b.status,
          lateCheckoutFee: b.lateCheckoutFee
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  app.post("/api/send-sms", async (req, res) => {
    console.log("[API] Send SMS hit");
    try {
      const { to, message } = req.body;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioSid || !twilioToken || !from) {
        return res.status(400).json({ error: "Twilio credentials not configured in secrets." });
      }

      if (twilioSid.includes('PROVIDE_REAL')) {
         return res.status(400).json({ error: "Please update the Twilio SID in your Settings -> Secrets." });
      }

      if (!to) {
        return res.status(400).json({ error: "Recipient phone number is required." });
      }

      const twilioPkg = await import('twilio');
      const twilio = twilioPkg.default || twilioPkg;
      const client = (twilio as any)(twilioSid, twilioToken);
      
      const formattedTo = formatPhoneToE164(to);
      const result = await client.messages.create({
        body: message,
        from: from,
        to: formattedTo
      });
      
      console.log("[API] SMS Success to", formattedTo, ":", result.sid);
      res.json({ success: true, sid: result.sid });
    } catch (err: any) {
      console.error("[API] SMS Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/test-sms", async (req, res) => {
    console.log("[API] Test SMS hit");
    try {
      const { to, message } = req.body;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioSid || !twilioToken || !from) {
        return res.status(400).json({ error: "Twilio credentials not configured in secrets." });
      }

      if (twilioSid.includes('PROVIDE_REAL')) {
         return res.status(400).json({ error: "Please update the Twilio SID in your Settings -> Secrets." });
      }

      const twilioPkg = await import('twilio');
      const twilio = twilioPkg.default || twilioPkg;
      const client = (twilio as any)(twilioSid, twilioToken);
      
      const result = await client.messages.create({
        body: message || "Test from REALCal Bookings",
        from: from,
        to: formatPhoneToE164(to)
      });
      
      console.log("[API] SMS Success:", result.sid);
      res.json({ success: true, sid: result.sid });
    } catch (err: any) {
      console.error("[API] SMS Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/test-email", async (req, res) => {
    console.log("[API] Test Email hit");
    try {
      const { to, subject, message } = req.body;
      const smtpHost = process.env.SMTP_HOST;

      if (!smtpHost) {
        return res.status(400).json({ error: "SMTP_HOST environment variable is not configured on Render.com." });
      }

      const result = await sendSmtpEmail({
        to,
        subject: subject || "Test Email from REALCal Bookings",
        text: message || "Testing SMTP integration on REALCal Bookings!"
      });

      console.log("[API] Email Success:", result);
      res.json({ success: true, result });
    } catch (err: any) {
      console.error("[API] Email Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/send-invoice-email", async (req, res) => {
    console.log("[API] Send Invoice Email hit");
    try {
      const { to, subject, html, text } = req.body;
      const smtpHost = process.env.SMTP_HOST;

      if (!smtpHost) {
        return res.status(400).json({ error: "SMTP_HOST environment variable is not configured." });
      }

      if (!to) {
        return res.status(400).json({ error: "Sponsor email 'to' address is required." });
      }

      const result = await sendSmtpEmail({
        to,
        subject: subject || "Invoice from REALCal Bookings",
        text: text || "Please check the attached HTML email for details.",
        html: html
      });

      console.log("[API] Invoice Email Success:", result);
      res.json({ success: true, result });
    } catch (err: any) {
      console.error("[API] Invoice Email Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/checkin-booking", async (req, res) => {
    console.log("[API] Checkin Booking hit");
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required." });
      }

      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      const bookingDoc = await db.collection("bookings").doc(bookingId).get();
      if (!bookingDoc.exists) {
        return res.status(404).json({ error: "Booking not found." });
      }

      const booking = bookingDoc.data();
      if (!booking) {
        return res.status(404).json({ error: "No data in booking." });
      }

      if (booking.checkedIn) {
        return res.status(400).json({ error: "This reservation is already checked in." });
      }

      if (booking.status === 'cancelled') {
        return res.status(400).json({ error: "This reservation is cancelled, so you cannot check in." });
      }

      const propertySnap = await db.collection("properties").doc(booking.propertyId).get();
      const propertyName = propertySnap.exists ? propertySnap.data().name : "Property";

      const now = new Date();

      // Update the booking document in Firestore
      await db.collection("bookings").doc(bookingId).update({
        checkedIn: true,
        checkedInAt: now.toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[API] Booking ${bookingId} successfully checked in.`);

      // Prepare guest information
      let guestName = booking.guestName || "Guest";
      let guestEmail = booking.guestEmail;
      let guestPhone = formatPhoneToE164(booking.guestPhone);

      if (!guestEmail || !guestPhone) {
        try {
          const userRec = await admin.auth().getUser(booking.userId);
          if (!guestEmail) guestEmail = userRec.email;
          if (!guestName || guestName === "Guest") guestName = userRec.displayName || "Guest";
        } catch (err) {
          console.error("[API] Firebase Auth user retrieval failed during checkin:", err);
        }
      }

      // Setup Notification Services
      const useSmtpEmail = !!process.env.SMTP_HOST;

      let twilioClient = null;
      const tSid = process.env.TWILIO_ACCOUNT_SID;
      const tTok = process.env.TWILIO_AUTH_TOKEN;
      const tFrom = process.env.TWILIO_PHONE_NUMBER;
      
      if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
        try {
          const twilioPkg = await import('twilio');
          const twilio = twilioPkg.default || twilioPkg;
          twilioClient = (twilio as any)(tSid, tTok);
        } catch (e) {}
      }

      const checkinTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
      const checkinDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });

      let roomsInfo = "";
      if (booking.selectedBedrooms && booking.selectedBedrooms.length > 0) {
        roomsInfo = " (Room(s): " + booking.selectedBedrooms.map((r: any) => `${r.roomNumber}`).join(', ') + ")";
      } else if (booking.selectedBedroom) {
        roomsInfo = ` (Room: ${booking.selectedBedroom.roomNumber})`;
      }

      // Guest check-in confirmation message
      const guestMsg = `Hi ${guestName}, this is to confirm your electronic check-in was completed successfully for your stay at ${propertyName}${roomsInfo} on ${checkinDateStr} at ${checkinTimeStr}.\n\nYour digital keys and PIN are active. We hope you enjoy your stay!`;

      const results = [];

      if (useSmtpEmail && guestEmail) {
        try {
          await sendSmtpEmail({
            to: guestEmail,
            subject: `Welcome to ${propertyName}! (Checked in)`,
            text: guestMsg
          });
          results.push(`Guest check-in email sent to ${guestEmail}`);
        } catch (e: any) {
          results.push(`Guest check-in email failed: ${e.message}`);
        }
      }

      if (twilioClient && guestPhone && tFrom) {
        try {
          await twilioClient.messages.create({
            body: guestMsg,
            from: tFrom,
            to: guestPhone
          });
          results.push(`Guest check-in SMS sent to ${guestPhone}`);
        } catch (e: any) {
          results.push(`Guest check-in SMS failed: ${e.message}`);
        }
      }

      // Alert Property Managers
      const managerMsg = `ALERT: Guest ${guestName} has successfully checked into ${propertyName}${roomsInfo} on ${checkinDateStr} at ${checkinTimeStr}. The property/room is now occupied.`;

      try {
        const managersSnap = await db.collection("property_managers").where("enabled", "==", true).get();
        if (!managersSnap.empty) {
          for (const mDoc of managersSnap.docs) {
            const m = mDoc.data();
            if (useSmtpEmail && m.email) {
              try {
                await sendSmtpEmail({
                  to: m.email,
                  subject: `Occupancy Alert: ${propertyName} Checked-in`,
                  text: managerMsg
                });
                results.push(`Manager email alert sent to ${m.email}`);
              } catch (e: any) {
                results.push(`Manager email alert failed for ${m.email}: ${e.message}`);
              }
            }
            if (twilioClient && m.phone && tFrom) {
              try {
                await twilioClient.messages.create({
                  body: managerMsg,
                  from: tFrom,
                  to: m.phone
                });
                results.push(`Manager SMS alert sent to ${m.phone}`);
              } catch (e: any) {
                results.push(`Manager SMS alert failed for ${m.phone}: ${e.message}`);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("[API] Manager checkin notifications failed:", err);
        results.push(`Manager notification query error: ${err.message}`);
      }

      res.json({
        success: true,
        checkedInAt: now.toISOString(),
        results
      });
    } catch (err: any) {
      console.error("[API] Checkin Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/checkout-booking", async (req, res) => {
    console.log("[API] Checkout Booking hit");
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required." });
      }

      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      const bookingDoc = await db.collection("bookings").doc(bookingId).get();
      if (!bookingDoc.exists) {
        return res.status(404).json({ error: "Booking not found." });
      }

      const booking = bookingDoc.data();
      if (!booking) {
        return res.status(404).json({ error: "No data in booking." });
      }

      if (booking.checkedOut) {
        return res.status(400).json({ error: "This reservation is already checked out." });
      }

      const propertySnap = await db.collection("properties").doc(booking.propertyId).get();
      const propertyName = propertySnap.exists ? propertySnap.data().name : "Property";

      const settingsSnap = await db.collection("global_settings").doc("settings").get();
      const globalSettings = settingsSnap.exists ? settingsSnap.data() : null;
      const lateCheckoutFeePercent = globalSettings && globalSettings.lateCheckoutFeePercent !== undefined 
        ? parseFloat(globalSettings.lateCheckoutFeePercent) 
        : 5.0; // default to 5% if not configured

      const deadline = getCheckoutDeadline(booking.checkOut);
      const now = new Date();
      let lateCheckoutFee = 0;
      let overdueHours = 0;
      let isLate = false;

      if (now > deadline) {
        isLate = true;
        const diffMs = now.getTime() - deadline.getTime();
        overdueHours = Math.ceil(diffMs / (1000 * 60 * 60));
        const rate = lateCheckoutFeePercent / 100;
        lateCheckoutFee = Math.round(overdueHours * booking.totalPrice * rate);
      }

      // Update the booking document in Firestore
      await db.collection("bookings").doc(bookingId).update({
        checkedOut: true,
        checkedOutAt: now.toISOString(),
        lateCheckoutFee: lateCheckoutFee,
        overdueHours: overdueHours,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[API] Booking ${bookingId} successfully checked out. Overdue: ${isLate} (${overdueHours} hours, fee: $${(lateCheckoutFee / 100).toFixed(2)})`);

      // Create or update auto-blackout for cleaning the day after ACTUAL checkout
      try {
        const actualCheckoutDate = new Date(now);
        const dayAfterDate = new Date(actualCheckoutDate);
        dayAfterDate.setDate(dayAfterDate.getDate() + 1);
        const blackoutDateString = dayAfterDate.toISOString().split('T')[0];

        const selectedBedrooms = booking.selectedBedrooms || [];
        const bookingRefCode = booking.bookingRef || '';

        if (selectedBedrooms.length > 0) {
          for (const room of selectedBedrooms) {
            const blackoutId = `maint-${bookingId}-${room.roomNumber}`;
            const boDoc = db.collection('blackout_dates').doc(blackoutId);
            const boSnap = await boDoc.get();
            if (boSnap.exists) {
              await boDoc.update({
                date: blackoutDateString,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } else {
              await boDoc.set({
                propertyId: booking.propertyId,
                date: blackoutDateString,
                targetType: 'room',
                roomNumber: room.roomNumber,
                reason: `Maintenance/Cleaning for Booking ${bookingRefCode} (Room ${room.roomNumber})`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          }
        } else {
          const blackoutId = `maint-${bookingId}`;
          const boDoc = db.collection('blackout_dates').doc(blackoutId);
          const boSnap = await boDoc.get();
          if (boSnap.exists) {
            await boDoc.update({
              date: blackoutDateString,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } else {
            await boDoc.set({
              propertyId: booking.propertyId,
              date: blackoutDateString,
              targetType: 'property',
              roomNumber: null,
              reason: `Maintenance/Cleaning for Booking ${bookingRefCode}`,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
        console.log(`[API] Updated checkout blackout(s) to day after actual checkout: ${blackoutDateString}`);
      } catch (blackoutErr) {
        console.warn("Failed to update blackout dates on checkout:", blackoutErr);
      }

      // Prepare guest information
      let guestName = booking.guestName || "Guest";
      let guestEmail = booking.guestEmail;
      let guestPhone = formatPhoneToE164(booking.guestPhone);

      if (!guestEmail || !guestPhone) {
        try {
          const userRec = await admin.auth().getUser(booking.userId);
          if (!guestEmail) guestEmail = userRec.email;
          if (!guestName || guestName === "Guest") guestName = userRec.displayName || "Guest";
        } catch (err) {
          console.error("[API] Firebase Auth user retrieval failed:", err);
        }
      }

      // Setup Notification Services
      const useSmtpEmail = !!process.env.SMTP_HOST;

      let twilioClient = null;
      const tSid = process.env.TWILIO_ACCOUNT_SID;
      const tTok = process.env.TWILIO_AUTH_TOKEN;
      const tFrom = process.env.TWILIO_PHONE_NUMBER;
      
      if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
        try {
          const twilioPkg = await import('twilio');
          const twilio = twilioPkg.default || twilioPkg;
          twilioClient = (twilio as any)(tSid, tTok);
        } catch (e) {}
      }

      const checkoutTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
      const checkoutDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      
      let priceDetailsObj: any = {};
      let pdfBuffer: Buffer | null = null;
      let invoiceUrl = "";

      try {
        const pricingRulesSnap = await db.collection("pricing_rules").where("propertyId", "==", booking.propertyId).get();
        const pricingRules = pricingRulesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

        const rentalMode = (booking.selectedBedrooms && booking.selectedBedrooms.length > 0) ? 'room' : 'entire';

        priceDetailsObj = calculatePriceDetails(
          booking.checkIn,
          booking.checkOut,
          pricingRules,
          globalSettings,
          booking.selectedBedrooms || null,
          rentalMode,
          booking.sameDayModificationFee || 0,
          booking.dailySelections
        );

        pdfBuffer = await createInvoicePDF(booking, propertyName, priceDetailsObj, lateCheckoutFee, overdueHours);

        const appUrl = `${req.protocol}://${req.get('host')}`;
        invoiceUrl = `${appUrl}/api/bookings/${bookingId}/invoice.pdf`;
      } catch (err: any) {
        console.error("[API] Error compiling invoice details or PDF during checkout:", err);
      }

      // Guest thank you message
      let guestMsg = `Hi ${guestName}, thank you so much for staying at ${propertyName}! This is to confirm your electronic check-out was completed successfully on ${checkoutDateStr} at ${checkoutTimeStr}.\n\nAn electronic PDF copy of your Final charges broken down line by line has been attached to your confirmation email.\n\nPlease remember to review your Final Bill by clicking on "View PDF Invoice" under your "My Bookings" section of the App.`;
      
      if (invoiceUrl) {
        guestMsg += `\n\nYou can also view & download your electronic invoice PDF here: ${invoiceUrl}`;
      }

      if (isLate && lateCheckoutFee > 0) {
        guestMsg += `\n\nNote: A late check-out fee of $${(lateCheckoutFee / 100).toFixed(2)} has been added to your Final bill for being ${overdueHours} hour(s) over the 11:00 AM checkout deadline on ${booking.checkOut}.`;
      }

      guestMsg += `\n\nWe appreciate you choosing REALCal Bookings and hope to host you again soon!`;

      const results = [];

      if (useSmtpEmail && guestEmail) {
        try {
          const emailAttachments = pdfBuffer ? [{
            filename: `Invoice-${booking.bookingRef || 'Booking'}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }] : undefined;

          await sendSmtpEmail({
            to: guestEmail,
            subject: `Thank you for staying at ${propertyName}! (Checked out)`,
            text: guestMsg,
            attachments: emailAttachments
          });
          results.push(`Guest thank-you email sent to ${guestEmail}`);
        } catch (e: any) {
          results.push(`Guest thank-you email failed: ${e.message}`);
        }
      }

      if (twilioClient && guestPhone && tFrom) {
        try {
          await twilioClient.messages.create({
            body: guestMsg,
            from: tFrom,
            to: guestPhone
          });
          results.push(`Guest thank-you SMS sent to ${guestPhone}`);
        } catch (e: any) {
          results.push(`Guest thank-you SMS failed: ${e.message}`);
        }
      }

      // Send Alerts to all Enabled Property Managers
      let roomsInfo = "";
      if (booking.selectedBedrooms && booking.selectedBedrooms.length > 0) {
        roomsInfo = " (Room(s): " + booking.selectedBedrooms.map((r: any) => `${r.roomNumber}`).join(', ') + ")";
      } else if (booking.selectedBedroom) {
        roomsInfo = ` (Room: ${booking.selectedBedroom.roomNumber})`;
      }

      const managerMsg = `ALERT: Guest ${guestName} has checked out of ${propertyName}${roomsInfo} on ${checkoutDateStr} at ${checkoutTimeStr}. The property and its room(s) are now ready for Cleaning/Maintenance.`;

      try {
        const managersSnap = await db.collection("property_managers").where("enabled", "==", true).get();
        if (!managersSnap.empty) {
          for (const mDoc of managersSnap.docs) {
            const m = mDoc.data();
            if (useSmtpEmail && m.email) {
              try {
                await sendSmtpEmail({
                  to: m.email,
                  subject: `Cleaning Alert: ${propertyName} Checked-out`,
                  text: managerMsg
                });
                results.push(`Manager email alert sent to ${m.email}`);
              } catch (e: any) {
                results.push(`Manager email alert failed for ${m.email}: ${e.message}`);
              }
            }
            if (twilioClient && m.phone && tFrom) {
              try {
                await twilioClient.messages.create({
                  body: managerMsg,
                  from: tFrom,
                  to: m.phone
                });
                results.push(`Manager SMS alert sent to ${m.phone}`);
              } catch (e: any) {
                results.push(`Manager SMS alert failed for ${m.phone}: ${e.message}`);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("[API] Manager notifications failed:", err);
        results.push(`Manager notification query error: ${err.message}`);
      }

      res.json({
        success: true,
        checkedOutAt: now.toISOString(),
        lateCheckoutFee,
        overdueHours,
        results
      });
    } catch (err: any) {
      console.error("[API] Checkout Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/provision-lock", async (req, res) => {
    try {
      const { checkIn, checkOut, name } = req.body;
      const seamApiKey = process.env.SEAM_API_KEY;
      const deviceId = process.env.YALE_DEVICE_ID;

      if (!seamApiKey || !deviceId || seamApiKey === "seam_test_...") {
         const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
         return res.json({ accessCode: randomPin });
      }

      const { Seam } = await import("seam");
      const seam = new Seam({ apiKey: seamApiKey });
      const createdAccessCode = await seam.accessCodes.create({
        device_id: deviceId,
        name: `Guest: ${name || 'Guest'}`,
        starts_at: checkIn,
        ends_at: checkOut
      });
      res.json({ accessCode: createdAccessCode.code });
    } catch (e: any) {
      console.error("Lock provisioning error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-booking-checkout-session", async (req, res) => {
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required." });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      const isStripeMissing = !key || key === "sk_test_..." || key.trim() === "";

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          activeDb = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database (Firestore) is not initialized on the server." });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const bookingData = bookingDoc.data() || {};
      const amountInCents = bookingData.totalPrice || Math.round((bookingData.priceDetails?.grandTotal || 0) * 100);

      // Fetch property details to display name/description
      const propertyId = bookingData.propertyId;
      const propSnap = await activeDb.collection('properties').doc(propertyId).get();
      const propertyName = propSnap.exists ? propSnap.data().name : "Lodging Property";

      const referer = req.headers.referer || "";
      let hostUrl = referer;
      if (referer) {
         try {
           const parsed = new URL(referer);
           hostUrl = parsed.origin;
         } catch {
           hostUrl = `${req.protocol}://${req.get('host')}`;
         }
      } else {
        hostUrl = `${req.protocol}://${req.get('host')}`;
      }
      
      if (!hostUrl.endsWith('/')) {
         hostUrl = hostUrl + '/';
      }

      if (isStripeMissing) {
        console.log(`[Server] Stripe keys are not configured. Returning mock checkout URL for booking ID ${bookingId}`);
        return res.json({ url: `${hostUrl}confirmation?bookingId=${bookingId}&status=paid&type=booking`, isMock: true });
      }

      const stripe = new Stripe(key);

      console.log(`[Server] Creating checkout session for booking ID ${bookingId} with amount ${amountInCents} cents`);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Lodging Reservation at ${propertyName}`,
                description: `Stay from ${bookingData.checkIn} to ${bookingData.checkOut}`,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${hostUrl}confirmation?bookingId=${bookingId}&status=paid&type=booking`,
        cancel_url: `${hostUrl}checkout`,
        customer_email: bookingData.guestEmail || undefined,
        metadata: {
          bookingId: bookingId,
          propertyId: propertyId,
          guestName: bookingData.guestName || '',
          guestEmail: bookingData.guestEmail || '',
          guestPhone: bookingData.guestPhone || '',
        }
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Error creating booking checkout session:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-modification-checkout-session", async (req, res) => {
    try {
      const { bookingId, checkIn, checkOut, amount, priceDetails, selectedBedrooms, rentalMode } = req.body;
      if (!bookingId || !checkIn || !checkOut || !amount) {
        return res.status(400).json({ error: "Missing required modification details." });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      const isStripeMissing = !key || key === "sk_test_..." || key.trim() === "";

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          activeDb = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database not initialized" });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();
      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const bookingData = bookingDoc.data() || {};
      const propertyId = bookingData.propertyId;
      const propSnap = await activeDb.collection('properties').doc(propertyId).get();
      const propertyName = propSnap.exists ? propSnap.data().name : "Lodging Property";

      const referer = req.headers.referer || "";
      let hostUrl = referer;
      if (referer) {
         try {
           const parsed = new URL(referer);
           hostUrl = parsed.origin;
         } catch {
           hostUrl = `${req.protocol}://${req.get('host')}`;
         }
      } else {
        hostUrl = `${req.protocol}://${req.get('host')}`;
      }
      
      if (!hostUrl.endsWith('/')) {
         hostUrl = hostUrl + '/';
      }

      const successUrl = `${hostUrl}my-bookings?checkout=success&bookingId=${bookingId}&newCheckIn=${checkIn}&newCheckOut=${checkOut}&amount=${amount}&priceDetails=${encodeURIComponent(JSON.stringify(priceDetails))}&selectedBedrooms=${encodeURIComponent(JSON.stringify(selectedBedrooms))}&rentalMode=${rentalMode}`;

      if (isStripeMissing) {
        console.log(`[Server] Stripe keys are not configured. Returning mock checkout URL for booking modification ID ${bookingId}`);
        return res.json({ url: successUrl, isMock: true });
      }

      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Reservation Modification at ${propertyName}`,
                description: `Stay modified to: ${checkIn} to ${checkOut}`,
              },
              unit_amount: Math.round(amount),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: `${hostUrl}my-bookings`,
        customer_email: bookingData.guestEmail || undefined,
        metadata: {
          bookingId: bookingId,
          type: 'modification_charge',
          checkIn,
          checkOut,
          amount: String(amount)
        }
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Error creating modification checkout session:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-renewal-checkout-session", async (req, res) => {
    try {
      const { bookingId, newCheckIn, newCheckOut, stayDays, renewalGrandTotal } = req.body;
      if (!bookingId || !newCheckIn || !newCheckOut || !renewalGrandTotal) {
        return res.status(400).json({ error: "Missing required renewal details." });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      const isStripeMissing = !key || key === "sk_test_..." || key.trim() === "";

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          activeDb = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database not initialized" });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();
      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const bookingData = bookingDoc.data() || {};
      const propertyId = bookingData.propertyId;
      const propSnap = await activeDb.collection('properties').doc(propertyId).get();
      const propertyName = propSnap.exists ? propSnap.data().name : "Lodging Property";

      const referer = req.headers.referer || "";
      let hostUrl = referer;
      if (referer) {
         try {
           const parsed = new URL(referer);
           hostUrl = parsed.origin;
         } catch {
           hostUrl = `${req.protocol}://${req.get('host')}`;
         }
      } else {
        hostUrl = `${req.protocol}://${req.get('host')}`;
      }
      
      if (!hostUrl.endsWith('/')) {
         hostUrl = hostUrl + '/';
      }

      const successUrl = `${hostUrl}my-bookings?checkout=renewal_success&bookingId=${bookingId}&newCheckIn=${newCheckIn}&newCheckOut=${newCheckOut}&amount=${renewalGrandTotal}&stayDays=${stayDays}`;

      if (isStripeMissing) {
        console.log(`[Server] Stripe keys are not configured. Returning mock checkout URL for renewal booking ID ${bookingId}`);
        return res.json({ url: successUrl, isMock: true });
      }

      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${stayDays}-Day Stay Renewal at ${propertyName}`,
                description: `Stay extension from ${newCheckIn} to ${newCheckOut}`,
              },
              unit_amount: Math.round(Number(renewalGrandTotal) * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: `${hostUrl}my-bookings`,
        customer_email: bookingData.guestEmail || undefined,
        metadata: {
          bookingId: bookingId,
          type: 'renewal_charge',
          newCheckIn,
          newCheckOut,
          stayDays: String(stayDays),
          amount: String(renewalGrandTotal)
        }
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Error creating renewal checkout session:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/complete-booking-checkout", async (req, res) => {
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required." });
      }

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          activeDb = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database not initialized" });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const booking = bookingDoc.data() || {};
      
      // If booking is already confirmed/pending and has access code, we can just return success
      if ((booking.status === 'confirmed' || booking.status === 'pending') && booking.accessCode) {
        return res.json({ 
          success: true, 
          booking, 
          accessCode: booking.accessCode || '', 
          bookingRef: booking.bookingRef || '' 
        });
      }

      // Provision smart lock access code if it does not exist
      let accessCode = booking.accessCode || '';
      if (!accessCode) {
        const seamApiKey = process.env.SEAM_API_KEY;
        const deviceId = process.env.YALE_DEVICE_ID;

        if (!seamApiKey || !deviceId || seamApiKey === "seam_test_...") {
          accessCode = Math.floor(1000 + Math.random() * 9000).toString();
        } else {
          try {
            const { Seam } = await import("seam");
            const seam = new Seam({ apiKey: seamApiKey });
            const createdAccessCode = await seam.accessCodes.create({
              device_id: deviceId,
              name: `Guest: ${booking.guestName || 'Guest'}`,
              starts_at: `${booking.checkIn}T15:00:00`,
              ends_at: `${booking.checkOut}T11:00:00`
            });
            accessCode = createdAccessCode.code || '';
          } catch (lockErr: any) {
            console.error("Lock provisioning error during complete-booking-checkout:", lockErr);
            accessCode = Math.floor(1000 + Math.random() * 9000).toString();
          }
        }
      }

      // Read isTestProperty from property to decide the status
      const propSnap = await activeDb.collection('properties').doc(booking.propertyId).get();
      const isTestProperty = propSnap.exists ? !!propSnap.data().isTestProperty : false;
      const finalStatus = isTestProperty ? 'confirmed' : 'pending';

      const updatePayload: any = {
        status: finalStatus,
        accessCode: accessCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Create auto-blackout for cleaning the day after checkout
      try {
        const checkOutDate = new Date(booking.checkOut);
        const dayAfterDate = new Date(checkOutDate);
        dayAfterDate.setDate(dayAfterDate.getDate() + 1);
        const blackoutDateString = dayAfterDate.toISOString().split('T')[0];
        
        const selectedBedrooms = booking.selectedBedrooms || [];
        const bookingRefCode = booking.bookingRef || '';

        if (selectedBedrooms.length > 0) {
          for (const room of selectedBedrooms) {
            const blackoutId = `maint-${bookingId}-${room.roomNumber}`;
            await activeDb.collection('blackout_dates').doc(blackoutId).set({
              propertyId: booking.propertyId,
              date: blackoutDateString,
              targetType: 'room',
              roomNumber: room.roomNumber,
              reason: `Maintenance/Cleaning for Booking ${bookingRefCode} (Room ${room.roomNumber})`,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } else {
          await activeDb.collection('blackout_dates').doc(`maint-${bookingId}`).set({
            propertyId: booking.propertyId,
            date: blackoutDateString,
            targetType: 'property',
            roomNumber: null,
            reason: `Maintenance/Cleaning for Booking ${bookingRefCode}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        console.log(`[Server] Auto-blackout(s) created for checkout day after: ${blackoutDateString}`);
      } catch (blackoutErr) {
        console.warn("Failed to create auto-blackout on server complete-booking-checkout:", blackoutErr);
      }

      // Update the booking document in Firestore
      await bookingRef.update(updatePayload);
      const updatedBooking = { ...booking, ...updatePayload };

      res.json({
        success: true,
        booking: updatedBooking,
        accessCode: accessCode,
        bookingRef: booking.bookingRef || ''
      });
    } catch (e: any) {
      console.error("Error in complete-booking-checkout:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-invoice-checkout-session", async (req, res) => {
    try {
      const { bookingId, amount, invoiceNumber, guestName, propertyName, checkIn, checkOut, sponsorEmail } = req.body;
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key === "sk_test_...") {
        return res.status(400).json({ error: "STRIPE_SECRET_KEY is not configured." });
      }

      const stripe = new Stripe(key);
      const referer = req.headers.referer || "";
      let hostUrl = referer;
      if (referer) {
         try {
           const parsed = new URL(referer);
           hostUrl = parsed.origin;
         } catch {
           hostUrl = `${req.protocol}://${req.get('host')}`;
         }
      } else {
        hostUrl = `${req.protocol}://${req.get('host')}`;
      }
      
      if (!hostUrl.endsWith('/')) {
         hostUrl = hostUrl + '/';
      }

      console.log(`[Server] Creating checkout session for invoice #${invoiceNumber || 'Manual'} with origin URL: ${hostUrl}`);

      if (bookingId && db) {
        try {
          await db.collection("bookings").doc(bookingId).update({
            agreedToHouseRules: true,
            agreedToBookingAgreement: true,
            agreementsAcceptedAt: new Date().toISOString()
          });
          console.log(`[Server] Updated agreements accepted status for booking ${bookingId}`);
        } catch (err: any) {
          console.warn(`[Server] Could not update agreements on booking ${bookingId}:`, err.message);
        }
      }
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Invoice #${invoiceNumber || 'Manual'} - Lodging Coverage`,
                description: `Sponsor payment for guest ${guestName || 'Guest'} at ${propertyName || 'Property'} (${checkIn || ''} to ${checkOut || ''})`,
              },
              unit_amount: Math.round(Number(amount) * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${hostUrl}confirmation?bookingId=${bookingId || 'manual'}&status=paid`,
        cancel_url: `${hostUrl}`,
        customer_email: sponsorEmail || undefined,
        metadata: {
          bookingId: bookingId || '',
          invoiceNumber: invoiceNumber || '',
          sponsorEmail: sponsorEmail || '',
        }
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (e: any) {
      console.error("Error creating invoice checkout session:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sync-invoice-stripe-status", async (req, res) => {
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required" });
      }

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
          activeDb = getFirestore(admin.app(), dbId);
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database not initialized" });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const data = bookingDoc.data() || {};
      const invoiceDetails = data.invoiceDetails || {};

      if (!invoiceDetails.stripeSessionId) {
        return res.status(400).json({ error: "This invoice does not have a Stripe checkout session ID for automated syncing." });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key === "sk_test_...") {
        return res.status(400).json({ error: "STRIPE_SECRET_KEY is not configured." });
      }

      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.retrieve(invoiceDetails.stripeSessionId);

      const isPaid = session.payment_status === "paid" || session.status === "complete";
      
      if (isPaid && !invoiceDetails.paid) {
        invoiceDetails.paid = true;
        invoiceDetails.paidAt = new Date().toISOString();
        
        await bookingRef.update({
          invoiceDetails,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Trigger notification to enabled Admins and the Guest
        const updatedBookingData = { ...data, invoiceDetails };
        await sendInvoicePaymentAdminNotification(bookingId, updatedBookingData, activeDb);
        await sendInvoicePaymentGuestNotification(bookingId, updatedBookingData, activeDb);
        await updateGuestTollFreeAcceptIfNeeded(updatedBookingData, activeDb);
        
        return res.json({ success: true, status: "paid", updated: true });
      }

      return res.json({ 
        success: true, 
        status: isPaid ? "paid" : "unpaid", 
        stripeStatus: session.status,
        stripePaymentStatus: session.payment_status,
        updated: false 
      });

    } catch (e: any) {
      console.error("Error syncing stripe invoice status on server:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/mark-invoice-paid", async (req, res) => {
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required" });
      }

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
          activeDb = getFirestore(admin.app(), dbId);
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database not initialized" });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const data = bookingDoc.data() || {};
      const invoiceDetails = data.invoiceDetails || {};

      const alreadyPaid = !!invoiceDetails.paid;

      invoiceDetails.paid = true;
      invoiceDetails.paidAt = new Date().toISOString();

      await bookingRef.update({
        invoiceDetails,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!alreadyPaid) {
        // Trigger notification to enabled Admins and the Guest
        const updatedBookingData = { ...data, invoiceDetails };
        await sendInvoicePaymentAdminNotification(bookingId, updatedBookingData, activeDb);
        await sendInvoicePaymentGuestNotification(bookingId, updatedBookingData, activeDb);
        await updateGuestTollFreeAcceptIfNeeded(updatedBookingData, activeDb);
      }

      console.log(`[Server] Marked invoice for booking ${bookingId} as paid successfully.`);
      res.json({ success: true });
    } catch (e: any) {
      console.error("Error setting invoice to paid on server:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/resend-invoice-confirmation", async (req, res) => {
    try {
      const { bookingId, notifyAdmins, notifyGuest } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required" });
      }

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId });
          }
          const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
          activeDb = getFirestore(admin.app(), dbId);
        }
      }

      if (!activeDb) {
        return res.status(500).json({ error: "Database not initialized" });
      }

      const bookingRef = activeDb.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const data = bookingDoc.data() || {};
      const invoiceDetails = data.invoiceDetails || {};

      if (!invoiceDetails.paid) {
        return res.status(400).json({ error: "Cannot resend payment confirmation for an unpaid invoice." });
      }

      let sentToAdmins = false;
      let sentToGuest = false;

      if (notifyAdmins) {
        await sendInvoicePaymentAdminNotification(bookingId, data, activeDb);
        sentToAdmins = true;
      }

      if (notifyGuest) {
        await sendInvoicePaymentGuestNotification(bookingId, data, activeDb);
        sentToGuest = true;
      }

      res.json({ success: true, sentToAdmins, sentToGuest });
    } catch (e: any) {
      console.error("Error resending invoice confirmation notification:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { propertyId, checkIn, checkOut, selectedBedrooms, selectedBedroom, currency = "usd", metadata, amount, dailySelections } = req.body;
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key === "sk_test_...") {
        return res.status(400).json({ error: "STRIPE_SECRET_KEY is not configured." });
      }

      let amountInCents: number;

      if (amount && (typeof amount === 'number') && amount > 0) {
        // Direct amount provided (likely a modification/additional charge)
        amountInCents = Math.round(amount);
        console.log(`[Server] Using provided amount for PaymentIntent: ${amountInCents} cents`);
      } else {
        // Standard full booking calculation
        if (!propertyId || !checkIn || !checkOut) {
          return res.status(400).json({ error: "Missing required booking details (propertyId, checkIn, checkOut) and no custom amount provided." });
        }

        // Handle legacy selectedBedroom or new selectedBedrooms array
        const rooms = selectedBedrooms || (selectedBedroom ? [selectedBedroom] : []);
        const rentalMode = rooms.length > 0 ? 'room' : 'entire';

        // Late-initialization check for Firestore if it failed at startup
        if (!db) {
          console.log("[Server] db not initialized at startup, attempting late initialization...");
          try {
            const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
            const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
            
            if (fs.existsSync(configPath)) {
              const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              if (admin.apps.length === 0) {
                admin.initializeApp({ projectId: firebaseConfig.projectId });
              }
              db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
            } else if (serviceAccountJson) {
              if (admin.apps.length === 0) {
                const sa = JSON.parse(serviceAccountJson);
                admin.initializeApp({ credential: admin.credential.cert(sa) });
              }
              db = getFirestore(admin.app(), process.env.FIREBASE_DATABASE_ID || "(default)");
            } else if (process.env.FIREBASE_PROJECT_ID) {
              if (admin.apps.length === 0) {
                admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
              }
              db = getFirestore(admin.app(), process.env.FIREBASE_DATABASE_ID || "(default)");
            }
            
            if (db) console.log("[Server] Late Firestore initialization successful.");
          } catch (e) {
            console.error("[Server] Late Firestore initialization failed:", e);
          }
        }

        if (!db) {
          return res.status(500).json({ 
            error: "Database (Firestore) is not initialized on the server.",
            details: "This app requires a Firebase project to be set up. Please run 'Firebase Setup' in the app settings or check if firebase-applet-config.json exists."
          });
        }

        // 1. Fetch pricing rules and global settings from Firestore
        const rulesSnap = await db.collection('pricing_rules').where('propertyId', '==', propertyId).get();
        const pricingRules = rulesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const settingsSnap = await db.collection('global_settings').doc('settings').get();
        const globalSettings = settingsSnap.exists ? settingsSnap.data() : null;

        // 2. Calculate correct amount
        const priceDetails = calculatePriceDetails(checkIn, checkOut, pricingRules as any, globalSettings, rooms, rentalMode, 0, dailySelections);
        amountInCents = Math.round(priceDetails.grandTotal * 100);
      }

      console.log(`[Server] PaymentIntent creation: Property ${propertyId || 'Unknown'}, Amount ${amountInCents} cents`);

      const stripe = new Stripe(key);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        metadata: {
          ...metadata,
          propertyId,
          checkIn,
          checkOut,
          isModificationCharge: amount ? 'true' : 'false'
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
      console.error("Payment intent error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/refund-payment", async (req, res) => {
    try {
      const { paymentIntentId, amount } = req.body;
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key === "sk_test_...") {
        return res.status(400).json({ error: "STRIPE_SECRET_KEY is not configured." });
      }
      const stripe = new Stripe(key);
      
      // Issue a refund for the specified amount (in cents)
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount,
      });
      
      console.log(`[Server] Refund issued: ${refund.id} for PI: ${paymentIntentId} amount: ${amount}`);
      res.json({ success: true, refundId: refund.id });
    } catch (e: any) {
      console.error("Refund error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/submit-lease-request", async (req, res) => {
    try {
      const { propertyId, propertyNameOrRoom, startDate, endDate, tenantName, tenantEmail, tenantPhone } = req.body;
      
      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      // Check if there are any active manager emails to notify
      const managersSnap = await db.collection("property_managers").get();
      const managers = managersSnap.docs.map(doc => doc.data()).filter(m => m.enabled);
      const emailList = managers.map(m => m.email).filter(Boolean);
      
      console.log(`[Server] Lease request notification: Tenant ${tenantName} (${tenantEmail}), Property/Room: ${propertyNameOrRoom}`);
      
      if (emailList.length > 0 && process.env.SMTP_HOST) {
        const subject = `New Lease Request: ${propertyNameOrRoom}`;
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; color: #334155; line-height: 1.6;">
            <h2 style="color: #4f46e5; margin-bottom: 20px;">New Lease Request Submitted</h2>
            <p>A guest has submitted a lease request for a long-term or short-term booking. Please find the details below:</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 20px; border-radius: 4px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; width: 40%;">Entire Property/Room:</td>
                  <td style="padding: 6px 0;">${propertyNameOrRoom}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Lease Start Date:</td>
                  <td style="padding: 6px 0;">${startDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Lease End Date:</td>
                  <td style="padding: 6px 0;">${endDate}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Tenant Full Name:</td>
                  <td style="padding: 6px 0;">${tenantName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Tenant Email address:</td>
                  <td style="padding: 6px 0;"><a href="mailto:${tenantEmail}" style="color: #4f46e5; text-decoration: none;">${tenantEmail}</a></td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Tenant Phone number:</td>
                  <td style="padding: 6px 0;">${tenantPhone || 'N/A'}</td>
                </tr>
              </table>
            </div>
            <p>To review and issue an official <strong>Lease Code #</strong>, please open the <strong>Admin Dashboard</strong> inside your REALCal Bookings app, under the "Lease Requests" tab.</p>
            <p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">This email was automatically dispatched by REALCal Bookings Engine.</p>
          </div>
        `;
        
        await sendSmtpEmail({
          to: emailList.join(", "),
          subject,
          text: `New Lease Request for ${propertyNameOrRoom} by ${tenantName}. Review details in the Admin Dashboard.`,
          html
        });
      } else {
        console.log("[Server] No active manager emails or SMTP_HOST not configured. Skipped sending email, but request successfully stored in Firestore.");
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("[Server] Error in submit-lease-request:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/approve-lease", async (req, res) => {
    try {
      const { requestId, leaseCode, propertyId, propertyNameOrRoom, startDate, endDate, tenantName, tenantEmail, tenantPhone } = req.body;
      
      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      // Calculate isLongTerm / bookingType based on dates
      let bookingType = "short-term";
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 180) {
          bookingType = "long-term";
        }
      }

      // Create/over-write the validated Lease Code database record
      await db.collection("leases").doc(leaseCode).set({
        leaseCode,
        propertyId,
        propertyNameOrRoom,
        startDate,
        endDate,
        tenantName,
        tenantEmail,
        tenantPhone: tenantPhone || "",
        status: "approved",
        bookingType,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update the status of the request if available
      if (requestId) {
        await db.collection("lease_requests").doc(requestId).update({
          status: "approved",
          approvedLeaseCode: leaseCode
        });
      }

      // Send the Lease with generated Lease Code to the Guest's email
      if (tenantEmail && process.env.SMTP_HOST) {
        const subject = `Your Lease Request has been Approved! Lease Code: ${leaseCode}`;
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; color: #334155; line-height: 1.6;">
            <h2 style="color: #10b981; margin-bottom: 20px;">Lease Approved!</h2>
            <p>Hello <strong>${tenantName}</strong>,</p>
            <p>Your lease request for <strong>${propertyNameOrRoom}</strong> spanning <strong>${startDate} to ${endDate}</strong> has been fully approved by the Property Management Team.</p>
            
            <p>To finalize and checkout your booking, please use your unique Lease Code # details provided below:</p>
            
            <div style="text-align: center; margin: 30px 0; background-color: #f0fdf4; border: 2px dashed #10b981; border-radius: 12px; padding: 25px;">
              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #059669; font-weight: bold; display: block; margin-bottom: 5px;">Your Unique Lease Code</span>
              <span style="font-size: 32px; font-family: monospace; font-weight: 900; color: #047857; letter-spacing: 2px;">${leaseCode}</span>
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ol style="padding-left: 20px; margin: 15px 0;">
              <li>Return to the REALCal booking application.</li>
              <li>Navigate to the property and pick your approved dates: <strong>${startDate}</strong> to <strong>${endDate}</strong>.</li>
              <li>Input your code <strong>${leaseCode}</strong> in the Lease Code Verification section.</li>
              <li>Once successfully verified, Click <strong>"Proceed to Checkout"</strong>.</li>
            </ol>
            
            <p style="margin-top: 30px;">Thank you for booking with us!</p>
            <p>Warmest regards,<br /><strong>REALCal Property Managers</strong></p>
            
            <p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">This email was automatically dispatched by REALCal Bookings Engine.</p>
          </div>
        `;

        await sendSmtpEmail({
          to: tenantEmail,
          subject,
          text: `Your lease request is approved! Use Lease Code: ${leaseCode} to book ${propertyNameOrRoom}.`,
          html
        });
      } else {
        console.log("[Server] Lease Code approved silently in Firestore. (Either SMTP_HOST is not configured or guest email is omitted)");
      }

      // Send Twilio SMS Notification to Tenant if phone is configured
      if (tenantPhone) {
        let twilioClient = null;
        const tSid = process.env.TWILIO_ACCOUNT_SID;
        const tTok = process.env.TWILIO_AUTH_TOKEN;
        const tFrom = process.env.TWILIO_PHONE_NUMBER;

        if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
          try {
            const twilioPkg = await import('twilio');
            const twilio = twilioPkg.default || twilioPkg;
            twilioClient = (twilio as any)(tSid, tTok);
          } catch (e) {
            console.error("[Server] Error instantiating Twilio Client for lease approval SMS:", e);
          }
        }

        const formattedPhone = formatPhoneToE164(tenantPhone);

        if (twilioClient && formattedPhone && tFrom) {
          try {
            const smsBody = `Hi ${tenantName || 'Tenant'}, your lease request for ${propertyNameOrRoom || 'Property'} (${startDate} to ${endDate}) is approved!\n\nUse Lease Code: ${leaseCode} to book. Verify this code in the app to checkout.`;
            await twilioClient.messages.create({
              body: smsBody,
              from: tFrom,
              to: formattedPhone
            });
            console.log(`[Server] Lease approval SMS sent successfully to ${formattedPhone}`);
          } catch (err: any) {
            console.error("[Server] Error sending lease approval SMS via Twilio:", err);
          }
        } else {
          console.log("[Server] Twilio SMS notification skipped for lease approval. (Twilio not configured or phone formatted incorrectly)");
        }
      }

      res.json({ success: true, leaseCode });
    } catch (e: any) {
      console.error("[Server] Error in approve-lease:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/resend-lease-reminder", async (req, res) => {
    try {
      const { leaseId, leaseCode, tenantEmail, tenantName, propertyName, endDate, monthlyRent, invoiceNumber } = req.body;
      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      let leaseData: any = null;
      if (leaseId) {
        const snap = await db.collection("leases").doc(leaseId).get();
        if (snap.exists) {
          leaseData = snap.data();
        }
      }

      const email = tenantEmail || leaseData?.tenantEmail;
      const code = leaseCode || leaseData?.leaseCode || leaseId;
      const name = tenantName || leaseData?.tenantName || "Valued Guest";
      const prop = propertyName || leaseData?.propertyNameOrRoom || "Property";
      const termEnd = endDate || leaseData?.endDate || "End of Term";
      const rent = monthlyRent || leaseData?.monthlyRent || 0;
      const invNum = invoiceNumber || leaseData?.invoiceNumber || "Manual";

      if (!email) {
        return res.status(400).json({ error: "Tenant email address is required to send reminder." });
      }

      let paymentDueDate = "Day after end of lease";
      let reminderDate = "5 Days prior to end of lease";
      if (termEnd && termEnd.includes("-")) {
        const endDt = new Date(termEnd);
        if (!isNaN(endDt.getTime())) {
          const nextDay = new Date(endDt);
          nextDay.setDate(nextDay.getDate() + 1);
          paymentDueDate = nextDay.toISOString().split("T")[0];

          const remDay = new Date(endDt);
          remDay.setDate(remDay.getDate() - 5);
          reminderDate = remDay.toISOString().split("T")[0];
        }
      }

      const hostUrl = req.headers.origin || ("https://" + req.headers.host);
      const validationUrl = `${hostUrl}/my-bookings`;

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="background-color: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Month-to-Month Lease Renewal & Payment Reminder</h2>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p>Dear <strong>${name}</strong>,</p>
            <p>This is an official payment & renewal reminder for your Month-to-Month Lease Agreement <strong>#${code}</strong> (Invoice #${invNum}) for <strong>${prop}</strong>.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0;">📅 <strong>Current Lease Term End Date:</strong> ${termEnd}</p>
              <p style="margin: 4px 0;">⏰ <strong>Reminder Schedule Date:</strong> ${reminderDate} (5 Days Before End Date)</p>
              <p style="margin: 4px 0;">💳 <strong>Next Lease Payment Due Date:</strong> <span style="color: #4f46e5; font-weight: bold;">${paymentDueDate}</span> (Day After Term End)</p>
              ${rent ? `<p style="margin: 4px 0;">💰 <strong>Monthly Rent Amount:</strong> $${Number(rent).toFixed(2)}</p>` : ''}
            </div>

            <p><strong>Action Required - Validation & Payment:</strong></p>
            <p>Please log in to your REALCal Guest Portal to <strong>validate whether you wish to continue your lease for another month</strong> and remit your lease payment on or before <strong>${paymentDueDate}</strong>.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${validationUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                Validate Renewal & Pay Next Month Lease
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b;">If you do not intend to renew, please validate your move-out intention in your portal or notify property management immediately.</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
            REALCal Property Management System
          </div>
        </div>
      `;

      if (process.env.SMTP_HOST) {
        await sendSmtpEmail({
          to: email,
          subject: `[ACTION REQUIRED] Month-to-Month Lease Renewal & Payment Reminder #${code}`,
          html: htmlContent,
          text: `Reminder: Month-to-Month Lease #${code} for ${prop} ends on ${termEnd}. Next payment due on ${paymentDueDate}. Validate renewal at ${validationUrl}`
        });
      }

      if (leaseId) {
        await db.collection("leases").doc(leaseId).update({
          lastReminderSentAt: new Date().toISOString(),
          status: 'pending_renewal'
        });
      }

      return res.json({ success: true, message: `Lease payment reminder sent successfully to ${email}` });
    } catch (err: any) {
      console.error("Error resending lease reminder:", err);
      return res.status(500).json({ error: err.message || "Failed to resend lease payment reminder." });
    }
  });

  app.post("/api/create-manual-lease", async (req, res) => {
    try {
      const { leaseCode, invoiceNumber, bookingId, propertyId, propertyNameOrRoom, startDate, endDate, tenantName, tenantEmail, tenantPhone, leaseType, monthlyRent } = req.body;
      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      if (!leaseCode) {
        return res.status(400).json({ error: "Lease code is required." });
      }

      const leaseData = {
        leaseCode,
        invoiceNumber: invoiceNumber || 'Manual',
        bookingId: bookingId || null,
        propertyId: propertyId || '',
        propertyNameOrRoom: propertyNameOrRoom || 'Property',
        startDate: startDate || '',
        endDate: endDate || '',
        tenantName: tenantName || 'Guest',
        tenantEmail: tenantEmail || '',
        tenantPhone: tenantPhone || '',
        leaseType: leaseType || 'month_to_month',
        monthlyRent: monthlyRent ? parseFloat(monthlyRent) : 0,
        status: 'approved',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("leases").doc(leaseCode).set(leaseData);

      if (bookingId) {
        try {
          await db.collection("bookings").doc(bookingId).update({
            leaseCode,
            leaseType: leaseType || 'month_to_month'
          });
        } catch (bErr) {
          console.warn("Could not update linked booking with leaseCode:", bErr);
        }
      }

      return res.json({ success: true, leaseCode, message: "Manual lease created successfully." });
    } catch (err: any) {
      console.error("Error in create-manual-lease API:", err);
      return res.status(500).json({ error: err.message || "Failed to create manual lease." });
    }
  });

  app.post("/api/update-lease-type", async (req, res) => {
    try {
      const { leaseId, leaseType } = req.body;
      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      if (!leaseId || !leaseType) {
        return res.status(400).json({ error: "leaseId and leaseType are required." });
      }

      await db.collection("leases").doc(leaseId).update({
        leaseType
      });

      return res.json({ success: true, message: `Lease type updated to ${leaseType}` });
    } catch (err: any) {
      console.error("Error updating lease type:", err);
      return res.status(500).json({ error: err.message || "Failed to update lease type." });
    }
  });

  app.post("/api/delete-lease", async (req, res) => {
    try {
      const { leaseId } = req.body;
      if (!db) {
        return res.status(500).json({ error: "Firebase Firestore is not initialized on the server." });
      }

      if (!leaseId) {
        return res.status(400).json({ error: "leaseId is required." });
      }

      await db.collection("leases").doc(leaseId).delete();

      return res.json({ success: true, message: "Lease record deleted successfully." });
    } catch (err: any) {
      console.error("Error deleting lease:", err);
      return res.status(500).json({ error: err.message || "Failed to delete lease." });
    }
  });

  app.post("/api/notify-managers", async (req, res) => {
    try {
      const { managers, bookingDetails } = req.body;
      const { checkIn, checkOut, originalCheckIn, originalCheckOut, propertyName, totalAmount, guestName, guestEmail, guestPhone, isUpdate, isCancellation, cancellationFee, accessCode, selectedBedrooms } = bookingDetails;
      const formattedGuestPhone = formatPhoneToE164(guestPhone);
      
      let daysChangedText = "";
      if (isUpdate && originalCheckIn && originalCheckOut) {
        try {
          const origIn = new Date(originalCheckIn.split('T')[0] + 'T12:00:00');
          const origOut = new Date(originalCheckOut.split('T')[0] + 'T12:00:00');
          const origNights = Math.round((origOut.getTime() - origIn.getTime()) / (1000 * 60 * 60 * 24));

          const newIn = new Date(checkIn.split('T')[0] + 'T12:00:00');
          const newOut = new Date(checkOut.split('T')[0] + 'T12:00:00');
          const newNights = Math.round((newOut.getTime() - newIn.getTime()) / (1000 * 60 * 60 * 24));

          const diffNights = newNights - origNights;
          if (diffNights > 0) {
            daysChangedText = `Your reservation length was extended by ${diffNights} day(s).`;
          } else if (diffNights < 0) {
            daysChangedText = `Your reservation length was reduced by ${Math.abs(diffNights)} day(s).`;
          } else {
            daysChangedText = `Your reservation length is unchanged.`;
          }
        } catch (e: any) {
          console.warn("[Notifications] Error calculating nights diff:", e.message);
        }
      }

      const eventType = isCancellation ? 'Booking CANCELLED 🚨' : (isUpdate ? 'Booking Update' : 'New Booking');
      let roomsInfo = "";
      if (selectedBedrooms && selectedBedrooms.length > 0) {
        roomsInfo = "\nRooms: " + selectedBedrooms.map((r: any) => {
          let str = `Room ${r.roomNumber} (${r.type})`;
          if (r.roomLockNumber) str += ` [Lock #: ${r.roomLockNumber}]`;
          return str;
        }).join(', ');
      }
      
      let textMsg = "";
      if (isCancellation) {
        textMsg = `🚨 BOOKING CANCELLED ALERT 🚨\nProperty: ${propertyName}${roomsInfo}\nGuest: ${guestName}\nDates: ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })}\nStatus: This booking has been CANCELLED. The calendars/rooms have been released.`;
        if (cancellationFee !== undefined && cancellationFee > 0) {
          textMsg += `\nCancellation Fee Assessed: $${(cancellationFee / 100).toFixed(2)}`;
        }
      } else {
        textMsg = `${eventType} for ${propertyName}!${roomsInfo}\nGuest: ${guestName}\nDates: ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })}`;
        if (daysChangedText) {
          textMsg += `\nChange Details: ${daysChangedText}`;
        }
      }
      
      const results = [];
      const useSmtpEmail = !!process.env.SMTP_HOST;
      
      let twilioClient = null;
      const tSid = process.env.TWILIO_ACCOUNT_SID;
      const tTok = process.env.TWILIO_AUTH_TOKEN;
      const tFrom = process.env.TWILIO_PHONE_NUMBER;
      
      if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
        try {
          const twilioPkg = await import('twilio');
          const twilio = twilioPkg.default || twilioPkg;
          twilioClient = (twilio as any)(tSid, tTok);
        } catch (e) {}
      }

      for (const m of (managers || [])) {
        if (useSmtpEmail && m.email) {
          try {
            await sendSmtpEmail({
              to: m.email,
              subject: `${isCancellation ? 'Cancellation' : 'Booking'} Alert: ${propertyName}`,
              text: textMsg
            });
            results.push(`Email sent to ${m.email}`);
          } catch (e) { results.push(`Email failed: ${m.email}`); }
        }
        if (twilioClient && m.phone && tFrom) {
          try {
            await twilioClient.messages.create({ body: textMsg, from: tFrom, to: m.phone });
            results.push(`SMS sent to ${m.phone}`);
          } catch (e) { results.push(`SMS failed: ${m.phone}`); }
        }
      }
      
      // Guest confirmations
      const guestSubject = isCancellation ? `Cancellation Confirmed: ${propertyName}` : (isUpdate ? `Booking Update: ${propertyName}` : `Booking Confirmed: ${propertyName}`);
      const guestDisplayName = guestName || 'Guest';
      
      // Email Content (Single Email for multiple rooms)
      let emailText = "";
      if (isCancellation) {
        emailText = `Hi ${guestDisplayName},\n\nYour reservation for ${propertyName} from ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })} has been successfully cancelled.\n\n${cancellationFee && cancellationFee > 0 ? `Late Cancellation Fee Assessed: $${(cancellationFee / 100).toFixed(2)}` : 'No cancellation fees were assessed.'}\n\nThank you!`;
      } else {
        emailText = `Hi ${guestDisplayName},\n\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })} is ${isUpdate ? 'updated' : 'confirmed'}.`;
        if (daysChangedText) {
          emailText += `\n\nStay Details: ${daysChangedText}`;
        }
        
        if (selectedBedrooms && selectedBedrooms.length > 0) {
          emailText += `\n\nRoom Details:`;
          selectedBedrooms.forEach((r: any) => {
             emailText += `\n- ${r.type} Room ${r.roomNumber}`;
             if (r.roomLockNumber) emailText += ` (Lock #: ${r.roomLockNumber})`;
          });
        }
        
        if (accessCode) emailText += `\n\nYour master access code is: ${accessCode}`;
        emailText += `\n\nTo view a short animated video and instructions on how to enter the Property and/or Room via our YAMIRY Smart Lock, please go to your "My Bookings" section.`;
        emailText += `\n\nThank you!`;
      }

      if (useSmtpEmail && guestEmail) {
        try {
          await sendSmtpEmail({ to: guestEmail, subject: guestSubject, text: emailText });
          results.push(`Guest confirmation email sent`);
        } catch (e) { results.push(`Guest email failed`); }
      }

      // SMS Notifications (Multiple if multiple rooms with locks)
      if (twilioClient && formattedGuestPhone && tFrom) {
        try {
            if (isCancellation) {
                let cancelSmsText = `Hi ${guestDisplayName}, your reservation for ${propertyName} from ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })} has been cancelled.`;
                if (cancellationFee && cancellationFee > 0) {
                    cancelSmsText += ` A late cancellation fee of $${(cancellationFee / 100).toFixed(2)} was applied.`;
                }
                await twilioClient.messages.create({ body: cancelSmsText, from: tFrom, to: formattedGuestPhone });
                results.push(`Guest cancellation SMS sent`);
            } else if (selectedBedrooms && selectedBedrooms.length > 0) {
                // Send an SMS for each room that has a Lock number
                for (const room of selectedBedrooms) {
                    if (room.roomLockNumber) {
                        let roomSmsText = "";
                        if (isUpdate) {
                          roomSmsText = `Hi ${guestDisplayName}, your booking for ${propertyName} - ${room.type} Room ${room.roomNumber} has been updated. ${daysChangedText}\nAccess Code: ${accessCode || '123456'}\nLock #: ${room.roomLockNumber}\nGo to "My Bookings" to watch the animated video on how to open the door with the YAMIRY Smart Lock.`;
                        } else {
                          roomSmsText = `Hi ${guestDisplayName}, access for ${propertyName} - ${room.type} Room ${room.roomNumber} is confirmed.\nAccess Code: ${accessCode || '123456'}\nLock #: ${room.roomLockNumber}\nGo to "My Bookings" to watch the animated video on how to open the door with the YAMIRY Smart Lock.`;
                        }
                        await twilioClient.messages.create({ body: roomSmsText, from: tFrom, to: formattedGuestPhone });
                        results.push(`Guest SMS sent for Room ${room.roomNumber}`);
                    }
                }
            } else {
                // Default SMS for entire property
                let defaultSmsText = "";
                if (isUpdate) {
                  defaultSmsText = `Hi ${guestDisplayName},\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })} is updated. ${daysChangedText}`;
                } else {
                  defaultSmsText = `Hi ${guestDisplayName},\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString('en-US', { timeZone: 'UTC' })} to ${new Date(checkOut).toLocaleDateString('en-US', { timeZone: 'UTC' })} is confirmed.`;
                }
                if (accessCode) defaultSmsText += `\nAccess code: ${accessCode}`;
                defaultSmsText += `\nGo to "My Bookings" to review operating instructions and watch the short video on using the YAMIRY Smart Lock.`;
                await twilioClient.messages.create({ body: defaultSmsText, from: tFrom, to: formattedGuestPhone });
                results.push(`Guest confirmation SMS sent`);
            }
        } catch (e) { results.push(`Guest SMS failed: ${e.message}`); }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE / STATIC / FALLBACK ---

  if (isProd) {
    console.log(`[Server] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    
    app.get("/opt-in", (req, res) => {
      const optInPath = path.resolve(distPath, "opt-in.html");
      if (fs.existsSync(optInPath)) return res.sendFile(optInPath);
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    // In Dev Mode
    console.log("[Server] Mounting Vite middleware for development");
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  // Catch-all SPA fallback
  app.all("*", (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: "Endpoint not found", path: req.path });
    }
    
    if (isProd) {
      const indexPath = path.resolve(distPath, "index.html");
      return res.sendFile(indexPath, (err) => {
        if (err) res.status(500).send("Index.html missing.");
      });
    }
    
    res.status(404).send("Not Found");
  });

  // --- CHECK-OUT REMINDERS SCHEDULER SYSTEM ---
  async function checkAndSendCheckoutReminders() {
    if (!db) {
      console.log("[Reminders] Firestore is not initialized yet.");
      return;
    }
    try {
      const bookingsSnap = await db.collection("bookings").get();
      if (bookingsSnap.empty) {
        return;
      }

      const now = new Date();
      const useSmtpEmail = !!process.env.SMTP_HOST;

      let twilioClient = null;
      const tSid = process.env.TWILIO_ACCOUNT_SID;
      const tTok = process.env.TWILIO_AUTH_TOKEN;
      const tFrom = process.env.TWILIO_PHONE_NUMBER;
      
      if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL')) {
        try {
          const twilioPkg = await import('twilio');
          const twilio = twilioPkg.default || twilioPkg;
          twilioClient = (twilio as any)(tSid, tTok);
        } catch (e) {}
      }

      for (const doc of bookingsSnap.docs) {
        const b = doc.data();
        if (!b) continue;

        // Only remind for confirmed or pending bookings (not cancelled or pending_payment)
        if (b.status !== "confirmed" && b.status !== "pending") continue;

        // Only remind if checkoutRemindersEnabled is true (defaults to true if not set)
        const remindersEnabled = b.checkoutRemindersEnabled !== false;
        if (!remindersEnabled) continue;

        // Only check-out active/not checked out bookings
        if (b.checkedOut === true) continue;

        // Standard checkout deadline is 11:00 AM on the b.checkOut date
        if (!b.checkOut) continue;

        const checkoutDeadline = getCheckoutDeadline(b.checkOut);
        const diffMs = checkoutDeadline.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // Only care about upcoming checkouts in the future
        if (diffHours <= 0) continue;

        let guestName = b.guestName || "Guest";
        let guestEmail = b.guestEmail;
        let guestPhone = formatPhoneToE164(b.guestPhone);

        if (!guestEmail || !guestPhone) {
          try {
            const userRec = await admin.auth().getUser(b.userId);
            if (!guestEmail) guestEmail = userRec.email;
            if (!guestName || guestName === "Guest") guestName = userRec.displayName || "Guest";
          } catch (err) {
            console.error(`[Reminders] Failed to retrieve guest details for user ${b.userId}:`, err);
          }
        }

        // Fetch property details for property name
        let propertyName = "Property";
        try {
          const propSnap = await db.collection("properties").doc(b.propertyId).get();
          if (propSnap.exists) {
            propertyName = propSnap.data()?.name || "Property";
          }
        } catch (err) {}

        let roomsStr = "";
        if (b.selectedBedrooms && b.selectedBedrooms.length > 0) {
          roomsStr = " (Room(s): " + b.selectedBedrooms.map((r: any) => `${r.roomNumber}`).join(', ') + ")";
        } else if (b.selectedBedroom) {
          roomsStr = ` (Room: ${b.selectedBedroom.roomNumber})`;
        }

        // Determine due threshold
        let updateFields: any = {};
        let reminderReason = "";
        let hoursLeftStr = "";

        // 1-hour reminder: diffHours <= 1.05 and hasn't been sent yet
        if (diffHours <= 1.05 && diffHours > 0 && !b.sent1hReminder) {
          reminderReason = "1h";
          hoursLeftStr = "1 hour";
          updateFields.sent1hReminder = true;
        }
        // 2-hour reminder: diffHours <= 2.05 and hasn't been sent yet
        else if (diffHours <= 2.05 && diffHours > 1.05 && !b.sent2hReminder) {
          reminderReason = "2h";
          hoursLeftStr = "2 hours";
          updateFields.sent2hReminder = true;
        }
        // 12-hour reminder: diffHours <= 12.05 and hasn't been sent yet
        else if (diffHours <= 12.05 && diffHours > 2.05 && !b.sent12hReminder) {
          reminderReason = "12h";
          hoursLeftStr = "12 hours";
          updateFields.sent12hReminder = true;
        }

        if (reminderReason && (guestEmail || guestPhone)) {
          const msgText = `Hi ${guestName}, this is a friendly reminder that you have ${hoursLeftStr} left before your scheduled check-out at ${propertyName}${roomsStr}. Standard check-out is by 11:00 AM on ${b.checkOut}.\n\nPlease complete your electronic check-out through the App to avoid late fees. Thank you!`;

          console.log(`[Reminders] Sending ${reminderReason} check-out alert to ${guestName} for booking ${doc.id}`);

          // Send Email
          if (useSmtpEmail && guestEmail) {
            try {
              await sendSmtpEmail({
                to: guestEmail,
                subject: `Check-out Reminder: ${hoursLeftStr} remaining at ${propertyName}`,
                text: msgText
              });
              console.log(`[Reminders] Sent email to ${guestEmail}`);
            } catch (e: any) {
              console.error(`[Reminders] Failed to send email to ${guestEmail}:`, e.message);
            }
          }

          // Send SMS
          if (twilioClient && guestPhone && tFrom) {
            try {
              await twilioClient.messages.create({
                body: msgText,
                from: tFrom,
                to: guestPhone
              });
              console.log(`[Reminders] Sent SMS to ${guestPhone}`);
            } catch (e: any) {
              console.error(`[Reminders] Failed to send SMS to ${guestPhone}:`, e.message);
            }
          }

          // Update database with flags
          updateFields.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          await db.collection("bookings").doc(doc.id).update(updateFields);
          console.log(`[Reminders] Updated booking ${doc.id} flags:`, updateFields);
        }

        // 5-Day Invoice Renewal Notification Check
        const diffDaysToEnd = Math.ceil((new Date(b.checkOut + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDaysToEnd <= 5 && diffDaysToEnd >= 0 && !b.sentRenewalNotification && !b.checkedOut) {
          const stayDays = Math.max(1, Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / (1000 * 60 * 60 * 24)));
          const hostUrl = req?.headers?.origin || "https://realcal.app/";
          const msgText = `Invoice Renewal Notice: Hi ${guestName}, your stay at ${propertyName} is scheduled to end on ${b.checkOut} (${stayDays} days). Do you plan to renew your stay for another ${stayDays} days? Log in to your portal at ${hostUrl}my-bookings to select Yes or No and secure your renewal.`;

          console.log(`[Reminders] Sending 5-day invoice renewal alert to ${guestName} for booking ${doc.id}`);
          if (useSmtpEmail && guestEmail) {
            try {
              await sendSmtpEmail({
                to: guestEmail,
                subject: `[ACTION REQUIRED] Invoice Renewal Notice: Extend your stay at ${propertyName}`,
                text: msgText
              });
            } catch (e: any) { console.error(`[Reminders] Failed to send renewal email:`, e.message); }
          }
          if (twilioClient && guestPhone && tFrom) {
            try {
              await twilioClient.messages.create({ body: msgText, from: tFrom, to: guestPhone });
            } catch (e: any) { console.error(`[Reminders] Failed to send renewal SMS:`, e.message); }
          }
          await db.collection("bookings").doc(doc.id).update({
            sentRenewalNotification: true,
            sentRenewalNotificationAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    } catch (err: any) {
      const isPermissionDenied = err.message?.includes("PERMISSION_DENIED") || 
                                 err.message?.includes("insufficient permissions") ||
                                 err.code === 7;
      if (isPermissionDenied) {
        console.warn("[Reminders] Scheduler run skipped: Service account does not have sufficient permissions to query Firestore. This is expected in development sandboxes and will be resolved upon deployment when the FIREBASE_SERVICE_ACCOUNT_JSON secret is set.");
      } else {
        console.error("[Reminders] Error in scheduler loop:", err);
      }
    }
  }

  // Start checkout reminders background scheduler
  console.log("[Server] Starting check-out reminders scheduler (running every 60s)...");
  setInterval(checkAndSendCheckoutReminders, 60000);
  checkAndSendCheckoutReminders().catch(console.error);

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    // Log routes for debugging
    try {
      const routes = app._router.stack
        .filter((r: any) => r.route)
        .map((r: any) => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
      console.log("[Server] Registered Routes:", routes);
    } catch (e) {
      console.log("[Server] Could not list routes");
    }
  });
}

startServer().catch(console.error);

