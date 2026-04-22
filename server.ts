import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";

async function startServer() {
  const app = express();
  const PORT = 3000;

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
         console.warn("Seam API not configured. Returning fallback Yale code.");
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
    try {
      const { managers, bookingDetails } = req.body;
      const { checkIn, checkOut, propertyName, totalAmount, guestName, guestEmail } = bookingDetails;
      
      const subject = `New Booking Alert: ${propertyName}`;
      const textMsg = `New booking received for ${propertyName}!\nGuest: ${guestName || 'Guest'}\nDates: ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()}\nTotal: $${(totalAmount/100).toFixed(2)}`;
      
      const results = [];
      
      // Initialize Resend
      let resend = null;
      if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('re_test_')) {
        const { Resend } = await import('resend');
        resend = new Resend(process.env.RESEND_API_KEY);
      }
      
      // Initialize Twilio
      let twilioClient = null;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '+1234567890';
      if (twilioSid && twilioToken && !twilioSid.includes('test_')) {
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
                  results.push(`Email sent to ${m.email}`);
               } catch(e: any) {
                  console.error(`Email error for ${m.email}:`, e.message);
                  results.push(`Email mock sent to ${m.email} - API configured but failed`);
               }
            } else {
               console.log(`[Mock Email] To: ${m.email} | Subject: ${subject}`);
               results.push(`Email mock sent to ${m.email}`);
            }

            // Send SMS
            if (twilioClient) {
               try {
                  await twilioClient.messages.create({
                     body: textMsg,
                     from: TWILIO_PHONE,
                     to: m.phone
                  });
                  results.push(`SMS sent to ${m.phone}`);
               } catch(e: any) {
                  console.error(`SMS error for ${m.phone}:`, e.message);
                  results.push(`SMS mock sent to ${m.phone} - API configured but failed`);
               }
            } else {
               console.log(`[Mock SMS] To: ${m.phone} | Body: ${textMsg}`);
               results.push(`SMS mock sent to ${m.phone}`);
            }
        }
      }

      // Guest Verification Email
      if (guestEmail) {
         const guestSubject = `Booking Confirmation: ${propertyName}`;
         const guestText = `Hi ${guestName || 'Guest'},\n\nYour booking for ${propertyName} from ${new Date(checkIn).toLocaleDateString()} to ${new Date(checkOut).toLocaleDateString()} has been confirmed!\nTotal: $${(totalAmount/100).toFixed(2)}\n\nThank you for choosing us!`;
         
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For Express 4
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
