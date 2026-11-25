const passkeyService = require("../services/passkeyService");

const registrationOptions = async (req, res, next) => {
  try {
    const options = await passkeyService.registrationOptions(req.user.id);
    return res.status(200).json(options);
  } catch (error) {
    next(error);
  }
};

const verifyRegistration = async (req, res, next) => {
  try {
    await passkeyService.verifyRegistration(req.user.id, req.body);
    return res.status(201).json({ message: "Passkey registered successfully" });
  } catch (error) {
    next(error);
  }
};

const authenticationOptions = async (req, res, next) => {
  try {
    const options = await passkeyService.authenticationOptions();
    return res.status(200).json(options);
  } catch (error) {
    next(error);
  }
};

const verifyAuthentication = async (req, res, next) => {
  try {
    const result = await passkeyService.verifyAuthentication(req.body);
    return res.status(200).json({ message: "Passkey sign-in successful", ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration
};
