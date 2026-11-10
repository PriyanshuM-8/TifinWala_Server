// Configuration constants for Brevo Transactional Email API

// import brevo from "@getbrevo/brevo";

export const BREVO_CONFIG = {
  API_URL: "https://api.brevo.com/v3/smtp/email",
  TIMEOUT_MS: 10000,
  DEFAULT_SENDER_NAME: "GharKaSwad",
  DEFAULT_SENDER_EMAIL: "noreply@gharkaswad.com",
};

export const getBrevoHeaders = () => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY environment variable is not defined");
  }

  return {
    "api-key": apiKey.trim(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
};
