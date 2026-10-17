use super::*;
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_MOVE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveReview {
    pub token: String,
    pub source: String,
    pub destination: String,
}
impl Workspace {
    pub(super) fn check_pending_move(&self, path: &str) -> Result<()> {
        if self.pending_entry_paths().iter().any(|p| overlaps(p, path)) {
            return Err(Error::new(
                "E-OUTCOME-UNKNOWN",
                "recheck the pending file/folder operation",
            ));
        }
        if self.trash_pending.values().any(|p| overlaps(p, path))
            || self
                .pending_moves
                .values()
                .any(|p| overlaps(&p.source, path) || overlaps(&p.destination, path))
        {
            return Err(Error::new(
                "E-OUTCOME-UNKNOWN",
                "Recheck both old and new paths before another mutation",
            ));
        }
        Ok(())
    }
    pub(super) fn path_gate(&self, source: &str) -> Result<()> {
        self.entry_gate(source, true)
    }
    pub(super) fn entry_gate(&self, source: &str, clean: bool) -> Result<()> {
        self.check_config()?;
        self.check_pending_move(source)?;
        if self.recovery_required || native::has_pending_recovery(&self.read.root)? {
            return Err(Error::new(
                "E-RECOVERY-REQUIRED",
                "path mutations are gated",
            ));
        }
        if clean
            && self
                .drafts
                .iter()
                .any(|(p, d)| within(p, source) && d.dirty())
        {
            return Err(Error::new(
                "E-PATH-DIRTY",
                "Save / Don't Save / Cancel required for this source",
            ));
        }
        if self.uncertain_paths().iter().any(|p| overlaps(p, source)) {
            return Err(Error::new(
                "E-OUTCOME-UNKNOWN",
                "source outcome must be rechecked",
            ));
        }
        if source == self.read.source_directory_path() {
            return Err(Error::new("E-PATH-SCOPE", "source root cannot be changed"));
        }
        if !self.read.sources.contains_key(source) && !self.read.folders.contains(source) {
            return Err(Error::new("E-SOURCE-MISSING", source));
        }
        Ok(())
    }
    pub fn path_move_choices(&self, source: &str) -> Result<serde_json::Value> {
        self.check_config()?;
        let snapshot = native::entry::capture(&self.read.root, &self.read.roots, source)?;
        let root = self
            .read
            .roots
            .iter()
            .find(|r| snapshot.physical.starts_with(r))
            .ok_or_else(|| Error::new("E-PATH-SCOPE", "source root required"))?;
        let folders = self
            .read
            .folders
            .iter()
            .filter(|p| {
                self.read.root.join(p).starts_with(root)
                    && (!snapshot.directory || !within(p, source))
            })
            .collect::<Vec<_>>();
        Ok(
            serde_json::json!({"root":self.read.source_directory_path(),"folders":folders,"filename":std::path::Path::new(source).file_name().unwrap().to_string_lossy(),"directory":snapshot.directory}),
        )
    }
    pub fn prepare_path_move(&mut self, source: &str, destination: &str) -> Result<MoveReview> {
        self.path_gate(source)?;
        self.check_pending_move(destination)?;
        let actual = native::entry::capture(&self.read.root, &self.read.roots, source)?;
        let expected = self.snapshots.get(source).unwrap_or(&actual);
        if !actual.directory && actual.bytes != self.read.sources[source].bytes {
            return Err(Error::new(
                "E-SOURCE-CONFLICT",
                "source changed; refresh before requesting Rename / Move",
            ));
        }
        let plan = native::prepare_move(
            &self.read.root,
            &self.read.roots,
            source,
            destination,
            expected,
        )?;
        let token = NEXT_MOVE.fetch_add(1, Ordering::Relaxed);
        let review = MoveReview {
            token: token.to_string(),
            source: source.into(),
            destination: destination.into(),
        };
        self.move_plans.insert(token, plan);
        while self.move_plans.len() > 16 {
            self.move_plans.pop_first();
        }
        Ok(review)
    }
    pub fn apply_path_move(&mut self, token: &str) -> Result<WriteResult> {
        self.apply_path_move_with_fault(token, Fault::None)
    }
    pub fn apply_path_move_with_fault(&mut self, token: &str, fault: Fault) -> Result<WriteResult> {
        let token = token
            .parse::<u64>()
            .map_err(|_| Error::new("E-PATH-PLAN", "invalid move token"))?;
        let plan = self.move_plans.get(&token).cloned().ok_or_else(|| {
            Error::new(
                "E-PATH-PLAN",
                "move review is unavailable; request a new review explicitly",
            )
        })?;
        self.path_gate(&plan.source)?;
        self.check_pending_move(&plan.destination)?;
        let mut result = native::commit_move(&plan, fault, || self.check_config());
        self.move_plans.remove(&token);
        // Native completion and client acknowledgement are separate. Retain a
        // bounded observation witness so a lost IPC reply can be explicitly
        // rechecked without repeating the write or inventing its outcome.
        self.move_observations.insert(token, plan.clone());
        while self.move_observations.len() > 16 {
            self.move_observations.pop_first();
        }
        if result.outcome == Outcome::Success
            && let Err(e) = self.accept_move(&plan)
        {
            result = WriteResult::new(&plan.source, Outcome::OutcomeUnknown, e.to_string());
        }
        if result.outcome == Outcome::OutcomeUnknown {
            self.pending_moves.insert(token, plan);
        }
        Ok(result)
    }
    pub fn recheck_path_move(&mut self, token: &str) -> Result<WriteResult> {
        let token = token
            .parse::<u64>()
            .map_err(|_| Error::new("E-PATH-PLAN", "invalid move token"))?;
        let plan = self
            .pending_moves
            .get(&token)
            .or_else(|| self.move_observations.get(&token))
            .cloned()
            .ok_or_else(|| Error::new("E-PATH-NOT-PENDING", "no uncertain path mutation"))?;
        let mut result = native::observe_move(&plan);
        if result.outcome == Outcome::Success
            && let Err(e) = self.accept_move(&plan)
        {
            result = WriteResult::new(&plan.source, Outcome::OutcomeUnknown, e.to_string());
        }
        if result.outcome != Outcome::OutcomeUnknown {
            self.pending_moves.remove(&token);
        } else {
            self.pending_moves.insert(token, plan);
        }
        Ok(result)
    }
    pub(super) fn accept_move(&mut self, plan: &native::MovePlan) -> Result<()> {
        if plan.base.directory {
            return self.accept_folder_move(plan);
        }
        let actual = native::capture(&self.read.root, &self.read.roots, &plan.destination)?;
        if !plan.destination_matches(&actual) {
            return Err(Error::new(
                "E-PATH-OBSERVATION",
                "destination changed after rename",
            ));
        }
        let previous = self.read.sources.get(&plan.source).cloned();
        let document = previous
            .as_ref()
            .and_then(|s| s.document.clone())
            .filter(|doc| doc.bytes == actual.bytes);
        let parsed = if let Some(doc) = document {
            Ok(doc)
        } else {
            Document::parse(actual.bytes.clone()).map(Arc::new)
        };
        let mut project = (*self.read).clone();
        project.sources.remove(&plan.source);
        project.sources.insert(
            plan.destination.clone(),
            Arc::new(Source {
                path: plan.destination.clone(),
                physical: actual.physical.clone(),
                bytes: actual.bytes.clone(),
                identity: actual.content.clone(),
                kind: parsed
                    .as_ref()
                    .ok()
                    .and_then(|d| d.root.get("kind"))
                    .and_then(|n| n.text().ok())
                    .map(str::to_owned),
                binding: parsed
                    .as_ref()
                    .ok()
                    .and_then(|d| d.root.get("table"))
                    .and_then(|n| n.text().ok())
                    .map(str::to_owned),
                document: parsed.as_ref().ok().cloned(),
                error: parsed.err().map(|e| e.to_string()),
            }),
        );
        project.rebuild_declarations();
        project.generation += 1;
        self.read = Arc::new(project);
        self.snapshots.remove(&plan.source);
        self.snapshots
            .insert(plan.destination.clone(), actual.clone());
        if let Some(mut draft) = self.drafts.remove(&plan.source) {
            draft.base = actual;
            draft.revision += 1;
            draft.outcome = None;
            draft.external = None;
            self.drafts.insert(plan.destination.clone(), draft);
        }
        self.remap_authoring_groups(&plan.source, &plan.destination);
        if let Some(view) = self.views.remove(&plan.source) {
            self.views.insert(plan.destination.clone(), view);
        }
        self.search_indexes.remove(&plan.source);
        self.authoring_views.remove(&plan.source);
        self.authoring_views.remove(&plan.destination);
        self.unavailable.remove(&plan.source);
        self.unavailable.remove(&plan.destination);
        for source in self.last_source.values_mut() {
            if *source == plan.source {
                *source = plan.destination.clone();
            }
        }
        self.generation += 1;
        self.external_version += 1;
        self.diagnostics_pending = true;
        Ok(())
    }
    pub fn discard_source(&mut self, path: &str) -> Result<()> {
        self.check_config()?;
        self.check_pending_move(path)?;
        if self.uncertain_paths().iter().any(|source| source == path) {
            return Err(Error::new(
                "E-OUTCOME-UNKNOWN",
                "Recheck source outcome before discard",
            ));
        }
        if self.recovery_required || native::has_pending_recovery(&self.read.root)? {
            return Err(Error::new(
                "E-RECOVERY-REQUIRED",
                "authoring mutations are gated",
            ));
        }
        let actual = native::capture(&self.read.root, &self.read.roots, path)?;
        let parsed = Document::parse(actual.bytes.clone()).map(Arc::new);
        self.drafts.remove(path);
        self.finish_authoring_save();
        self.authoring_views.remove(path);
        self.search_indexes.remove(path);
        self.replace_read(
            path,
            &actual,
            parsed.as_ref().ok().cloned(),
            parsed.err().map(|e| e.to_string()),
        );
        self.snapshots.insert(path.into(), actual);
        self.external_version += 1;
        Ok(())
    }
}

impl Workspace {
    pub fn source_trash(&mut self) -> Result<Vec<native::trash::Entry>> {
        self.check_config()?;
        let entries = native::trash::entries(&self.read.root, &self.read.roots)?;
        for entry in &entries {
            if self.trash_pending.contains_key(&entry.id) && entry.state != "OutcomeUnknown" {
                self.trash_pending.remove(&entry.id);
                if entry.state == "Stored" || entry.state == "Conflict" {
                    self.accept_source_removal(&entry.source);
                }
                if self.read.root.join(&entry.source).exists() {
                    self.refresh_paths(&[self.read.root.join(&entry.source)]);
                }
            }
        }
        Ok(entries
            .into_iter()
            .filter(|e| e.state != "Restored")
            .collect())
    }
    pub(super) fn accept_source_removal(&mut self, source: &str) {
        self.drafts.retain(|p, _| !within(p, source));
        self.finish_authoring_save();
        self.snapshots.retain(|p, _| !within(p, source));
        self.views.retain(|p, _| !within(p, source));
        self.unavailable.retain(|p, _| !within(p, source));
        self.search_indexes.retain(|p, _| !within(p, source));
        self.last_source.retain(|_, p| !within(p, source));
        let read = Arc::make_mut(&mut self.read);
        read.sources.retain(|p, _| !within(p, source));
        read.folders.retain(|p| !within(p, source));
        read.rebuild_declarations();
        read.generation += 1;
        self.authoring_views.clear();
        self.generation += 1;
        self.external_version += 1;
        self.diagnostics_pending = true;
    }
    pub fn trash_source(&mut self, source: &str) -> Result<serde_json::Value> {
        self.trash_source_with_fault(source, Fault::None)
    }
    pub fn trash_source_with_fault(
        &mut self,
        source: &str,
        fault: Fault,
    ) -> Result<serde_json::Value> {
        self.path_gate(source)?;
        let actual = native::entry::capture(&self.read.root, &self.read.roots, source)?;
        if !actual.directory && actual.bytes != self.read.sources[source].bytes {
            return Err(Error::new(
                "E-SOURCE-CONFLICT",
                "source changed before deletion",
            ));
        }
        let (receipt, result) = native::trash::archive_with_fault(
            &self.read.root,
            &self.read.roots,
            source,
            self.snapshots.get(source).unwrap_or(&actual),
            fault,
            || self.check_config(),
        )?;
        if result.outcome == Outcome::Success {
            self.accept_source_removal(source);
        } else if result.outcome == Outcome::OutcomeUnknown {
            self.trash_pending.insert(receipt.id.clone(), source.into());
        }
        Ok(serde_json::json!({"receipt":receipt,"result":result}))
    }
    pub fn restore_source(&mut self, id: &str) -> Result<WriteResult> {
        self.check_config()?;
        if self.recovery_required || native::has_pending_recovery(&self.read.root)? {
            return Err(Error::new("E-RECOVERY-REQUIRED", "source restore is gated"));
        }
        if self.trash_pending.contains_key(id) {
            return Err(Error::new(
                "E-OUTCOME-UNKNOWN",
                "recheck trash before restore",
            ));
        }
        let (source, result) =
            native::trash::restore(&self.read.root, &self.read.roots, id, || {
                self.check_config()
            })?;
        if result.outcome == Outcome::Success {
            self.refresh_paths(&[self.read.root.join(&source)]);
        } else if result.outcome == Outcome::OutcomeUnknown {
            self.trash_pending.insert(id.into(), source);
        }
        Ok(result)
    }
}

pub(super) fn within(path: &str, parent: &str) -> bool {
    path == parent || path.starts_with(&format!("{parent}/"))
}
fn overlaps(a: &str, b: &str) -> bool {
    within(a, b) || within(b, a)
}
impl Workspace {
    fn accept_folder_move(&mut self, plan: &native::MovePlan) -> Result<()> {
        let actual = native::entry::capture(&self.read.root, &self.read.roots, &plan.destination)?;
        if !plan.destination_matches(&actual) {
            return Err(Error::new(
                "E-PATH-OBSERVATION",
                "folder changed after rename",
            ));
        }
        let mut entries = Vec::new();
        for (old, source) in &self.read.sources {
            if !within(old, &plan.source) {
                continue;
            }
            let new = format!("{}{}", plan.destination, &old[plan.source.len()..]);
            let snapshot = native::capture(&self.read.root, &self.read.roots, &new)?;
            let document = source
                .document
                .clone()
                .filter(|d| d.bytes == snapshot.bytes)
                .map(Ok)
                .unwrap_or_else(|| Document::parse(snapshot.bytes.clone()).map(Arc::new));
            let mut changed = (**source).clone();
            changed.path = new.clone();
            changed.physical = snapshot.physical.clone();
            changed.bytes = snapshot.bytes.clone();
            changed.identity = snapshot.content.clone();
            changed.document = document.as_ref().ok().cloned();
            changed.error = document.err().map(|e| e.to_string());
            entries.push((old.clone(), new, snapshot, Arc::new(changed)));
        }
        let read = Arc::make_mut(&mut self.read);
        for (old, new, snapshot, source) in entries {
            read.sources.remove(&old);
            read.sources.insert(new.clone(), source);
            self.snapshots.remove(&old);
            self.snapshots.insert(new.clone(), snapshot.clone());
            if let Some(mut draft) = self.drafts.remove(&old) {
                draft.base = snapshot;
                draft.document = read.sources[&new]
                    .document
                    .clone()
                    .unwrap_or(draft.document);
                draft.revision += 1;
                draft.outcome = None;
                draft.external = None;
                self.drafts.insert(new.clone(), draft);
            }
            if let Some(view) = self.views.remove(&old) {
                self.views.insert(new, view);
            }
            self.unavailable.remove(&old);
        }
        read.folders = read
            .folders
            .iter()
            .map(|p| {
                if within(p, &plan.source) {
                    format!("{}{}", plan.destination, &p[plan.source.len()..])
                } else {
                    p.clone()
                }
            })
            .collect();
        read.rebuild_declarations();
        read.generation += 1;
        self.remap_authoring_groups(&plan.source, &plan.destination);
        for source in self.last_source.values_mut() {
            if within(source, &plan.source) {
                *source = format!("{}{}", plan.destination, &source[plan.source.len()..]);
            }
        }
        self.authoring_views.clear();
        self.search_indexes.clear();
        self.generation += 1;
        self.external_version += 1;
        self.diagnostics_pending = true;
        Ok(())
    }
}
