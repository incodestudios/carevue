import express from "express";
import cors from 'cors';
import helmet from 'helmet';
import superAgenciesRouter from "./routes/super.agencies.js";
import agencyAdminRouter from "./routes/agency.admin.js";
import agencyCareGiverRouter from "./routes/agency.caregivers.js";
import agencyPatientsRouter from "./routes/agency.patients.js";
import agencyAssignmentsRouter from "./routes/agency.assignments.js";
import agencyScheduleVisitsRouter from "./routes/agency.schedule.visits.js";
import agencyStripeWebhook from "./routes/stripe.webhook.js";
import superAdminRoutes from "./routes/super.admin.js";
import evvRoutes from "./routes/evvRoutes.js";
import caregiverEvvRoutes from "./routes/caregiver.evv.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import mongoose from 'mongoose';
import morgan from 'morgan';

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('DB CONNECTED'))
  .catch((err) => console.log('DB CONNECTION ERR', err))

const app = express();

// Security Middleware - Helmet configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"]
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

// CORS Configuration
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000','https://carevuebackend.vercel.app','https://carevue.vercel.app', process.env.FRONTEND_URL].filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// Body Parsing Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.get('/', (req, res) => {
  res.send('Welcome to CareVue Home-Care Platform!');
});

app.use("/api/super-admin", superAdminRoutes);
app.use("/api/super-admin/agencies", superAgenciesRouter);
app.use("/api/agency/admin", agencyAdminRouter);
app.use("/api/agency/caregivers", agencyCareGiverRouter);
app.use("/api/agency/patients", agencyPatientsRouter);
app.use("/api/agency", agencyAssignmentsRouter);
app.use("/api/agency/schedule/visits", agencyScheduleVisitsRouter);
app.use("/api/evv", evvRoutes);
app.use("/api/caregiver", caregiverEvvRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/stripe", agencyStripeWebhook);
//app.use("/api/users", require("./routes/userRoutes"))

export default app;
