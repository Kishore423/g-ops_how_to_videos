const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://nlhnqebpetugfbsygiqa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_8Z-LkjH9HWzbCuvyeZGIMQ_npvIGSDV";
const VIDEO_BUCKET = "gops-videos";

function publicClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
}

function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
}

function publicVideoUrl(storagePath) {
  if (!storagePath) return "";
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${encodedPath}`;
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  VIDEO_BUCKET,
  adminClient,
  publicClient,
  publicVideoUrl,
};
