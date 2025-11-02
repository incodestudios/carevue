import express from "express";
import superAgenciesRouter from "./routes/super.agencies.js";
import agencyAdminRouter from "./routes/agency.admin.js";
import agencyCareGiverRouter from "./routes/agency.caregivers.js";
import agencyPatientsRouter from "./routes/agency.patients.js";
import agencyAssignmentsRouter from "./routes/agency.assignments.js";
import agencyStripeWebhook from "./routes/stripe.webhook.js";
import superAdminRoutes from "./routes/super.admin.js";
import mongoose from 'mongoose';
import morgan from 'morgan';

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('DB CONNECTED'))
  .catch((err) => console.log('DB CONNECTION ERR', err))

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'))

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
app.use("/api/stripe", agencyStripeWebhook);
//app.use("/api/users", require("./routes/userRoutes"));

export default app;