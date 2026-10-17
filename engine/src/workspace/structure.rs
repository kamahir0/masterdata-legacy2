use super::*;
use crate::migration::{self, Plan};
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_GROUP: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoringResult {
    pub command: migration::Command,
    pub sources: Vec<String>,
    pub affected_records: usize,
    pub changed: bool,
}
impl Workspace {
    pub(super) fn authoring_project(&self) -> Project {
        let mut project = self.diagnostic_input();
        project.rebuild_declarations();
        let mut tables: BTreeMap<String, Vec<Arc<Table>>> = BTreeMap::new();
        let mut types = BTreeMap::new();
        for (path, source) in &project.sources {
            let Some(doc) = &source.document else {
                continue;
            };
            match source.kind.as_deref() {
                Some("schema") => {
                    if let Ok(table) = semantic::parse_table_authoring(doc, path) {
                        tables
                            .entry(table.name.clone())
                            .or_default()
                            .push(Arc::new(table));
                    }
                }
                Some("type") => {
                    if let Ok((name, declaration)) = semantic::parse_type_authoring(doc) {
                        types
                            .entry(name)
                            .or_insert_with(Vec::new)
                            .push((path.clone(), declaration));
                    }
                }
                _ => {}
            }
        }
        project.tables = tables
            .into_iter()
            .filter_map(|(name, mut entries)| {
                (entries.len() == 1).then(|| (name, entries.pop().unwrap()))
            })
            .collect();
        let unique: BTreeMap<_, _> = types
            .into_iter()
            .filter_map(|(name, mut entries)| {
                (entries.len() == 1).then(|| (name, entries.pop().unwrap()))
            })
            .collect();
        project.type_sources = unique
            .iter()
            .map(|(name, (path, _))| (name.clone(), path.clone()))
            .collect();
        project.types = Arc::new(
            unique
                .into_iter()
                .map(|(name, (_, declaration))| (name, declaration))
                .collect(),
        );
        project
    }
    fn apply_authoring(&mut self, plan: Plan) -> Result<AuthoringResult> {
        self.check_config()?;
        if self.recovery_required || native::has_pending_recovery(&self.read.root)? {
            return Err(Error::new(
                "E-RECOVERY-REQUIRED",
                "source mutation is gated",
            ));
        }
        // Prepare every current draft before accepting any candidate. An I/O or
        // stale failure cannot leave half a structural operation in local history.
        for (path, candidate) in &plan.candidates {
            self.refresh_source(path)?;
            self.ensure_draft(path)?;
            let draft = &self.drafts[path];
            if draft.outcome == Some(Outcome::OutcomeUnknown) {
                return Err(Error::new("E-OUTCOME-UNKNOWN", path));
            }
            if draft.document.bytes != candidate.before.bytes {
                return Err(Error::new(
                    "E-DRAFT-STALE",
                    format!("{path}: current edit changed"),
                ));
            }
        }
        let group = NEXT_GROUP.fetch_add(1, Ordering::Relaxed);
        let mut sources = BTreeSet::new();
        for (path, candidate) in plan.candidates {
            let draft = self.drafts.get_mut(&path).unwrap();
            if draft.apply((*candidate.after).clone(), draft.row_ids.clone()) {
                draft.group = Some(group);
                sources.insert(path);
            }
        }
        let changed = !sources.is_empty();
        if changed {
            self.authoring_groups.insert(group, sources.clone());
            self.generation += 1;
            self.authoring_views.clear();
            self.search_indexes.clear();
            self.diagnostics_pending = true;
        }
        Ok(AuthoringResult {
            command: plan.command,
            affected_records: plan.affected_records,
            sources: sources.into_iter().collect(),
            changed,
        })
    }
    pub fn author_field(
        &mut self,
        source: &str,
        revision: u64,
        generation: u64,
        operation: FieldOperation,
    ) -> Result<AuthoringResult> {
        let command = self.field_command(source, revision, generation, operation)?;
        let project = self.authoring_project();
        self.apply_authoring(migration::derive_authoring(&project, command)?)
    }
    pub fn author_type(
        &mut self,
        source: &str,
        identity: &str,
        mut command: crate::type_migration::Command,
        input: Option<crate::initializer::Input>,
    ) -> Result<AuthoringResult> {
        self.check_config()?;
        self.refresh_source(source)?;
        self.ensure_draft(source)?;
        if self.current_doc(source)?.identity != identity {
            return Err(Error::new("E-DRAFT-STALE", "type declaration changed"));
        }
        let project = self.authoring_project();
        if let crate::type_migration::Command::AddCustomField {
            declaration,
            initializer,
            ..
        } = &mut command
        {
            let field = Field {
                key: 0,
                name: declaration.name.clone(),
                type_name: declaration.type_name.clone(),
                nullable: declaration.nullable,
                array: declaration.array,
            };
            if let Ok(shape) = semantic::shape(&field, &project.types) {
                if let Some(input) = &input {
                    *initializer = Some(crate::initializer::authoring_value(&shape, input)?);
                } else if initializer.is_none() {
                    *initializer = super::defaults::value(&shape, &project.types).ok();
                }
            }
        }
        self.apply_authoring(crate::type_migration::derive_authoring(
            &project, source, command,
        )?)
    }
    pub fn author_table(
        &mut self,
        command: crate::table_declaration::Command,
    ) -> Result<AuthoringResult> {
        self.check_config()?;
        self.refresh_source(&command.source)?;
        self.ensure_draft(&command.source)?;
        let project = self.authoring_project();
        self.apply_authoring(crate::table_declaration::derive_authoring(
            &project, command,
        )?)
    }
    pub(super) fn include_authoring_group(&self, targets: &mut BTreeSet<String>) {
        loop {
            let previous = targets.len();
            for (group, paths) in &self.authoring_groups {
                if paths.iter().any(|p| {
                    self.drafts.get(p).is_some_and(|d| {
                        d.group == Some(*group) || d.undo.iter().any(|s| s.group == Some(*group))
                    })
                }) && !paths.is_disjoint(targets)
                {
                    targets.extend(paths.iter().cloned());
                }
            }
            if previous == targets.len() {
                break;
            }
        }
    }
    pub fn save_authoring(&mut self, source: &str) -> Result<Vec<WriteResult>> {
        self.save_authoring_sources(vec![source.to_owned()])
    }
    pub fn save_authoring_sources(&mut self, sources: Vec<String>) -> Result<Vec<WriteResult>> {
        let mut paths = BTreeSet::from_iter(sources);
        self.include_authoring_group(&mut paths);
        self.save_paths(
            paths
                .into_iter()
                .filter(|p| self.drafts.get(p).is_some_and(Draft::dirty))
                .collect(),
            Fault::None,
        )
    }
    pub(super) fn finish_authoring_save(&mut self) {
        self.authoring_groups.retain(|group, paths| {
            paths.retain(|p| {
                self.drafts.get(p).is_some_and(|d| {
                    d.group == Some(*group)
                        || d.undo
                            .iter()
                            .chain(&d.redo)
                            .any(|s| s.group == Some(*group))
                })
            });
            !paths.is_empty()
        });
    }
    pub(super) fn remap_authoring_groups(&mut self, source: &str, destination: &str) {
        for paths in self.authoring_groups.values_mut() {
            *paths = paths
                .iter()
                .map(|path| {
                    if super::path::within(path, source) {
                        format!("{destination}{}", &path[source.len()..])
                    } else {
                        path.clone()
                    }
                })
                .collect();
        }
    }
}
