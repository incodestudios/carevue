import Patient from "../models/Patient";
import withAgencyScope from "../middlewares/withAgencyScope";
// GET /api/agency/patients
router.get("/", auth, withAgencyScope, async (req, res) => {
  const patients = await Patient.find({ agencyId: req.agencyId })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(patients);
});
