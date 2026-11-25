const express = require("express");
const { getActivity } = require("../controllers/activityController");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authenticate);
router.get("/", getActivity);

module.exports = router;
