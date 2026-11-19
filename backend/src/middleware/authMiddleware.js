
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        message: "Authentication token required"
      });
    }

    const token = authHeader.slice(7);

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        message: "Invalid or expired token"
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    const user = await User.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({
        message: "Invalid or expired token"
      });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "CastError"
    ) {
      return res.status(401).json({
        message: "Invalid or expired token"
      });
    }

    next(error);
  }
};

module.exports = authenticate;
