import express from "express";
import { type ViteDevServer } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import Stripe from "stripe";
import * as dotenv from "dotenv";
import fs from "fs";
import cors from "cors";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { calculatePriceDetails } from "./src/lib/pricing";

// Load environment variables from .env file if present
dotenv.config();

// Initialize Firebase Admin
let db: admin.firestore.Firestore;
try {
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  console.log(`[Server] Initializing Firebase Admin...`);
  
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (admin.apps.length === 0) {
      admin.initializeApp({ projectId: firebaseConfig.projectId });
    }
    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
    db = getFirestore(admin.app(), dbId);
    console.log(`[Server] Firebase Admin initialized using config file. Project: ${firebaseConfig.projectId}, DB: ${dbId}`);
  } else {
    // Check for environment variables (Render.com / Deployment)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    if (projectId || serviceAccountJson) {
      if (admin.apps.length === 0) {
        if (serviceAccountJson) {
          try {
            const sa = JSON.parse(serviceAccountJson);
            admin.initializeApp({
              credential: admin.credential.cert(sa),
              projectId: sa.project_id || projectId
            });
            console.log(`[Server] Firebase Admin initialized using Service Account JSON.`);
          } catch (saErr) {
            console.error("[Server] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", saErr);
            admin.initializeApp({ projectId });
          }
        } else {
          admin.initializeApp({ projectId });
          console.log(`[Server] Firebase Admin initialized using Project ID: ${projectId}. (Warning: May require credentials)`);
        }
      }
      const dbId = process.env.FIREBASE_DATABASE_ID || "(default)";
      db = getFirestore(admin.app(), dbId);
    } else {
      console.warn(`[Server] No Firebase configuration found. Use AI Studio setup or set FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_JSON.`);
    }
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
async function sendSmtpEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }) {
  const nodemailer = await import("nodemailer");
  
  const host = process.env.SMTP_HOST || "smtp.mailgun.org";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER || "donotreply@cashgroupproperties.com";
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true"; // normally false for 587, true for 465
  const fromEmail = process.env.SMTP_FROM_EMAIL || "donotreply@cashgroupproperties.com";
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

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    html
  };

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
    res.json({ status: "ok", uptime: process.uptime() });
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
        to: to
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

      const deadline = new Date(`${booking.checkOut}T11:00:00`);
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

      // Prepare guest information
      let guestName = booking.guestName || "Guest";
      let guestEmail = booking.guestEmail;
      let guestPhone = booking.guestPhone;

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

      const checkoutTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkoutDateStr = now.toLocaleDateString();
      
      // Guest thank you message
      let guestMsg = `Hi ${guestName}, thank you so much for staying at ${propertyName}! This is to confirm your electronic check-out was completed successfully on ${checkoutDateStr} at ${checkoutTimeStr}.\n\nWe appreciate you choosing REALCal Bookings and hope to host you again soon!`;
      if (isLate && lateCheckoutFee > 0) {
        guestMsg += `\n\nNote: A late check-out fee of $${(lateCheckoutFee / 100).toFixed(2)} has been added to your Final bill for being ${overdueHours} hour(s) over the 11:00 AM checkout deadline on ${booking.checkOut}.`;
      }

      const results = [];

      if (useSmtpEmail && guestEmail) {
        try {
          await sendSmtpEmail({
            to: guestEmail,
            subject: `Thank you for staying at ${propertyName}! (Checked out)`,
            text: guestMsg
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

  app.post("/api/create-payment-intent", async (req, res) => {
    try {
      const { propertyId, checkIn, checkOut, selectedBedrooms, selectedBedroom, currency = "usd", metadata, amount } = req.body;
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
        const priceDetails = calculatePriceDetails(checkIn, checkOut, pricingRules as any, globalSettings, rooms, rentalMode);
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

  app.post("/api/notify-managers", async (req, res) => {
    try {
      const { managers, bookingDetails } = req.body;
      const { checkIn, checkOut, propertyName, totalAmount, guestName, guestEmail, guestPhone, isUpdate, accessCode, selectedBedrooms } = bookingDetails;
      
      const eventType = isUpdate ? 'Booking Update' : 'New Booking';
      let roomsInfo = "";
      if (selectedBedrooms && selectedBedrooms.length > 0) {
        roomsInfo = "\nRooms: " + selectedBedrooms.map((r: any) => `Room ${r.roomNumber} (${r.type})`).join(', ');
      }
      
      const textMsg = `${eventType} for ${propertyName}!${roomsInfo}\nGuest: ${guestName}\nDates: ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()}`;
      
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
              subject: `Booking Alert: ${propertyName}`,
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
      const guestSubject = isUpdate ? `Booking Update: ${propertyName}` : `Booking Confirmed: ${propertyName}`;
      const guestDisplayName = guestName || 'Guest';
      
      // Email Content (Single Email for multiple rooms)
      let emailText = `Hi ${guestDisplayName},\n\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()} is ${isUpdate ? 'updated' : 'confirmed'}.`;
      
      if (selectedBedrooms && selectedBedrooms.length > 0) {
        emailText += `\n\nRoom Details:`;
        selectedBedrooms.forEach((r: any) => {
           emailText += `\n- ${r.type} Room ${r.roomNumber}`;
           if (r.roomLockNumber) emailText += ` (Lock #: ${r.roomLockNumber})`;
        });
      }
      
      if (accessCode) emailText += `\n\nYour master access code is: ${accessCode}`;
      emailText += `\n\nThank you!`;

      if (useSmtpEmail && guestEmail) {
        try {
          await sendSmtpEmail({ to: guestEmail, subject: guestSubject, text: emailText });
          results.push(`Guest confirmation email sent`);
        } catch (e) { results.push(`Guest email failed`); }
      }

      // SMS Notifications (Multiple if multiple rooms with locks)
      if (twilioClient && guestPhone && tFrom) {
        try {
            if (selectedBedrooms && selectedBedrooms.length > 0) {
                // Send an SMS for each room that has a Lock number
                for (const room of selectedBedrooms) {
                    if (room.roomLockNumber) {
                        let roomSmsText = `Hi ${guestDisplayName}, access for ${propertyName} - ${room.type} Room ${room.roomNumber} is confirmed.\nAccess Code: ${accessCode || '123456'}\nLock #: ${room.roomLockNumber}`;
                        await twilioClient.messages.create({ body: roomSmsText, from: tFrom, to: guestPhone });
                        results.push(`Guest SMS sent for Room ${room.roomNumber}`);
                    }
                }
            } else {
                // Default SMS for entire property
                let defaultSmsText = `Hi ${guestDisplayName},\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()} is ${isUpdate ? 'updated' : 'confirmed'}.`;
                if (accessCode) defaultSmsText += `\nAccess code: ${accessCode}`;
                await twilioClient.messages.create({ body: defaultSmsText, from: tFrom, to: guestPhone });
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

