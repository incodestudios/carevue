// utils/generateToken.js
import jwt from "jsonwebtoken";

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      agencyId: user.agencyId || null,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d", // adjust as needed
    }
  );
}

export default generateToken;
