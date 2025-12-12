import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { Readable } from "stream";

// Generates a PDF buffer for a single visit (expand for full schedule as needed)
function generateSchedulePDF(visit, patient, caregiver) {
  const doc = new PDFDocument();
  const chunks = [];
  doc.fontSize(18).text("Caregiver Schedule", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Caregiver: ${caregiver.firstName} ${caregiver.lastName}`);
  doc.text(`Visit Date: ${visit.startTime}`);
  doc.text(`Patient: ${patient?.firstName || ""} ${patient?.lastName || ""}`);
  doc.text(`Service Type: ${visit.serviceType}`);
  doc.text(`Time: ${visit.startTime} - ${visit.endTime}`);
  doc.text(`Location: ${patient?.addressLine1 || ""} ${patient?.addressLine2 || ""} ${patient?.city || ""}, ${patient?.state || ""} ${patient?.zipCode || ""}`);
  doc.text(`Notes: ${visit.notes || "-"}`);
  doc.end();
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

// Generates a PDF buffer with a simple table layout for visit details
function generateSchedulePDFTable(visit, patient, caregiver) {
  const doc = new PDFDocument();
  const chunks = [];
  doc.fontSize(18).text("Caregiver Schedule", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Caregiver: ${caregiver.firstName} ${caregiver.lastName}`);
  doc.text(`Patient: ${patient?.firstName || ""} ${patient?.lastName || ""}`);
  doc.moveDown();

  const tableTop = doc.y + 10;
  const left = doc.page.margins.left;
  const colWidths = [110, 110, 120, 150, 110]; // Visit Date, Service Type, Time, Location, Notes
  const headers = ["Visit Date", "Service Type", "Time", "Location", "Notes"];
  const values = [
    new Date(visit.startTime).toLocaleString(),
    visit.serviceType || "-",
    `${new Date(visit.startTime).toLocaleTimeString()} - ${new Date(visit.endTime).toLocaleTimeString()}`,
    `${patient?.addressLine1 || ""} ${patient?.addressLine2 || ""} ${patient?.city || ""}, ${patient?.state || ""} ${patient?.zipCode || ""}`.trim(),
    visit.notes || "-",
  ];

  const drawRow = (y, cells) => {
    let x = left;
    cells.forEach((text, idx) => {
      const width = colWidths[idx];
      doc.rect(x, y, width, 20).stroke();
      doc.text(String(text), x + 4, y + 6, { width: width - 8, height: 14 });
      x += width;
    });
  };

  drawRow(tableTop, headers);
  drawRow(tableTop + 20, values);
  doc.moveDown();
  doc.end();

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

// Sends email with PDF attachment
export async function sendCaregiverScheduleEmail({
  caregiver,
  patient,
  visit,
  agency,
  subject,
  text,
}) {
  if (!caregiver?.email) throw new Error("Caregiver email missing");
  const pdfBuffer = await generateSchedulePDF(visit, patient, caregiver);
  //const pdfBuffer = await generateSchedulePDFTable(visit, patient, caregiver);

  // Configure mail transport (use env with sensible defaults)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER || "user@example.com",
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "password",
    },
  });

  // Build "from" so it uses a valid address; allow name if provided without '@'
  const envFrom = process.env.SMTP_FROM;
  const authUser = process.env.SMTP_USER;
  const fromAddress =
    envFrom && envFrom.includes("@")
      ? envFrom
      : envFrom && authUser
        ? `${envFrom} <${authUser}>`
        : authUser || "no-reply@carevue.com";

  const mailOptions = {
    from: fromAddress,
    to: caregiver.email,
    subject: subject || "Your Updated Schedule",
    text:
      text ||
      `Dear ${caregiver.firstName},\n\nYour schedule has been updated. Please see the attached PDF for details.\n\nThank you,\nCareVue Team`,
    attachments: [
      {
        filename: "schedule.pdf",
        content: pdfBuffer,
      },
    ],
  };
 // Send the email
  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw error;
  }
}

// Sends email Notification to Caregiver
export async function sendCaregiverNotificationEmail({
  caregiver,
  subject,
  text,
}) {
  if (!caregiver?.email) throw new Error("Caregiver email missing");
  // const pdfBuffer = await generateSchedulePDF(visit, patient, caregiver);
  //const pdfBuffer = await generateSchedulePDFTable(visit, patient, caregiver);

  // Configure mail transport (use env with sensible defaults)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.example.com",
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER || "user@example.com",
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "password",
    },
  });

  // Build "from" so it uses a valid address; allow name if provided without '@'
  const envFrom = process.env.SMTP_FROM;
  const authUser = process.env.SMTP_USER;
  const fromAddress =
    envFrom && envFrom.includes("@")
      ? envFrom
      : envFrom && authUser
        ? `${envFrom} <${authUser}>`
        : authUser || "no-reply@carevue.com";

  const mailOptions = {
    from: fromAddress,
    to: caregiver.email,
    subject: subject || "Your Updated Schedule",
    text: text  };
 // Send the email
  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw error;
  }
}

export { generateSchedulePDFTable };
