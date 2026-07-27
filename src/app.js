const STORAGE_KEY = "gops-airlines-v1";
const SESSION_KEY = "gops-admin-session";

const defaultAirlines = [
  {
    id: "ke",
    name: "KE",
    group: "oal",
    gateForms: ["Gate form"],
    videoName: "",
    videoUrl: "",
  },
  {
    id: "vj",
    name: "VJ",
    group: "vj",
    gateForms: ["Gate form"],
    videoName: "",
    videoUrl: "",
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
    return Array.isArray(parsed) && parsed.length ? parsed : defaultAirlines;
  } catch {
    return defaultAirlines;
  }
}

function saveAirlines() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.airlines));
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
    videoName: "No video uploaded",
    videoUrl: "",
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

  const videoFile = form.video.files[0];
  if (videoFile) {
    airline.videoName = videoFile.name;
    airline.videoUrl = "indexeddb";
    await saveVideo(airline.id, videoFile);
    setCachedVideoUrl(airline.id, videoFile);
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

async function hydrateVideos() {
  await Promise.all(
    state.airlines
      .filter((airline) => airline.videoUrl === "indexeddb")
      .map(async (airline) => {
        const file = await getVideo(airline.id);
        if (file) setCachedVideoUrl(airline.id, file);
      }),
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
          <button class="primary-action" data-group-video="oal">OAL <span>excluding VJ</span></button>
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
  return `
    <article class="airline-card">
      <button class="airline-button" data-airline="${airline.id}">
        <span>${airline.name}</span>
        <small>${airline.gateForms.length || 0} gate form${airline.gateForms.length === 1 ? "" : "s"}</small>
      </button>
    </article>
  `;
}

function airlineDetailTemplate(airline) {
  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace detail-layout">
        <header class="section-header">
          <div>
            <p class="eyebrow">Airline</p>
            <h1>${airline.name}</h1>
          </div>
          <button class="secondary-button" data-view="${airline.group}">Back</button>
        </header>
        <div class="video-panel">
          ${
            videoUrls.get(airline.id)
              ? `<video src="${videoUrls.get(airline.id)}" controls playsinline></video>`
              : `<div class="video-placeholder">Video not uploaded yet</div>`
          }
        </div>
        <div class="form-list">
          <h2>Gate forms</h2>
          ${airline.gateForms.map((form) => `<p>${form}</p>`).join("") || `<p>No gate forms added.</p>`}
        </div>
      </section>
    </main>
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
            <p class="section-copy">Manage airline gate forms and replace training videos.</p>
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
  return `
    <form class="admin-form compact-form" data-edit="${airline.id}">
      <div class="admin-form-header">
        <div>
          <p class="eyebrow">${airline.group === "vj" ? "VJ" : "OAL"}</p>
          <h2>${airline.name}</h2>
        </div>
        <button class="danger-button" type="button" data-delete="${airline.id}">Delete</button>
      </div>
      <label>
        Airline
        <input name="airlineName" value="${airline.name}" />
      </label>
      <label>
        Category
        <select name="airlineGroup">
          <option value="oal" ${airline.group === "oal" ? "selected" : ""}>OAL excluding VJ</option>
          <option value="vj" ${airline.group === "vj" ? "selected" : ""}>VJ</option>
        </select>
      </label>
      <label>
        Replace video
        <input name="video" type="file" accept="video/*" />
      </label>
      <p class="file-status">${airline.videoName || "No video uploaded"}</p>
      <button class="secondary-button full-width" type="submit">Update</button>
    </form>
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
