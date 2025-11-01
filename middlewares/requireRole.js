// middlewares/requireRole.js
export default function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ message: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
};
