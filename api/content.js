const { verifyAdminToken } = require("./_auth");
const {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  VIDEO_BUCKET,
  adminClient,
  publicClient,
  publicVideoUrl,
} = require("./_supabase");

function json(response, statusCode, body) {
  response.status(statusCode).json(body);
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `group-${Date.now()}`;
}

function normalizeFileName(fileName) {
  return String(fileName || "video.mp4").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function loadContent() {
  const supabase = publicClient();
  const [{ data: groups, error: groupError }, { data: forms, error: formError }, { data: videos, error: videoError }] =
    await Promise.all([
      supabase.from("gops_form_groups").select("*").order("sort_order", { ascending: true }),
      supabase.from("gops_forms").select("*").order("created_at", { ascending: true }),
      supabase.from("gops_videos").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    ]);

  if (groupError || formError || videoError) {
    throw new Error(groupError?.message || formError?.message || videoError?.message || "Content could not be loaded.");
  }

  return {
    supabase: {
      url: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      bucket: VIDEO_BUCKET,
    },
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      singleAirline: group.single_airline,
    })),
    airlines: forms.map((form) => ({
      id: form.id,
      name: form.name,
      group: form.group_id,
      gateForms: [],
      videos: videos
        .filter((video) => video.form_id === form.id)
        .map((video) => ({
          id: video.id,
          title: video.title || "",
          videoName: video.file_name || "",
          storagePath: video.storage_path || "",
          videoUrl: publicVideoUrl(video.storage_path),
        })),
    })),
  };
}

async function createGroup(request, response, body) {
  const supabase = adminClient();
  const name = String(body.name || "").trim();
  if (!name) {
    json(response, 400, { error: "Group name is required." });
    return;
  }

  let id = slugify(name);
  const { data: existing } = await supabase.from("gops_form_groups").select("id").eq("id", id).maybeSingle();
  if (existing) id = `${id}-${Date.now()}`;

  const { count } = await supabase.from("gops_form_groups").select("id", { count: "exact", head: true });
  const { error: groupError } = await supabase.from("gops_form_groups").insert({
    id,
    name,
    single_airline: Boolean(body.singleAirline),
    sort_order: count || 0,
  });
  if (groupError) throw new Error(groupError.message);

  const { error: formError } = await supabase.from("gops_forms").insert({
    id: `${id}-form`,
    group_id: id,
    name,
  });
  if (formError) throw new Error(formError.message);

  json(response, 200, await loadContent());
}

async function updateForm(response, body) {
  const supabase = adminClient();
  const formId = String(body.formId || "");
  const videos = Array.isArray(body.videos) ? body.videos : [];

  await Promise.all(
    videos.map(async (video) => {
      const { error } = await supabase
        .from("gops_videos")
        .update({ title: String(video.title || ""), updated_at: new Date().toISOString() })
        .eq("id", String(video.id || ""))
        .eq("form_id", formId);
      if (error) throw new Error(error.message);
    }),
  );

  json(response, 200, await loadContent());
}

async function deleteForm(response, body) {
  const supabase = adminClient();
  const formId = String(body.formId || "");
  const groupId = String(body.groupId || "");

  const { data: videos, error: videoError } = await supabase.from("gops_videos").select("storage_path").eq("form_id", formId);
  if (videoError) throw new Error(videoError.message);

  const paths = videos.map((video) => video.storage_path).filter(Boolean);
  if (paths.length) await supabase.storage.from(VIDEO_BUCKET).remove(paths);

  if (groupId) {
    const { error } = await supabase.from("gops_form_groups").delete().eq("id", groupId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("gops_forms").delete().eq("id", formId);
    if (error) throw new Error(error.message);
  }

  json(response, 200, await loadContent());
}

async function createUpload(response, body) {
  const supabase = adminClient();
  const formId = String(body.formId || "");
  const fileName = normalizeFileName(body.fileName);
  const videoId = `video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storagePath = `${formId}/${videoId}-${fileName}`;

  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);

  json(response, 200, {
    videoId,
    storagePath,
    token: data.token,
    path: data.path,
    signedUrl: data.signedUrl,
  });
}

async function confirmUpload(response, body) {
  const supabase = adminClient();
  const formId = String(body.formId || "");
  const videoId = String(body.videoId || "");

  const { count } = await supabase.from("gops_videos").select("id", { count: "exact", head: true }).eq("form_id", formId);
  const { error } = await supabase.from("gops_videos").insert({
    id: videoId,
    form_id: formId,
    title: String(body.title || ""),
    file_name: String(body.fileName || ""),
    storage_path: String(body.storagePath || ""),
    sort_order: count || 0,
  });
  if (error) throw new Error(error.message);

  json(response, 200, await loadContent());
}

async function confirmReplace(response, body) {
  const supabase = adminClient();
  const videoId = String(body.videoId || "");
  const storagePath = String(body.storagePath || "");

  const { data: current, error: currentError } = await supabase
    .from("gops_videos")
    .select("storage_path")
    .eq("id", videoId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);

  const { error } = await supabase
    .from("gops_videos")
    .update({
      title: String(body.title || ""),
      file_name: String(body.fileName || ""),
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);
  if (error) throw new Error(error.message);

  if (current?.storage_path && current.storage_path !== storagePath) {
    await supabase.storage.from(VIDEO_BUCKET).remove([current.storage_path]);
  }

  json(response, 200, await loadContent());
}

async function deleteVideo(response, body) {
  const supabase = adminClient();
  const videoId = String(body.videoId || "");
  const { data: current, error: currentError } = await supabase
    .from("gops_videos")
    .select("storage_path")
    .eq("id", videoId)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);

  const { error } = await supabase.from("gops_videos").delete().eq("id", videoId);
  if (error) throw new Error(error.message);

  if (current?.storage_path) await supabase.storage.from(VIDEO_BUCKET).remove([current.storage_path]);
  json(response, 200, await loadContent());
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === "GET") {
      json(response, 200, await loadContent());
      return;
    }

    if (request.method !== "POST") {
      json(response, 405, { error: "Method not allowed." });
      return;
    }

    if (!verifyAdminToken(request)) {
      json(response, 401, { error: "Admin session expired. Sign in again." });
      return;
    }

    const body = request.body || {};
    if (body.action === "createGroup") return createGroup(request, response, body);
    if (body.action === "updateForm") return updateForm(response, body);
    if (body.action === "deleteForm") return deleteForm(response, body);
    if (body.action === "createUpload") return createUpload(response, body);
    if (body.action === "confirmUpload") return confirmUpload(response, body);
    if (body.action === "confirmReplace") return confirmReplace(response, body);
    if (body.action === "deleteVideo") return deleteVideo(response, body);

    json(response, 400, { error: "Unknown action." });
  } catch (error) {
    json(response, 500, { error: error.message || "Content update failed." });
  }
};
