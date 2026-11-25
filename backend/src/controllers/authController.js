const { createError } = require("../utils/httpError");

const authService = require("../services/authService");
const User = require("../models/userModel");
const passwordEncryptionService = require("../services/passwordEncryptionService");

const rejectPlaintextPassword = body => {
  if (Object.prototype.hasOwnProperty.call(body || {}, "password")) {
    throw createError("Plaintext passwords are not accepted", 400);
  }
};

const getPasswordEncryptionKey = (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.status(200).json(passwordEncryptionService.getPublicKey());
  } catch (error) {
    next(error);
  }
};

const createPasswordChallenge = async (req, res, next) => {
  try {
    rejectPlaintextPassword(req.body);
    const challenge = await passwordEncryptionService.createChallenge(req.body || {});
    res.set("Cache-Control", "no-store");
    return res.status(201).json(challenge);
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    rejectPlaintextPassword(req.body);
    const { name, email } = req.body || {};
    const { challengeId, keyId, encryptedPassword } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      Buffer.byteLength(email.trim(), "utf8") > 254 ||
      typeof encryptedPassword !== "string" ||
      typeof challengeId !== "string" ||
      typeof keyId !== "string"
    ) {
      throw createError("Valid name, email and encrypted password are required", 400);
    }

    const decryptedPassword = await passwordEncryptionService.decryptPassword({
      operation: "register",
      account: email,
      challengeId,
      keyId,
      encryptedPassword
    });
    if (decryptedPassword.length < 8) {
      throw createError("Password must contain at least 8 characters", 400);
    }

    const user = await authService.registerUser({
      name,
      email,
      password: decryptedPassword
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
    rejectPlaintextPassword(req.body);
    const { email } = req.body || {};
    const { challengeId, keyId, encryptedPassword } = req.body || {};

    if (
      typeof email !== "string" ||
      !email.trim() ||
      Buffer.byteLength(email.trim(), "utf8") > 254 ||
      typeof encryptedPassword !== "string" ||
      typeof challengeId !== "string" ||
      typeof keyId !== "string"
    ) {
      throw createError("Email and encrypted password are required", 400);
    }

    const decryptedPassword = await passwordEncryptionService.decryptPassword({
      operation: "login",
      account: email,
      challengeId,
      keyId,
      encryptedPassword
    });
    if (!decryptedPassword) throw createError("Email and password are required", 400);

    const result = await authService.loginUser({
      email,
      password: decryptedPassword
    });

    return res.status(200).json({
      message: "Login successful",
      ...result
    });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      throw createError("Administrator access required", 403);
    }

    const users = await User.find({}, "_id name email role").sort({ name: 1 });
    return res.status(200).json({
      message: "Users retrieved successfully",
      users,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPasswordChallenge,
  getPasswordEncryptionKey,
  register,
  login,
  listUsers
};
