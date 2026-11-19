
const authService = require("../services/authService");

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        message: "Valid name, email and password (8–72 bytes) are required"
      });
    }

    const user = await authService.registerUser({
      name,
      email,
      password
    });

    return res.status(201).json({
      message: "User registered successfully",
      user
    });
  } catch (error) {
    next(error);
  }
};


const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const result = await authService.loginUser({
      email,
      password
    });

    return res.status(200).json({
      message: "Login successful",
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register , login };
