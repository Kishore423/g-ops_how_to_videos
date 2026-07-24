const STORAGE_KEY = "gops-airlines-v1";
const SESSION_KEY = "gops-admin-session";

const defaultAirlines = [
  {
    id: "ke",
    name: "KE",
    group: "oal",
    gateForms: ["Gate form"],
    videoName: "Upload KE video",
    videoUrl: "",
  },
  {
    id: "vj",
    name: "VJ",
    group: "vj",
    gateForms: ["Gate form"],
    videoName: "Upload VJ video",
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
  const gateForm = form.gateForm.value.trim();

  if (!name) return;

  const id = `${name.toLowerCase()}-${Date.now()}`;
  state.airlines.push({
    id,
    name,
    group,
    gateForms: gateForm ? [gateForm] : [],
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

  const gateForms = form.gateForms.value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  airline.name = form.airlineName.value.trim().toUpperCase() || airline.name;
  airline.group = form.airlineGroup.value;
  airline.gateForms = gateForms;

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
          <button class="primary-action" data-view="oal">OAL <span>excluding VJ</span></button>
          <button class="primary-action alt" data-view="vj">VJ</button>
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
            ? `<button class="ghost-button" data-view="admin">Admin</button><button class="ghost-button" id="sign-out">Sign out</button>`
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
              : `<div class="video-placeholder">${airline.videoName}</div>`
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
        ${topBarTemplate()}
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
              <input name="password" type="password" placeholder="Enter password" autocomplete="current-password" required />
            </label>
            ${state.auth.error ? `<p class="form-error">${state.auth.error}</p>` : ""}
            <button class="auth-button" type="submit" ${state.auth.loading ? "disabled" : ""}>
              ${state.auth.loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    `;
  }

  return `
    <main class="shell">
      ${topBarTemplate()}
      <section class="workspace admin-layout">
        <header class="section-header">
          <div>
            <p class="eyebrow">Admin</p>
            <h1>Airline content</h1>
          </div>
          <button class="secondary-button" data-view="home">Back</button>
        </header>
        <form id="add-airline-form" class="admin-form">
          <h2>Add airline</h2>
          <label>
            Airline
            <input name="airlineName" placeholder="KE" required />
          </label>
          <label>
            Category
            <select name="airlineGroup">
              <option value="oal">OAL excluding VJ</option>
              <option value="vj">VJ</option>
            </select>
          </label>
          <label>
            Gate form
            <input name="gateForm" placeholder="Gate form name or link" />
          </label>
          <button class="primary-action compact" type="submit">Add airline</button>
        </form>
        <div class="admin-list">
          ${state.airlines.map(adminAirlineTemplate).join("")}
        </div>
      </section>
    </main>
  `;
}

function adminAirlineTemplate(airline) {
  return `
    <form class="admin-form compact-form" data-edit="${airline.id}">
      <div class="admin-form-header">
        <h2>${airline.name}</h2>
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
        Gate forms
        <textarea name="gateForms" rows="3">${airline.gateForms.join("\n")}</textarea>
      </label>
      <label>
        Replace video
        <input name="video" type="file" accept="video/*" />
      </label>
      <p class="file-status">${airline.videoName}</p>
      <button class="secondary-button full-width" type="submit">Update</button>
    </form>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll("[data-airline]").forEach((button) => {
    button.addEventListener("click", () => setView("airline", button.dataset.airline));
  });

  document.getElementById("sign-out")?.addEventListener("click", signOut);

  document.getElementById("admin-login-form")?.addEventListener("submit", (event) => {
    loginAdmin(event).catch(() => showToast("Admin login failed."));
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
