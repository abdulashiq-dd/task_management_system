const { createError } = require("../utils/httpError");

const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

const authenticate = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET?.trim()) return next(createError("JWT_SECRET is not configured", 500));
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return next(createError("Authentication token required", 401));
    }

    const token = authHeader.slice(7);

    if (!token) {
      return next(createError("Invalid or expired token", 401));
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    const user = await User.findById(decoded.sub);

    if (!user) {
      return next(createError("Invalid or expired token", 401));
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
      return next(createError("Invalid or expired token", 401));
    }

    next(error);
  }
};

module.exports = authenticate;
