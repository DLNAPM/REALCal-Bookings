import express from "express";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import Stripe from "stripe";
import * as dotenv from "dotenv";

// Load environment variables from .env file if present
dotenv.config();

let __filename: string;
let __dirname: string;

try {
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  // @ts-ignore
  __filename = typeof __filename !== 'undefined' ? __filename : '';
  // @ts-ignore
  __dirname = typeof __dirname !== 'undefined' ? __dirname : '';
}

import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  const isProd = process.env.NODE_ENV === "production";
  const rootDir = process.cwd();
  const distPath = path.resolve(rootDir, "dist");
  console.log(`[Server] Starting in ${isProd ? "production" : "development"} mode.`);
  console.log(`[Server] Root: ${rootDir}, Dist: ${distPath}`);

  // Base Middlewares
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    next();
  });

  // API Logging
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[API Request] ${new Date().toISOString()} - ${req.method} ${req.path}`);
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

  // --- API ROUTES ---
  app.get("/api/config", (req, res) => {
    console.log("[Server] /api/config hit");
    const publicEnv: Record<string, string> = {};
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('VITE_')) {
        publicEnv[key] = process.env[key] || '';
      }
    });

    res.json({
      ...publicEnv,
      stripePublishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
      environment: process.env.NODE_ENV || 'development',
      hasStripeSecret: !!process.env.STRIPE_SECRET_KEY
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
      const { amount, currency = "usd", metadata } = req.body;
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key === "sk_test_...") {
        return res.status(400).json({ error: "STRIPE_SECRET_KEY is not configured." });
      }
      const stripe = new Stripe(key);
      const paymentIntent = await stripe.paymentIntents.create({
        amount, currency, metadata,
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
      console.error("Payment intent error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/notify-managers", async (req, res) => {
    try {
      const { managers, bookingDetails } = req.body;
      const { checkIn, checkOut, propertyName, totalAmount, guestName, guestEmail, guestPhone, isUpdate, accessCode } = bookingDetails;
      
      const eventType = isUpdate ? 'Booking Update' : 'New Booking';
      const textMsg = `${eventType} for ${propertyName}!\nGuest: ${guestName}\nDates: ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()}`;
      
      const results = [];
      
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
      let guestText = `Hi ${guestDisplayName},\n\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()} is ${isUpdate ? 'updated' : 'confirmed'}.`;
      if (accessCode) guestText += `\nYour access code is: ${accessCode}`;
      guestText += `\n\nThank you!`;

      if (resend && guestEmail) {
        try {
          await resend.emails.send({ from: 'bookings@realcal.demo', to: guestEmail, subject: guestSubject, text: guestText });
          results.push(`Guest email sent`);
        } catch (e) { results.push(`Guest email failed`); }
      }

      if (twilioClient && guestPhone && tFrom) {
        try {
          await twilioClient.messages.create({ body: guestText, from: tFrom, to: guestPhone });
          results.push(`Guest SMS sent`);
        } catch (e) { results.push(`Guest SMS failed`); }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- VITE / STATIC / FALLBACK ---

  if (isProd) {
    app.use(express.static(distPath));
    
    app.get("/opt-in", (req, res) => {
      const optInPath = path.resolve(distPath, "opt-in.html");
      if (fs.existsSync(optInPath)) return res.sendFile(optInPath);
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    // In Dev Mode
    const vite = await createViteServer({
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
    const routes = app._router.stack
      .filter((r: any) => r.route)
      .map((r: any) => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    console.log("[Server] Registered Routes:", routes);
  });
}

startServer().catch(console.error);

