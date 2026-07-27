const crypto = require("crypto");

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createAdminToken(username) {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) return "";

  const payload = base64Url(
    JSON.stringify({
      username,
      exp: Date.now() + 12 * 60 * 60 * 1000,
    }),
  );
  return `${payload}.${signPayload(payload, secret)}`;
}

function verifyAdminToken(request) {
  const secret = process.env.ADMIN_PASSWORD || "";
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, signature] = token.split(".");

  if (!secret || !payload || !signature) return false;

  const expected = signPayload(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

module.exports = {
  createAdminToken,
  verifyAdminToken,
};
