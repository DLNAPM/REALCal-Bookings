import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Use JSON parsing for typical API requests
  app.use(express.json());

  // Security headers for Firebase Auth popups
  app.use((_req, res, next) => {
    // same-origin-allow-popups is generally the best for Firebase Auth within iframes
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    next();
  });

  // API Routes
  app.post("/api/provision-lock", async (req, res) => {
    try {
      const { checkIn, checkOut, name } = req.body;
      const seamApiKey = process.env.SEAM_API_KEY;
      const deviceId = process.env.YALE_DEVICE_ID;

      if (!seamApiKey || !deviceId || seamApiKey === "seam_test_...") {
         // Fallback if Seam not configured for preview demo
         const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
         console.warn("Seam API not configured. Returning fallback York code.");
         return res.json({ accessCode: randomPin });
      }

      // Real Seam API implementation
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
      console.log(`Payment Intent request: Amount=${amount}, Secret Key Present: ${!!key}`);

      if (!key || key === "sk_test_...") {
        console.warn("Stripe Secret Key is missing or using placeholder.");
        return res.status(400).json({ error: "STRIPE_SECRET_KEY is not configured on the server." });
      }
      
      const stripe = new Stripe(key);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata,
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
      console.error("Payment intent error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/notify-managers", async (req, res) => {
    console.log("Received request to /api/notify-managers");
    try {
      const { managers, bookingDetails } = req.body;
      const { checkIn, checkOut, propertyName, totalAmount, guestName, guestEmail, guestPhone, isUpdate, accessCode, isTestProperty } = bookingDetails;
      
      const eventType = isUpdate ? 'Booking Update' : 'New Booking';
      const subject = `${eventType} Alert: ${propertyName}`;
      const textMsg = `${eventType} received for ${propertyName}!\nGuest: ${guestName || 'Guest'}\nDates: ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()}\nTotal: $${(totalAmount/100).toFixed(2)}`;
      
      const results = [];
      
      // Initialize Resend
      let resend = null;
      if (process.env.RESEND_API_KEY) {
        try {
          const { Resend } = await import('resend');
          resend = new Resend(process.env.RESEND_API_KEY);
        } catch (e: any) {
          console.error("Resend init failed:", e.message);
        }
      }
      
      // Initialize Twilio
      let twilioClient = null;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
      
      if (twilioSid && twilioToken && twilioSid.startsWith('AC') && twilioSid !== 'AC_test_...') {
        try {
          const twilioExport = (await import('twilio')).default;
          if (typeof twilioExport === 'function') {
            twilioClient = twilioExport(twilioSid, twilioToken);
          } else {
             const twilioPkg = await import('twilio');
             const clientFunc = twilioPkg.default || twilioPkg;
             twilioClient = (clientFunc as any)(twilioSid, twilioToken);
          }
          console.log("Twilio client initialized for notifications");
        } catch (initErr: any) {
          console.error("Twilio notification init failed:", initErr.message);
        }
      }

      if (managers && managers.length > 0) {
        for (const m of managers) {
            // Send Email to Manager
            if (resend) {
               try {
                  await resend.emails.send({
                     from: 'bookings@realcal.demo',
                     to: m.email,
                     subject: subject,
                     text: textMsg
                  });
                  results.push(`Manager Email sent to ${m.email}`);
               } catch(e: any) {
                  console.error(`Email error for ${m.email}:`, e.message);
                  results.push(`Manager Email error for ${m.email}: ${e.message}`);
               }
            } else {
               results.push(`Manager Email skipped (not configured) for ${m.email}`);
            }

            // Send SMS to Manager
            if (twilioClient && m.phone && TWILIO_PHONE) {
               try {
                  const msg = await twilioClient.messages.create({
                     body: textMsg,
                     from: TWILIO_PHONE,
                     to: m.phone
                  });
                  console.log(`Manager SMS sent to ${m.phone}, SID: ${msg.sid}`);
                  results.push(`Manager SMS sent to ${m.phone}`);
               } catch(e: any) {
                  console.error(`SMS error for ${m.phone}:`, e.message);
                  results.push(`Manager SMS failed for ${m.phone}: ${e.message}`);
               }
            } else if (m.phone) {
               results.push(`Manager SMS skipped/mocked for ${m.phone}`);
            }
        }
      }

      const guestSubject = isUpdate ? `Booking Update Confirmation: ${propertyName}` : `Booking Confirmation: ${propertyName}`;
      let guestText = `Hi ${guestName || 'Guest'},\n\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()} has been ${isUpdate ? 'updated' : 'confirmed'}!\nTotal: $${(totalAmount/100).toFixed(2)}\n\n`;
      
      if (accessCode) {
          guestText += `Your access code for entry is: ${accessCode}\n\n`;
      }
      
      guestText += `Thank you for choosing us!`;

      // Guest Verification Email
      if (guestEmail) {
         if (resend) {
             try {
                await resend.emails.send({
                   from: 'bookings@realcal.demo',
                   to: guestEmail,
                   subject: guestSubject,
                   text: guestText
                });
                results.push(`Guest Email sent to ${guestEmail}`);
             } catch(e: any) {
                console.error(`Guest Email error for ${guestEmail}:`, e.message);
                results.push(`Guest Email error for ${guestEmail}: ${e.message}`);
             }
         } else {
             results.push(`Guest Email skipped for ${guestEmail}`);
         }
      }

      // Guest Verification SMS
      if (guestPhone) {
         if (twilioClient && TWILIO_PHONE) {
             try {
                const msg = await twilioClient.messages.create({
                   body: guestText,
                   from: TWILIO_PHONE,
                   to: guestPhone
                });
                console.log(`Guest SMS sent to ${guestPhone}, SID: ${msg.sid}`);
                results.push(`Guest SMS sent to ${guestPhone}`);
             } catch(e: any) {
                console.error(`Guest SMS error for ${guestPhone}:`, e.message);
                results.push(`Guest SMS failed for ${guestPhone}: ${e.message}`);
             }
         } else {
             results.push(`Guest SMS skipped/mocked for ${guestPhone}`);
         }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Notification failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/test-sms", async (req, res) => {
    try {
      const { to, message } = req.body;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;

      console.log(`Test SMS request to: ${to}`);

      if (!twilioSid || !twilioToken || !from || twilioSid === 'AC_test_...') {
        return res.status(400).json({ error: "Twilio credentials not configured in secrets." });
      }

      let twilioClient: any = null;
      try {
        const twilioExport = (await import('twilio')).default;
        if (typeof twilioExport === 'function') {
          twilioClient = twilioExport(twilioSid, twilioToken);
        } else {
           const twilioPkg = await import('twilio');
           const clientFunc = twilioPkg.default || twilioPkg;
           twilioClient = (clientFunc as any)(twilioSid, twilioToken);
        }
      } catch (initErr: any) {
        return res.status(500).json({ error: "Twilio init failed: " + initErr.message });
      }

      if (!twilioClient) {
        return res.status(500).json({ error: "Twilio client not initialized." });
      }
      
      console.log("Attempting to send Twilio message...");
      const result = await twilioClient.messages.create({
        body: message || "Test message from REALCal Bookings",
        from: from,
        to: to
      });

      console.log("Twilio Test SMS Result Keys:", Object.keys(result));
      console.log("Twilio Test SMS Result Prototype Keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(result)));

      // Twilio SID is usually in .sid
      let sid = result.sid;
      
      // Fallbacks
      if (!sid && result.data) sid = result.data.sid;
      if (!sid) {
         // Some versions or mock structures might put it elsewhere
         for (const key in result) {
            if (key.toLowerCase().includes('sid') && typeof result[key] === 'string') {
               sid = result[key];
               break;
            }
         }
      }

      console.log("Final SID extracted:", sid);
      
      const responseBody = { 
        success: true, 
        messageId: sid ? String(sid) : "SID_MISSING",
        status: result.status || "completed",
        debug_route: "test-sms",
        ts: Date.now()
      };

      console.log("Sending response:", responseBody);
      res.json(responseBody);
    } catch (e: any) {
      console.error("Test SMS Error:", e);
      res.status(500).json({ error: e.message });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.resolve(__dirname, "dist");
    
    console.log(`Production mode: serving static files from ${distPath}`);

    // Serve static files from the dist directory
    app.use(express.static(distPath));
    
    // CUSTOM ROUTE: Specifically handle /opt-in to serve the static HTML file
    // This ensures it works even on direct link or refresh without 404
    app.get("/opt-in", (req, res) => {
      const optInPath = path.resolve(distPath, "opt-in.html");
      console.log(`Explicit Opt-In requested. Checking ${optInPath}`);
      if (fs.existsSync(optInPath)) {
        res.sendFile(optInPath);
      } else {
        // Fallback to React app if the static file is missing for some reason
        res.sendFile(path.resolve(distPath, "index.html"));
      }
    });

    // SPA fallback: return index.html for any unknown routes
    app.all("*", (req, res) => {
      // Don't handle API routes as SPA
      if (req.path.startsWith('/api/')) {
        console.log(`API 404: ${req.path}`);
        return res.status(404).json({ error: "API route not found" });
      }

      const indexPath = path.resolve(distPath, "index.html");
      console.log(`SPA Fallback: Serving ${indexPath} for ${req.path}`);
      
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`Error sending index.html from ${indexPath}:`, err);
          res.status(500).send("The application is currently building or index.html is missing. Please refresh in a moment.");
        }
      });
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);

