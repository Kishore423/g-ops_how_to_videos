const crypto = require("crypto");
const { createAdminToken } = require("./_auth");

function json(response, statusCode, body) {
  response.status(statusCode).json(body);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed." });
    return;
  }

  const expectedUsername = process.env.ADMIN_USERNAME || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  const username = String(request.body?.username || "");
  const password = String(request.body?.password || "");

  if (!expectedUsername || !expectedPassword) {
    json(response, 503, { error: "Admin login is not configured." });
    return;
  }

  const usernameMatches = safeEqual(username, expectedUsername);
  const passwordMatches = safeEqual(password, expectedPassword);

  if (!usernameMatches || !passwordMatches) {
    json(response, 401, { error: "Username or password is incorrect." });
    return;
  }

  json(response, 200, { username, token: createAdminToken(username) });
};
