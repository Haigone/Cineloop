const PORTS = Array.from({ length: 10 }, (_, i) => 6463 + i);
const $ = (id) => document.getElementById(id);

function log(message) {
  $("log").textContent = message;
}

$("clear").addEventListener("click", () => {
  $("status").textContent = "Premi “Prova connessione” con Discord desktop aperto.";
  $("status").className = "muted";
  log("In attesa del test.");
});

$("run").addEventListener("click", async () => {
  const button = $("run");
  button.disabled = true;
  $("status").className = "muted";
  $("status").textContent = "Controllo le porte RPC locali di Discord…";
  log("Test in corso. Nessun comando RPC o dato personale verrà inviato.");

  const results = await Promise.all(PORTS.map((port) => probe(port)));
  const open = results.filter((r) => r.open);
  const errors = results.filter((r) => !r.open);

  if (open.length) {
    $("status").textContent = "Una o più porte hanno accettato l'apertura WebSocket. È solo un primo segnale: non prova che Discord autorizzi SET_ACTIVITY.";
    $("status").className = "good";
  } else {
    $("status").textContent = "Nessuna porta ha accettato la connessione dal contesto della pagina di test.";
    $("status").className = "bad";
  }

  log([
    "Risultato del test di sola connessione",
    "",
    ...results.map((r) => `Porta ${r.port}: ${r.open ? "WebSocket aperto" : r.reason}`),
    "",
    "Non è stato inviato alcun comando RPC, token o attività Discord.",
    open.length
      ? "Prossimo passo: verificare se il protocollo autorizza l'estensione; non assumere che la presenza sia già funzionante."
      : "Possibili cause: Discord non espone la porta, il browser blocca la connessione o il client rifiuta l'origine dell'estensione."
  ].join("\n"));
  button.disabled = false;
});

function probe(port) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let socket;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve({ port, ...result });
    };

    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=1559324285544435712`);
    } catch (error) {
      finish({ open: false, reason: `non avviato (${error?.message || "errore browser"} )` });
      return;
    }

    timer = setTimeout(() => finish({ open: false, reason: "timeout / connessione rifiutata" }), 1300);
    socket.addEventListener("open", () => finish({ open: true }));
    socket.addEventListener("error", () => finish({ open: false, reason: "errore WebSocket / origine rifiutata" }));
    socket.addEventListener("close", () => {
      if (!settled) finish({ open: false, reason: "connessione chiusa prima dell'apertura" });
    });
  });
}
