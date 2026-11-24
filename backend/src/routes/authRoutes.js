
const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

const { authRateLimit } = require("../middleware/authRateLimit");
router.post("/register", authRateLimit({ limit: 10 }), authController.register);
router.post("/login", authRateLimit({ limit: 30 }), authController.login);
module.exports = router;
