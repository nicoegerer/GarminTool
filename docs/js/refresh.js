/* ============================================================
   „Daten aktualisieren“: startet den GitHub-Actions-Workflow
   (refresh-data.yml) per workflow_dispatch, wartet auf frische
   Daten und lädt die Seite neu.

   Benötigt einmalig einen Fine-grained GitHub-PAT (nur Repo
   GarminTool, Berechtigung Actions: Read & write). Der Token
   bleibt im localStorage dieses Browsers.
   ============================================================ */

const GH_REPO = "nicoegerer/GarminTool";
const GH_WORKFLOW = "refresh-data.yml";
const GH_TOKEN_KEY = "gt_gh_token";

const refreshBtn = document.getElementById("refresh-btn");
const refreshLabel = document.getElementById("refresh-label");

refreshBtn.addEventListener("click", () => {
  const token = localStorage.getItem(GH_TOKEN_KEY);
  if (!token) { openRefreshModal(); return; }
  startRefresh(token);
});

/* ---------- Modal ---------- */

function openRefreshModal() {
  const backdrop = document.getElementById("modal-backdrop");
  const modal = document.getElementById("modal-refresh");
  backdrop.classList.add("is-open");
  modal.hidden = false;
  document.getElementById("modal-key").hidden = true;
  document.getElementById("gh-token-input").focus();
}

function closeModals() {
  document.getElementById("modal-backdrop").classList.remove("is-open");
}

document.getElementById("modal-refresh-cancel").addEventListener("click", closeModals);
document.getElementById("modal-backdrop").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModals();
});
document.getElementById("modal-refresh-save").addEventListener("click", () => {
  const token = document.getElementById("gh-token-input").value.trim();
  if (!token) return;
  localStorage.setItem(GH_TOKEN_KEY, token);
  document.getElementById("gh-token-input").value = "";
  closeModals();
  startRefresh(token);
});

/* ---------- Workflow starten & auf neue Daten warten ---------- */

function setRefreshState(label, running) {
  refreshLabel.textContent = label;
  refreshBtn.disabled = running;
  refreshBtn.classList.toggle("is-running", running);
}

async function startRefresh(token) {
  const before = DATA.manifest && DATA.manifest.generated_at;
  setRefreshState("Starte Workflow …", true);

  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem(GH_TOKEN_KEY);
      setRefreshState("Daten aktualisieren", false);
      openRefreshModal();
      return;
    }
    if (!res.ok && res.status !== 204) {
      throw new Error(`GitHub antwortete mit ${res.status}`);
    }

    // Warten, bis manifest.generated_at sich ändert (Workflow + Pages-Deploy)
    setRefreshState("Uhr wird abgefragt …", true);
    const fresh = await waitForNewData(before, 8 * 60 * 1000);
    if (fresh) {
      setRefreshState("Fertig – lade neu …", true);
      setTimeout(() => location.reload(), 800);
    } else {
      setRefreshState("Dauert noch – später neu laden", false);
      setTimeout(() => setRefreshState("Daten aktualisieren", false), 8000);
    }
  } catch (err) {
    console.error("Refresh fehlgeschlagen:", err);
    setRefreshState("Fehler – erneut versuchen", false);
    setTimeout(() => setRefreshState("Daten aktualisieren", false), 6000);
  }
}

async function waitForNewData(before, timeoutMs) {
  const start = Date.now();
  let tick = 0;
  while (Date.now() - start < timeoutMs) {
    await sleep(15000);
    tick++;
    const mins = Math.round((Date.now() - start) / 60000);
    setRefreshState(tick % 2 ? `Synchronisiere … (${mins} min)` : "Warte auf Deploy …", true);
    try {
      const res = await fetch(`./data/manifest.json?ts=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const m = await res.json();
        if (m.generated_at && m.generated_at !== before) return true;
      }
    } catch { /* Netzwerkfehler ignorieren, weiter pollen */ }
  }
  return false;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
