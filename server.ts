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
      const resendApiKey = process.env.RESEND_API_KEY;

      if (!resendApiKey) {
        return res.status(400).json({ error: "RESEND_API_KEY is not configured in secrets." });
      }

      const { Resend } = await import('resend');
      const resend = new Resend(resendApiKey);

      const result = await resend.emails.send({
        from: 'bookings@realcal.demo',
        to: to,
        subject: subject || "Test Email from REALCal Bookings",
        text: message || "Testing Resend integration on REALCal Bookings!"
      });

      console.log("[API] Email Success:", result);
      res.json({ success: true, result });
    } catch (err: any) {
      console.error("[API] Email Error:", err);
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
      // ... (existing Twilio/Resend setup)
      
      let resend = null;
      if (process.env.RESEND_API_KEY) {
        try {
          const { Resend } = await import('resend');
          resend = new Resend(process.env.RESEND_API_KEY);
        } catch (e) {}
      }
      
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
        if (resend && m.email) {
          try {
            await resend.emails.send({
              from: 'bookings@realcal.demo',
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

      if (resend && guestEmail) {
        try {
          await resend.emails.send({ from: 'bookings@realcal.demo', to: guestEmail, subject: guestSubject, text: emailText });
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

