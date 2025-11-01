// middlewares/agencyScope.js
export default function agencyScope(req, res, next) {
  if (req.user.role === "super_admin") return next();
  if (!req.user.agencyId) {
    return res.status(400).json({ message: "No agency scope" });
  }
  req.agencyId = req.user.agencyId;
  next();
};
