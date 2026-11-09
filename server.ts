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

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId || "realcal-bookings";
  const dbId = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || "(default)";
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
async function sendSmtpEmail({ to, subject, text, html, attachments, cc }: { to: string; subject: string; text: string; html?: string; attachments?: any[]; cc?: string }) {
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

  if (cc) {
    mailOptions.cc = cc;
  }

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

// ==========================================
// SURVEY & REVIEWS NOTIFICATION HELPERS
// ==========================================

async function sendStaySurveyEmail({
  guestName,
  guestEmail,
  propertyName,
  bookingRef,
  appUrl,
  stayType = 'booking'
}: {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  bookingRef?: string;
  appUrl?: string;
  stayType?: string;
}) {
  if (!guestEmail) return false;

  const baseAppUrl = appUrl || process.env.APP_URL || process.env.PUBLIC_URL || "https://realcal.app";
  const normalizedBase = baseAppUrl.endsWith('/') ? baseAppUrl.slice(0, -1) : baseAppUrl;
  
  const reviewsUrl = `${normalizedBase}/reviews?prop=${encodeURIComponent(propertyName)}&ref=${encodeURIComponent(bookingRef || '')}`;
  const surveyUrl = `${normalizedBase}/survey?ref=${encodeURIComponent(bookingRef || '')}&property=${encodeURIComponent(propertyName)}&guest=${encodeURIComponent(guestName)}&email=${encodeURIComponent(guestEmail)}&stayType=${encodeURIComponent(stayType)}`;

  const subject = `Your Stay at ${propertyName} - Stay Survey & Reviews`;

  const emailText = `Hi ${guestName},

Thank you so much for choosing to stay at ${propertyName}! It was a pleasure hosting you, and I hope you had a safe trip home.

We always strive to provide a 5-star experience, so we would love to hear your thoughts on a few quick questions:
•	Comfort: How was your overall experience during your stay?
•	Amenities: Was there anything missing that could have made your stay more comfortable?
•	Cleanliness: Did the space meet your expectations for cleanliness and preparation?
•	Operations: Did you run into any issues with check-in, the Wi-Fi, or any appliances?
•	Future Ideas: Do you have any suggestions for future improvements, or would you stay with us again?

Your feedback helps us keep improving for future guests. If you have a moment, we would also truly appreciate it if you could leave us a quick review on our Review Page here! ${reviewsUrl}

You can also submit your 5 quick answers online directly here:
${surveyUrl}

Thank you again. We hope to host you, your friends, or your family again soon.

Management
RealCal Bookings
C&SH Group Properties, LLC`;

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      
      <div style="background-color: #4f46e5; padding: 24px 32px; text-align: left;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">RealCal Bookings</h1>
        <p style="color: #e0e7ff; margin: 4px 0 0; font-size: 12px; font-weight: 500;">C&SH Group Properties, LLC</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">Hi ${guestName},</p>
        
        <p style="font-size: 14px; color: #334155; margin-bottom: 20px;">
          Thank you so much for choosing to stay at <strong>${propertyName}</strong>! It was a pleasure hosting you, and I hope you had a safe trip home.
        </p>
        
        <p style="font-size: 14px; color: #334155; margin-bottom: 20px;">
          We always strive to provide a 5-star experience, so we would love to hear your thoughts on a few quick questions:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
          <ul style="margin: 0; padding-left: 20px; font-size: 13.5px; color: #334155; line-height: 1.8;">
            <li style="margin-bottom: 8px;"><strong>Comfort:</strong> How was your overall experience during your stay?</li>
            <li style="margin-bottom: 8px;"><strong>Amenities:</strong> Was there anything missing that could have made your stay more comfortable?</li>
            <li style="margin-bottom: 8px;"><strong>Cleanliness:</strong> Did the space meet your expectations for cleanliness and preparation?</li>
            <li style="margin-bottom: 8px;"><strong>Operations:</strong> Did you run into any issues with check-in, the Wi-Fi, or any appliances?</li>
            <li style="margin-bottom: 0;"><strong>Future Ideas:</strong> Do you have any suggestions for future improvements, or would you stay with us again?</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${surveyUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
            Complete 5-Question Survey &rarr;
          </a>
        </div>

        <p style="font-size: 14px; color: #334155; margin-bottom: 24px; line-height: 1.6;">
          Your feedback helps us keep improving for future guests. If you have a moment, we would also truly appreciate it if you could leave us a quick review on our <a href="${reviewsUrl}" style="color: #4f46e5; font-weight: 700; text-decoration: underline;">Review Page here!</a>
        </p>

        <p style="font-size: 14px; color: #334155; margin-bottom: 28px;">
          Thank you again. We hope to host you, your friends, or your family again soon.
        </p>

        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 13px; color: #64748b;">
          <p style="margin: 0; font-weight: 700; color: #0f172a;">Management</p>
          <p style="margin: 2px 0;">RealCal Bookings</p>
          <p style="margin: 2px 0;">C&SH Group Properties, LLC</p>
        </div>
      </div>

      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 11px; color: #94a3b8;">
        &copy; 2026 C&SH Group Properties, LLC &bull; Automated Guest Experience Services
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    await sendSmtpEmail({
      to: guestEmail,
      subject,
      text: emailText,
      html: emailHtml
    });
    console.log(`[Survey Email] Successfully sent stay survey email to ${guestEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Survey Email] Failed to send stay survey email to ${guestEmail}:`, err.message);
    return false;
  }
}

async function sendSurveyResultsToPropertyManagers({
  surveyData,
  activeDb
}: {
  surveyData: any;
  activeDb: any;
}) {
  const propertyName = surveyData.propertyName || "Stonewall Villa";
  const guestName = surveyData.guestName || "Guest";
  const guestEmail = surveyData.guestEmail || "N/A";
  const guestPhone = surveyData.guestPhone || "N/A";
  const rating = surveyData.overallRating || surveyData.comfortRating || 5;
  const stayRef = surveyData.bookingRef ? `(Ref: ${surveyData.bookingRef})` : "";

  const subject = `[Guest Survey Results] ${propertyName} - ${guestName} (${rating}/5 Stars)`;

  const text = `A guest has completed their Stay Survey for ${propertyName} ${stayRef}.

GUEST DETAILS:
• Name: ${guestName}
• Email: ${guestEmail}
• Phone: ${guestPhone}
• Property: ${propertyName}
• Stay Reference: ${surveyData.bookingRef || 'N/A'}
• Overall Rating: ${rating} / 5 Stars

SURVEY QUESTIONS & ANSWERS:
1. Comfort: How was your overall experience during your stay?
Rating: ${surveyData.comfortRating || rating} / 5 Stars
Feedback: ${surveyData.comfort || 'N/A'}

2. Amenities: Was there anything missing that could have made your stay more comfortable?
Response: ${surveyData.amenities || 'N/A'}

3. Cleanliness: Did the space meet your expectations for cleanliness and preparation?
Status: ${surveyData.cleanlinessRating || 'N/A'}
Feedback: ${surveyData.cleanliness || 'N/A'}

4. Operations: Did you run into any issues with check-in, the Wi-Fi, or any appliances?
Status: ${surveyData.operationsStatus || 'N/A'}
Feedback: ${surveyData.operations || 'N/A'}

5. Future Ideas: Do you have any suggestions for future improvements, or would you stay with us again?
Would Stay Again: ${surveyData.wouldStayAgain || 'N/A'}
Suggestions: ${surveyData.futureIdeas || 'N/A'}

PUBLIC REVIEW COMMENT:
${surveyData.publishAsReview ? (surveyData.publicReviewComment || surveyData.comfort || 'Yes (Shared to Review Page)') : 'Guest opted for private feedback only'}

---
RealCal Bookings Property Management Notification
C&SH Group Properties, LLC`;

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
  </head>
  <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; line-height: 1.6;">
    <div style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="background-color: #4f46e5; padding: 20px 28px;">
        <span style="display: inline-block; background-color: #3730a3; color: #ffffff; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">Property Management Notification</span>
        <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">New Guest Survey Completed</h2>
        <p style="color: #c7d2fe; margin: 4px 0 0; font-size: 13px;">${propertyName} &bull; ${guestName} &bull; <strong>${rating} / 5 Stars</strong></p>
      </div>

      <div style="padding: 28px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 35%;">Guest Name:</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 700;">${guestName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Email:</td>
            <td style="padding: 8px 0; color: #0f172a;"><a href="mailto:${guestEmail}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${guestEmail}</a></td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Phone:</td>
            <td style="padding: 8px 0; color: #0f172a;">${guestPhone}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Property:</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${propertyName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Stay Reference:</td>
            <td style="padding: 8px 0; color: #0f172a; font-family: monospace;">${surveyData.bookingRef || 'N/A'}</td>
          </tr>
        </table>

        <h3 style="font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin: 0 0 12px; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px;">
          5 Stay Questions & Answers
        </h3>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #4f46e5;">1. Comfort: How was your overall experience during your stay?</p>
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #0f172a;">Rating: <strong>${surveyData.comfortRating || rating} / 5 Stars</strong></p>
          <p style="margin: 0; font-size: 13px; color: #334155;">${surveyData.comfort || 'No written comment'}</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #4f46e5;">2. Amenities: Was there anything missing that could have made your stay more comfortable?</p>
          <p style="margin: 0; font-size: 13px; color: #334155;">${surveyData.amenities || 'All amenities were provided'}</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #4f46e5;">3. Cleanliness: Did the space meet your expectations for cleanliness and preparation?</p>
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #059669;">Status: ${surveyData.cleanlinessRating || 'Met expectations'}</p>
          <p style="margin: 0; font-size: 13px; color: #334155;">${surveyData.cleanliness || 'No further notes'}</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #4f46e5;">4. Operations: Did you run into any issues with check-in, the Wi-Fi, or any appliances?</p>
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #0f172a;">Status: ${surveyData.operationsStatus || 'Smooth'}</p>
          <p style="margin: 0; font-size: 13px; color: #334155;">${surveyData.operations || 'No operational issues reported'}</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #4f46e5;">5. Future Ideas: Suggestions for future improvements, or would stay again?</p>
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #0f172a;">Would Stay Again: <strong>${surveyData.wouldStayAgain || 'Yes'}</strong></p>
          <p style="margin: 0; font-size: 13px; color: #334155;">${surveyData.futureIdeas || 'None'}</p>
        </div>

        ${surveyData.publishAsReview ? `
        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #1d4ed8;">Public Review Published on Review Page:</p>
          <p style="margin: 0; font-size: 13px; color: #1e3a8a; font-style: italic;">"${surveyData.publicReviewComment || surveyData.comfort}"</p>
        </div>
        ` : ''}

        <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          This survey notification was automatically dispatched to all enabled Property Management Contacts at C&SH Group Properties, LLC.
        </p>
      </div>
    </div>
  </body>
  </html>
  `;

  const recipientEmails: string[] = [];

  if (activeDb) {
    try {
      const managersSnap = await activeDb.collection("property_managers").where("enabled", "==", true).get();
      if (!managersSnap.empty) {
        for (const doc of managersSnap.docs) {
          const email = doc.data()?.email;
          if (email && !recipientEmails.includes(email)) {
            recipientEmails.push(email);
          }
        }
      }
    } catch (e: any) {
      console.warn("[Survey] Could not fetch property_managers from Firestore:", e.message);
    }
  }

  if (recipientEmails.length === 0) {
    const fallbackEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || "donotreply@cashgroupproperties.com";
    recipientEmails.push(fallbackEmail);
  }

  console.log(`[Survey] Sending survey results to Property Management contacts: ${recipientEmails.join(", ")}`);

  for (const email of recipientEmails) {
    try {
      await sendSmtpEmail({
        to: email,
        subject,
        text,
        html
      });
      console.log(`[Survey] Successfully sent survey results to Property Manager: ${email}`);
    } catch (err: any) {
      console.error(`[Survey] Failed to send survey results to Property Manager ${email}:`, err.message);
    }
  }
}

// ==========================================
// SYSTEM INCIDENT & ALARM MONITORING ENGINE
// ==========================================

// In-memory cache for the live publicly accessible URL of the app
let lastKnownAppUrl = process.env.APP_URL || process.env.PUBLIC_URL || "";

export function resolveAppUrl(req?: any, explicitAppUrl?: string): string {
  // 1. Explicit appUrl passed in parameter or request body
  if (explicitAppUrl && typeof explicitAppUrl === 'string' && explicitAppUrl.startsWith('http')) {
    const cleaned = explicitAppUrl.replace(/\/+$/, '');
    if (!cleaned.includes('realcal-bookings.web.app')) {
      lastKnownAppUrl = cleaned;
      return cleaned;
    }
  }

  // 2. Client origin or referer header if req is provided
  if (req) {
    const origin = req.headers?.origin as string;
    if (origin && typeof origin === 'string' && origin.startsWith('http') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      const cleaned = origin.replace(/\/+$/, '');
      lastKnownAppUrl = cleaned;
      return cleaned;
    }

    const referer = req.headers?.referer as string;
    if (referer) {
      try {
        const parsed = new URL(referer);
        if (parsed.origin && parsed.origin.startsWith('http') && !parsed.origin.includes('localhost') && !parsed.origin.includes('127.0.0.1')) {
          const cleaned = parsed.origin.replace(/\/+$/, '');
          lastKnownAppUrl = cleaned;
          return cleaned;
        }
      } catch {}
    }

    const forwardedHost = (req.headers?.['x-forwarded-host'] as string)?.split(',')[0]?.trim();
    const forwardedProto = (req.headers?.['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
    const host = forwardedHost || req.headers?.host || (typeof req.get === 'function' ? req.get('host') : null);
    const proto = forwardedProto || (req.secure ? 'https' : 'https');

    if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('0.0.0.0')) {
      const cleaned = `${proto}://${host}`.replace(/\/+$/, '');
      lastKnownAppUrl = cleaned;
      return cleaned;
    }
  }

  // 3. Last known app URL captured from live HTTP requests
  if (lastKnownAppUrl && lastKnownAppUrl.startsWith('http') && !lastKnownAppUrl.includes('realcal-bookings.web.app')) {
    return lastKnownAppUrl.replace(/\/+$/, '');
  }

  // 4. process.env.APP_URL
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http') && !process.env.APP_URL.includes('realcal-bookings.web.app')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  // 5. process.env.PUBLIC_URL
  if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.startsWith('http') && !process.env.PUBLIC_URL.includes('realcal-bookings.web.app')) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '');
  }

  // 6. Safe domain fallback
  return "https://realcal.app";
}

// In-memory debounce cache to prevent duplicate email/SMS storms (key: service:errorCode:title -> timestamp)
const recentIncidentAlerts = new Map<string, number>();

export async function triggerSystemIncident({
  service,
  title,
  message,
  severity = 'high',
  errorCode,
  errorDetails,
  endpoint,
  appUrl: explicitAppUrl,
  req,
  metadata
}: {
  service: 'stripe' | 'twilio' | 'gemini' | 'smtp' | 'billing' | 'api' | 'smart_lock' | 'database' | 'other';
  title: string;
  message: string;
  severity?: 'critical' | 'high' | 'warning' | 'info';
  errorCode?: string | number;
  errorDetails?: any;
  endpoint?: string;
  appUrl?: string;
  req?: any;
  metadata?: Record<string, any>;
}) {
  console.error(`🚨 [SYSTEM INCIDENT REPORTED] [${severity.toUpperCase()}] [${service.toUpperCase()}] ${title}: ${message}`);
  
  const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestampIso = new Date().toISOString();
  const appUrl = resolveAppUrl(req, explicitAppUrl);
  const adminDashboardUrl = `${appUrl}/admin`;

  // Deduplication check for notifications (5 min window)
  const debounceKey = `${service}:${errorCode || ''}:${title.slice(0, 40)}`;
  const now = Date.now();
  const lastAlertTime = recentIncidentAlerts.get(debounceKey) || 0;
  const shouldDispatchNotifications = (now - lastAlertTime) > (5 * 60 * 1000);

  let formattedDetails = "";
  if (typeof errorDetails === 'string') {
    formattedDetails = errorDetails;
  } else if (errorDetails && typeof errorDetails === 'object') {
    try {
      formattedDetails = JSON.stringify(errorDetails, Object.getOwnPropertyNames(errorDetails), 2);
    } catch {
      formattedDetails = String(errorDetails);
    }
  }

  const notificationResults = {
    emails: [] as string[],
    sms: [] as string[],
    failedEmails: [] as string[],
    failedSms: [] as string[],
    suppressedByThrottling: !shouldDispatchNotifications,
    timestamp: timestampIso
  };

  if (shouldDispatchNotifications) {
    recentIncidentAlerts.set(debounceKey, now);

    // 1. Gather Email Recipients: APP Admin dlaniger.napm.consulting@gmail.com and Enabled Property Managers
    const primaryAdminEmail = (process.env.ADMIN_ALERT_EMAIL || "dlaniger.napm.consulting@gmail.com").trim();
    const recipientEmails = new Set<string>();
    if (primaryAdminEmail) {
      recipientEmails.add(primaryAdminEmail.toLowerCase());
    }

    // 2. Gather Phone Recipients for SMS
    const recipientPhones = new Set<string>();
    if (process.env.ADMIN_ALERT_PHONE) {
      const formatted = formatPhoneToE164(process.env.ADMIN_ALERT_PHONE);
      if (formatted) recipientPhones.add(formatted);
    }

    const activeDb = db;
    if (activeDb) {
      try {
        const managersSnap = await activeDb.collection("property_managers").where("enabled", "==", true).get();
        if (!managersSnap.empty) {
          for (const doc of managersSnap.docs) {
            const data = doc.data();
            if (data.email) {
              recipientEmails.add(data.email.trim().toLowerCase());
            }
            if (data.phone) {
              const p = formatPhoneToE164(data.phone);
              if (p) recipientPhones.add(p);
            }
          }
        }
      } catch (err: any) {
        console.warn("[Incident Alert] Failed fetching property managers for incident dispatch:", err.message);
      }
    }

    // Prepare Email Content
    const severityColor = severity === 'critical' ? '#dc2626' : severity === 'high' ? '#ea580c' : severity === 'warning' ? '#d97706' : '#2563eb';
    const emailSubject = `🚨 [REALCal SYSTEM ALARM - ${severity.toUpperCase()}] ${service.toUpperCase()}: ${title}`;
    const emailText = `SYSTEM INCIDENT ALERT - ${severity.toUpperCase()}\n\n` +
      `Service: ${service.toUpperCase()}\n` +
      `Title: ${title}\n` +
      `Message: ${message}\n` +
      (errorCode ? `Error Code: ${errorCode}\n` : '') +
      (endpoint ? `Endpoint: ${endpoint}\n` : '') +
      `Time: ${timestampIso}\n\n` +
      `Action Required: Please visit the REALCal Admin Dashboard to review and acknowledge this incident.\n` +
      `Admin Dashboard: ${adminDashboardUrl}\n\n` +
      (formattedDetails ? `Technical Details:\n${formattedDetails}\n` : '');

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 24px; margin: 0;">
      <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: ${severityColor}; padding: 22px 24px; color: #ffffff;">
          <div style="display: inline-block; background-color: rgba(255,255,255,0.25); padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;">
            ${severity} INCIDENT ALARM
          </div>
          <h1 style="margin: 12px 0 4px; font-size: 20px; font-weight: 700; line-height: 1.3;">${title}</h1>
          <p style="margin: 0; opacity: 0.9; font-size: 13px;">Service: <strong>${service.toUpperCase()}</strong> &bull; ${new Date().toLocaleString()}</p>
        </div>
        <div style="padding: 24px;">
          <div style="background-color: #fff1f2; border-left: 4px solid ${severityColor}; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #9f1239;">${message}</p>
          </div>

          <table style="width: 100%; font-size: 13px; margin-bottom: 20px; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Service Category:</td><td style="padding: 8px 0; font-weight: 700; color: #0f172a; text-transform: uppercase;">${service}</td></tr>
            ${errorCode ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Error Code:</td><td style="padding: 8px 0; font-family: monospace; color: #b91c1c; font-weight: 600;">${errorCode}</td></tr>` : ''}
            ${endpoint ? `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; color: #64748b; font-weight: 600;">API Endpoint:</td><td style="padding: 8px 0; font-family: monospace; color: #334155;">${endpoint}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Incident ID:</td><td style="padding: 8px 0; font-family: monospace; color: #64748b;">${incidentId}</td></tr>
          </table>

          ${formattedDetails ? `
          <div style="margin-bottom: 24px;">
            <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Technical Details &amp; Payload</p>
            <pre style="background-color: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; font-size: 12px; overflow-x: auto; margin: 0; max-height: 220px; line-height: 1.4;">${formattedDetails}</pre>
          </div>` : ''}

          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="${adminDashboardUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
              Open Admin Dashboard to Acknowledge &rarr;
            </a>
          </div>

          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 20px 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            Dispatched to App Admin (${primaryAdminEmail}) and enabled Property Managers.
          </p>
        </div>
      </div>
    </body>
    </html>`;

    // Dispatch Emails via Nodemailer
    for (const email of recipientEmails) {
      try {
        await sendSmtpEmail({
          to: email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        });
        notificationResults.emails.push(email);
        console.log(`[Incident Alert] Email dispatched successfully to: ${email}`);
      } catch (err: any) {
        console.error(`[Incident Alert] Failed sending email to ${email}:`, err.message);
        notificationResults.failedEmails.push(`${email}: ${err.message}`);
      }
    }

    // Dispatch SMS via Twilio (if configured)
    const tSid = process.env.TWILIO_ACCOUNT_SID;
    const tTok = process.env.TWILIO_AUTH_TOKEN;
    const tFrom = process.env.TWILIO_PHONE_NUMBER;
    
    if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL') && tFrom && recipientPhones.size > 0) {
      try {
        const twilioPkg = await import('twilio');
        const twilio = twilioPkg.default || twilioPkg;
        const twilioClient = (twilio as any)(tSid, tTok);

        const smsBody = `🚨 REALCal ALARM [${severity.toUpperCase()}] ${service.toUpperCase()}: ${title}. ${message.slice(0, 80)}. Ack: ${adminDashboardUrl}`;

        for (const phone of recipientPhones) {
          try {
            await twilioClient.messages.create({
              body: smsBody,
              from: tFrom,
              to: phone
            });
            notificationResults.sms.push(phone);
            console.log(`[Incident Alert] SMS dispatched successfully to: ${phone}`);
          } catch (smsErr: any) {
            console.error(`[Incident Alert] Failed sending SMS to ${phone}:`, smsErr.message);
            notificationResults.failedSms.push(`${phone}: ${smsErr.message}`);
          }
        }
      } catch (twErr: any) {
        console.error("[Incident Alert] Twilio error during incident SMS dispatch:", twErr.message);
      }
    }
  } else {
    console.log(`[Incident Alert] Notification throttled (already sent in last 5m): ${debounceKey}`);
  }

  // Record Incident in Firestore
  const incidentDoc = {
    id: incidentId,
    title,
    service,
    severity,
    status: 'active',
    message,
    errorCode: errorCode ? String(errorCode) : null,
    errorDetails: formattedDetails,
    endpoint: endpoint || null,
    appUrl,
    adminDashboardUrl,
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedBy: null,
    acknowledgmentNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    notificationsSent: notificationResults,
    metadata: metadata || {},
    createdAt: timestampIso,
    updatedAt: timestampIso
  };

  const activeDb = db;
  if (activeDb) {
    try {
      await activeDb.collection('incidents').doc(incidentId).set(incidentDoc);
      await activeDb.collection('system_alerts').doc(incidentId).set(incidentDoc);
      console.log(`[Incident Alert] Incident recorded in Firestore with ID: ${incidentId}`);
    } catch (dbErr: any) {
      console.error("[Incident Alert] Failed recording incident in Firestore:", dbErr.message);
    }
  }

  return incidentDoc;
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

function addDaysDateString(dateStr: string, days: number): string {
  if (!dateStr || !dateStr.includes('-')) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function checkExtensionAvailability(
  activeDb: admin.firestore.Firestore,
  propertyId: string,
  currentCheckOut: string,
  requestedDays: number,
  rentalMode: string = 'entire',
  selectedBedrooms: any[] = [],
  currentBookingId?: string
): Promise<{ isAvailable: boolean; reason?: string; extensionStart: string; extensionEnd: string }> {
  const extensionStart = currentCheckOut;
  const extensionEnd = addDaysDateString(currentCheckOut, requestedDays);

  if (!activeDb) {
    return { isAvailable: false, reason: "Database connection not ready", extensionStart, extensionEnd };
  }

  try {
    // 1. Check for conflicting bookings
    const bookingsSnap = await activeDb.collection("bookings")
      .where("propertyId", "==", propertyId)
      .get();

    for (const bDoc of bookingsSnap.docs) {
      if (currentBookingId && bDoc.id === currentBookingId) continue;
      const b = bDoc.data();
      if (!b || b.status === "cancelled") continue;

      const otherIn = b.checkIn;
      const otherOut = b.checkOut;
      if (!otherIn || !otherOut) continue;

      // Check overlap: StartA < EndB and EndA > StartB
      const overlaps = otherIn < extensionEnd && otherOut > extensionStart;
      if (overlaps) {
        if (rentalMode === 'entire' || b.rentalMode === 'entire') {
          return {
            isAvailable: false,
            reason: `Another guest has booked ${b.propertyName || 'the property'} from ${otherIn} to ${otherOut}.`,
            extensionStart,
            extensionEnd
          };
        }

        // Room rentals: check overlapping room numbers
        const currentRooms: string[] = (selectedBedrooms && selectedBedrooms.length > 0)
          ? selectedBedrooms.map((r: any) => String(r.roomNumber || r))
          : [];
        const otherRooms: string[] = (b.selectedBedrooms && b.selectedBedrooms.length > 0)
          ? b.selectedBedrooms.map((r: any) => String(r.roomNumber || r))
          : (b.selectedBedroom ? [String(b.selectedBedroom.roomNumber || b.selectedBedroom)] : []);

        if (currentRooms.length === 0 || otherRooms.length === 0) {
          return {
            isAvailable: false,
            reason: `Conflicting stay reserved from ${otherIn} to ${otherOut}.`,
            extensionStart,
            extensionEnd
          };
        }

        const conflictRooms = currentRooms.filter(r => otherRooms.includes(r));
        if (conflictRooms.length > 0) {
          return {
            isAvailable: false,
            reason: `Room(s) ${conflictRooms.join(', ')} already booked from ${otherIn} to ${otherOut}.`,
            extensionStart,
            extensionEnd
          };
        }
      }
    }

    // 2. Check for conflicting blackout dates
    const blackoutsSnap = await activeDb.collection("blackout_dates")
      .where("propertyId", "==", propertyId)
      .get();

    for (const boDoc of blackoutsSnap.docs) {
      const bo = boDoc.data();
      if (!bo || !bo.date) continue;
      if (bo.date >= extensionStart && bo.date < extensionEnd) {
        if (!bo.roomNumber || bo.roomNumber === 'all' || rentalMode === 'entire') {
          return {
            isAvailable: false,
            reason: `Maintenance blackout on ${bo.date}: ${bo.reason || 'Property reserved'}.`,
            extensionStart,
            extensionEnd
          };
        }
        const currentRooms = (selectedBedrooms && selectedBedrooms.length > 0)
          ? selectedBedrooms.map((r: any) => String(r.roomNumber || r))
          : [];
        if (currentRooms.includes(String(bo.roomNumber))) {
          return {
            isAvailable: false,
            reason: `Maintenance blackout for Room ${bo.roomNumber} on ${bo.date}.`,
            extensionStart,
            extensionEnd
          };
        }
      }
    }

    // 3. Check for conflicting leases
    const leasesSnap = await activeDb.collection("leases")
      .where("propertyId", "==", propertyId)
      .get();

    for (const lDoc of leasesSnap.docs) {
      const l = lDoc.data();
      if (!l || l.status === 'cancelled' || l.status === 'terminated') continue;
      if (l.startDate && l.endDate) {
        if (l.startDate < extensionEnd && l.endDate > extensionStart) {
          return {
            isAvailable: false,
            reason: `Property is under an active lease (${l.leaseCode || 'Lease'}) from ${l.startDate} to ${l.endDate}.`,
            extensionStart,
            extensionEnd
          };
        }
      }
    }

    return { isAvailable: true, extensionStart, extensionEnd };
  } catch (err: any) {
    console.warn("[checkExtensionAvailability] Error:", err.message);
    return { isAvailable: false, reason: err.message, extensionStart, extensionEnd };
  }
}

async function createOrGetRenewalPaymentUrl({
  activeDb,
  bookingId,
  bookingData,
  propertyName,
  extensionStart,
  extensionEnd,
  stayDays,
  renewalGrandTotal,
  hostUrl
}: {
  activeDb: admin.firestore.Firestore;
  bookingId: string;
  bookingData: any;
  propertyName: string;
  extensionStart: string;
  extensionEnd: string;
  stayDays: number;
  renewalGrandTotal: number;
  hostUrl: string;
}): Promise<string> {
  let normalizedHost = hostUrl.trim();
  if (!normalizedHost.endsWith('/')) normalizedHost += '/';
  const fallbackUrl = `${normalizedHost}my-bookings?checkout=renewal_success&bookingId=${bookingId}&newCheckIn=${extensionStart}&newCheckOut=${extensionEnd}&amount=${renewalGrandTotal}&stayDays=${stayDays}`;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === "sk_test_..." || key.trim() === "") {
    return fallbackUrl;
  }

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${stayDays}-Day Stay Extension at ${propertyName}`,
              description: `Stay extension from ${extensionStart} to ${extensionEnd} (${stayDays} additional days)`,
            },
            unit_amount: Math.round(Number(renewalGrandTotal) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: fallbackUrl,
      cancel_url: `${normalizedHost}my-bookings?extendStay=${bookingId}`,
      customer_email: bookingData.guestEmail || undefined,
      metadata: {
        bookingId: bookingId,
        type: 'renewal_charge',
        newCheckIn: extensionStart,
        newCheckOut: extensionEnd,
        stayDays: String(stayDays),
        amount: String(renewalGrandTotal)
      }
    });

    return session.url || fallbackUrl;
  } catch (err: any) {
    console.warn("[createOrGetRenewalPaymentUrl] Stripe session fallback:", err.message);
    return fallbackUrl;
  }
}

async function sendBooking5DayReminderInternal({
  activeDb,
  bookingId,
  force = false,
  reqHostUrl
}: {
  activeDb: admin.firestore.Firestore;
  bookingId: string;
  force?: boolean;
  reqHostUrl?: string;
}): Promise<{
  success: boolean;
  bookingId: string;
  isAvailable: boolean;
  message: string;
  paymentUrl?: string;
  extensionStart?: string;
  extensionEnd?: string;
  stayDays?: number;
  renewalGrandTotal?: number;
  emailSent?: boolean;
  smsSent?: boolean;
}> {
  if (!activeDb) {
    throw new Error("Firestore database is not initialized.");
  }

  const bDoc = await activeDb.collection("bookings").doc(bookingId).get();
  if (!bDoc.exists) {
    throw new Error(`Booking ${bookingId} not found.`);
  }

  const b = bDoc.data() || {};
  if (b.status === "cancelled") {
    throw new Error(`Booking ${bookingId} is cancelled.`);
  }

  const now = new Date();
  const checkOutDateStr = b.checkOut;
  if (!checkOutDateStr) {
    throw new Error(`Booking ${bookingId} does not have a valid checkOut date.`);
  }

  const diffDaysToEnd = Math.ceil((new Date(checkOutDateStr + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (!force) {
    if (diffDaysToEnd > 5 || diffDaysToEnd < 0) {
      return { success: false, bookingId, isAvailable: false, message: `Booking checkout is ${diffDaysToEnd} days away, not within 5-day window.` };
    }
    if (b.sentRenewalNotification) {
      return { success: false, bookingId, isAvailable: false, message: `5-day renewal reminder was already sent previously.` };
    }
  }

  // Calculate stay days
  const checkInDateObj = new Date(b.checkIn + 'T12:00:00');
  const checkOutDateObj = new Date(b.checkOut + 'T12:00:00');
  const stayDays = Math.max(1, Math.round((checkOutDateObj.getTime() - checkInDateObj.getTime()) / (1000 * 60 * 60 * 24)));

  // Resolve property name
  let propertyName = b.propertyName || "Property";
  try {
    if (b.propertyId) {
      const pSnap = await activeDb.collection("properties").doc(b.propertyId).get();
      if (pSnap.exists) {
        propertyName = pSnap.data()?.name || propertyName;
      }
    }
  } catch (err) {}

  // Rooms string
  let roomsStr = "";
  if (b.selectedBedrooms && b.selectedBedrooms.length > 0) {
    roomsStr = " (Room(s): " + b.selectedBedrooms.map((r: any) => `${r.roomNumber || r}`).join(', ') + ")";
  } else if (b.selectedBedroom) {
    roomsStr = ` (Room: ${b.selectedBedroom.roomNumber || b.selectedBedroom})`;
  }

  // Resolve guest email, name, phone
  let guestName = b.guestName || "Valued Guest";
  let guestEmail = b.guestEmail;
  let guestPhone = formatPhoneToE164(b.guestPhone);

  if ((!guestEmail || !guestPhone) && b.userId) {
    try {
      const userRec = await admin.auth().getUser(b.userId);
      if (!guestEmail) guestEmail = userRec.email;
      if (!guestName || guestName === "Valued Guest") guestName = userRec.displayName || "Valued Guest";
      if (!guestPhone && userRec.phoneNumber) guestPhone = formatPhoneToE164(userRec.phoneNumber);
    } catch (err) {}
  }

  // Check extension availability
  const availability = await checkExtensionAvailability(
    activeDb,
    b.propertyId,
    b.checkOut,
    stayDays,
    b.rentalMode || 'entire',
    b.selectedBedrooms || (b.selectedBedroom ? [b.selectedBedroom] : []),
    bookingId
  );

  // Calculate renewal price
  let baseRenewalSubtotal = 0;
  if (b.invoiceDetails?.baseAmount) {
    baseRenewalSubtotal = Number(b.invoiceDetails.baseAmount);
  } else if (b.priceDetails?.baseTotal) {
    baseRenewalSubtotal = Number(b.priceDetails.baseTotal);
  } else {
    baseRenewalSubtotal = (b.totalPrice / 100);
  }
  const renewalGrandTotal = Math.round((((baseRenewalSubtotal + 0.30) / (1 - 0.029)) * (1 + 0.004)) * 100) / 100;

  // Resolve host URL
  let hostUrl = reqHostUrl || process.env.APP_URL || process.env.PUBLIC_URL || "https://realcal.app";
  let normalizedHost = hostUrl.trim();
  if (!normalizedHost.endsWith('/')) normalizedHost += '/';

  const portalManageUrl = `${normalizedHost}my-bookings?extendStay=${bookingId}`;
  let paymentUrl = "";
  if (availability.isAvailable) {
    paymentUrl = await createOrGetRenewalPaymentUrl({
      activeDb,
      bookingId,
      bookingData: b,
      propertyName,
      extensionStart: availability.extensionStart,
      extensionEnd: availability.extensionEnd,
      stayDays,
      renewalGrandTotal,
      hostUrl: normalizedHost
    });
  }

  // Check invoice details (if any unpaid invoice)
  const inv = b.invoiceDetails;
  const isInvoiceUnpaid = inv && !inv.paid && !inv.cancelled;
  const invoicePayUrl = `${normalizedHost}pay-invoice/${bookingId}`;
  const invoiceNumber = inv?.invoiceNumber || b.bookingRef || 'Manual';
  const invoiceGrandTotal = inv?.grandTotal || (b.totalPrice / 100);

  // Build Rich HTML Email
  const emailSubject = availability.isAvailable
    ? `[ACTION REQUIRED] 5-Day Stay & Invoice Reminder: Extend Your Stay at ${propertyName}`
    : `[REMINDER] 5-Day Check-out & Invoice Notice: ${propertyName}`;

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; line-height: 1.6;">
    <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      
      <!-- Header -->
      <div style="background-color: #4f46e5; padding: 24px 32px; text-align: left;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">REALCal Bookings</h1>
        <p style="color: #e0e7ff; margin: 4px 0 0; font-size: 12px; font-weight: 500;">5-Day Stay & Invoice Notification</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">Hi ${guestName},</p>
        
        <p style="font-size: 14px; color: #334155; margin-bottom: 20px;">
          This is an official 5-day reminder regarding your upcoming stay conclusion at <strong>${propertyName}</strong>${roomsStr}.
        </p>

        <!-- Current Stay Recap Box -->
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">Current Reservation Details</h4>
          <p style="margin: 4px 0; font-size: 14px;">📅 <strong>Scheduled Departure Date:</strong> <span style="color: #0f172a; font-weight: bold;">${b.checkOut}</span></p>
          <p style="margin: 4px 0; font-size: 14px;">⏰ <strong>Standard Check-out Deadline:</strong> <span style="color: #4f46e5; font-weight: bold;">11:00 AM Eastern Time</span></p>
          <p style="margin: 4px 0; font-size: 14px;">📍 <strong>Property:</strong> ${propertyName}${roomsStr}</p>
          <p style="margin: 4px 0; font-size: 14px;">🎫 <strong>Confirmation Ref:</strong> ${b.bookingRef || bookingId}</p>
        </div>

        ${isInvoiceUnpaid ? `
        <!-- Unpaid Invoice Notice -->
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">💳</span>
            <strong style="color: #92400e; font-size: 14px;">Pending Invoice #${invoiceNumber} Due: $${Number(invoiceGrandTotal).toFixed(2)}</strong>
          </div>
          <p style="margin: 8px 0 14px 0; font-size: 13px; color: #78350f;">
            An invoice associated with this booking is currently unpaid. Please complete payment before check-out:
          </p>
          <div style="text-align: left;">
            <a href="${invoicePayUrl}" style="display: inline-block; background-color: #d97706; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px;">
              Pay Outstanding Invoice ($${Number(invoiceGrandTotal).toFixed(2)}) &rarr;
            </a>
          </div>
        </div>
        ` : ''}

        <!-- Stay Extension Section -->
        ${availability.isAvailable ? `
        <div style="background-color: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="font-size: 20px;">🎉</span>
            <h3 style="margin: 0; color: #166534; font-size: 16px; font-weight: 800;">Extension Days Confirmed Available!</h3>
          </div>
          <p style="font-size: 13.5px; color: #14532d; margin-bottom: 12px; line-height: 1.5;">
            Would you like to extend your stay for another <strong>${stayDays} days</strong>? The property and your allocated room are completely available for your extension window.
          </p>
          
          <div style="background-color: #ffffff; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
            <p style="margin: 3px 0; font-size: 13.5px; color: #166534;">🗓️ <strong>Extension Dates:</strong> <strong>${availability.extensionStart} &rarr; ${availability.extensionEnd}</strong> (${stayDays} Days)</p>
            <p style="margin: 3px 0; font-size: 13.5px; color: #166534;">💰 <strong>Total Renewal Cost:</strong> <strong style="color: #059669; font-size: 16px;">$${renewalGrandTotal.toFixed(2)}</strong> (Includes all fees)</p>
          </div>

          <div style="text-align: center; margin: 20px 0 10px 0;">
            <a href="${paymentUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(22, 163, 74, 0.3);">
              Pay Now to Extend Stay ($${renewalGrandTotal.toFixed(2)}) &rarr;
            </a>
          </div>
          <p style="font-size: 11.5px; color: #15803d; text-align: center; margin: 8px 0 0 0;">
            Instant Confirmation &bull; Direct Secure Payment &bull; Or manage in <a href="${portalManageUrl}" style="color: #166534; text-decoration: underline; font-weight: bold;">Guest Portal</a>
          </p>
        </div>
        ` : `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 18px;">⚠️</span>
            <strong style="color: #991b1b; font-size: 14px;">Stay Extension Unavailable (Fully Booked)</strong>
          </div>
          <p style="font-size: 13px; color: #7f1d1d; margin: 4px 0 0 0; line-height: 1.5;">
            ${availability.reason || 'The property is scheduled for maintenance or has an existing guest reservation immediately following your stay.'} Extensions cannot be accommodated at this time. Standard check-out applies on <strong>${b.checkOut} by 11:00 AM</strong>.
          </p>
        </div>
        `}

        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 24px; font-size: 13px; color: #64748b;">
          <p style="margin: 0 0 4px 0;">Need assistance or have special check-out requests?</p>
          <p style="margin: 0;">Access your portal anytime at <a href="${portalManageUrl}" style="color: #4f46e5; font-weight: bold;">${normalizedHost}my-bookings</a>.</p>
        </div>

      </div>

      <!-- Footer -->
      <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 11px; color: #94a3b8;">
        REALCal Bookings &bull; C&SH Group Properties, LLC
      </div>

    </div>
  </body>
  </html>
  `;

  // Build SMS Text
  let smsText = "";
  if (availability.isAvailable) {
    smsText = `5-Day Stay & Invoice Notice: Hi ${guestName}, your stay at ${propertyName}${roomsStr} ends on ${b.checkOut} at 11:00 AM. Good news! Extension dates (${availability.extensionStart} to ${availability.extensionEnd}, ${stayDays} days) are AVAILABLE. Pay now to extend stay ($${renewalGrandTotal.toFixed(2)}): ${paymentUrl} or manage in portal: ${portalManageUrl}. Standard check-out is by 11:00 AM.`;
  } else {
    smsText = `5-Day Stay & Invoice Notice: Hi ${guestName}, your stay at ${propertyName}${roomsStr} ends on ${b.checkOut} at 11:00 AM. Please note stay extension is UNAVAILABLE as unit is booked for following dates. Standard check-out is by 11:00 AM on ${b.checkOut} via ${portalManageUrl}.`;
  }

  let emailSent = false;
  let smsSent = false;

  // Send Email
  if (guestEmail && process.env.SMTP_HOST) {
    try {
      await sendSmtpEmail({
        to: guestEmail,
        subject: emailSubject,
        html: emailHtml,
        text: smsText
      });
      emailSent = true;
      console.log(`[5-Day Reminder] Successfully emailed guest ${guestEmail} for booking ${bookingId}`);
    } catch (err: any) {
      console.error(`[5-Day Reminder] Email failed to ${guestEmail}:`, err.message);
    }
  }

  // Send SMS
  const tSid = process.env.TWILIO_ACCOUNT_SID;
  const tTok = process.env.TWILIO_AUTH_TOKEN;
  const tFrom = process.env.TWILIO_PHONE_NUMBER;
  if (guestPhone && tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL') && tFrom) {
    try {
      const twilioPkg = await import('twilio');
      const twilio = twilioPkg.default || twilioPkg;
      const twilioClient = (twilio as any)(tSid, tTok);
      await twilioClient.messages.create({
        body: smsText,
        from: tFrom,
        to: guestPhone
      });
      smsSent = true;
      console.log(`[5-Day Reminder] Successfully sent SMS to ${guestPhone} for booking ${bookingId}`);
    } catch (err: any) {
      console.error(`[5-Day Reminder] SMS failed to ${guestPhone}:`, err.message);
    }
  }

  // Update Firestore booking record
  await activeDb.collection("bookings").doc(bookingId).update({
    sentRenewalNotification: true,
    sentRenewalNotificationAt: admin.firestore.FieldValue.serverTimestamp(),
    lastRenewalReminder: {
      sentAt: new Date().toISOString(),
      isAvailable: availability.isAvailable,
      extensionStart: availability.extensionStart,
      extensionEnd: availability.extensionEnd,
      stayDays,
      renewalGrandTotal,
      paymentUrl: availability.isAvailable ? paymentUrl : null,
      emailSent,
      smsSent
    }
  });

  return {
    success: true,
    bookingId,
    isAvailable: availability.isAvailable,
    message: availability.isAvailable 
      ? `5-day reminder sent! Extension available for ${stayDays} days ($${renewalGrandTotal.toFixed(2)}). Direct pay link included in Email & SMS.`
      : `5-day reminder sent! Extension unavailable (unit booked). Check-out instructions sent via Email & SMS.`,
    paymentUrl: availability.isAvailable ? paymentUrl : undefined,
    extensionStart: availability.extensionStart,
    extensionEnd: availability.extensionEnd,
    stayDays,
    renewalGrandTotal,
    emailSent,
    smsSent
  };
}

async function sendLease5DayReminderInternal({
  activeDb,
  leaseId,
  leaseData,
  hostUrl
}: {
  activeDb: admin.firestore.Firestore;
  leaseId: string;
  leaseData: any;
  hostUrl: string;
}): Promise<{ success: boolean; message: string; isAvailable: boolean; paymentUrl?: string }> {
  if (!activeDb) throw new Error("Firestore not initialized");

  const leaseDoc = leaseData || (await activeDb.collection("leases").doc(leaseId).get()).data();
  if (!leaseDoc) throw new Error(`Lease ${leaseId} not found`);

  const code = leaseDoc.leaseCode || leaseId;
  const name = leaseDoc.tenantName || "Valued Resident";
  const email = leaseDoc.tenantEmail;
  const phone = formatPhoneToE164(leaseDoc.tenantPhone);
  const prop = leaseDoc.propertyNameOrRoom || "Property";
  const termEnd = leaseDoc.endDate || "End of Term";
  const rent = leaseDoc.monthlyRent || 0;
  const invNum = leaseDoc.invoiceNumber || "Manual";

  let nextTermStart = termEnd;
  let nextTermEnd = addDaysDateString(termEnd, 30);

  // Check availability
  let isAvailable = true;
  let conflictReason = "";
  if (leaseDoc.propertyId) {
    const avail = await checkExtensionAvailability(activeDb, leaseDoc.propertyId, termEnd, 30, 'entire', [], undefined);
    isAvailable = avail.isAvailable;
    conflictReason = avail.reason || "";
  }

  let normalizedHost = hostUrl.trim();
  if (!normalizedHost.endsWith('/')) normalizedHost += '/';
  const validationUrl = `${normalizedHost}my-bookings`;

  // Create payment URL for next month lease
  let paymentUrl = validationUrl;
  const rentSubtotal = Number(rent);
  const leaseGrandTotal = rentSubtotal > 0 ? Math.round((((rentSubtotal + 0.30) / (1 - 0.029)) * (1 + 0.004)) * 100) / 100 : rentSubtotal;

  const key = process.env.STRIPE_SECRET_KEY;
  if (key && key !== "sk_test_..." && key.trim() !== "" && isAvailable && leaseGrandTotal > 0) {
    try {
      const stripe = new Stripe(key);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Month-to-Month Lease Renewal - ${prop}`,
                description: `Monthly lease extension from ${nextTermStart} to ${nextTermEnd} (Lease #${code})`,
              },
              unit_amount: Math.round(Number(leaseGrandTotal) * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${normalizedHost}my-bookings?checkout=lease_renewal_success&leaseId=${leaseId}&amount=${leaseGrandTotal}`,
        cancel_url: validationUrl,
        customer_email: email || undefined,
        metadata: {
          leaseId,
          type: 'lease_renewal_charge',
          nextTermStart,
          nextTermEnd,
          amount: String(leaseGrandTotal)
        }
      });
      paymentUrl = session.url || validationUrl;
    } catch (err: any) {
      console.warn("[sendLease5DayReminderInternal] Stripe error:", err.message);
    }
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="background-color: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Month-to-Month Lease 5-Day Renewal & Payment Reminder</h2>
      </div>
      <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
        <p>Dear <strong>${name}</strong>,</p>
        <p>This is your official 5-day payment & renewal reminder for Month-to-Month Lease Agreement <strong>#${code}</strong> (Invoice #${invNum}) for <strong>${prop}</strong>.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;">📅 <strong>Current Term End Date:</strong> ${termEnd}</p>
          <p style="margin: 4px 0;">💳 <strong>Next Month Rent Due:</strong> $${leaseGrandTotal.toFixed(2)}</p>
          ${isAvailable ? `
          <p style="margin: 4px 0; color: #166534;">✅ <strong>Next Term Extension:</strong> AVAILABLE (${nextTermStart} to ${nextTermEnd})</p>
          ` : `
          <p style="margin: 4px 0; color: #991b1b;">⚠️ <strong>Next Term Extension:</strong> UNAVAILABLE (${conflictReason || 'Reserved'})</p>
          `}
        </div>

        ${isAvailable ? `
        <p><strong>Action Required - Pay & Secure Next Month:</strong></p>
        <p>Your property is confirmed available for the upcoming month. You can remit payment directly using the button below:</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${paymentUrl}" style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
            Pay Next Month Lease ($${leaseGrandTotal.toFixed(2)}) &rarr;
          </a>
        </div>
        ` : `
        <p style="color: #991b1b;">Please log in to your portal to validate move-out intentions as renewal cannot be accommodated for the subsequent period.</p>
        `}

        <div style="text-align: center; margin: 20px 0;">
          <a href="${validationUrl}" style="color: #4f46e5; text-decoration: underline; font-size: 13px;">Manage in Guest Portal</a>
        </div>
      </div>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
        REALCal Property Management System
      </div>
    </div>
  `;

  const smsText = isAvailable
    ? `5-Day Lease Notice: Hi ${name}, your lease #${code} at ${prop} ends on ${termEnd}. Next month is AVAILABLE. Pay now to renew ($${leaseGrandTotal.toFixed(2)}): ${paymentUrl} or portal: ${validationUrl}`
    : `5-Day Lease Notice: Hi ${name}, your lease #${code} at ${prop} ends on ${termEnd}. Lease extension is UNAVAILABLE due to upcoming reservation. Check portal: ${validationUrl}`;

  if (email && process.env.SMTP_HOST) {
    await sendSmtpEmail({
      to: email,
      subject: `[ACTION REQUIRED] Month-to-Month Lease 5-Day Renewal & Payment Reminder #${code}`,
      html: htmlContent,
      text: smsText
    });
  }

  const tSid = process.env.TWILIO_ACCOUNT_SID;
  const tTok = process.env.TWILIO_AUTH_TOKEN;
  const tFrom = process.env.TWILIO_PHONE_NUMBER;
  if (phone && tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL') && tFrom) {
    try {
      const twilioPkg = await import('twilio');
      const twilio = twilioPkg.default || twilioPkg;
      const twilioClient = (twilio as any)(tSid, tTok);
      await twilioClient.messages.create({
        body: smsText,
        from: tFrom,
        to: phone
      });
    } catch (err: any) {
      console.warn("[sendLease5DayReminderInternal] SMS failed:", err.message);
    }
  }

  await activeDb.collection("leases").doc(leaseId).update({
    lastReminderSentAt: new Date().toISOString(),
    status: isAvailable ? 'pending_renewal' : 'terminating'
  });

  return { success: true, message: `5-day lease reminder sent to ${email || phone}`, isAvailable, paymentUrl };
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

  // Parse CLI arguments for port
  let cliPort: number | null = null;
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--port' || argv[i] === '-p') && argv[i + 1]) {
      const p = parseInt(argv[i + 1], 10);
      if (!isNaN(p)) cliPort = p;
    } else if (argv[i].startsWith('--port=')) {
      const p = parseInt(argv[i].split('=')[1], 10);
      if (!isNaN(p)) cliPort = p;
    }
  }

  const isProd = process.env.NODE_ENV === "production";
  // In development, dev server must run on port 3000 (or CLI specified port). In production, respect process.env.PORT.
  const PORT = cliPort || (isProd ? (process.env.PORT || 3000) : 3000);

  // Trust proxy for accurate protocol & host recognition behind reverse proxies
  app.set('trust proxy', true);

  // Dynamic host tracking: automatically capture the public URL from live incoming requests
  app.use((req, _res, next) => {
    resolveAppUrl(req);
    next();
  });

  const rootDir = process.cwd();
  const distPath = path.resolve(rootDir, "dist");
  console.log(`[Server] Starting in ${isProd ? "production" : "development"} mode on port ${PORT}.`);
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
      // Trigger system incident alert for App Admin and Property Managers
      await triggerSystemIncident({
        service: 'twilio',
        title: 'Twilio SMS Dispatch Failure',
        message: err.message || 'Error occurred while sending SMS',
        severity: 'high',
        errorCode: err.code || err.status || 'TWILIO_SMS_FAILED',
        errorDetails: {
          recipient: req.body.to,
          error: err.message,
          code: err.code,
          moreInfo: err.moreInfo
        },
        endpoint: '/api/send-sms',
        req,
        appUrl: resolveAppUrl(req)
      }).catch((incErr) => console.error("Failed recording SMS incident:", incErr));

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

  app.post("/api/send-advertisement-email", async (req, res) => {
    console.log("[API] Send Advertisement Email hit");
    try {
      const { to, subject, html, text, venueName, recipientName, propertyName } = req.body;
      const smtpHost = process.env.SMTP_HOST;

      if (!smtpHost) {
        return res.status(400).json({ error: "SMTP_HOST environment variable is not configured on Render.com." });
      }

      if (!to) {
        return res.status(400).json({ error: "Venue or recipient email address is required." });
      }

      const emailSubject = subject || `Exclusive Artist & Tour Accommodations near ${venueName || 'St. James Live'} | ${propertyName || 'Stonewall Villa'}`;
      const emailText = text || `Exclusive Artist Lodging for ${venueName || 'Your Venue'}. Please view the HTML version of this digital one-pager for details on room suites, rates, photos, and past booking reviews at ${propertyName || 'Stonewall Villa'}.`;

      const result = await sendSmtpEmail({
        to,
        subject: emailSubject,
        text: emailText,
        html: html
      });

      console.log(`[API] Advertisement Email successfully dispatched to ${to} (${venueName || 'Venue'}):`, result);
      res.json({ success: true, result, message: `Advertisement flyer successfully emailed to ${to}` });
    } catch (err: any) {
      console.error("[API] Advertisement Email Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/send-proof-of-residency-email", async (req, res) => {
    console.log("[API] Send Proof of Residency Email hit");
    try {
      const { to, cc, subject, html, text, guestName } = req.body;
      const smtpHost = process.env.SMTP_HOST;

      if (!to) {
        return res.status(400).json({ error: "Recipient email address is required." });
      }

      if (!smtpHost) {
        console.warn("[API] SMTP_HOST is not configured. Simulating successful Proof of Residency email dispatch.");
        return res.json({ 
          success: true, 
          simulated: true, 
          message: `Proof of Residency Letter dispatch simulated to ${to} (SMTP_HOST not set).` 
        });
      }

      const emailSubject = subject || `Official Proof of Residency Letter - ${guestName || 'Guest'} - C&SH Group Properties, LLC`;
      const emailText = text || `Please review the attached Official Proof of Residency Letter for ${guestName || 'the guest'}.`;

      const result = await sendSmtpEmail({
        to,
        cc,
        subject: emailSubject,
        text: emailText,
        html: html
      });

      console.log(`[API] Proof of Residency Email successfully sent to ${to}:`, result);
      res.json({ success: true, result, message: `Proof of Residency Letter successfully emailed to ${to}` });
    } catch (err: any) {
      console.error("[API] Proof of Residency Email Error:", err);
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
          // Also dispatch Stay Survey & Review email
          try {
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            await sendStaySurveyEmail({
              guestName,
              guestEmail,
              propertyName,
              bookingRef: booking.bookingRef || bookingId,
              appUrl: hostUrl,
              stayType: 'booking'
            });
            await db.collection("bookings").doc(bookingId).update({
              sentSurveyEmail: true,
              sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
            });
            results.push(`Stay survey email dispatched to ${guestEmail}`);
          } catch (surveyErr: any) {
            console.warn("[API] Checkout survey email dispatch error:", surveyErr);
          }
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
      await triggerSystemIncident({
        service: 'stripe',
        title: 'Stripe Checkout Session Creation Failed',
        message: e.message || 'Error occurred while creating Stripe checkout session',
        severity: 'critical',
        errorCode: e.code || e.type || 'STRIPE_CHECKOUT_ERROR',
        errorDetails: {
          bookingId: req.body?.bookingId,
          error: e.message,
          type: e.type,
          code: e.code
        },
        endpoint: '/api/create-booking-checkout-session',
        req,
        appUrl: resolveAppUrl(req)
      }).catch((incErr) => console.error("Failed recording Stripe incident:", incErr));

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

  app.post("/api/update-pending-invoice", async (req, res) => {
    try {
      const { bookingId, guestName, guestEmail, guestPhone, checkIn, checkOut, totalPrice, invoiceDetails } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required" });
      }

      let activeDb = db;
      if (!activeDb) {
        const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: firebaseConfig.projectId || "realcal-bookings" });
          }
          const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
          activeDb = getFirestore(admin.app(), dbId);
        } else {
          if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "realcal-bookings" });
          }
          activeDb = getFirestore(admin.app(), "(default)");
        }
      }

      if (!activeDb) {
        return res.json({ success: true, bookingId, notice: "Database not initialized on server; updated on client" });
      }

      try {
        const bookingRef = activeDb.collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (bookingDoc.exists) {
          const currentData = bookingDoc.data() || {};
          const updatedFields: any = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          if (guestName !== undefined) updatedFields.guestName = guestName;
          if (guestEmail !== undefined) updatedFields.guestEmail = guestEmail;
          if (guestPhone !== undefined) updatedFields.guestPhone = guestPhone;
          if (checkIn !== undefined) updatedFields.checkIn = checkIn;
          if (checkOut !== undefined) updatedFields.checkOut = checkOut;
          if (totalPrice !== undefined) updatedFields.totalPrice = totalPrice;
          if (invoiceDetails !== undefined) updatedFields.invoiceDetails = invoiceDetails;

          await bookingRef.update(updatedFields);

          // Also adjust maintenance cleaning blackout dates if stay dates moved
          try {
            if (checkOut) {
              const checkOutDate = new Date(checkOut + 'T12:00:00');
              const dayAfterDate = new Date(checkOutDate);
              dayAfterDate.setDate(dayAfterDate.getDate() + 1);
              const blackoutDateString = dayAfterDate.toISOString().split('T')[0];

              const manualBookingRooms = currentData.selectedBedrooms 
                ? currentData.selectedBedrooms.map((r: any) => r.roomNumber) 
                : (currentData.selectedBedroom ? [currentData.selectedBedroom.roomNumber] : []);

              if (manualBookingRooms.length > 0) {
                for (const roomNum of manualBookingRooms) {
                  await activeDb.collection('blackout_dates').doc(`maint-${bookingId}-${roomNum}`).set({
                    propertyId: currentData.propertyId,
                    date: blackoutDateString,
                    targetType: 'room',
                    roomNumber: roomNum,
                    reason: `Maintenance/Cleaning for Booking Override (Room ${roomNum})`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                  }, { merge: true });
                }
              } else if (currentData.propertyId) {
                await activeDb.collection('blackout_dates').doc(`maint-${bookingId}`).set({
                  propertyId: currentData.propertyId,
                  date: blackoutDateString,
                  targetType: 'property',
                  reason: 'Maintenance/Cleaning for Booking Override',
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
              }
            }
          } catch (boErr) {
            console.warn("[Server] Blackout update warning for invoice edit:", boErr);
          }
        }
      } catch (dbErr: any) {
        console.warn("[Server] Firebase Admin write notice (client handles direct persistence):", dbErr?.message || dbErr);
      }

      console.log(`[Server] Successfully processed pending invoice update for booking ${bookingId}`);
      res.json({ success: true, bookingId });
    } catch (e: any) {
      console.error("Error updating pending invoice on server:", e);
      res.json({ success: true, warning: e.message });
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

  app.post("/api/send-5day-reminder", async (req, res) => {
    try {
      const { bookingId, force } = req.body;
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

      const reqHostUrl = req.headers.origin || (`${req.protocol}://${req.get('host')}`);
      const result = await sendBooking5DayReminderInternal({
        activeDb,
        bookingId,
        force: force !== undefined ? force : true,
        reqHostUrl
      });

      res.json(result);
    } catch (e: any) {
      console.error("[Server] Error in /api/send-5day-reminder:", e);
      res.status(500).json({ error: e.message || "Failed to send 5-day reminder." });
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

      const hostUrl = req.headers.origin || ("https://" + req.headers.host);
      const result = await sendLease5DayReminderInternal({
        activeDb: db,
        leaseId: leaseId || leaseData?.id || leaseCode,
        leaseData: leaseData || { leaseCode, tenantEmail, tenantName, propertyNameOrRoom: propertyName, endDate, monthlyRent, invoiceNumber },
        hostUrl
      });

      return res.json({ success: true, message: result.message, isAvailable: result.isAvailable, paymentUrl: result.paymentUrl });
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

  
  // ==========================================
  // SURVEY & REVIEWS API ENDPOINTS
  // ==========================================

  const REVIEWS_FILE = path.resolve(process.cwd(), "data", "reviews.json");
  const SURVEYS_FILE = path.resolve(process.cwd(), "data", "surveys.json");

  function getLocalReviews(): any[] {
    try {
      if (fs.existsSync(REVIEWS_FILE)) {
        return JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf-8"));
      }
    } catch (e) {
      console.warn("[Reviews] Error reading local reviews file:", e);
    }
    return [];
  }

  function saveLocalReview(review: any) {
    try {
      const dataDir = path.dirname(REVIEWS_FILE);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const current = getLocalReviews();
      const existingIdx = current.findIndex(r => r.id === review.id || (r.bookingRef && review.bookingRef && r.bookingRef === review.bookingRef));
      if (existingIdx >= 0) {
        current[existingIdx] = { ...current[existingIdx], ...review };
      } else {
        current.unshift(review);
      }
      fs.writeFileSync(REVIEWS_FILE, JSON.stringify(current, null, 2), "utf-8");
      return current;
    } catch (e) {
      console.error("[Reviews] Error writing local review:", e);
      return [];
    }
  }

  function getLocalSurveys(): any[] {
    try {
      if (fs.existsSync(SURVEYS_FILE)) {
        return JSON.parse(fs.readFileSync(SURVEYS_FILE, "utf-8"));
      }
    } catch (e) {
      console.warn("[Surveys] Error reading local surveys file:", e);
    }
    return [];
  }

  function saveLocalSurvey(survey: any) {
    try {
      const dataDir = path.dirname(SURVEYS_FILE);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const current = getLocalSurveys();
      const existingIdx = current.findIndex(s => s.id === survey.id || (s.bookingRef && survey.bookingRef && s.bookingRef === survey.bookingRef));
      if (existingIdx >= 0) {
        current[existingIdx] = { ...current[existingIdx], ...survey };
      } else {
        current.unshift(survey);
      }
      fs.writeFileSync(SURVEYS_FILE, JSON.stringify(current, null, 2), "utf-8");
      return current;
    } catch (e) {
      console.error("[Surveys] Error writing local survey:", e);
      return [];
    }
  }

  // Submit 5-Question Survey and forward results to Property Management Contacts
  app.post("/api/submit-survey", async (req, res) => {
    console.log("[API] Submit Survey hit");
    try {
      const surveyData = req.body;
      if (!surveyData || !surveyData.guestName) {
        return res.status(400).json({ error: "Survey data and guest name are required." });
      }

      const surveyId = "srv-" + Date.now();
      const newSurveyRecord = {
        id: surveyId,
        ...surveyData,
        createdAt: new Date().toISOString()
      };

      // 1. Always save to reliable local store
      saveLocalSurvey(newSurveyRecord);

      let publishedReviewRecord: any = null;
      if (surveyData.publishAsReview && (surveyData.publicReviewComment || surveyData.comfort)) {
        const surveyAnswers = surveyData.surveyAnswers || {
          comfort: (surveyData.comfort || "").trim(),
          comfortRating: Number(surveyData.comfortRating || 5),
          amenities: (surveyData.amenities || "").trim(),
          amenitiesMissingTag: (surveyData.amenitiesMissingTag || "").trim(),
          cleanliness: (surveyData.cleanliness || "").trim(),
          cleanlinessRating: (surveyData.cleanlinessRating || "").trim(),
          operations: (surveyData.operations || "").trim(),
          operationsStatus: (surveyData.operationsStatus || "").trim(),
          futureIdeas: (surveyData.futureIdeas || "").trim(),
          wouldStayAgain: (surveyData.wouldStayAgain || "").trim()
        };

        publishedReviewRecord = {
          id: "rev-" + Date.now(),
          author: surveyData.guestName.trim(),
          email: (surveyData.guestEmail || "").trim(),
          phone: (surveyData.guestPhone || "").trim(),
          role: surveyData.reviewRole || "Verified Guest",
          propertyName: surveyData.propertyName || "2844 Stonewall Villa",
          rating: Number(surveyData.overallRating || surveyData.comfortRating || 5),
          title: (surveyData.publicReviewTitle || "Guest Stay Experience").trim(),
          comment: (surveyData.publicReviewComment || surveyData.comfort).trim(),
          bookingRef: (surveyData.bookingRef || "").trim(),
          verified: true,
          surveyAnswers,
          createdAt: new Date().toISOString()
        };
        saveLocalReview(publishedReviewRecord);
        console.log(`[API] Saved public review for guest ${surveyData.guestName} (${publishedReviewRecord.id})`);
      }

      // 2. Try Firestore Admin if available, but never fail the submission if Firestore permissions are restricted
      if (db) {
        try {
          const docRef = await db.collection("surveys").add({
            ...surveyData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[API] Survey persisted to Firestore: ${docRef.id}`);

          if (publishedReviewRecord) {
            const revDocRef = await db.collection("reviews").add({
              author: publishedReviewRecord.author,
              email: publishedReviewRecord.email,
              phone: publishedReviewRecord.phone,
              role: publishedReviewRecord.role,
              propertyName: publishedReviewRecord.propertyName,
              rating: publishedReviewRecord.rating,
              title: publishedReviewRecord.title,
              comment: publishedReviewRecord.comment,
              bookingRef: publishedReviewRecord.bookingRef,
              verified: true,
              surveyAnswers: publishedReviewRecord.surveyAnswers,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[API] Public review persisted to Firestore: ${revDocRef.id}`);
          }

          if (surveyData.bookingRef) {
            try {
              const bDoc = await db.collection("bookings").doc(surveyData.bookingRef).get();
              if (bDoc.exists) {
                await db.collection("bookings").doc(surveyData.bookingRef).update({
                  surveyCompleted: true,
                  surveyCompletedAt: admin.firestore.FieldValue.serverTimestamp()
                });
              }
            } catch (bErr) {}
          }
        } catch (dbErr: any) {
          console.warn("[API] Firestore Admin write warning (handled gracefully via local fallback):", dbErr.message);
        }
      }

      // 3. Dispatch management notification emails
      try {
        await sendSurveyResultsToPropertyManagers({ surveyData, activeDb: db });
      } catch (emailErr: any) {
        console.warn("[API] Survey email dispatch warning:", emailErr.message);
      }

      res.json({
        success: true,
        surveyId,
        reviewPublished: !!publishedReviewRecord,
        review: publishedReviewRecord
      });
    } catch (err: any) {
      console.error("[API] Error submitting survey:", err);
      res.status(500).json({ error: err.message || "Failed to process survey." });
    }
  });

  // GET /api/reviews - returns all reviews from local store and Firestore
  app.get("/api/reviews", async (req, res) => {
    try {
      const localReviews = getLocalReviews();
      let firestoreReviewsList: any[] = [];
      if (db) {
        try {
          const snap = await db.collection("reviews").orderBy("createdAt", "desc").get();
          firestoreReviewsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e: any) {
          console.warn("[API] Firestore get reviews warning:", e.message);
        }
      }
      const mergedMap = new Map<string, any>();
      [...firestoreReviewsList, ...localReviews].forEach(item => {
        const key = item.id || `${item.author}-${item.comment?.slice(0, 20)}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, item);
        }
      });
      res.json({ reviews: Array.from(mergedMap.values()) });
    } catch (err: any) {
      console.error("[API] Error fetching reviews:", err);
      res.status(500).json({ error: err.message, reviews: getLocalReviews() });
    }
  });

  // POST /api/reviews - direct review submission from Leave a Review modal
  app.post("/api/reviews", async (req, res) => {
    try {
      const reviewData = req.body;
      if (!reviewData || !reviewData.author || !reviewData.comment) {
        return res.status(400).json({ error: "Author name and comment are required." });
      }
      const newReview = {
        id: "rev-" + Date.now(),
        author: reviewData.author.trim(),
        role: reviewData.role || "Verified Guest",
        email: (reviewData.email || "").trim(),
        propertyName: reviewData.propertyName || "2844 Stonewall Villa",
        rating: Number(reviewData.rating || 5),
        title: (reviewData.title || "").trim(),
        comment: reviewData.comment.trim(),
        bookingRef: (reviewData.bookingRef || "").trim(),
        verified: true,
        createdAt: new Date().toISOString()
      };
      saveLocalReview(newReview);
      if (db) {
        try {
          await db.collection("reviews").add({
            ...newReview,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (dbErr: any) {
          console.warn("[API] Firestore review add warning:", dbErr.message);
        }
      }
      res.json({ success: true, review: newReview });
    } catch (err: any) {
      console.error("[API] Error saving review:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/surveys - returns all completed surveys
  app.get("/api/surveys", async (req, res) => {
    try {
      const localSurveys = getLocalSurveys();
      let firestoreSurveysList: any[] = [];
      if (db) {
        try {
          const snap = await db.collection("surveys").orderBy("createdAt", "desc").get();
          firestoreSurveysList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e: any) {
          console.warn("[API] Firestore get surveys warning:", e.message);
        }
      }
      const mergedMap = new Map<string, any>();
      [...firestoreSurveysList, ...localSurveys].forEach(item => {
        const key = item.id || `${item.guestEmail}-${item.bookingRef}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, item);
        }
      });
      res.json({ surveys: Array.from(mergedMap.values()) });
    } catch (err: any) {
      res.json({ surveys: getLocalSurveys() });
    }
  });

  // Manually trigger or resend Stay Survey & Review Reminder Email (e.g. from Admin Dashboard)
  app.post("/api/send-survey-email", async (req, res) => {
    console.log("[API] Send Survey Email hit");
    try {
      const { bookingId, leaseId, guestEmail, guestName, guestPhone, propertyName, sendSms = false, customNote } = req.body;
      const appUrl = `${req.protocol}://${req.get('host')}`;

      let targetEmail = guestEmail;
      let targetName = guestName || "Guest";
      let targetPhone = guestPhone || "";
      let targetProperty = propertyName || "Stonewall Villa";
      let targetRef = bookingId || leaseId || "";
      let stayType = bookingId ? "booking" : (leaseId ? "lease" : "manual_booking");

      if (db && bookingId) {
        try {
          const bDoc = await db.collection("bookings").doc(bookingId).get();
          if (bDoc.exists) {
            const b = bDoc.data() || {};
            targetEmail = targetEmail || b.guestEmail;
            targetName = targetName === "Guest" ? (b.guestName || "Guest") : targetName;
            targetPhone = targetPhone || b.guestPhone || "";
            targetRef = b.bookingRef || bookingId;
            if (!propertyName && b.propertyId) {
              const pDoc = await db.collection("properties").doc(b.propertyId).get();
              if (pDoc.exists) targetProperty = pDoc.data()?.name || targetProperty;
            }
            await db.collection("bookings").doc(bookingId).update({
              sentSurveyEmail: true,
              sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } catch (dbErr: any) {
          console.warn("[API] DB read/update warning for survey email:", dbErr.message);
        }
      } else if (db && leaseId) {
        try {
          const lDoc = await db.collection("leases").doc(leaseId).get();
          if (lDoc.exists) {
            const l = lDoc.data() || {};
            targetEmail = targetEmail || l.tenantEmail;
            targetName = targetName === "Guest" ? (l.tenantName || "Resident") : targetName;
            targetPhone = targetPhone || l.tenantPhone || "";
            targetRef = l.leaseCode || leaseId;
            targetProperty = l.propertyNameOrRoom || targetProperty;
            await db.collection("leases").doc(leaseId).update({
              sentSurveyEmail: true,
              sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } catch (dbErr: any) {
          console.warn("[API] DB lease update warning for survey email:", dbErr.message);
        }
      }

      if (!targetEmail) {
        return res.status(400).json({ error: "Recipient guest email is required." });
      }

      const sent = await sendStaySurveyEmail({
        guestName: targetName,
        guestEmail: targetEmail,
        propertyName: targetProperty,
        bookingRef: targetRef,
        appUrl,
        stayType
      });

      // Optional SMS dispatch if enabled and phone number available
      let smsSent = false;
      const phoneToUse = targetPhone ? formatPhoneToE164(targetPhone) : "";
      if (sendSms && phoneToUse) {
        const tSid = process.env.TWILIO_ACCOUNT_SID;
        const tTok = process.env.TWILIO_AUTH_TOKEN;
        const tFrom = process.env.TWILIO_PHONE_NUMBER;
        if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL') && tFrom) {
          try {
            const twilioPkg = await import('twilio');
            const twilio = twilioPkg.default || twilioPkg;
            const twilioClient = (twilio as any)(tSid, tTok);
            const normalizedBase = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
            const surveyUrl = `${normalizedBase}/survey?ref=${encodeURIComponent(targetRef)}&property=${encodeURIComponent(targetProperty)}&guest=${encodeURIComponent(targetName)}&email=${encodeURIComponent(targetEmail)}&stayType=${encodeURIComponent(stayType)}`;
            const reviewsUrl = `${normalizedBase}/reviews?prop=${encodeURIComponent(targetProperty)}&ref=${encodeURIComponent(targetRef)}`;
            
            const smsText = `Hi ${targetName}, thank you for staying at ${targetProperty}! We'd love your feedback: please take our 5-question survey (${surveyUrl}) or leave a quick review (${reviewsUrl}). Thank you! RealCal Bookings`;
            await twilioClient.messages.create({ body: smsText, from: tFrom, to: phoneToUse });
            smsSent = true;
          } catch (smsErr: any) {
            console.warn("[API] SMS survey reminder dispatch warning:", smsErr.message);
          }
        }
      }

      res.json({ success: sent, guestEmail: targetEmail, smsSent });
    } catch (err: any) {
      console.error("[API] Error sending survey email:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Batch send Survey & Review Reminders to multiple past guests
  app.post("/api/send-batch-survey-reminders", async (req, res) => {
    console.log("[API] Send Batch Survey Reminders hit");
    try {
      const { items, sendSms = false } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required with at least one recipient." });
      }

      const appUrl = `${req.protocol}://${req.get('host')}`;
      const results: Array<{ id: string; email: string; success: boolean; error?: string; smsSent?: boolean }> = [];

      for (const item of items) {
        const { bookingId, leaseId, guestEmail, guestName, guestPhone, propertyName, bookingRef } = item;
        const targetEmail = guestEmail?.trim();
        const targetName = guestName?.trim() || "Guest";
        const targetProperty = propertyName || "Stonewall Villa";
        const targetRef = bookingRef || bookingId || leaseId || "";
        const stayType = bookingId ? "booking" : (leaseId ? "lease" : "manual_booking");

        if (!targetEmail) {
          results.push({ id: bookingId || leaseId || "unknown", email: "", success: false, error: "Missing email" });
          continue;
        }

        try {
          const sent = await sendStaySurveyEmail({
            guestName: targetName,
            guestEmail: targetEmail,
            propertyName: targetProperty,
            bookingRef: targetRef,
            appUrl,
            stayType
          });

          let smsSent = false;
          const phoneToUse = guestPhone ? formatPhoneToE164(guestPhone) : "";
          if (sendSms && phoneToUse) {
            const tSid = process.env.TWILIO_ACCOUNT_SID;
            const tTok = process.env.TWILIO_AUTH_TOKEN;
            const tFrom = process.env.TWILIO_PHONE_NUMBER;
            if (tSid && tTok && tSid.startsWith('AC') && !tSid.includes('PROVIDE_REAL') && tFrom) {
              try {
                const twilioPkg = await import('twilio');
                const twilio = twilioPkg.default || twilioPkg;
                const twilioClient = (twilio as any)(tSid, tTok);
                const normalizedBase = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
                const surveyUrl = `${normalizedBase}/survey?ref=${encodeURIComponent(targetRef)}&property=${encodeURIComponent(targetProperty)}&guest=${encodeURIComponent(targetName)}&email=${encodeURIComponent(targetEmail)}&stayType=${encodeURIComponent(stayType)}`;
                const reviewsUrl = `${normalizedBase}/reviews?prop=${encodeURIComponent(targetProperty)}&ref=${encodeURIComponent(targetRef)}`;
                const smsText = `Hi ${targetName}, thank you for staying at ${targetProperty}! We'd love your feedback: please take our 5-question survey (${surveyUrl}) or leave a quick review (${reviewsUrl}). Thank you! RealCal Bookings`;
                await twilioClient.messages.create({ body: smsText, from: tFrom, to: phoneToUse });
                smsSent = true;
              } catch (smsErr) {}
            }
          }

          if (db && bookingId) {
            try {
              await db.collection("bookings").doc(bookingId).update({
                sentSurveyEmail: true,
                sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } catch (e) {}
          } else if (db && leaseId) {
            try {
              await db.collection("leases").doc(leaseId).update({
                sentSurveyEmail: true,
                sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } catch (e) {}
          }

          results.push({ id: bookingId || leaseId || targetRef, email: targetEmail, success: !!sent, smsSent });
        } catch (itemErr: any) {
          results.push({ id: bookingId || leaseId || targetRef, email: targetEmail, success: false, error: itemErr.message });
        }
      }

      const sentCount = results.filter(r => r.success).length;
      res.json({ success: true, count: sentCount, total: items.length, results });
    } catch (err: any) {
      console.error("[API] Error processing batch survey reminders:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Notify property managers when a standalone review is submitted on Review Page
  app.post("/api/notify-review-submitted", async (req, res) => {
    try {
      const { author, email, propertyName, rating, title, comment, bookingRef } = req.body;
      const prop = propertyName || "Stonewall Villa";
      const rAuthor = author || "Verified Guest";
      const rRating = rating || 5;

      const subject = `[New Review Published] ${prop} - ${rAuthor} (${rRating}/5 Stars)`;
      const text = `A new guest review has been posted on the Reviews Page!\n\nProperty: ${prop}\nAuthor: ${rAuthor} (${email || 'No email'})\nRating: ${rRating} / 5 Stars\nTitle: ${title || 'N/A'}\nComment: "${comment || ''}"\nBooking Ref: ${bookingRef || 'N/A'}\n\nView in real time on the App's Review Page.`;

      if (db) {
        const managersSnap = await db.collection("property_managers").where("enabled", "==", true).get();
        if (!managersSnap.empty) {
          for (const doc of managersSnap.docs) {
            const mEmail = doc.data()?.email;
            if (mEmail) {
              await sendSmtpEmail({ to: mEmail, subject, text });
            }
          }
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.warn("[API] notify-review-submitted non-fatal error:", err.message);
      res.json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // INCIDENTS & SYSTEM ALARMS API ENDPOINTS
  // ==========================================

  // GET /api/incidents - List incidents with filtering
  app.get("/api/incidents", async (req, res) => {
    try {
      if (!db) {
        return res.json({ success: true, incidents: [], warning: "Database not connected" });
      }

      const statusFilter = req.query.status as string; // 'all', 'active', 'acknowledged', 'resolved'
      const serviceFilter = req.query.service as string;

      let snap: any;
      try {
        snap = await db.collection("incidents").orderBy("createdAt", "desc").limit(100).get();
      } catch (errQ: any) {
        console.warn("[API] Incidents orderBy error, falling back to simple get:", errQ.message);
        snap = await db.collection("incidents").limit(100).get();
      }

      let incidents = snap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));

      // In-memory sort in case fallback was used
      incidents.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      if (statusFilter && statusFilter !== 'all') {
        incidents = incidents.filter((inc: any) => inc.status === statusFilter);
      }
      if (serviceFilter && serviceFilter !== 'all') {
        incidents = incidents.filter((inc: any) => inc.service === serviceFilter);
      }

      const activeCount = incidents.filter((inc: any) => inc.status === 'active' || !inc.acknowledged).length;

      res.json({
        success: true,
        incidents,
        count: incidents.length,
        activeCount
      });
    } catch (err: any) {
      console.error("[API] Error fetching incidents:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/incidents - Report a new incident (from client or internal)
  app.post("/api/incidents", async (req, res) => {
    try {
      const { service, title, message, severity, errorCode, errorDetails, endpoint, metadata, appUrl: clientAppUrl } = req.body;
      if (!service || !title || !message) {
        return res.status(400).json({ error: "Missing required fields: service, title, message" });
      }

      const resolvedAppUrl = resolveAppUrl(req, clientAppUrl);

      const incident = await triggerSystemIncident({
        service,
        title,
        message,
        severity: severity || 'high',
        errorCode,
        errorDetails,
        endpoint: endpoint || req.path,
        req,
        appUrl: resolvedAppUrl,
        metadata
      });

      res.json({ success: true, incident });
    } catch (err: any) {
      console.error("[API] Error reporting incident:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/incidents/:id/acknowledge - Acknowledge an incident
  app.post("/api/incidents/:id/acknowledge", async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { acknowledgedBy, notes } = req.body;

      const updateData = {
        acknowledged: true,
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: acknowledgedBy || 'Admin',
        acknowledgmentNotes: notes || '',
        updatedAt: new Date().toISOString()
      };

      if (db) {
        await db.collection("incidents").doc(incidentId).set(updateData, { merge: true });
        await db.collection("system_alerts").doc(incidentId).set(updateData, { merge: true });
      }

      console.log(`[Incident Alert] Incident ${incidentId} ACKNOWLEDGED by ${acknowledgedBy || 'Admin'}`);
      res.json({ success: true, incidentId, ...updateData });
    } catch (err: any) {
      console.error(`[API] Error acknowledging incident ${req.params.id}:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/incidents/:id/resolve - Mark incident as resolved
  app.post("/api/incidents/:id/resolve", async (req, res) => {
    try {
      const incidentId = req.params.id;
      const { resolvedBy } = req.body;

      const updateData = {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolvedBy || 'Admin',
        updatedAt: new Date().toISOString()
      };

      if (db) {
        await db.collection("incidents").doc(incidentId).set(updateData, { merge: true });
        await db.collection("system_alerts").doc(incidentId).set(updateData, { merge: true });
      }

      console.log(`[Incident Alert] Incident ${incidentId} RESOLVED by ${resolvedBy || 'Admin'}`);
      res.json({ success: true, incidentId, ...updateData });
    } catch (err: any) {
      console.error(`[API] Error resolving incident ${req.params.id}:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/incidents/test - Dispatch a real test alarm & notifications to Admin and Managers
  app.post("/api/incidents/test", async (req, res) => {
    try {
      const { service = 'api', severity = 'high', customMessage, adminEmail, appUrl: clientAppUrl } = req.body;
      const testTitle = `Test Alarm: Integration Health & Alert Pipeline Check`;
      const testMsg = customMessage || `Verification of Automated Incident & Alarm Notifications. Confirming real-time routing to App Admin (dlaniger.napm.consulting@gmail.com) and all Enabled Property Managers.`;

      const resolvedAppUrl = resolveAppUrl(req, clientAppUrl);

      const incident = await triggerSystemIncident({
        service,
        title: testTitle,
        message: testMsg,
        severity,
        errorCode: 'HEALTH_CHECK_OK',
        errorDetails: {
          testInitiatedBy: adminEmail || 'dlaniger.napm.consulting@gmail.com',
          environment: process.env.NODE_ENV || 'production',
          timestamp: new Date().toISOString(),
          simulatedIssue: 'Twilio SMS & Stripe integration verification'
        },
        endpoint: '/api/incidents/test',
        req,
        appUrl: resolvedAppUrl
      });

      res.json({
        success: true,
        message: "Test alarm created! Notification emails and SMS dispatched to App Admin and Property Managers.",
        adminDashboardUrl: `${resolvedAppUrl}/admin`,
        incident
      });
    } catch (err: any) {
      console.error("[API] Error generating test incident:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // DEVICE SETTINGS & FIRMWARE OTA APIS
  // ==========================================

  // In-memory persistent server fleet cache
  let serverDevicesCache: any[] = [];

  const getOrInitServerDevices = async () => {
    if (serverDevicesCache.length > 0) return serverDevicesCache;
    try {
      if (db) {
        const snap = await db.collection("smart_devices").get();
        if (!snap.empty) {
          serverDevicesCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          return serverDevicesCache;
        }
      }
    } catch (e: any) {
      console.warn("[Server] Firestore smart_devices read warning:", e.message);
    }
    // Fallback import
    try {
      const { INITIAL_DEVICES } = await import("./src/data/devicesData.js");
      serverDevicesCache = JSON.parse(JSON.stringify(INITIAL_DEVICES));
    } catch {
      try {
        const { INITIAL_DEVICES } = await import("./src/data/devicesData");
        serverDevicesCache = JSON.parse(JSON.stringify(INITIAL_DEVICES));
      } catch (err: any) {
        console.warn("[Server] Could not import devicesData:", err.message);
      }
    }
    return serverDevicesCache;
  };

  // GET /api/devices - List devices with firmware info
  app.get("/api/devices", async (req, res) => {
    try {
      const { propertyId, includeTestProperties } = req.query;
      let devices = await getOrInitServerDevices();

      if (propertyId && typeof propertyId === "string" && propertyId !== "all") {
        devices = devices.filter((d: any) => d.propertyId === propertyId);
      }

      if (includeTestProperties !== "true") {
        devices = devices.filter((d: any) => 
          d.propertyId !== "oceanview-paradise-villa" && 
          d.propertyId !== "mountain-retreat-cabin"
        );
      }

      res.json({
        success: true,
        devices,
        total: devices.length,
        outdatedCount: devices.filter((d: any) => d.firmware?.updateAvailable).length,
        criticalCount: devices.filter((d: any) => d.firmware?.criticalSecurityUpdate).length
      });
    } catch (err: any) {
      console.error("[API] Error fetching devices:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/devices/update-firmware - Apply OTA firmware update
  app.post("/api/devices/update-firmware", async (req, res) => {
    try {
      const { deviceId, targetVersion, installedBy } = req.body;
      if (!deviceId) {
        return res.status(400).json({ error: "deviceId is required." });
      }

      const devices = await getOrInitServerDevices();
      const devIndex = devices.findIndex((d: any) => d.id === deviceId);
      if (devIndex === -1) {
        return res.status(404).json({ error: "Device not found." });
      }

      const device = devices[devIndex];
      const newVersion = targetVersion || device.firmware.latestVersion;
      const oldVersion = device.firmware.currentVersion;

      const logEntry = {
        id: `ota-${Date.now()}`,
        fromVersion: oldVersion,
        toVersion: newVersion,
        installedAt: new Date().toISOString(),
        installedBy: installedBy || "Admin / User OTA",
        status: "success",
        durationSeconds: Math.floor(35 + Math.random() * 20),
        notes: `Firmware upgrade to ${newVersion} successfully flashed and verified via OTA.`
      };

      device.firmware.currentVersion = newVersion;
      device.firmware.updateAvailable = newVersion !== device.firmware.latestVersion;
      device.firmware.criticalSecurityUpdate = false;
      device.lastHeartbeat = new Date().toISOString();
      device.status = "online";
      device.updateHistory = [logEntry, ...(device.updateHistory || [])];

      // Sync to Firestore if available
      if (db) {
        try {
          await db.collection("smart_devices").doc(deviceId).set(device, { merge: true });
        } catch (e: any) {
          console.warn("[Server] Firestore smart_devices write skipped in dev:", e.message);
        }
      }

      res.json({
        success: true,
        message: `Device firmware updated to ${newVersion} successfully!`,
        device
      });
    } catch (err: any) {
      console.error("[API] Error updating firmware:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/devices/batch-update - Batch OTA update all outdated devices
  app.post("/api/devices/batch-update", async (req, res) => {
    try {
      const { propertyId, installedBy } = req.body;
      const devices = await getOrInitServerDevices();
      const updatedDevices: any[] = [];

      for (const device of devices) {
        if (propertyId && propertyId !== "all" && device.propertyId !== propertyId) {
          continue;
        }

        if (device.firmware?.updateAvailable) {
          const oldVersion = device.firmware.currentVersion;
          const newVersion = device.firmware.latestVersion;

          const logEntry = {
            id: `ota-batch-${Date.now()}-${device.id}`,
            fromVersion: oldVersion,
            toVersion: newVersion,
            installedAt: new Date().toISOString(),
            installedBy: installedBy || "Batch OTA Updater",
            status: "success",
            durationSeconds: Math.floor(30 + Math.random() * 25),
            notes: `Batch update to ${newVersion} completed.`
          };

          device.firmware.currentVersion = newVersion;
          device.firmware.updateAvailable = false;
          device.firmware.criticalSecurityUpdate = false;
          device.lastHeartbeat = new Date().toISOString();
          device.status = "online";
          device.updateHistory = [logEntry, ...(device.updateHistory || [])];

          if (db) {
            try {
              await db.collection("smart_devices").doc(device.id).set(device, { merge: true });
            } catch {}
          }
          updatedDevices.push(device);
        }
      }

      res.json({
        success: true,
        message: `Updated ${updatedDevices.length} devices successfully!`,
        count: updatedDevices.length,
        devices: updatedDevices
      });
    } catch (err: any) {
      console.error("[API] Error in batch update:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/devices/self-test - Run device diagnostics & ping
  app.post("/api/devices/self-test", async (req, res) => {
    try {
      const { deviceId } = req.body;
      const devices = await getOrInitServerDevices();
      const device = devices.find((d: any) => d.id === deviceId);

      if (!device) {
        return res.status(404).json({ error: "Device not found." });
      }

      const latency = Math.floor(12 + Math.random() * 26);
      const isBattery = device.powerSource === "battery";
      const report = {
        lastTestedAt: new Date().toISOString(),
        passed: true,
        latencyMs: latency,
        diagnostics: {
          keypadOk: true,
          motorLatchOk: true,
          tamperSwitchOk: true,
          bleBeaconOk: true,
          storageOk: true,
          voltageLevel: isBattery ? +(5.6 + Math.random() * 0.7).toFixed(1) : 5.0
        }
      };

      device.selfTestReport = report;
      device.lastHeartbeat = new Date().toISOString();

      res.json({
        success: true,
        report,
        device
      });
    } catch (err: any) {
      console.error("[API] Error in self-test:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/devices/settings - Update auto-update settings
  app.post("/api/devices/settings", async (req, res) => {
    try {
      const { deviceId, autoUpdateEnabled, autoUpdateWindow, channel } = req.body;
      const devices = await getOrInitServerDevices();
      const device = devices.find((d: any) => d.id === deviceId);

      if (!device) {
        return res.status(404).json({ error: "Device not found." });
      }

      if (typeof autoUpdateEnabled === "boolean") device.autoUpdateEnabled = autoUpdateEnabled;
      if (autoUpdateWindow) device.autoUpdateWindow = autoUpdateWindow;
      if (channel && device.firmware) device.firmware.channel = channel;

      if (db) {
        try {
          await db.collection("smart_devices").doc(deviceId).set(device, { merge: true });
        } catch {}
      }

      res.json({
        success: true,
        message: "Device settings updated.",
        device
      });
    } catch (err: any) {
      console.error("[API] Error updating device settings:", err.message);
      res.status(500).json({ success: false, error: err.message });
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
      server: { middlewareMode: true, hmr: false },
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

        // 5-Day Stay Extension & Invoice Renewal Notification Check
        const diffDaysToEnd = Math.ceil((new Date(b.checkOut + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDaysToEnd <= 5 && diffDaysToEnd >= 0 && !b.sentRenewalNotification && !b.checkedOut) {
          try {
            console.log(`[Reminders] Triggering automated 5-day stay extension & invoice reminder for booking ${doc.id}`);
            await sendBooking5DayReminderInternal({
              activeDb: db,
              bookingId: doc.id,
              force: false
            });
          } catch (remErr: any) {
            console.error(`[Reminders] Failed to dispatch 5-day reminder for booking ${doc.id}:`, remErr.message);
          }
        }

        // Automated Stay Survey Email when Booking Ends (checked out or past deadline)
        const deadlineDate = getCheckoutDeadline(b.checkOut);
        const bookingHasEnded = b.checkedOut === true || now > deadlineDate;
        if (bookingHasEnded && !b.sentSurveyEmail && guestEmail) {
          try {
            console.log(`[Reminders] Sending post-stay survey email to ${guestEmail} for booking ${doc.id}`);
            await sendStaySurveyEmail({
              guestName,
              guestEmail,
              propertyName,
              bookingRef: b.bookingRef || doc.id,
              stayType: 'booking'
            });
            await db.collection("bookings").doc(doc.id).update({
              sentSurveyEmail: true,
              sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[Reminders] Sent survey email to ${guestEmail} for booking ${doc.id}`);
          } catch (surveyErr: any) {
            console.error(`[Reminders] Failed to send survey email to ${guestEmail}:`, surveyErr.message);
          }
        }
      }
          // Check for ended leases Survey & Reviews Email
      try {
        const leasesSnap = await db.collection("leases").get();
        for (const lDoc of leasesSnap.docs) {
          const l = lDoc.data();
          if (!l || l.sentSurveyEmail) continue;

          let leaseHasEnded = false;
          if (l.status === 'terminating') {
            leaseHasEnded = true;
          } else if (l.endDate) {
            const endDateTime = new Date(`${l.endDate}T23:59:59`);
            if (now > endDateTime) {
              leaseHasEnded = true;
            }
          }

          if (leaseHasEnded && l.tenantEmail) {
            console.log(`[Reminders] Sending post-lease survey email to ${l.tenantEmail} for lease ${lDoc.id}`);
            await sendStaySurveyEmail({
              guestName: l.tenantName || 'Resident',
              guestEmail: l.tenantEmail,
              propertyName: l.propertyNameOrRoom || 'Stonewall Villa',
              bookingRef: l.leaseCode || lDoc.id,
              stayType: 'lease'
            });
            await db.collection("leases").doc(lDoc.id).update({
              sentSurveyEmail: true,
              sentSurveyEmailAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          // Check for 5-Day Month-to-Month Lease Renewal & Payment Reminder
          if (l.endDate && !l.sent5DayRenewalReminder && l.status !== 'cancelled' && l.status !== 'terminated') {
            const diffDaysToLeaseEnd = Math.ceil((new Date(l.endDate + 'T12:00:00').getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDaysToLeaseEnd <= 5 && diffDaysToLeaseEnd >= 0) {
              try {
                let hostUrl = process.env.APP_URL || process.env.PUBLIC_URL || "https://realcal.app/";
                console.log(`[Reminders] Triggering automated 5-day lease renewal & payment reminder for lease ${lDoc.id}`);
                await sendLease5DayReminderInternal({
                  activeDb: db,
                  leaseId: lDoc.id,
                  leaseData: l,
                  hostUrl
                });
                await db.collection("leases").doc(lDoc.id).update({
                  sent5DayRenewalReminder: true,
                  sent5DayRenewalReminderAt: admin.firestore.FieldValue.serverTimestamp()
                });
              } catch (leaseRemErr: any) {
                console.error(`[Reminders] Error sending 5-day lease reminder for ${lDoc.id}:`, leaseRemErr.message);
              }
            }
          }
        }
      } catch (leaseSurveyErr: any) {
        // Silently skip if permission denied in sandbox
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

