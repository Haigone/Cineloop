const PORTS = Array.from({ length: 10 }, (_, i) => 6463 + i);
const CLIENT_ID = "1559324285544435712";
const $ = (id) => document.getElementById(id);

function log(message) {
  $("log").textContent = message;
}

$("clear").addEventListener("click", () => {
  $("status").textContent = "Scegli uno dei test con Discord desktop aperto.";
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

  $("status").textContent = open.length
    ? "Una o più porte hanno accettato l'apertura WebSocket. È solo un primo segnale: non prova che Discord autorizzi SET_ACTIVITY."
    : "Nessuna porta ha accettato la connessione dal contesto della pagina di test.";
  $("status").className = open.length ? "good" : "bad";

  log([
    "Risultato del test di sola connessione",
    "",
    ...results.map((r) => `Porta ${r.port}: ${r.open ? "WebSocket aperto" : r.reason}`),
    "",
    "Non è stato inviato alcun comando RPC, token o attività Discord.",
    open.length
      ? "Prossimo passo: prova il test di autorizzazione separato."
      : "Possibili cause: Discord non espone la porta, il browser blocca la connessione o il client rifiuta l'origine dell'estensione."
  ].join("\n"));
  button.disabled = false;
});

$("authorize").addEventListener("click", () => {
  const button = $("authorize");
  button.disabled = true;
  $("status").className = "muted";
  $("status").textContent = "Verifico se Discord accetta la richiesta di autorizzazione RPC…";
  log("Test di autorizzazione in corso. Invierò soltanto AUTHORIZE con gli ambiti rpc e identify. Nessun Client Secret, token o comando SET_ACTIVITY verrà inviato.");

  const ports = PORTS.slice();
  tryPort(ports, 0, button);
});

function tryPort(ports, index, button) {
  if (index >= ports.length) {
    $("status").textContent = "Nessuna porta ha completato il test di autorizzazione.";
    $("status").className = "bad";
    log($("log").textContent + "\n\nTutte le porte sono state provate senza completare l'autorizzazione.");
    button.disabled = false;
    return;
  }

  const port = ports[index];
  let socket;
  let timer;
  let settled = false;
  let authorizeSent = false;
  const nonce = `cineloop-auth-test-${Date.now()}-${port}`;

  const finish = (message, ok = false, continueNext = false) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { socket?.close(); } catch {}
    $("status").textContent = message;
    $("status").className = ok ? "good" : "bad";
    if (continueNext) {
      log($("log").textContent + `\nPorta ${port}: nessuna risposta utile; provo la successiva…`);
      tryPort(ports, index + 1, button);
    } else {
      button.disabled = false;
    }
  };

  try {
    socket = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${CLIENT_ID}&encoding=json`);
  } catch (error) {
    log($("log").textContent + `\nPorta ${port}: connessione non avviata.`);
    tryPort(ports, index + 1, button);
    return;
  }

  timer = setTimeout(() => finish(
    `Timeout sulla porta ${port}: Discord non ha completato il test. Controlla il risultato qui sotto.`
  ), 7000);

  socket.addEventListener("open", () => {
    log($("log").textContent + `\nPorta ${port}: WebSocket aperto; attendo la risposta RPC…`);
  });

  socket.addEventListener("message", (event) => {
    let packet;
    try { packet = JSON.parse(event.data); }
    catch {
      finish(`Discord ha inviato una risposta non riconosciuta sulla porta ${port}.`);
      return;
    }

    if (packet.evt === "READY" && !authorizeSent) {
      authorizeSent = true;
      socket.send(JSON.stringify({
        cmd: "AUTHORIZE",
        nonce,
        args: { client_id: CLIENT_ID, scopes: ["rpc", "identify"] }
      }));
      log($("log").textContent + "\nRicevuto READY. Inviata la richiesta AUTHORIZE (solo rpc e identify). Se Discord mostra una finestra di consenso, leggila e scegli tu se autorizzare.");
      return;
    }

    if (packet.nonce === nonce) {
      if (packet.data && typeof packet.data.code === "string") {
        finish("Discord ha restituito un codice di autorizzazione. Il codice non viene mostrato né scambiato: non è ancora attiva la Rich Presence.", true);
      } else if (packet.evt === "ERROR" || packet.data?.code) {
        finish(`Discord ha risposto alla richiesta, ma non l'ha autorizzata. Evento: ${packet.evt || "risposta"}; codice: ${packet.data?.code ?? "non indicato"}.`);
      } else {
        finish("Discord ha risposto alla richiesta AUTHORIZE. Non è stata impostata alcuna attività; controlla il risultato tecnico qui sotto.", true);
      }
    } else if (packet.evt === "ERROR") {
      finish(`Discord ha rifiutato la connessione RPC. Codice errore: ${packet.data?.code ?? "non indicato"}.`);
    }
  });

  socket.addEventListener("error", () => {
    if (!settled) {
      log($("log").textContent + `\nPorta ${port}: errore WebSocket.`);
      finish(`La connessione alla porta ${port} è stata rifiutata o bloccata.`, false, true);
    }
  });

  socket.addEventListener("close", (event) => {
    if (!settled) {
      log($("log").textContent + `\nPorta ${port}: connessione chiusa (codice ${event.code || "non indicato"}).`);
      finish(`Discord ha chiuso la connessione sulla porta ${port} prima di completare l'autorizzazione.`, false, true);
    }
  });
}

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
      socket = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${CLIENT_ID}&encoding=json`);
    } catch (error) {
      finish({ open: false, reason: `non avviato (${error?.message || "errore browser"})` });
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
