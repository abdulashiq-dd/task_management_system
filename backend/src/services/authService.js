
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
// A fixed valid bcrypt hash ensures unknown accounts still incur a cost-12 comparison.
const DUMMY_HASH = "$2b$12$w9i2Sli8ps0tLRg5KjvHROn1AykJHSQqOlRpFGYNtjqLm2ivvS.I2";

const registerUser = async ({ name, email, password }) => {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail
  });

  if (existingUser) {
    const error = new Error("Email already registered");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: "user"
    });

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };
  } catch (error) {
    if (error.code === 11000) {
      const duplicateError = new Error("Email already registered");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }

    throw error;
  }
};


const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Password is excluded by default in userModel
  const user = await User.findOne({
    email: normalizedEmail
  }).select("+password");

  const isPasswordValid = await bcrypt.compare(password, user?.password || DUMMY_HASH);
  if (!user || !isPasswordValid) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign(
    { sub: user._id.toString() },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
      algorithm: "HS256"
    }
  );

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
};

module.exports = { registerUser,loginUser };
