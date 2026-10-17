use super::*;
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_BATCH: AtomicU64 = AtomicU64::new(1);
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryOperation {
    Move,
    Copy,
    Trash,
}
#[derive(Clone, Debug)]
enum Action {
    Move(native::MovePlan),
    Copy(native::entry::CopyPlan),
    Trash(Snapshot),
}
#[derive(Clone, Debug)]
struct Item {
    source: String,
    destination: String,
    action: Action,
}
#[derive(Clone, Debug, Serialize)]
pub struct EntryItemResult {
    pub source: String,
    pub destination: String,
    pub result: WriteResult,
    pub receipt: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct EntryBatchReview {
    pub token: String,
    pub items: Vec<(String, String)>,
}
#[derive(Clone, Debug, Serialize)]
pub struct EntryBatchResult {
    pub token: String,
    pub items: Vec<EntryItemResult>,
}
#[derive(Clone, Debug)]
pub(super) struct EntryBatch {
    items: Vec<Item>,
    results: Vec<EntryItemResult>,
    applied: bool,
}
fn inside(path: &str, parent: &str) -> bool {
    super::path::within(path, parent)
}
impl Workspace {
    pub(super) fn pending_entry_paths(&self) -> Vec<String> {
        self.entry_batches
            .values()
            .flat_map(|b| {
                b.results
                    .iter()
                    .filter(|r| r.result.outcome == Outcome::OutcomeUnknown)
                    .flat_map(|r| [r.source.clone(), r.destination.clone()])
            })
            .filter(|p| !p.is_empty())
            .collect()
    }
    pub fn prepare_entry_batch(
        &mut self,
        operation: EntryOperation,
        sources: Vec<String>,
        folder: Option<String>,
    ) -> Result<EntryBatchReview> {
        self.check_config()?;
        let all: BTreeSet<_> = sources.into_iter().collect();
        let sources = all
            .iter()
            .filter(|p| {
                !all.iter()
                    .any(|ancestor| *p != ancestor && inside(p, ancestor))
            })
            .cloned()
            .collect::<Vec<_>>();
        let mut items = Vec::new();
        let mut reserved = BTreeSet::new();
        for source in sources {
            self.entry_gate(&source, !matches!(operation, EntryOperation::Copy))?;
            let destination = if matches!(operation, EntryOperation::Trash) {
                String::new()
            } else {
                let folder = folder
                    .as_deref()
                    .ok_or_else(|| Error::new("E-PATH-SCOPE", "destination folder required"))?;
                let parent = native::checked_path(&self.read.root, &self.read.roots, folder)?;
                if !parent.is_dir() {
                    return Err(Error::new("E-PATH-KIND", "destination folder required"));
                }
                let filename = std::path::Path::new(&source)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned();
                let mut destination = format!("{folder}/{filename}");
                if matches!(operation, EntryOperation::Copy) {
                    let path = std::path::Path::new(&filename);
                    let directory = self.read.folders.contains(&source);
                    let stem = if directory {
                        filename.clone()
                    } else {
                        path.file_stem().unwrap().to_string_lossy().into_owned()
                    };
                    let extension = if directory {
                        String::new()
                    } else {
                        path.extension()
                            .map(|e| format!(".{}", e.to_string_lossy()))
                            .unwrap_or_default()
                    };
                    let mut i = 1;
                    while self
                        .read
                        .root
                        .join(&destination)
                        .try_exists()
                        .map_err(project::io_error)?
                        || reserved.contains(&destination)
                    {
                        destination = format!(
                            "{folder}/{stem}-copy{}{extension}",
                            if i == 1 {
                                String::new()
                            } else {
                                format!("-{i}")
                            }
                        );
                        i += 1;
                    }
                }
                if !reserved.insert(destination.clone()) {
                    return Err(Error::new(
                        "E-PATH-CONFLICT",
                        "multiple entries have the same destination",
                    ));
                }
                destination
            };
            let action = match operation {
                EntryOperation::Move => {
                    let snapshot =
                        native::entry::capture(&self.read.root, &self.read.roots, &source)?;
                    Action::Move(native::prepare_move(
                        &self.read.root,
                        &self.read.roots,
                        &source,
                        &destination,
                        &snapshot,
                    )?)
                }
                EntryOperation::Copy => Action::Copy(native::entry::prepare_copy(
                    &self.read.root,
                    &self.read.roots,
                    &source,
                    &destination,
                )?),
                EntryOperation::Trash => Action::Trash(native::entry::capture(
                    &self.read.root,
                    &self.read.roots,
                    &source,
                )?),
            };
            items.push(Item {
                source,
                destination,
                action,
            });
        }
        let token = NEXT_BATCH.fetch_add(1, Ordering::Relaxed);
        let review = EntryBatchReview {
            token: token.to_string(),
            items: items
                .iter()
                .map(|i| (i.source.clone(), i.destination.clone()))
                .collect(),
        };
        // Keep unknown witnesses; settled older batches can release owned stages.
        while self.entry_batches.len() >= 32 {
            let old = self
                .entry_batches
                .iter()
                .filter(|(_, b)| {
                    !b.results
                        .iter()
                        .any(|r| r.result.outcome == Outcome::OutcomeUnknown)
                })
                .map(|(k, _)| *k)
                .next();
            let Some(old) = old else {
                break;
            };
            self.entry_batches.remove(&old);
        }
        self.entry_batches.insert(
            token,
            EntryBatch {
                items,
                results: vec![],
                applied: false,
            },
        );
        Ok(review)
    }
    pub fn apply_entry_batch(&mut self, token: &str) -> Result<EntryBatchResult> {
        self.apply_entry_batch_with_fault(token, Fault::None)
    }
    pub fn apply_entry_batch_with_fault(
        &mut self,
        token: &str,
        fault: Fault,
    ) -> Result<EntryBatchResult> {
        let id = token
            .parse()
            .map_err(|_| Error::new("E-PATH-PLAN", "invalid batch token"))?;
        let mut batch = self
            .entry_batches
            .remove(&id)
            .ok_or_else(|| Error::new("E-PATH-PLAN", "file/folder operation is unavailable"))?;
        let result = (|| {
            if batch.applied {
                return Err(Error::new(
                    "E-OUTCOME-UNKNOWN",
                    "recheck this batch instead of retrying",
                ));
            }
            for item in &batch.items {
                self.entry_gate(&item.source, !matches!(item.action, Action::Copy(_)))?;
                match &item.action {
                    Action::Move(plan) => plan.fresh()?,
                    Action::Copy(plan) => {
                        native::entry::validate_copy(&self.read.root, &self.read.roots, plan)?
                    }
                    Action::Trash(snapshot) => {
                        native::entry::preflight(
                            &self.read.root,
                            &self.read.roots,
                            &item.source,
                            snapshot,
                        )?;
                    }
                }
            }
            batch.applied = true;
            let mut stop = false;
            for item in &batch.items {
                let mut receipt = None;
                let mut result = if stop {
                    WriteResult::new(
                        &item.source,
                        Outcome::NotAttempted,
                        "recheck the previous unknown result first",
                    )
                } else {
                    match &item.action {
                        Action::Move(plan) => {
                            native::commit_move(plan, fault, || self.check_config())
                        }
                        Action::Copy(plan) => native::entry::commit_copy(
                            &self.read.root,
                            &self.read.roots,
                            plan,
                            fault,
                            || self.check_config(),
                        ),
                        Action::Trash(snapshot) => match native::trash::archive(
                            &self.read.root,
                            &self.read.roots,
                            &item.source,
                            snapshot,
                            || self.check_config(),
                        ) {
                            Ok((entry, result)) => {
                                receipt = Some(entry.id);
                                result
                            }
                            Err(e) => {
                                WriteResult::new(&item.source, Outcome::Failure, e.to_string())
                            }
                        },
                    }
                };
                if result.outcome == Outcome::Success {
                    let accepted = match &item.action {
                        Action::Move(plan) => self.accept_move(plan),
                        Action::Copy(_) => {
                            self.refresh_paths(&[self.read.root.join(&item.destination)]);
                            Ok(())
                        }
                        Action::Trash(_) => {
                            self.accept_source_removal(&item.source);
                            Ok(())
                        }
                    };
                    if let Err(e) = accepted {
                        result =
                            WriteResult::new(&item.source, Outcome::OutcomeUnknown, e.to_string());
                    }
                }
                stop |= result.outcome == Outcome::OutcomeUnknown;
                batch.results.push(EntryItemResult {
                    source: item.source.clone(),
                    destination: item.destination.clone(),
                    result,
                    receipt,
                });
            }
            Ok(EntryBatchResult {
                token: token.into(),
                items: batch.results.clone(),
            })
        })();
        self.entry_batches.insert(id, batch);
        result
    }
    pub fn recheck_entry_batch(&mut self, token: &str) -> Result<EntryBatchResult> {
        let id = token
            .parse()
            .map_err(|_| Error::new("E-PATH-PLAN", "invalid batch token"))?;
        let mut batch = self
            .entry_batches
            .remove(&id)
            .ok_or_else(|| Error::new("E-PATH-PLAN", "batch is unavailable"))?;
        let result = (|| {
            if !batch.applied {
                return Ok(EntryBatchResult {
                    token: token.into(),
                    items: batch
                        .items
                        .iter()
                        .map(|i| EntryItemResult {
                            source: i.source.clone(),
                            destination: i.destination.clone(),
                            result: WriteResult::new(
                                &i.source,
                                Outcome::NotAttempted,
                                "no write was accepted",
                            ),
                            receipt: None,
                        })
                        .collect(),
                });
            }
            for (item, previous) in batch.items.iter().zip(&mut batch.results) {
                if previous.result.outcome != Outcome::OutcomeUnknown {
                    continue;
                }
                let mut result = match &item.action {
                    Action::Move(plan) => native::observe_move(plan),
                    Action::Copy(plan) => native::entry::observe_copy(plan),
                    Action::Trash(_) => {
                        let entries = native::trash::entries(&self.read.root, &self.read.roots)?;
                        let outcome = match entries
                            .iter()
                            .find(|e| Some(&e.id) == previous.receipt.as_ref())
                            .map(|e| e.state.as_str())
                        {
                            Some("Stored" | "Conflict") => Outcome::Success,
                            Some("Restored") => Outcome::Failure,
                            _ => Outcome::OutcomeUnknown,
                        };
                        WriteResult::new(&item.source, outcome, "trash state rechecked")
                    }
                };
                if result.outcome == Outcome::Success {
                    let accepted = match &item.action {
                        Action::Move(plan) => self.accept_move(plan),
                        Action::Copy(_) => {
                            self.refresh_paths(&[self.read.root.join(&item.destination)]);
                            Ok(())
                        }
                        Action::Trash(_) => {
                            self.accept_source_removal(&item.source);
                            Ok(())
                        }
                    };
                    if let Err(e) = accepted {
                        result =
                            WriteResult::new(&item.source, Outcome::OutcomeUnknown, e.to_string());
                    }
                }
                previous.result = result;
            }
            Ok(EntryBatchResult {
                token: token.into(),
                items: batch.results.clone(),
            })
        })();
        self.entry_batches.insert(id, batch);
        result
    }
}
