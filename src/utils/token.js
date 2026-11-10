import jwt from "jsonwebtoken";

/**
 * Generates a signed JSON Web Token (JWT)
 * @param {object} payload - Data payload to encode (e.g. { id, role, email })
 * @returns {string} - Signed JWT
 */
export const generateToken = (payload) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(payload, secret, {
    expiresIn,
  });
};

/**
 * Verifies and decodes a JSON Web Token
 * @param {string} token
 * @returns {object} - Decoded token payload
 */
export const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
  }

  return jwt.verify(token, secret);
};
