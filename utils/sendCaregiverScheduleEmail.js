import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { Readable } from "stream";

// Generates a PDF buffer for a single visit (expand for full schedule as needed)
function generateSchedulePDF(visit, caregiver) {
  const doc = new PDFDocument();
  const chunks = [];
  doc.fontSize(18).text("Caregiver Schedule", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Caregiver: ${caregiver.firstName} ${caregiver.lastName}`);
  doc.text(`Visit Date: ${visit.startTime}`);
  doc.text(`Patient: ${visit.patientId?.firstName || ""} ${visit.patientId?.lastName || ""}`);
  doc.text(`Service Type: ${visit.serviceType}`);
  doc.text(`Time: ${visit.startTime} - ${visit.endTime}`);
  doc.text(`Location: ${visit.location}`);
  doc.text(`Notes: ${visit.notes || "-"}`);
  doc.end();
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

// Sends email with PDF attachment
export default async function sendCaregiverScheduleEmail({ caregiver, visit, agency }) {
  if (!caregiver?.email) throw new Error("Caregiver email missing");
  const pdfBuffer = await generateSchedulePDF(visit, caregiver);

  // Configure mail transport (replace with real SMTP config)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || "user@example.com",
      pass: process.env.SMTP_PASS || "password",
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || "no-reply@carevue.com",
    to: caregiver.email,
    subject: "Your Updated Schedule",
    text: `Dear ${caregiver.firstName},\n\nYour schedule has been updated. Please see the attached PDF for details.\n\nThank you,\nCareVue Team`,
    attachments: [
      {
        filename: "schedule.pdf",
        content: pdfBuffer,
      },
    ],
  };

  await transporter.sendMail(mailOptions);
}