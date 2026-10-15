use masterdata_engine::{
    native::{self, Outcome},
    workspace::{Workspace, complex::Operation},
};
use std::fs;
const SCHEMA: &str = "sources/schema.yaml";
const DATA: &str = "sources/data.yaml";
fn project() -> tempfile::TempDir {
    let t = tempfile::tempdir().unwrap();
    fs::create_dir(t.path().join("sources")).unwrap();
    fs::write(t.path().join("masterdata.toml"),"[project]\nid = \"interaction\"\nname = \"Interaction\"\nversion = \"0.1.0\"\n[build]\nartifact_dir = \".masterdata/output\"\ncache = \".masterdata/cache\"\n").unwrap();
    fs::write(t.path().join(SCHEMA),"kind: schema\ntable: item\nfields:\n  - {key: 0, name: id, type: int}\n  - {key: 1, name: name, type: string}\n  - {key: 2, name: enabled, type: bool}\n  - {key: 3, name: options, type: Feature}\n  - {key: 4, name: values, type: Detail, array: true}\n  - {key: 5, name: detail, type: Detail, nullable: true}\nprimaryKey:\n  fields: [id]\n").unwrap();
    fs::write(t.path().join("sources/feature.yaml"),"kind: type\nname: Feature\nflags:\n  underlying: uint\n  members:\n    - {name: None, value: 0}\n    - {name: First, value: 1}\n    - {name: Second, value: 2}\n").unwrap();
    fs::write(t.path().join("sources/detail.yaml"),"kind: type\nname: Detail\ncustom:\n  fields:\n    - {key: 0, name: amount, type: long}\n    - {key: 1, name: enabled, type: bool}\n    - {key: 2, name: note, type: string, nullable: true}\n").unwrap();
    fs::write(t.path().join(DATA),"kind: data\ntable: item\nrecords:\n  - id: 0\n    name: kept\n    enabled: true\n    options: [None]\n    values: []\n    detail: null\n").unwrap();
    t
}
#[test]
fn schema_record_destination_is_explicit_and_first_add_is_one_reversible_operation() {
    let t = project();
    let original = fs::read(t.path().join(SCHEMA)).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    assert_eq!(
        w.select(SCHEMA, 0, 32).unwrap().source.as_deref(),
        Some(DATA)
    );
    w.select_record_source(SCHEMA).unwrap();
    let v = w.select(SCHEMA, 0, 32).unwrap();
    assert_eq!(v.source.as_deref(), Some(SCHEMA));
    assert_eq!(v.total_rows, 0);
    assert!(!v.dirty);
    assert!(v.sources.iter().any(|s| s == SCHEMA));
    w.add_row(SCHEMA, v.revision, v.generation, None).unwrap();
    let v = w.select(SCHEMA, 0, 32).unwrap();
    assert_eq!(v.total_rows, 1);
    assert!(v.rows[0].cells.iter().all(|c| c.valid));
    assert_eq!(v.rows[0].cells[0].display, "1");
    assert_eq!(fs::read(t.path().join(SCHEMA)).unwrap(), original);
    w.undo(SCHEMA, false).unwrap();
    assert_eq!(w.current_doc(SCHEMA).unwrap().bytes.as_bytes(), original);
    assert!(!w.select(SCHEMA, 0, 32).unwrap().dirty);
    w.undo(SCHEMA, true).unwrap();
    assert_eq!(w.select(SCHEMA, 0, 32).unwrap().total_rows, 1);
}
#[test]
fn new_records_allocate_unique_keys_against_other_unsaved_sources_and_initialize_nested_types() {
    let t = project();
    fs::write(
        t.path().join("sources/other.yaml"),
        fs::read(t.path().join(DATA)).unwrap(),
    )
    .unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let v = w.select("sources/other.yaml", 0, 32).unwrap();
    w.edit_text("sources/other.yaml", v.revision, &v.rows[0].id, "id", "1")
        .unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let row = w.add_row(DATA, v.revision, v.generation, None).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let added = v.rows.iter().find(|r| r.id == row).unwrap();
    assert_eq!(added.cells[0].display, "2");
    assert!(added.cells.iter().all(|c| c.valid));
    let path = vec!["values".into()];
    w.complex_operation(DATA, v.revision, v.generation, &row, &path, Operation::Add)
        .unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let array = w
        .complex_view(DATA, v.revision, v.generation, &row, &path, 0..32)
        .unwrap();
    assert!(array.node.valid);
    assert_eq!(array.node.children.len(), 1);
    let detail = vec!["detail".into()];
    w.complex_operation(
        DATA,
        v.revision,
        v.generation,
        &row,
        &detail,
        Operation::Materialize,
    )
    .unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let details = w
        .complex_view(DATA, v.revision, v.generation, &row, &detail, 0..32)
        .unwrap();
    assert!(details.node.valid);
    assert_eq!(details.node.children[0].input.as_deref(), Some("0"));
    assert_eq!(details.node.children[1].input.as_deref(), Some("false"));
    assert_eq!(details.node.children[2].kind, "null");
}
#[test]
fn flags_none_is_exclusive_and_last_bit_returns_to_none_with_one_undo() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let row = v.rows[0].id.clone();
    let path = vec!["options".into()];
    for (symbol, enabled, expected) in [
        ("First", true, vec!["First"]),
        ("Second", true, vec!["First", "Second"]),
        ("None", true, vec!["None"]),
        ("Second", true, vec!["Second"]),
        ("Second", false, vec!["None"]),
    ] {
        let v = w.select(DATA, 0, 32).unwrap();
        w.complex_operation(
            DATA,
            v.revision,
            v.generation,
            &row,
            &path,
            Operation::Flag {
                symbol: symbol.into(),
                enabled,
            },
        )
        .unwrap();
        let v = w.select(DATA, 0, 32).unwrap();
        let view = w
            .complex_view(DATA, v.revision, v.generation, &row, &path, 0..32)
            .unwrap();
        assert!(view.node.valid);
        assert_eq!(view.node.selected_members, expected);
    }
    w.undo(DATA, false).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let view = w
        .complex_view(DATA, v.revision, v.generation, &row, &path, 0..32)
        .unwrap();
    assert_eq!(view.node.selected_members, ["Second"]);
}
#[test]
fn trash_preserves_exact_bytes_other_drafts_and_restores_after_restart_without_overwrite() {
    let t = project();
    let bytes = fs::read(t.path().join("sources/feature.yaml")).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    w.edit_text(DATA, v.revision, &v.rows[0].id, "name", "unsaved")
        .unwrap();
    let local = w.current_doc(DATA).unwrap().bytes.clone();
    let result = w.trash_source("sources/feature.yaml").unwrap();
    assert_eq!(result["result"]["outcome"], "Success");
    assert_eq!(w.dirty_paths(), [DATA]);
    assert_eq!(w.current_doc(DATA).unwrap().bytes, local);
    assert!(!t.path().join("sources/feature.yaml").exists());
    let id = result["receipt"]["id"].as_str().unwrap();
    let stored = result["receipt"]["stored"].as_str().unwrap();
    assert_eq!(fs::read(t.path().join(stored)).unwrap(), bytes);
    let mut reopened = Workspace::open(t.path()).unwrap();
    assert_eq!(reopened.source_trash().unwrap()[0].id, id);
    fs::write(t.path().join("sources/feature.yaml"), "occupied").unwrap();
    assert!(reopened.restore_source(id).is_err());
    assert_eq!(
        fs::read_to_string(t.path().join("sources/feature.yaml")).unwrap(),
        "occupied"
    );
    assert_eq!(fs::read(t.path().join(stored)).unwrap(), bytes);
    fs::remove_file(t.path().join("sources/feature.yaml")).unwrap();
    assert_eq!(
        reopened.restore_source(id).unwrap().outcome,
        Outcome::Success
    );
    assert_eq!(
        fs::read(t.path().join("sources/feature.yaml")).unwrap(),
        bytes
    );
    assert!(reopened.source_trash().unwrap().is_empty());
    fs::write(
        t.path().join("sources/feature.yaml"),
        "edited after restore",
    )
    .unwrap();
    let mut again = Workspace::open(t.path()).unwrap();
    assert!(again.source_trash().unwrap().is_empty());
}
#[test]
fn trash_refuses_stale_source_or_a_racing_destination_and_retains_original_bytes() {
    let t = project();
    let root = t.path().canonicalize().unwrap();
    let roots = vec![root.join("sources")];
    let expected = native::capture(&root, &roots, DATA).unwrap();
    let (_, result) = native::trash::archive(&root, &roots, DATA, &expected, || {
        let entry = fs::read_dir(root.join(".masterdata/trash"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        fs::write(entry.join("source.yaml"), "racing file").unwrap();
        Ok(())
    })
    .unwrap();
    assert_eq!(result.outcome, Outcome::Conflict);
    assert_eq!(
        fs::read_to_string(root.join(DATA)).unwrap(),
        expected.bytes.as_ref()
    );
    fs::write(root.join(DATA), "external").unwrap();
    assert!(native::trash::archive(&root, &roots, DATA, &expected, || Ok(())).is_err());
    assert_eq!(fs::read_to_string(root.join(DATA)).unwrap(), "external");
}
#[cfg(unix)]
#[test]
fn trash_rejects_symlink_storage_instead_of_writing_outside_project() {
    let t = project();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), t.path().join(".masterdata")).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    assert!(w.trash_source(DATA).is_err());
    assert!(t.path().join(DATA).is_file());
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
}
#[cfg(feature = "oracle-faults")]
#[test]
fn uncertain_trash_blocks_retry_until_identity_recheck_then_can_restore() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let result = w
        .trash_source_with_fault(DATA, native::Fault::AfterCommitObservation)
        .unwrap();
    assert_eq!(result["result"]["outcome"], "OutcomeUnknown");
    let id = result["receipt"]["id"].as_str().unwrap();
    assert!(w.trash_source(DATA).is_err());
    assert!(w.restore_source(id).is_err());
    assert!(w.uncertain_paths().iter().any(|p| p == DATA));
    assert_eq!(w.source_trash().unwrap()[0].state, "Stored");
    assert!(!w.uncertain_paths().iter().any(|p| p == DATA));
    assert_eq!(w.restore_source(id).unwrap().outcome, Outcome::Success);
    assert!(t.path().join(DATA).is_file());
}
#[test]
fn exhausted_finite_unique_key_rejects_creation_without_history_or_byte_changes() {
    let t = project();
    fs::write(t.path().join(SCHEMA),"kind: schema\ntable: item\nfields:\n  - {key: 0, name: id, type: Limit}\nprimaryKey:\n  fields: [id]\n").unwrap();
    fs::write(
        t.path().join(DATA),
        "kind: data\ntable: item\nrecords:\n  - {id: Zero}\n  - {id: One}\n",
    )
    .unwrap();
    fs::write(t.path().join("sources/limit.yaml"),"kind: type\nname: Limit\nenum:\n  underlying: int\n  members:\n    - {name: Zero, value: 0}\n    - {name: One, value: 1}\n").unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    let before = w.current_doc(DATA).unwrap().bytes.clone();
    assert_eq!(
        w.add_row(DATA, v.revision, v.generation, None)
            .unwrap_err()
            .code,
        "E-DEFAULT-KEY"
    );
    assert_eq!(w.current_doc(DATA).unwrap().bytes, before);
    assert!(!w.select(DATA, 0, 32).unwrap().can_undo);
}
#[test]
fn temporary_initializers_share_recursive_defaults_and_flags_control_without_mutating_sources() {
    use masterdata_engine::{
        creation::Declaration,
        initializer::{Action, Input},
    };
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let masterdata_engine::workspace::SelectionProjection::Type(p) =
        w.select_view("sources/detail.yaml", 0, 32).unwrap()
    else {
        panic!("type projection expected")
    };
    let declaration = Declaration {
        key: "3".into(),
        name: "newField".into(),
        type_name: "Detail".into(),
        nullable: false,
        array: true,
    };
    let input = w
        .type_initializer_value(
            &p.source,
            &p.identity,
            &declaration,
            &["0".into()],
            Action::Materialize,
        )
        .unwrap();
    let Input::Mapping { value } = input else {
        panic!("Custom default expected")
    };
    assert!(matches!(&value[0].1,Input::Scalar {text} if text=="0"));
    assert!(matches!(value[2].1, Input::Null));
    let declaration = Declaration {
        type_name: "Feature".into(),
        array: false,
        ..declaration
    };
    let input = w
        .type_initializer_value(
            &p.source,
            &p.identity,
            &declaration,
            &[],
            Action::Flag {
                symbol: "First".into(),
                enabled: true,
                members: vec!["None".into()],
            },
        )
        .unwrap();
    let Input::Sequence { value } = input else {
        panic!("Flags default expected")
    };
    assert!(matches!(&value[0],Input::Scalar {text} if text=="First"));
    assert_eq!(value.len(), 1);
    assert!(w.dirty_paths().is_empty());
}
#[test]
fn dense_integer_primary_keys_allocate_beyond_the_set_without_overwriting_any_row() {
    let t = project();
    fs::write(t.path().join(SCHEMA),"kind: schema\ntable: item\nfields:\n  - {key: 0, name: id, type: int}\nprimaryKey:\n  fields: [id]\n").unwrap();
    let rows = (0..1000)
        .map(|id| format!("  - {{id: {id}}}\n"))
        .collect::<String>();
    fs::write(
        t.path().join(DATA),
        format!("kind: data\ntable: item\nrecords:\n{rows}"),
    )
    .unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    w.add_row(DATA, v.revision, v.generation, None).unwrap();
    let v = w.select(DATA, 996, 32).unwrap();
    assert_eq!(v.total_rows, 1001);
    assert_eq!(v.rows.last().unwrap().cells[0].display, "1000");
    assert!(
        fs::read_to_string(t.path().join(DATA))
            .unwrap()
            .ends_with("  - {id: 999}\n")
    );
}
#[test]
fn composite_primary_and_unique_secondary_defaults_are_allocated_together() {
    let t = project();
    fs::write(t.path().join(SCHEMA),"kind: schema\ntable: item\nfields:\n  - {key: 0, name: id, type: int}\n  - {key: 1, name: locale, type: Locale}\n  - {key: 2, name: slug, type: string}\nprimaryKey:\n  fields: [id, locale]\nsecondaryKeys:\n  - fields: [slug]\n").unwrap();
    fs::write(t.path().join("sources/locale.yaml"),"kind: type\nname: Locale\nenum:\n  underlying: int\n  members:\n    - {name: Base, value: 0}\n    - {name: Extra, value: 1}\n").unwrap();
    fs::write(t.path().join(DATA),"kind: data\ntable: item\nrecords:\n  - {id: 0, locale: Base, slug: \"\"}\n  - {id: 0, locale: Extra, slug: \"2\"}\n").unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    w.add_row(DATA, v.revision, v.generation, None).unwrap();
    let v = w.select(DATA, 0, 32).unwrap();
    assert_eq!(v.rows[2].cells[0].display, "1");
    assert_eq!(v.rows[2].cells[1].display, "Base");
    assert_eq!(v.rows[2].cells[2].display, "1");
    assert!(w.validation_snapshot().validate(None).unwrap().0.is_empty());
}
