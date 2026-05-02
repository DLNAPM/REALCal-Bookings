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
      if (!key) {
        throw new Error("STRIPE_SECRET_KEY environment variable is required");
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
        const { Resend } = await import('resend');
        resend = new Resend(process.env.RESEND_API_KEY);
      }
      
      // Initialize Twilio
      let twilioClient = null;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '+1234567890';
      if (twilioSid && twilioToken) {
        const twilio = (await import('twilio')).default;
        twilioClient = twilio(twilioSid, twilioToken);
      }

      if (managers && managers.length > 0) {
        for (const m of managers) {
            // Send Email
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
                  results.push(`Manager Email mock sent to ${m.email} - API configured but failed`);
               }
            } else {
               console.log(`[Mock Manager Email] To: ${m.email} | Subject: ${subject}`);
               results.push(`Manager Email mock sent to ${m.email}`);
            }

            // Send SMS
            if (twilioClient && m.phone) {
               try {
                  await twilioClient.messages.create({
                     body: textMsg,
                     from: TWILIO_PHONE,
                     to: m.phone
                  });
                  results.push(`Manager SMS sent to ${m.phone}`);
               } catch(e: any) {
                  console.error(`SMS error for ${m.phone}:`, e.message);
                  results.push(`Manager SMS mock sent to ${m.phone} - API configured but failed`);
               }
            } else if (m.phone) {
               console.log(`[Mock Manager SMS] To: ${m.phone} | Body: ${textMsg}`);
               results.push(`Manager SMS mock sent to ${m.phone}`);
            }
        }
      }

      const guestSubject = isUpdate ? `Booking Update Confirmation: ${propertyName}` : `Booking Confirmation: ${propertyName}`;
      let guestText = `Hi ${guestName || 'Guest'},\n\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()} has been ${isUpdate ? 'updated' : 'confirmed'}!\nTotal: $${(totalAmount/100).toFixed(2)}\n\n`;
      
      if (accessCode) {
          if (isTestProperty) {
             guestText += `Since this is a test property, here is your simulated York Code for entry: ${accessCode}\n\n`;
          } else {
             guestText += `Your York Code for entry is: ${accessCode}\n\n`;
          }
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
                results.push(`Guest Email mock sent to ${guestEmail} - API configured but failed`);
             }
         } else {
             console.log(`[Mock Guest Email] To: ${guestEmail} | Subject: ${guestSubject} | Body: ${guestText}`);
             results.push(`Guest Email mock sent to ${guestEmail}`);
         }
      }

      // Guest Verification SMS
      if (guestPhone) {
         if (twilioClient) {
             try {
                await twilioClient.messages.create({
                   body: guestText,
                   from: TWILIO_PHONE,
                   to: guestPhone
                });
                results.push(`Guest SMS sent to ${guestPhone}`);
             } catch(e: any) {
                console.error(`Guest SMS error for ${guestPhone}:`, e.message);
                results.push(`Guest SMS mock sent to ${guestPhone} - API configured but failed`);
             }
         } else {
             console.log(`[Mock Guest SMS] To: ${guestPhone} | Body: ${guestText}`);
             results.push(`Guest SMS mock sent to ${guestPhone}`);
         }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Notification failed:', error);
      res.status(500).json({ error: error.message });
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
    
    // Serve static files from the dist directory
    app.use(express.static(distPath));
    
    // SPA fallback: return index.html for any unknown routes
    app.get("*", (req, res) => {
      // Specifically avoid catching API routes that might have failed to avoid recursive confusion
      if (req.path.startsWith('/api/')) {
        console.warn(`404 API Route: ${req.path}`);
        return res.status(404).json({ error: `API route ${req.path} not found` });
      }

      // Try multiple possible paths for index.html to increase resilience
      const possibleIndexPaths = [
        path.join(distPath, "index.html"),
        path.join(process.cwd(), "dist", "index.html"),
        path.resolve("./dist/index.html")
      ];

      const validPath = possibleIndexPaths.find(p => fs.existsSync(p));

      if (validPath) {
        res.sendFile(validPath);
      } else {
        console.error("Critical: Could not find index.html in any expected location.");
        res.status(500).send(`
          <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e11d48;">Server Error</h1>
            <p>The application could not find the main entry file (index.html).</p>
            <p><strong>Checked paths:</strong></p>
            <ul style="background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; list-style: none;">
              ${possibleIndexPaths.map(p => `<li style="margin-bottom: 0.5rem; font-family: monospace; font-size: 0.8rem;">${p}</li>`).join('')}
            </ul>
            <p><strong>Current directory:</strong> <code style="background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 0.2rem;">${process.cwd()}</code></p>
            <p style="color: #64748b; font-size: 0.9rem;">Please ensure 'npm run build' was successful and the 'dist' directory exists.</p>
          </div>
        `);
      }
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(console.error);

