// Injected only into the configured CineLoop site when a completion is pending.
(() => {
  if (!globalThis.chrome?.runtime?.id || document.getElementById("cineloop-completion-confirm")) return;
  chrome.runtime.sendMessage({ type: "completion-pending" }).then((pending) => {
    if (!pending || document.getElementById("cineloop-completion-confirm")) return;
    const overlay = document.createElement("div");
    overlay.id = "cineloop-completion-confirm";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "cineloop-completion-title");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(8,10,18,.72);display:flex;align-items:center;justify-content:center;padding:20px;font:15px/1.5 system-ui,sans-serif;color:#171923";
    const card = document.createElement("section");
    card.style.cssText = "box-sizing:border-box;width:min(460px,100%);background:#fff;color:#171923;border-radius:16px;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.4)";
    const heading = document.createElement("h2");
    heading.id = "cineloop-completion-title";
    heading.textContent = "Hai finito di guardare questo episodio?";
    heading.style.cssText = "font-size:19px;line-height:1.3;font-weight:750;margin:0 0 10px";
    const detail = document.createElement("p");
    const episode = Number.isInteger(pending.player?.episode) ? " · Episodio " + pending.player.episode : "";
    const season = Number.isInteger(pending.player?.season) ? " · Stagione " + pending.player.season : "";
    detail.textContent = (pending.player?.title || pending.documentTitle || "Episodio in riproduzione") + season + episode;
    detail.style.cssText = "margin:0 0 20px;opacity:.8";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.style.cssText = "margin:0 0 12px;min-height:1.5em;font-size:13px;opacity:.8";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.textContent = "Sì, episodio terminato";
    yes.style.cssText = "border:0;border-radius:9px;background:#2563eb;color:#fff;padding:11px 15px;font:inherit;font-weight:650;cursor:pointer";
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "No, non ancora";
    no.style.cssText = "border:1px solid #9ca3af;border-radius:9px;background:transparent;color:inherit;padding:11px 15px;font:inherit;font-weight:600;cursor:pointer";
    yes.addEventListener("click", async () => {
      yes.disabled = no.disabled = true;
      status.textContent = "Salvataggio in corso…";
      const ok = await chrome.runtime.sendMessage({ type: "completion-decision", action: "confirm", key: pending.key }).catch(() => false);
      if (ok) overlay.remove();
      else {
        yes.disabled = no.disabled = false;
        status.textContent = "Non siamo riusciti a salvare. Riprova.";
      }
    });
    no.addEventListener("click", async () => {
      no.disabled = yes.disabled = true;
      await chrome.runtime.sendMessage({ type: "completion-decision", action: "dismiss", key: pending.key }).catch(() => false);
      overlay.remove();
    });
    actions.append(yes, no);
    if (!pending.nextUrl) {
      const explanation = document.createElement("p");
      explanation.textContent = "Conferma per segnare l’episodio come terminato. Il prossimo verrà tracciato quando lo avvii.";
      explanation.style.cssText = "margin:0 0 18px;color:#454958";
      card.append(heading, detail, explanation, status, actions);
    } else {
      card.append(heading, detail, status, actions);
    }
    overlay.append(card);
    document.documentElement.append(overlay);
    yes.focus();
  }).catch(() => {});
})();
