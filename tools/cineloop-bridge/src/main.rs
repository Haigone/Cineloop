//! CineLoop Bridge: icona nella barra di Windows, nessuna finestra.
#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(not(windows))]
fn main() {
    eprintln!("CineLoop Bridge funziona solo su Windows (per ora). Usa tools/discord-bridge su altri sistemi.");
}

#[cfg(windows)]
fn main() {
    app::run();
}

#[cfg(windows)]
mod app {
    use cineloop_bridge::http;
    use cineloop_bridge::logic::{parse_payload, Presence};
    use cineloop_bridge::store::{self, Config};
    use discord_rich_presence::activity::{ActivityType, Assets, Button};
    use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
    use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tao::event::Event;
    use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
    use tray_icon::menu::{CheckMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
    use tray_icon::{Icon, TrayIconBuilder};

    const SITE: &str = "https://cineloop-one.vercel.app";
    const AUTOSTART_NAME: &str = "CineLoop Bridge";
    const ICON_PNG: &[u8] = include_bytes!("../../../extension/icons/32.png");

    enum Ev {
        Menu(String),
        Changed,
    }

    enum Cmd {
        Refresh,
        Reconnect,
    }

    struct Shared {
        cfg: Config,
        discord_ok: bool,
    }

    fn save(shared: &Shared) {
        store::save(&shared.cfg);
    }

    fn icon() -> Icon {
        let mut reader = png::Decoder::new(ICON_PNG).read_info().expect("icona");
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).expect("icona");
        buf.truncate(info.buffer_size());
        // L'icona dell'estensione e' RGBA a 8 bit.
        Icon::from_rgba(buf, info.width, info.height).expect("icona")
    }

    fn autostart() -> Option<auto_launch::AutoLaunch> {
        let exe = std::env::current_exe().ok()?;
        auto_launch::AutoLaunchBuilder::new()
            .set_app_name(AUTOSTART_NAME)
            .set_app_path(exe.to_str()?)
            .build()
            .ok()
    }

    fn build_menu(shared: &Shared) -> Menu {
        let st = &shared.cfg.state;
        let menu = Menu::new();
        let status = MenuItem::with_id("status", st.status_line(shared.discord_ok), false, None);
        let _ = menu.append(&status);
        if store::app_id(&shared.cfg).is_none() {
            let _ = menu.append(&MenuItem::with_id("noid", "Manca l'Application ID Discord", false, None));
        }
        let _ = menu.append(&PredefinedMenuItem::separator());
        let pause = if st.paused { "Riprendi attività" } else { "Nascondi attività" };
        let _ = menu.append(&MenuItem::with_id("pause", pause, true, None));

        // Titolo mostrato quando non stai guardando nulla.
        let auto = CheckMenuItem::with_id("auto", "Ultimo guardato", true, st.pinned.is_none(), None);
        let recents: Vec<CheckMenuItem> = st
            .recent
            .iter()
            .enumerate()
            .map(|(i, t)| {
                let on = st.pinned.as_ref().is_some_and(|p| p.title == t.title);
                CheckMenuItem::with_id(format!("pin:{i}"), &t.title, true, on, None)
            })
            .collect();
        let mut items: Vec<&dyn IsMenuItem> = vec![&auto];
        items.extend(recents.iter().map(|c| c as &dyn IsMenuItem));
        let sub = Submenu::with_items("Titolo in evidenza", true, &items).expect("menu");
        let _ = menu.append(&sub);

        let _ = menu.append(&MenuItem::with_id("reconnect", "Riconnetti a Discord", true, None));
        let _ = menu.append(&PredefinedMenuItem::separator());
        let on = autostart().and_then(|a| a.is_enabled().ok()).unwrap_or(false);
        let _ = menu.append(&CheckMenuItem::with_id("autostart", "Avvia con Windows", true, on, None));
        let _ = menu.append(&MenuItem::with_id("open", "Apri CineLoop", true, None));
        let _ = menu.append(&MenuItem::with_id("quit", "Esci", true, None));
        menu
    }

    fn to_activity<'a>(p: &'a Presence) -> activity::Activity<'a> {
        let mut assets = Assets::new().small_image("cineloop_logo").small_text("CineLoop");
        assets = match &p.poster {
            Some(url) => assets.large_image(url.as_str()).large_text(p.details.as_str()),
            None => assets.large_text("CineLoop"),
        };
        activity::Activity::new()
            .activity_type(ActivityType::Watching)
            .details(p.details.as_str())
            .state(p.state.as_str())
            .assets(assets)
            .buttons(vec![Button::new("Apri CineLoop", SITE)])
    }

    /// Thread che parla con Discord: si riconnette da solo quando Discord parte.
    fn presence_worker(shared: Arc<Mutex<Shared>>, rx: std::sync::mpsc::Receiver<Cmd>, proxy: EventLoopProxy<Ev>) {
        let mut client: Option<DiscordIpcClient> = None;
        let mut shown: Option<Presence> = None;
        loop {
            let cmd = match rx.recv_timeout(Duration::from_secs(15)) {
                Ok(c) => Some(c),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return,
            };
            if matches!(cmd, Some(Cmd::Reconnect)) {
                if let Some(mut c) = client.take() {
                    let _ = c.close();
                }
                shown = None;
            }
            let (want, app_id) = {
                let g = shared.lock().unwrap();
                (g.cfg.state.presence(), store::app_id(&g.cfg))
            };
            let ok_before = client.is_some();
            match (&want, &app_id) {
                (None, _) => {
                    if let Some(c) = client.as_mut() {
                        if shown.is_some() && c.clear_activity().is_err() {
                            client = None;
                        }
                    }
                    shown = None;
                }
                (Some(p), Some(id)) => {
                    if client.is_none() {
                        let mut c = DiscordIpcClient::new(id);
                        if c.connect().is_ok() {
                            client = Some(c);
                            shown = None;
                        }
                    }
                    if let Some(c) = client.as_mut() {
                        if shown.as_ref() != Some(p) {
                            if c.set_activity(to_activity(p)).is_ok() {
                                shown = Some(p.clone());
                            } else {
                                client = None;
                                shown = None;
                            }
                        }
                    }
                }
                (Some(_), None) => {}
            }
            let ok = client.is_some();
            if ok != ok_before || shared.lock().unwrap().discord_ok != ok {
                shared.lock().unwrap().discord_ok = ok;
                let _ = proxy.send_event(Ev::Changed);
            }
        }
    }

    pub fn run() {
        // Una sola istanza: se la porta e' occupata c'e' gia' un bridge attivo.
        let Some(server) = http::bind() else { return };

        let shared = Arc::new(Mutex::new(Shared { cfg: store::load(), discord_ok: false }));
        let event_loop = EventLoopBuilder::<Ev>::with_user_event().build();
        let proxy = event_loop.create_proxy();
        let (tx, rx): (Sender<Cmd>, _) = channel();

        {
            let (shared, proxy, tx) = (shared.clone(), proxy.clone(), tx.clone());
            std::thread::spawn(move || {
                http::serve(server, move |payload| {
                    let mut g = shared.lock().unwrap();
                    g.cfg.state.apply(parse_payload(&payload));
                    save(&g);
                    drop(g);
                    let _ = tx.send(Cmd::Refresh);
                    let _ = proxy.send_event(Ev::Changed);
                });
            });
        }
        {
            let (shared, proxy) = (shared.clone(), proxy.clone());
            std::thread::spawn(move || presence_worker(shared, rx, proxy));
        }
        let _ = tx.send(Cmd::Refresh);

        let menu_proxy = proxy.clone();
        MenuEvent::set_event_handler(Some(move |e: MenuEvent| {
            let _ = menu_proxy.send_event(Ev::Menu(e.id.0));
        }));

        let mut tray = None;
        event_loop.run(move |event, _, flow| {
            *flow = ControlFlow::Wait;
            match event {
                Event::NewEvents(tao::event::StartCause::Init) => {
                    let g = shared.lock().unwrap();
                    tray = TrayIconBuilder::new()
                        .with_icon(icon())
                        .with_tooltip("CineLoop Bridge")
                        .with_menu(Box::new(build_menu(&g)))
                        .build()
                        .ok();
                }
                Event::UserEvent(Ev::Changed) => {
                    let g = shared.lock().unwrap();
                    if let Some(t) = &tray {
                        t.set_menu(Some(Box::new(build_menu(&g))));
                    }
                }
                Event::UserEvent(Ev::Menu(id)) => {
                    let mut g = shared.lock().unwrap();
                    let mut redraw = true;
                    match id.as_str() {
                        "pause" => g.cfg.state.paused = !g.cfg.state.paused,
                        "auto" => g.cfg.state.pinned = None,
                        "reconnect" => {
                            let _ = tx.send(Cmd::Reconnect);
                        }
                        "autostart" => {
                            if let Some(a) = autostart() {
                                let _ = if a.is_enabled().unwrap_or(false) { a.disable() } else { a.enable() };
                            }
                        }
                        "open" => {
                            let _ = std::process::Command::new("cmd").args(["/C", "start", "", SITE]).spawn();
                            redraw = false;
                        }
                        "quit" => {
                            *flow = ControlFlow::Exit;
                            drop(tray.take());
                            return;
                        }
                        other => {
                            if let Some(i) = other.strip_prefix("pin:").and_then(|n| n.parse::<usize>().ok()) {
                                g.cfg.state.pinned = g.cfg.state.recent.get(i).cloned();
                            } else {
                                redraw = false;
                            }
                        }
                    }
                    if redraw {
                        save(&g);
                        let _ = tx.send(Cmd::Refresh);
                        if let Some(t) = &tray {
                            t.set_menu(Some(Box::new(build_menu(&g))));
                        }
                    }
                }
                _ => {}
            }
        });
    }
}

