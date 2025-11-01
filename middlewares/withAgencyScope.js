// middlewares/withAgencyScope.js
export default function withAgencyScope(req, res, next) {
  if (req.user.role === "super_admin") return next();
  if (!req.user.agencyId) {
    return res.status(403).json({ message: "Agency scope required" });
  }
  // attach for controllers
  req.agencyId = req.user.agencyId;
  next();
};
