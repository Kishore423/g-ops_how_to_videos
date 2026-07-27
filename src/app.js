const STORAGE_KEY = "gops-airlines-v1";
const SESSION_KEY = "gops-admin-session";

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
  selectedAirlineId: null,
  airlines: loadAirlines(),
};

const videoUrls = new Map();

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

function saveAirlines() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.airlines));
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
  if (airlines.length === 1) {
    setView("airline", airlines[0].id);
    return;
  }

  setView(group);
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

    localStorage.setItem(SESSION_KEY, data.username);
    state.admin = true;
    state.auth = { error: "", loading: false };
  } catch (error) {
    state.auth = { ...state.auth, error: error.message, loading: false };
  }

  render();
}

function addAirline(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.airlineName.value.trim().toUpperCase();
  const group = form.airlineGroup.value;

  if (!name) return;

  const id = `${name.toLowerCase()}-${Date.now()}`;
  state.airlines.push({
    id,
    name,
    group,
    gateForms: [],
    videos: [],
  });
  saveAirlines();
  form.reset();
  showToast(`${name} added.`);
  render();
}

async function updateAirline(event, airlineId) {
  event.preventDefault();
  const form = event.currentTarget;
  const airline = state.airlines.find((item) => item.id === airlineId);
  if (!airline) return;

  airline.name = form.airlineName.value.trim().toUpperCase() || airline.name;
  airline.group = form.airlineGroup.value;

  const videos = getAirlineVideos(airline);
  await Promise.all(
    videos.map(async (video) => {
      const titleInput = form.elements[`videoTitle-${video.id}`];
      const fileInput = form.elements[`videoFile-${video.id}`];
      video.title = titleInput?.value.trim() || "";

      const replacement = fileInput?.files?.[0];
      if (replacement) {
        video.videoName = replacement.name;
        video.videoUrl = "indexeddb";
        await saveVideo(video.id, replacement);
        setCachedVideoUrl(video.id, replacement);
      }
    }),
  );

  const newVideoFile = form.newVideo.files[0];
  if (newVideoFile) {
    const video = {
      id: `video-${Date.now()}`,
      title: form.newVideoTitle.value.trim(),
      videoName: newVideoFile.name,
      videoUrl: "indexeddb",
    };
    airline.videos.push(video);
    await saveVideo(video.id, newVideoFile);
    setCachedVideoUrl(video.id, newVideoFile);
  }

  saveAirlines();
  showToast(`${airline.name} updated.`);
  render();
}

function openVideoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gops-video-store", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("videos");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveVideo(id, file) {
  const db = await openVideoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getVideo(id) {
  const db = await openVideoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readonly");
    const request = tx.objectStore("videos").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeVideo(id) {
  const db = await openVideoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function hydrateVideos() {
  await Promise.all(
    state.airlines.flatMap((airline) =>
      getAirlineVideos(airline)
        .filter((video) => video.videoUrl === "indexeddb")
        .map(async (video) => {
          const file = await getVideo(video.id);
          if (file) setCachedVideoUrl(video.id, file);
        }),
    ),
  );
  render();
}

function setCachedVideoUrl(id, file) {
  const existing = videoUrls.get(id);
  if (existing) URL.revokeObjectURL(existing);
  videoUrls.set(id, URL.createObjectURL(file));
}

function deleteAirline(airlineId) {
  state.airlines = state.airlines.filter((airline) => airline.id !== airlineId);
  saveAirlines();
  setView("admin");
}

async function deleteVideo(airlineId, videoId) {
  const airline = state.airlines.find((item) => item.id === airlineId);
  if (!airline) return;

  airline.videos = getAirlineVideos(airline).filter((video) => video.id !== videoId);
  await removeVideo(videoId);

  const existing = videoUrls.get(videoId);
  if (existing) URL.revokeObjectURL(existing);
  videoUrls.delete(videoId);

  saveAirlines();
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
          <button class="primary-action" data-group-video="oal">OAL(excluding VJ)</button>
          <button class="primary-action alt" data-group-video="vj">VJ</button>
        </div>
      </section>
    </main>
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

function airlineListTemplate(group) {
  const title = group === "vj" ? "VJ" : "OAL forms";
  const airlines = state.airlines.filter((airline) => airline.group === group);

  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace">
        <header class="section-header">
          <div>
            <p class="eyebrow">Gate process</p>
            <h1>${title}</h1>
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
  const pageTitle = airline.group === "oal" ? "OAL(excluding VJ)" : airline.name;
  const videos = getAirlineVideos(airline);

  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace detail-layout">
        <header class="section-header">
          <div>
            <p class="eyebrow">Airline</p>
            <h1>${escapeHtml(pageTitle)}</h1>
          </div>
          <button class="secondary-button" data-view="${airline.group}">Back</button>
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
          videoUrls.get(video.id)
            ? `<video src="${videoUrls.get(video.id)}" controls playsinline></video>`
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
            <form id="add-airline-form" class="admin-form">
              <h2>Add airline</h2>
              <label>
                Airline code
                <input name="airlineName" placeholder="KE" required />
              </label>
              <label>
                Category
                <select name="airlineGroup">
                  <option value="oal">OAL excluding VJ</option>
                  <option value="vj">VJ</option>
                </select>
              </label>
              <button class="primary-action compact" type="submit">Add airline</button>
            </form>
          </aside>
          <section class="admin-main" aria-labelledby="airline-list-title">
            <div class="admin-section-title">
              <div>
                <p class="eyebrow">Library</p>
                <h2 id="airline-list-title">Existing airlines</h2>
              </div>
              <span class="count-badge">${state.airlines.length} airline${state.airlines.length === 1 ? "" : "s"}</span>
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

  return `
    <form class="admin-form compact-form" data-edit="${airline.id}">
      <div class="admin-form-header">
        <div>
          <p class="eyebrow">${airline.group === "vj" ? "VJ" : "OAL"}</p>
          <h2>${escapeHtml(airline.name)}</h2>
        </div>
        <button class="danger-button" type="button" data-delete="${airline.id}">Delete</button>
      </div>
      <label>
        Airline
        <input name="airlineName" value="${escapeHtml(airline.name)}" />
      </label>
      <label>
        Category
        <select name="airlineGroup">
          <option value="oal" ${airline.group === "oal" ? "selected" : ""}>OAL excluding VJ</option>
          <option value="vj" ${airline.group === "vj" ? "selected" : ""}>VJ</option>
        </select>
      </label>
      <div class="video-editor-list">
        <p class="field-group-title">Videos</p>
        ${
          videos.length
            ? videos.map((video) => adminVideoTemplate(airline, video)).join("")
            : `<p class="file-status">No video uploaded</p>`
        }
      </div>
      <section class="video-editor add-video-editor">
        <p class="field-group-title">Add video</p>
        <label>
          Video title optional
          <input name="newVideoTitle" placeholder="Walkthrough Video" />
        </label>
        <label>
          Upload video
          <input name="newVideo" type="file" accept="video/*" />
        </label>
      </section>
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

  document.getElementById("add-airline-form")?.addEventListener("submit", addAirline);

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
}

function render() {
  const selectedAirline = state.airlines.find((airline) => airline.id === state.selectedAirlineId);
  const templates = {
    home: homeTemplate,
    oal: () => airlineListTemplate("oal"),
    vj: () => airlineListTemplate("vj"),
    admin: adminTemplate,
    airline: () => (selectedAirline ? airlineDetailTemplate(selectedAirline) : homeTemplate()),
  };

  document.getElementById("app").innerHTML = templates[state.view]();
  bindEvents();
}

render();
hydrateVideos().catch(() => {
  showToast("Saved videos could not be loaded.");
});
