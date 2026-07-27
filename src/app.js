const STORAGE_KEY = "gops-airlines-v1";
const GROUP_STORAGE_KEY = "gops-form-groups-v1";
const SESSION_KEY = "gops-admin-session";
const SUPABASE_URL = "https://nlhnqebpetugfbsygiqa.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8Z-LkjH9HWzbCuvyeZGIMQ_npvIGSDV";
const VIDEO_BUCKET = "gops-videos";

const defaultGroups = [
  {
    id: "oal",
    name: "OAL(excluding VJ)",
    singleAirline: false,
  },
  {
    id: "vj",
    name: "VJ",
    singleAirline: true,
  },
];

const defaultAirlines = [
  {
    id: "ke",
    name: "KE",
    group: "oal",
    gateForms: ["Gate form"],
    videos: [],
  },
  {
    id: "vj",
    name: "VJ",
    group: "vj",
    gateForms: ["Gate form"],
    videos: [],
  },
];

let state = {
  view: "home",
  admin: Boolean(localStorage.getItem(SESSION_KEY)),
  auth: {
    error: "",
    loading: false,
  },
  content: {
    error: "",
    loading: true,
    supabase: null,
  },
  selectedAirlineId: null,
  groups: loadGroups(),
  airlines: loadAirlines(),
};

let uploadClient = null;
let uploadClientPromise = null;

function loadAirlines() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultAirlines;

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed.map(normalizeAirline) : defaultAirlines;
  } catch {
    return defaultAirlines;
  }
}

function normalizeAirline(airline) {
  if (Array.isArray(airline.videos)) {
    return {
      ...airline,
      videos: airline.videos.map(normalizeVideo),
    };
  }

  if (airline.videoUrl) {
    return {
      ...airline,
      videos: [
        {
          id: airline.id,
          title: "",
          videoName: airline.videoName || "Uploaded video",
          videoUrl: airline.videoUrl,
        },
      ],
    };
  }

  return {
    ...airline,
    videos: [],
  };
}

function normalizeVideo(video) {
  return {
    id: video.id || `video-${Date.now()}`,
    title: video.title || "",
    videoName: video.videoName || "",
    videoUrl: video.videoUrl || "",
  };
}

function getAirlineVideos(airline) {
  airline.videos = Array.isArray(airline.videos) ? airline.videos.map(normalizeVideo) : [];
  return airline.videos;
}

function loadGroups() {
  const saved = localStorage.getItem(GROUP_STORAGE_KEY);
  if (!saved) return defaultGroups;

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed.map(normalizeGroup) : defaultGroups;
  } catch {
    return defaultGroups;
  }
}

function normalizeGroup(group) {
  return {
    id: group.id || slugify(group.name || "group"),
    name: group.name || "Form group",
    singleAirline: Boolean(group.singleAirline),
  };
}

function saveAirlines() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.airlines));
}

function saveGroups() {
  localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(state.groups));
}

function adminToken() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken()}`,
  };
}

async function contentRequest(body) {
  const response = await fetch("/api/content", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Content update failed.");
  if (data.groups || data.airlines) applyRemoteContent(data);
  return data;
}

function applyRemoteContent(data) {
  state.groups = Array.isArray(data.groups) ? data.groups.map(normalizeGroup) : defaultGroups;
  state.airlines = Array.isArray(data.airlines) ? data.airlines.map(normalizeAirline) : defaultAirlines;
  state.content = {
    error: "",
    loading: false,
    supabase: data.supabase || state.content.supabase,
  };
}

function publicVideoUrl(storagePath) {
  if (!storagePath) return "";
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${encodedPath}`;
}

async function fetchSupabaseTable(table, query) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Content could not be loaded.");
  return data;
}

async function fetchPublicContent() {
  const [groups, forms, videos] = await Promise.all([
    fetchSupabaseTable("gops_form_groups", "select=*&order=sort_order.asc"),
    fetchSupabaseTable("gops_forms", "select=*&order=created_at.asc"),
    fetchSupabaseTable("gops_videos", "select=*&order=sort_order.asc&order=created_at.asc"),
  ]);

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

async function loadRemoteContent(options = {}) {
  if (options.showLoading !== false) {
    state.content = { ...state.content, error: "", loading: true };
    render();
  }

  try {
    applyRemoteContent(await fetchPublicContent());
  } catch (error) {
    state.content = { ...state.content, error: error.message, loading: false };
  }

  render();
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `group-${Date.now()}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function setView(view, selectedAirlineId = null) {
  state.view = view;
  state.selectedAirlineId = selectedAirlineId;
  render();
}

function openGroupVideo(group) {
  const airlines = state.airlines.filter((airline) => airline.group === group);
  const formGroup = getGroup(group);

  if (airlines.length === 1 || (formGroup?.singleAirline && airlines.length)) {
    setView("airline", airlines[0].id);
    return;
  }

  setView(group);
}

function getGroup(groupId) {
  return state.groups.find((group) => group.id === groupId);
}

function getGroupAirlines(groupId) {
  return state.airlines.filter((airline) => airline.group === groupId);
}

function signOut() {
  localStorage.removeItem(SESSION_KEY);
  state.admin = false;
  state.auth = { error: "", loading: false };
  state.view = "home";
  render();
}

async function loginAdmin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  state.auth = { ...state.auth, error: "", loading: true };
  render();

  try {
    const loginResponse = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    });
    const data = await loginResponse.json();

    if (!loginResponse.ok) throw new Error(data.error || "Admin login failed.");

    localStorage.setItem(SESSION_KEY, data.token);
    state.admin = true;
    state.auth = { error: "", loading: false };
  } catch (error) {
    state.auth = { ...state.auth, error: error.message, loading: false };
  }

  render();
}

function addGroup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.groupName.value.trim();
  if (!name) return;

  contentRequest({
    action: "createGroup",
    name,
    singleAirline: form.singleAirline.checked,
  })
    .then(() => {
      form.reset();
      showToast(`${name} group added.`);
      render();
    })
    .catch((error) => showToast(error.message));
}

async function updateAirline(event, airlineId) {
  event.preventDefault();
  const form = event.currentTarget;
  const airline = state.airlines.find((item) => item.id === airlineId);
  if (!airline) return;

  airline.name = form.airlineName.value.trim().toUpperCase() || airline.name;
  airline.group = form.airlineGroup.value;

  const videos = getAirlineVideos(airline);
  await contentRequest({
    action: "updateForm",
    formId: airline.id,
    skipReload: true,
    videos: videos.map((video) => ({
      id: video.id,
      title: form.elements[`videoTitle-${video.id}`]?.value.trim() || "",
    })),
  });

  for (const video of videos) {
    const titleInput = form.elements[`videoTitle-${video.id}`];
    const fileInput = form.elements[`videoFile-${video.id}`];
    const replacement = fileInput?.files?.[0];
    if (!replacement) continue;

    const upload = await createSignedUpload(airline.id, replacement);
    await uploadToSupabase(upload, replacement);
    await contentRequest({
      action: "confirmReplace",
      videoId: video.id,
      title: titleInput?.value.trim() || "",
      fileName: replacement.name,
      storagePath: upload.storagePath,
      skipReload: true,
    });
  }

  const newVideoRows = Array.from(form.querySelectorAll("[data-new-video-row]"));
  for (const row of newVideoRows) {
    const newVideoFile = row.querySelector("[data-new-video-file]")?.files?.[0];
    if (!newVideoFile) continue;

    const upload = await createSignedUpload(airline.id, newVideoFile);
    await uploadToSupabase(upload, newVideoFile);
    await contentRequest({
      action: "confirmUpload",
      formId: airline.id,
      videoId: upload.videoId,
      title: row.querySelector("[data-new-video-title]")?.value.trim() || "",
      fileName: newVideoFile.name,
      storagePath: upload.storagePath,
      skipReload: true,
    });
  }

  await loadRemoteContent({ showLoading: false });
  showToast(`${airline.name} updated.`);
  render();
}

async function createSignedUpload(formId, file) {
  return contentRequest({
    action: "createUpload",
    formId,
    fileName: file.name,
    contentType: file.type,
  });
}

async function uploadToSupabase(upload, file) {
  if (!uploadClientPromise) {
    uploadClientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY),
    );
  }
  uploadClient = uploadClient || (await uploadClientPromise);
  if (!uploadClient) throw new Error("Video storage is not configured.");

  const { error } = await uploadClient.storage
    .from(VIDEO_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || "video/mp4",
    });

  if (error) throw new Error(error.message);
}

function deleteAirline(airlineId) {
  const airline = state.airlines.find((item) => item.id === airlineId);
  if (!airline) return;

  contentRequest({
    action: "deleteForm",
    formId: airline.id,
    groupId: airline.group,
  })
    .then(() => setView("admin"))
    .catch((error) => showToast(error.message));
}

async function deleteVideo(airlineId, videoId) {
  await contentRequest({
    action: "deleteVideo",
    videoId,
  });
  showToast("Video removed.");
  render();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function homeTemplate() {
  return `
    <main class="shell home-shell">
      ${topBarTemplate()}
      <section class="home-card" aria-labelledby="home-title">
        <p class="eyebrow">SATS operations</p>
        <h1 id="home-title">G-Ops forms</h1>
        <div class="home-actions">
          ${state.groups.map(homeGroupButtonTemplate).join("")}
        </div>
      </section>
    </main>
  `;
}

function homeGroupButtonTemplate(group, index) {
  return `
    <button class="primary-action ${index % 2 ? "alt" : ""}" data-group-video="${group.id}">
      ${escapeHtml(group.name)}
    </button>
  `;
}

function topBarTemplate() {
  return `
    <nav class="topbar" aria-label="Main navigation">
      ${state.view === "home" ? `<span aria-hidden="true"></span>` : `<button class="ghost-button" data-view="home">Home</button>`}
      <div class="topbar-actions">
        ${
          state.admin
            ? `${state.view === "admin" ? "" : `<button class="ghost-button" data-view="admin">Admin</button>`}<button class="ghost-button" id="sign-out">Sign out</button>`
            : `<button class="ghost-button" data-view="admin">Admin</button>`
        }
      </div>
    </nav>
  `;
}

function airlineListTemplate(groupId) {
  const group = getGroup(groupId);
  const title = group?.name || "Form group";
  const airlines = getGroupAirlines(groupId);

  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace">
        <header class="section-header">
          <div>
            <p class="eyebrow">Gate process</p>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <button class="secondary-button" data-view="home">Back</button>
        </header>
        <div class="airline-grid">
          ${
            airlines.length
              ? airlines.map(airlineCardTemplate).join("")
              : `<p class="empty-state">No airlines have been added yet.</p>`
          }
        </div>
      </section>
    </main>
  `;
}

function airlineCardTemplate(airline) {
  const videos = getAirlineVideos(airline);

  return `
    <article class="airline-card">
      <button class="airline-button" data-airline="${airline.id}">
        <span>${escapeHtml(airline.name)}</span>
        <small>${videos.length} video${videos.length === 1 ? "" : "s"}</small>
      </button>
    </article>
  `;
}

function airlineDetailTemplate(airline) {
  const group = getGroup(airline.group);
  const groupAirlines = getGroupAirlines(airline.group);
  const showGroupTitle = group?.singleAirline || groupAirlines.length === 1;
  const pageTitle = showGroupTitle ? group?.name || airline.name : airline.name;
  const eyebrow = showGroupTitle ? "Form group" : "Airline";
  const videos = getAirlineVideos(airline);

  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace detail-layout">
        <header class="section-header">
          <div>
            <p class="eyebrow">${eyebrow}</p>
            <h1>${escapeHtml(pageTitle)}</h1>
          </div>
          <button class="secondary-button" data-view="${showGroupTitle ? "home" : airline.group}">Back</button>
        </header>
        ${
          videos.length
            ? videos.map(videoPlayerTemplate).join("")
            : `<div class="video-panel"><div class="video-placeholder">Video not uploaded yet</div></div>`
        }
      </section>
    </main>
  `;
}

function videoPlayerTemplate(video) {
  return `
    <section class="video-section">
      <div class="video-heading">
        <h2>${escapeHtml(video.title || "Walkthrough Video")}</h2>
      </div>
      <div class="video-panel">
        ${
          video.videoUrl
            ? `<video src="${escapeHtml(video.videoUrl)}" controls playsinline></video>`
            : `<div class="video-placeholder">Video not uploaded yet</div>`
        }
      </div>
    </section>
  `;
}

function adminTemplate() {
  if (!state.admin) {
    return `
      <main class="shell home-shell">
        <section class="auth-panel">
          <p class="eyebrow">Admin</p>
          <h1>Admin login</h1>
          <form id="admin-login-form" class="stack">
            <label>
              Username
              <input name="username" type="text" placeholder="Enter username" autocomplete="username" required />
            </label>
            <label>
              Password
              <span class="password-field">
                <input id="admin-password" name="password" type="password" placeholder="Enter password" autocomplete="current-password" required />
                <button class="icon-button password-toggle" type="button" id="toggle-password" aria-label="Show password" title="Show password">
                  <svg class="eye-icon eye-open" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg class="eye-icon eye-closed" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m3 3 18 18"></path>
                    <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2"></path>
                    <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3 3.8"></path>
                    <path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-.9"></path>
                  </svg>
                </button>
              </span>
            </label>
            ${state.auth.error ? `<p class="form-error">${state.auth.error}</p>` : ""}
            <button class="auth-button" type="submit" ${state.auth.loading ? "disabled" : ""}>
              ${state.auth.loading ? "Signing in..." : "Sign in"}
            </button>
            <button class="ghost-button full-width" type="button" data-view="home">Back to home</button>
          </form>
        </section>
      </main>
    `;
  }

  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace admin-layout">
        <header class="section-header admin-hero">
          <div>
            <p class="eyebrow">Admin</p>
            <h1>Airline content</h1>
            <p class="section-copy">Manage airline categories and walkthrough videos.</p>
          </div>
        </header>
        <div class="admin-shell">
          <aside class="admin-sidebar">
            <form id="add-group-form" class="admin-form">
              <h2>Create form group</h2>
              <label>
                Group name
                <input name="groupName" placeholder="OAL(excluding VJ)" required />
              </label>
              <label class="checkbox-row">
                <input name="singleAirline" type="checkbox" />
                <span>This group only has one airline</span>
              </label>
              <button class="primary-action compact" type="submit">Create form group</button>
            </form>
          </aside>
          <section class="admin-main" aria-labelledby="airline-list-title">
            <div class="admin-section-title">
              <div>
                <p class="eyebrow">Library</p>
                <h2 id="airline-list-title">Existing forms</h2>
              </div>
              <span class="count-badge">${state.airlines.length} form${state.airlines.length === 1 ? "" : "s"}</span>
            </div>
            <div class="admin-list">
              ${state.airlines.map(adminAirlineTemplate).join("")}
            </div>
          </section>
        </div>
      </section>
    </main>
  `;
}

function adminAirlineTemplate(airline) {
  const videos = getAirlineVideos(airline);
  const group = getGroup(airline.group);
  const groupAirlines = getGroupAirlines(airline.group);
  const showGroupOnly = group?.singleAirline || groupAirlines.length === 1;
  const cardTitle = showGroupOnly ? group?.name || airline.name : airline.name;

  return `
    <form class="admin-form compact-form" data-edit="${airline.id}">
      <div class="admin-form-header">
        <div>
          <p class="eyebrow">${escapeHtml(group?.name || "Group")}</p>
          <h2>${escapeHtml(cardTitle)}</h2>
        </div>
        <button class="danger-button" type="button" data-delete="${airline.id}">Delete</button>
      </div>
      ${
        showGroupOnly
          ? `<input name="airlineName" type="hidden" value="${escapeHtml(airline.name)}" />
             <input name="airlineGroup" type="hidden" value="${airline.group}" />`
          : `<label>
              Airline
              <input name="airlineName" value="${escapeHtml(airline.name)}" />
            </label>
            <input name="airlineGroup" type="hidden" value="${airline.group}" />`
      }
      <div class="video-editor-list">
        <p class="field-group-title">Videos</p>
        ${
          videos.length
            ? videos.map((video) => adminVideoTemplate(airline, video)).join("")
            : `<p class="file-status">No video uploaded</p>`
        }
      </div>
      <div class="new-video-list" data-new-video-list="${airline.id}"></div>
      <button class="secondary-button full-width add-video-button" type="button" data-add-video="${airline.id}">
        Add video
      </button>
      <button class="secondary-button full-width" type="submit">Update</button>
    </form>
  `;
}

function adminVideoTemplate(airline, video) {
  return `
    <section class="video-editor">
      <div class="video-editor-header">
        <strong>${escapeHtml(video.videoName || "Uploaded video")}</strong>
        <button class="danger-button small-button" type="button" data-delete-video="${airline.id}:${video.id}">Remove</button>
      </div>
      <label>
        Video title optional
        <input name="videoTitle-${video.id}" value="${escapeHtml(video.title || "")}" placeholder="Walkthrough Video" />
      </label>
      <label>
        Replace this video
        <input name="videoFile-${video.id}" type="file" accept="video/*" />
      </label>
    </section>
  `;
}

function newVideoTemplate(id) {
  return `
    <section class="video-editor add-video-editor" data-new-video-row>
      <div class="video-editor-header">
        <p class="field-group-title">New video</p>
        <button class="ghost-button small-button" type="button" data-remove-new-video="${id}">Cancel</button>
      </div>
      <label>
        Video title optional
        <input data-new-video-title placeholder="Walkthrough Video" />
      </label>
      <label>
        Upload video
        <input data-new-video-file type="file" accept="video/*" />
      </label>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll("[data-group-video]").forEach((button) => {
    button.addEventListener("click", () => openGroupVideo(button.dataset.groupVideo));
  });

  document.querySelectorAll("[data-airline]").forEach((button) => {
    button.addEventListener("click", () => setView("airline", button.dataset.airline));
  });

  document.getElementById("sign-out")?.addEventListener("click", signOut);

  document.getElementById("admin-login-form")?.addEventListener("submit", (event) => {
    loginAdmin(event).catch(() => showToast("Admin login failed."));
  });

  document.getElementById("toggle-password")?.addEventListener("click", (event) => {
    const input = document.getElementById("admin-password");
    if (!input) return;

    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    event.currentTarget.classList.toggle("is-visible", shouldShow);
    event.currentTarget.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
    event.currentTarget.setAttribute("title", shouldShow ? "Hide password" : "Show password");
  });

  document.getElementById("add-group-form")?.addEventListener("submit", addGroup);

  document.querySelectorAll("[data-edit]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      updateAirline(event, form.dataset.edit).catch(() => {
        showToast("Video update failed.");
      });
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteAirline(button.dataset.delete));
  });

  document.querySelectorAll("[data-delete-video]").forEach((button) => {
    button.addEventListener("click", () => {
      const [airlineId, videoId] = button.dataset.deleteVideo.split(":");
      deleteVideo(airlineId, videoId).catch(() => showToast("Video could not be removed."));
    });
  });

  document.querySelectorAll("[data-add-video]").forEach((button) => {
    button.addEventListener("click", () => {
      const list = document.querySelector(`[data-new-video-list="${button.dataset.addVideo}"]`);
      if (!list) return;

      const id = `new-video-${Date.now()}`;
      list.insertAdjacentHTML("beforeend", newVideoTemplate(id));
      const row = list.lastElementChild;
      row?.querySelector("input")?.focus();
    });
  });

  document.querySelectorAll("[data-new-video-list]").forEach((list) => {
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-new-video]");
      if (!button) return;
      button.closest("[data-new-video-row]")?.remove();
    });
  });
}

function render() {
  const selectedAirline = state.airlines.find((airline) => airline.id === state.selectedAirlineId);
  const templates = {
    home: homeTemplate,
    admin: adminTemplate,
    airline: () => (selectedAirline ? airlineDetailTemplate(selectedAirline) : homeTemplate()),
  };

  const template = templates[state.view] || (() => airlineListTemplate(state.view));
  document.getElementById("app").innerHTML = template();
  bindEvents();
}

render();
loadRemoteContent();
