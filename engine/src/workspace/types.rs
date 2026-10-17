use super::*;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeProjection {
    pub kind: &'static str,
    pub clicked: String,
    pub source: String,
    pub name: String,
    pub identity: String,
    pub declaration: semantic::Type,
    pub protected_members: Vec<String>,
    pub flag_bits: BTreeMap<String, u32>,
    pub available_flag_bits: Vec<FlagChoice>,
    pub generation: u64,
    pub revision: u64,
    pub dirty: bool,
    pub can_undo: bool,
    pub can_redo: bool,
    pub measurement: Measurement,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagChoice {
    pub bit: u32,
    pub value: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum SelectionProjection {
    Table(Projection),
    Type(TypeProjection),
}
impl Workspace {
    pub(super) fn type_projection_current(
        &mut self,
        clicked: &str,
        freshness: instrument::Span,
    ) -> Result<TypeProjection> {
        let document = self.current_doc(clicked)?;
        let (name, _) = semantic::parse_type_authoring(&document)?;
        for dependency in self.dependency_context()?.type_dependencies(&name) {
            if dependency != clicked {
                let _ = self.refresh_source(&dependency);
            }
        }
        let document = self.current_doc(clicked)?;
        let (name, declaration) = semantic::parse_type_authoring(&document)?;
        drop(freshness);
        let _projection = instrument::span("projection");
        let flag_bits: BTreeMap<String, u32> = if let semantic::Type::Enum {
            underlying,
            flags: true,
            members,
        } = &declaration
        {
            members
                .iter()
                .filter_map(|(name, value)| {
                    let value = semantic::integer_value(value, underlying).ok()?;
                    let mask = if matches!(underlying.as_str(), "int" | "uint") {
                        value as u32 as u64
                    } else {
                        value as u64
                    };
                    mask.is_power_of_two()
                        .then(|| (name.clone(), mask.trailing_zeros()))
                })
                .collect()
        } else {
            BTreeMap::new()
        };
        // These are read suggestions for explicit Add input. The eventual intent
        // checks the current declaration again; this cache authorizes no write.
        let available_flag_bits = if let semantic::Type::Enum {
            underlying,
            flags: true,
            ..
        } = &declaration
        {
            let width = if matches!(underlying.as_str(), "int" | "uint") {
                32
            } else {
                64
            };
            let signed = matches!(underlying.as_str(), "int" | "long");
            (0..width)
                .filter(|bit| !flag_bits.values().any(|used| used == bit))
                .map(|bit| FlagChoice {
                    bit,
                    value: if signed && bit == width - 1 {
                        (-(1_i128 << bit)).to_string()
                    } else {
                        (1_u64 << bit).to_string()
                    },
                })
                .collect()
        } else {
            vec![]
        };
        Ok(TypeProjection {
            kind: "type",
            clicked: clicked.into(),
            source: clicked.into(),
            name,
            identity: document.identity.clone(),
            protected_members: if matches!(&declaration, semantic::Type::Enum { flags: true, .. }) {
                vec!["None".into()]
            } else {
                vec![]
            },
            // The parsed declaration already owns integer width and atomic Flags
            // semantics. Publish read-only bit positions, including signed sign
            // bits, so the frontend never reconstructs them with JS Number.
            flag_bits,
            available_flag_bits,
            declaration,
            generation: self.generation,
            revision: self.drafts.get(clicked).map_or(0, |d| d.revision),
            dirty: self.drafts.get(clicked).is_some_and(Draft::dirty),
            can_undo: self.drafts.get(clicked).is_some_and(Draft::can_undo),
            can_redo: self.drafts.get(clicked).is_some_and(Draft::can_redo),
            measurement: instrument::measure(|| ()).1,
        })
    }
    pub fn prepare_type_migration(
        &mut self,
        source: &str,
        identity: &str,
        command: crate::type_migration::Command,
    ) -> Result<MigrationReview> {
        self.prepare_type_migration_input(source, identity, command, None)
    }
    pub fn default_enum_member(
        &mut self,
        source: &str,
        identity: &str,
    ) -> Result<crate::type_migration::Command> {
        self.refresh_source(source)?;
        let project = self.authoring_type_project(source, identity)?;
        let document = project
            .sources
            .get(source)
            .and_then(|s| s.document.as_ref())
            .ok_or_else(|| {
                Error::new(
                    "E-TYPE-MIGRATION-TARGET",
                    "current type source is unavailable",
                )
            })?;
        let (name, declaration) = semantic::parse_type_authoring(document)?;
        crate::type_migration::suggest_enum_member(&name, &declaration)
    }
    pub fn type_initializer_shape(
        &mut self,
        source: &str,
        identity: &str,
        declaration: &crate::creation::Declaration,
    ) -> Result<Shape> {
        let project = self.authoring_type_project(source, identity)?;
        let field = Field {
            key: 0,
            name: "value".into(),
            type_name: declaration.type_name.clone(),
            nullable: declaration.nullable,
            array: declaration.array,
        };
        crate::migration::field_resolution(&project, &field)?;
        semantic::shape(&field, &project.types)
    }
    pub fn type_initializer_value(
        &mut self,
        source: &str,
        identity: &str,
        declaration: &crate::creation::Declaration,
        path: &[String],
        action: crate::initializer::Action,
    ) -> Result<crate::initializer::Input> {
        let mut shape = self.type_initializer_shape(source, identity, declaration)?;
        for step in path {
            if shape.array {
                shape.array = false;
                shape.nullable = false;
            } else {
                shape = shape
                    .fields
                    .iter()
                    .find(|(f, _)| f.name == *step)
                    .map(|(_, s)| s.clone())
                    .ok_or_else(|| Error::new("E-INITIALIZER", "initializer path changed"))?;
            }
        }
        if let crate::initializer::Action::Flag {
            symbol,
            enabled,
            members,
        } = action
        {
            return Ok(crate::initializer::Input::Sequence {
                value: crate::initializer::flags_members(&shape, members, symbol, enabled)?
                    .into_iter()
                    .map(|text| crate::initializer::Input::Scalar { text })
                    .collect(),
            });
        }
        if matches!(action, crate::initializer::Action::Materialize) {
            shape.nullable = false;
        }
        let project = self.authoring_type_project(source, identity)?;
        Ok(crate::initializer::from_value(super::defaults::value(
            &shape,
            &project.types,
        )?))
    }
    fn authoring_type_project(&self, source: &str, identity: &str) -> Result<Project> {
        let project = self.authoring_project();
        let target = project
            .sources
            .get(source)
            .and_then(|source| source.document.as_ref())
            .ok_or_else(|| {
                Error::new(
                    "E-TYPE-MIGRATION-TARGET",
                    "current type source is unavailable",
                )
            })?;
        if target.identity != identity || semantic::parse_type_authoring(target).is_err() {
            return Err(Error::new(
                "E-MIGRATION-STALE",
                "type source changed; confirm the current declaration before requesting a Plan",
            ));
        }
        Ok(project)
    }
    fn type_input_project(&self, source: &str, identity: &str) -> Result<Project> {
        let project = Project::open(&self.read.root)?;
        let target = project
            .sources
            .get(source)
            .and_then(|source| source.document.as_ref())
            .ok_or_else(|| {
                Error::new(
                    "E-TYPE-MIGRATION-TARGET",
                    "current type source is unavailable",
                )
            })?;
        if target.identity != identity || semantic::parse_type(target).is_err() {
            return Err(Error::new(
                "E-MIGRATION-STALE",
                "type source changed; confirm the current declaration before requesting a Plan",
            ));
        }
        Ok(project)
    }
    pub fn prepare_type_migration_input(
        &mut self,
        source: &str,
        identity: &str,
        mut command: crate::type_migration::Command,
        input: Option<crate::initializer::Input>,
    ) -> Result<MigrationReview> {
        self.migration_gate(std::iter::empty())?;
        let project = self.type_input_project(source, identity)?;
        let target = project
            .sources
            .get(source)
            .and_then(|source| source.document.as_ref())
            .ok_or_else(|| {
                Error::new(
                    "E-TYPE-MIGRATION-TARGET",
                    "current type source is unavailable",
                )
            })?;
        if target.identity != identity
            || project
                .type_sources
                .get(command.target())
                .is_none_or(|path| path != source)
        {
            return Err(Error::new(
                "E-MIGRATION-STALE",
                "type source changed; confirm the current declaration before requesting a Plan",
            ));
        }
        if let Some(input) = input {
            let crate::type_migration::Command::AddCustomField {
                declaration,
                initializer,
                ..
            } = &mut command
            else {
                return Err(Error::new(
                    "E-INITIALIZER",
                    "initializer is only available for Add Custom Field",
                ));
            };
            if initializer.is_some() {
                return Err(Error::new(
                    "E-INITIALIZER",
                    "one initializer input is required",
                ));
            }
            let field = crate::migration::field_declaration(declaration, &project.types)?;
            *initializer = Some(crate::initializer::resolve(&field, &input, &project.types)?);
        }
        let plan = crate::type_migration::derive(&project, command)?;
        // The saved-source Plan remains reviewable when an affected data draft
        // exists. The shared Apply gate owns the prohibition on committing it.
        let plan = native::SourceSetPlan::prepare(&project, plan)?;
        Ok(self.register_migration(plan))
    }
}
