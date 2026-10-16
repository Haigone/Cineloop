use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MAX_RECENT: usize = 8;

/// Un titolo visto dall'estensione.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Title {
    pub title: String,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub poster: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct State {
    /// Presenza nascosta: niente va su Discord.
    pub paused: bool,
    /// Titolo scelto a mano da mostrare quando non stai guardando nulla.
    pub pinned: Option<Title>,
    /// Ultimo titolo rilevato.
    pub last: Option<Title>,
    /// Titoli visti di recente (il più recente per primo).
    pub recent: Vec<Title>,
    /// Stai guardando qualcosa adesso.
    #[serde(skip)]
    pub watching: bool,
}

/// Cosa mostrare su Discord.
#[derive(Clone, Debug, PartialEq)]
pub struct Presence {
    pub details: String,
    pub state: String,
    pub poster: Option<String>,
}

fn int(v: Option<&Value>) -> Option<i64> {
    v.and_then(Value::as_i64)
}

fn https_url(v: Option<&Value>) -> Option<String> {
    let s = v?.as_str()?;
    let rest = s.strip_prefix("https://")?;
    (!rest.is_empty() && !rest.starts_with('/') && s.len() <= 512).then(|| s.to_string())
}

/// Estrae il titolo dal corpo inviato dall'estensione; `None` = nessuna visione.
pub fn parse_payload(payload: &Value) -> Option<Title> {
    let w = payload.get("watching")?.as_object()?;
    let t = w.get("title").and_then(Value::as_object);
    let name = t?.get("title")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    let poster = https_url(w.get("posterUrl")).or_else(|| {
        let t = t?;
        https_url(t.get("artwork").and_then(|a| a.get("posterUrl")))
            .or_else(|| https_url(t.get("posterUrl")))
    });
    Some(Title {
        title: name.chars().take(128).collect(),
        season: int(w.get("season")),
        episode: int(w.get("episode")),
        poster,
    })
}

impl State {
    /// Registra la visione corrente (o la sua fine).
    pub fn apply(&mut self, seen: Option<Title>) {
        match seen {
            Some(mut t) => {
                // Se manca la locandina, tieni quella già nota per lo stesso titolo.
                if t.poster.is_none() {
                    t.poster = self
                        .last
                        .iter()
                        .chain(self.recent.iter())
                        .find(|o| o.title == t.title)
                        .and_then(|o| o.poster.clone());
                }
                self.watching = true;
                self.recent.retain(|o| o.title != t.title);
                self.recent.insert(0, t.clone());
                self.recent.truncate(MAX_RECENT);
                self.last = Some(t);
            }
            None => self.watching = false,
        }
    }

    /// Cosa mostrare ora: visione in corso, poi titolo in evidenza, poi ultimo titolo.
    pub fn presence(&self) -> Option<Presence> {
        if self.paused {
            return None;
        }
        if self.watching {
            let t = self.last.as_ref()?;
            return Some(Presence {
                details: t.title.clone(),
                state: match (t.season, t.episode) {
                    (Some(s), Some(e)) => format!("Ora sta guardando · Stagione {s}, episodio {e}"),
                    (_, Some(e)) => format!("Ora sta guardando · Episodio {e}"),
                    _ => "Ora sta guardando su CineLoop".into(),
                },
                poster: t.poster.clone(),
            });
        }
        if let Some(t) = &self.pinned {
            return Some(Presence {
                details: t.title.clone(),
                state: "In evidenza su CineLoop".into(),
                poster: t.poster.clone(),
            });
        }
        let t = self.last.as_ref()?;
        Some(Presence {
            details: t.title.clone(),
            state: match (t.season, t.episode) {
                (Some(s), Some(e)) => format!("Ultimo contenuto rilevato · Stagione {s}, episodio {e}"),
                (_, Some(e)) => format!("Ultimo contenuto rilevato · Episodio {e}"),
                _ => "Ultimo contenuto aperto · non in visione".into(),
            },
            poster: t.poster.clone(),
        })
    }

    /// Riga di stato per il menu.
    pub fn status_line(&self, discord_ok: bool) -> String {
        if self.paused {
            return "In pausa: attività nascosta".into();
        }
        if !discord_ok {
            return "In attesa di Discord".into();
        }
        match self.presence() {
            Some(p) if self.watching => format!("Sta guardando: {}", p.details),
            Some(p) => format!("In evidenza: {}", p.details),
            None => "Nessun titolo ancora".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn t(name: &str) -> Title {
        Title { title: name.into(), season: Some(1), episode: Some(2), poster: None }
    }

    #[test]
    fn parse_reads_title_episode_and_https_poster() {
        let p = json!({"watching": {"season": 2, "episode": 5,
            "title": {"title": "Dark", "artwork": {"posterUrl": "https://img/x.jpg"}}}});
        let got = parse_payload(&p).unwrap();
        assert_eq!((got.title.as_str(), got.season, got.episode), ("Dark", Some(2), Some(5)));
        assert_eq!(got.poster.as_deref(), Some("https://img/x.jpg"));
    }

    #[test]
    fn parse_rejects_non_https_and_null() {
        let p = json!({"watching": {"title": {"title": "A"}, "posterUrl": "http://x/y.jpg"}});
        assert_eq!(parse_payload(&p).unwrap().poster, None);
        assert!(parse_payload(&json!({"watching": null})).is_none());
        assert!(parse_payload(&json!({})).is_none());
    }

    #[test]
    fn shows_last_title_when_idle() {
        let mut s = State::default();
        s.apply(Some(t("Dark")));
        s.apply(None);
        let p = s.presence().unwrap();
        assert_eq!(p.details, "Dark");
        assert!(p.state.starts_with("Ultimo contenuto rilevato"));
    }

    #[test]
    fn pinned_wins_over_last_only_when_idle() {
        let mut s = State::default();
        s.pinned = Some(t("Severance"));
        s.apply(Some(t("Dark")));
        assert_eq!(s.presence().unwrap().details, "Dark");
        s.apply(None);
        assert_eq!(s.presence().unwrap().details, "Severance");
    }

    #[test]
    fn pause_hides_everything() {
        let mut s = State::default();
        s.apply(Some(t("Dark")));
        s.paused = true;
        assert!(s.presence().is_none());
    }

    #[test]
    fn recent_is_unique_and_capped() {
        let mut s = State::default();
        for i in 0..20 {
            s.apply(Some(t(&format!("T{i}"))));
        }
        s.apply(Some(t("T19")));
        assert_eq!(s.recent.len(), MAX_RECENT);
        assert_eq!(s.recent[0].title, "T19");
    }

    #[test]
    fn poster_is_kept_for_same_title() {
        let mut s = State::default();
        let mut a = t("Dark");
        a.poster = Some("https://img/a.jpg".into());
        s.apply(Some(a));
        s.apply(Some(t("Dark")));
        assert_eq!(s.last.unwrap().poster.as_deref(), Some("https://img/a.jpg"));
    }
}
