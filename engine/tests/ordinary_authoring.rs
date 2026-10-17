#[path = "support/mod.rs"]
mod fixture;
use masterdata_engine::{
    native::Outcome,
    workspace::{FieldOperation, Workspace},
};
use std::{fs, path::Path};
const SCHEMA: &str = "sources/catalog-schema.yaml";
const DATA: &str = "sources/catalog-data.yaml";
fn project() -> tempfile::TempDir {
    let temp = tempfile::tempdir().unwrap();
    fixture::copy(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/full"),
        temp.path(),
    )
    .unwrap();
    temp
}
#[test]
fn unresolved_column_and_unrelated_syntax_errors_do_not_block_dirty_rename_drop_or_group_undo() {
    let temp = project();
    fs::write(temp.path().join("sources/broken.yaml"), "kind: [\n").unwrap();
    let disk_schema = fs::read_to_string(temp.path().join(SCHEMA)).unwrap();
    let disk_data = fs::read_to_string(temp.path().join(DATA)).unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.edit_text(
        DATA,
        p.revision,
        &p.rows[0].id,
        "name",
        "keep this unsaved value",
    )
    .unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.schema_modifier(
        SCHEMA,
        p.schema_revision,
        "enabled",
        false,
        false,
        Some("MissingType"),
    )
    .unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    let before_schema = w.current_doc(SCHEMA).unwrap().bytes.clone();
    let before_data = w.current_doc(DATA).unwrap().bytes.clone();
    let result = w
        .author_field(
            SCHEMA,
            p.schema_revision,
            p.generation,
            FieldOperation::Rename {
                field: "enabled".into(),
                new_name: "active".into(),
            },
        )
        .unwrap();
    assert_eq!(result.sources.len(), 2);
    assert!(w.current_doc(DATA).unwrap().bytes.contains("active: true"));
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .contains("keep this unsaved value")
    );
    let renamed = w.current_doc(DATA).unwrap().bytes.clone();
    let p = w.select(DATA, 0, 32).unwrap();
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Drop {
            field: "active".into(),
        },
    )
    .unwrap();
    assert!(!w.current_doc(DATA).unwrap().bytes.contains("active:"));
    w.undo(SCHEMA, false).unwrap();
    assert_eq!(w.current_doc(DATA).unwrap().bytes, renamed);
    w.undo(SCHEMA, false).unwrap();
    assert_eq!(w.current_doc(SCHEMA).unwrap().bytes, before_schema);
    assert_eq!(w.current_doc(DATA).unwrap().bytes, before_data);
    w.undo(SCHEMA, true).unwrap();
    assert_eq!(w.current_doc(DATA).unwrap().bytes, renamed);
    assert_eq!(
        fs::read_to_string(temp.path().join(SCHEMA)).unwrap(),
        disk_schema
    );
    assert_eq!(
        fs::read_to_string(temp.path().join(DATA)).unwrap(),
        disk_data
    );
    let saved = w.save_table("item", Some(DATA)).unwrap();
    assert_eq!(saved.len(), 2);
    assert!(saved.iter().all(|r| r.outcome == Outcome::Success));
}
#[test]
fn dropping_a_key_column_is_a_recoverable_draft_and_keeps_the_remaining_declaration_editable() {
    let temp = project();
    let mut w = Workspace::open(temp.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    let before = w.current_doc(SCHEMA).unwrap().bytes.clone();
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Drop { field: "id".into() },
    )
    .unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    assert!(!p.columns.iter().any(|c| c.field.name == "id"));
    assert!(
        w.validation_snapshot()
            .declaration_problems
            .iter()
            .any(|d| d.source == SCHEMA)
    );
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Add {
            neighbor: None,
            after: false,
        },
    )
    .unwrap();
    w.undo(SCHEMA, false).unwrap();
    w.undo(SCHEMA, false).unwrap();
    assert_eq!(w.current_doc(SCHEMA).unwrap().bytes, before);
}

#[test]
fn malformed_record_shapes_survive_column_repairs_while_known_mappings_follow_the_edit() {
    let t = project();
    fs::write(
        t.path().join("sources/bad-records.yaml"),
        "kind: data\ntable: item\nrecords: wrong\n",
    )
    .unwrap();
    let data = fs::read_to_string(t.path().join(DATA)).unwrap() + "  - malformed-row\n";
    fs::write(t.path().join(DATA), &data).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Rename {
            field: "name".into(),
            new_name: "title".into(),
        },
    )
    .unwrap();
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .contains("title: Debug Sword")
    );
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .ends_with("  - malformed-row\n")
    );
    assert_eq!(
        w.current_doc("sources/bad-records.yaml")
            .unwrap()
            .bytes
            .as_ref(),
        "kind: data\ntable: item\nrecords: wrong\n"
    );
    w.undo(SCHEMA, false).unwrap();
    assert_eq!(w.current_doc(DATA).unwrap().bytes.as_ref(), data);
}
#[test]
fn custom_and_enum_edits_compose_dirty_nested_values_and_keep_invalid_occurrences() {
    use masterdata_engine::{type_migration::Command, workspace::SelectionProjection};
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.edit_text(DATA, p.revision, &p.rows[0].id, "name", "unsaved name")
        .unwrap();
    let SelectionProjection::Type(v) = w.select_view("sources/reward.yaml", 0, 32).unwrap() else {
        panic!()
    };
    w.author_type(
        &v.source,
        &v.identity,
        Command::RenameCustomField {
            type_name: "Reward".into(),
            field: "note".into(),
            new_name: "memo".into(),
        },
        None,
    )
    .unwrap();
    assert!(w.current_doc(DATA).unwrap().bytes.contains("memo: null"));
    assert!(w.current_doc(DATA).unwrap().bytes.contains("unsaved name"));
    assert!(
        !fs::read_to_string(t.path().join(DATA))
            .unwrap()
            .contains("memo:")
    );
    let SelectionProjection::Type(v) = w.select_view("sources/rarity.yaml", 0, 32).unwrap() else {
        panic!()
    };
    w.author_type(
        &v.source,
        &v.identity,
        Command::DropEnumMember {
            type_name: "Rarity".into(),
            member: "Rare".into(),
        },
        None,
    )
    .unwrap();
    assert!(w.current_doc(DATA).unwrap().bytes.contains("rarity: Rare"));
    assert!(
        !w.current_doc(&v.source)
            .unwrap()
            .bytes
            .contains("name: Rare")
    );
    w.undo(&v.source, false).unwrap();
    w.undo("sources/reward.yaml", false).unwrap();
    assert!(w.current_doc(DATA).unwrap().bytes.contains("note: null"));
    assert!(w.current_doc(DATA).unwrap().bytes.contains("unsaved name"));
}
#[test]
fn related_history_does_not_overwrite_a_later_value_edit() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Rename {
            field: "name".into(),
            new_name: "title".into(),
        },
    )
    .unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.edit_text(DATA, p.revision, &p.rows[0].id, "title", "later edit")
        .unwrap();
    assert_eq!(w.undo(SCHEMA, false).unwrap_err().code, "E-HISTORY-GROUP");
    assert!(w.current_doc(DATA).unwrap().bytes.contains("later edit"));
    w.undo(DATA, false).unwrap();
    w.undo(SCHEMA, false).unwrap();
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .contains("name: Debug Sword")
    );
    w.undo(SCHEMA, true).unwrap();
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .contains("title: Debug Sword")
    );
}
#[test]
fn table_keys_are_drafts_even_with_existing_errors_and_can_be_repaired() {
    use masterdata_engine::table_declaration::{Change, Command};
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.schema_modifier(
        SCHEMA,
        p.schema_revision,
        "enabled",
        false,
        false,
        Some("Missing"),
    )
    .unwrap();
    let before = w.current_doc(SCHEMA).unwrap().bytes.clone();
    let detail = w.table_declaration_detail(SCHEMA, "item").unwrap();
    w.author_table(Command {
        table: "item".into(),
        source: SCHEMA.into(),
        identity: detail.detail.identity,
        change: Change::SetPrimaryKey {
            fields: vec!["name".into()],
        },
    })
    .unwrap();
    let current = w.table_declaration_detail(SCHEMA, "item").unwrap();
    assert_eq!(current.detail.primary.fields, ["name"]);
    w.undo(SCHEMA, false).unwrap();
    assert_eq!(w.current_doc(SCHEMA).unwrap().bytes, before);
}

#[test]
fn source_checkpoints_detach_only_that_files_structural_history() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Rename {
            field: "name".into(),
            new_name: "title".into(),
        },
    )
    .unwrap();
    w.discard_source(DATA).unwrap();
    assert!(w.undo(SCHEMA, false).unwrap());
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .contains("name: Debug Sword")
    );
    assert!(w.current_doc(SCHEMA).unwrap().bytes.contains("name: name"));
}
#[test]
fn editing_a_duplicate_type_never_picks_it_as_value_shape_authority() {
    use masterdata_engine::{type_migration::Command, workspace::SelectionProjection};
    let t = project();
    fs::copy(
        t.path().join("sources/rarity.yaml"),
        t.path().join("sources/duplicate-rarity.yaml"),
    )
    .unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let SelectionProjection::Type(p) = w.select_view("sources/rarity.yaml", 0, 32).unwrap() else {
        panic!()
    };
    w.author_type(
        &p.source,
        &p.identity,
        Command::RenameEnumMember {
            type_name: "Rarity".into(),
            member: "Rare".into(),
            new_name: "Epic".into(),
        },
        None,
    )
    .unwrap();
    assert!(!w.current_types().unwrap().contains_key("Rarity"));
    assert!(w.current_doc(DATA).unwrap().bytes.contains("rarity: Rare"));
}

#[test]
fn schema_selected_as_an_empty_record_destination_can_save_its_declaration() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    w.schema_modifier(SCHEMA, p.schema_revision, "enabled", true, false, None)
        .unwrap();
    let saved = w.save_table("item", Some(SCHEMA)).unwrap();
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].source, SCHEMA);
    assert_eq!(saved[0].outcome, Outcome::Success);
    assert!(w.dirty_paths().is_empty());
    assert!(!w.current_doc(SCHEMA).unwrap().bytes.contains("records:"));
}

#[test]
fn unknown_declaration_members_survive_safe_repairs_and_invalid_enum_numbers_do_not_panic() {
    use masterdata_engine::semantic::{self, Typed};
    let t = project();
    let schema = fs::read_to_string(t.path().join(SCHEMA)).unwrap()
        + "editorHint: keep this unknown member\n";
    fs::write(t.path().join(SCHEMA), schema).unwrap();
    let rarity = fs::read_to_string(t.path().join("sources/rarity.yaml"))
        .unwrap()
        .replace("value: 2", "value: broken");
    fs::write(t.path().join("sources/rarity.yaml"), rarity).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(DATA, 0, 32).unwrap();
    let field = p.columns.iter().find(|c| c.field.name == "rarity").unwrap();
    assert!(
        semantic::key_part(
            &Typed::Enum("Rare".into()),
            &field.field,
            &w.current_types().unwrap()
        )
        .is_err()
    );
    w.author_field(
        SCHEMA,
        p.schema_revision,
        p.generation,
        FieldOperation::Rename {
            field: "name".into(),
            new_name: "title".into(),
        },
    )
    .unwrap();
    assert!(
        w.current_doc(SCHEMA)
            .unwrap()
            .bytes
            .ends_with("editorHint: keep this unknown member\n")
    );
    assert!(
        w.current_doc(DATA)
            .unwrap()
            .bytes
            .contains("title: Debug Sword")
    );
}

#[test]
fn moving_a_clean_folder_keeps_undone_group_history_attached_to_its_new_paths() {
    let t = project();
    fs::create_dir(t.path().join("sources/group")).unwrap();
    for name in ["catalog-schema.yaml", "catalog-data.yaml"] {
        fs::rename(
            t.path().join(format!("sources/{name}")),
            t.path().join(format!("sources/group/{name}")),
        )
        .unwrap();
    }
    let schema = "sources/group/catalog-schema.yaml";
    let data = "sources/group/catalog-data.yaml";
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w.select(data, 0, 32).unwrap();
    w.author_field(
        schema,
        p.schema_revision,
        p.generation,
        FieldOperation::Rename {
            field: "name".into(),
            new_name: "title".into(),
        },
    )
    .unwrap();
    w.undo(schema, false).unwrap();
    assert!(w.dirty_paths().is_empty());
    let moved = w
        .prepare_path_move("sources/group", "sources/moved")
        .unwrap();
    assert_eq!(
        w.apply_path_move(&moved.token).unwrap().outcome,
        Outcome::Success
    );
    w.undo("sources/moved/catalog-schema.yaml", true).unwrap();
    assert!(
        w.current_doc("sources/moved/catalog-data.yaml")
            .unwrap()
            .bytes
            .contains("title: Debug Sword")
    );
    w.undo("sources/moved/catalog-data.yaml", false).unwrap();
    assert!(
        w.current_doc("sources/moved/catalog-schema.yaml")
            .unwrap()
            .bytes
            .contains("name: name")
    );
}
