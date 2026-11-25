
const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const passkeyController = require("../controllers/passkeyController");

const { authRateLimit } = require("../middleware/authRateLimit");
const authenticate = require("../middleware/authMiddleware");
router.get("/password-encryption/public-key", authRateLimit({ limit: 60 }), authController.getPasswordEncryptionKey);
router.post("/password-encryption/challenges", authRateLimit({ limit: 30 }), authController.createPasswordChallenge);
router.post("/register", authRateLimit({ limit: 10 }), authController.register);
router.post("/login", authRateLimit({ limit: 30 }), authController.login);
router.post("/passkeys/registration/options", authenticate, authRateLimit({ limit: 10 }), passkeyController.registrationOptions);
router.post("/passkeys/registration/verify", authenticate, authRateLimit({ limit: 10 }), passkeyController.verifyRegistration);
router.post("/passkeys/authentication/options", authRateLimit({ limit: 30 }), passkeyController.authenticationOptions);
router.post("/passkeys/authentication/verify", authRateLimit({ limit: 30 }), passkeyController.verifyAuthentication);
router.get("/users", authenticate, authController.listUsers);
module.exports = router;
