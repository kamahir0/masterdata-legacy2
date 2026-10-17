#[path = "support/mod.rs"]
mod fixture;
use masterdata_engine::{
    native::Outcome,
    workspace::{EntryOperation, Workspace},
};
use std::{fs, path::Path};
fn project() -> tempfile::TempDir {
    let t = tempfile::tempdir().unwrap();
    fixture::copy(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/full"),
        t.path(),
    )
    .unwrap();
    fs::create_dir_all(t.path().join("sources/group/nested/empty")).unwrap();
    fs::write(
        t.path().join("sources/group/nested/broken.yaml"),
        "kind: [\n",
    )
    .unwrap();
    fs::write(
        t.path().join("sources/group/nested/raw.bin"),
        [0, 255, 127, 3],
    )
    .unwrap();
    t
}
#[test]
fn folder_move_delete_and_restart_restore_preserve_invalid_bytes_and_empty_directories() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    assert_eq!(
        w.path_move_choices("sources/group").unwrap()["directory"],
        true
    );
    let review = w
        .prepare_path_move("sources/group", "sources/renamed")
        .unwrap();
    assert_eq!(
        w.apply_path_move(&review.token).unwrap().outcome,
        Outcome::Success
    );
    assert!(!t.path().join("sources/group").exists());
    assert!(t.path().join("sources/renamed/nested/empty").is_dir());
    assert_eq!(
        fs::read(t.path().join("sources/renamed/nested/raw.bin")).unwrap(),
        [0, 255, 127, 3]
    );
    let deleted = w.trash_source("sources/renamed").unwrap();
    assert_eq!(deleted["result"]["outcome"], "Success");
    let id = deleted["receipt"]["id"].as_str().unwrap().to_owned();
    drop(w);
    let mut w = Workspace::open(t.path()).unwrap();
    assert_eq!(w.source_trash().unwrap().len(), 1);
    assert_eq!(w.restore_source(&id).unwrap().outcome, Outcome::Success);
    assert!(t.path().join("sources/renamed/nested/empty").is_dir());
    assert_eq!(
        fs::read_to_string(t.path().join("sources/renamed/nested/broken.yaml")).unwrap(),
        "kind: [\n"
    );
    assert!(w.source_trash().unwrap().is_empty());
}
#[test]
fn batch_copy_and_normalized_delete_preserve_the_original_and_reject_occupied_restore() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let review = w
        .prepare_entry_batch(
            EntryOperation::Copy,
            vec![
                "sources/group".into(),
                "sources/group/nested/broken.yaml".into(),
            ],
            Some("sources".into()),
        )
        .unwrap();
    assert_eq!(review.items.len(), 1);
    assert_eq!(review.items[0].1, "sources/group-copy");
    let result = w.apply_entry_batch(&review.token).unwrap();
    assert_eq!(result.items[0].result.outcome, Outcome::Success);
    assert!(t.path().join("sources/group/nested/empty").is_dir());
    assert!(t.path().join("sources/group-copy/nested/empty").is_dir());
    assert_eq!(
        fs::read(t.path().join("sources/group-copy/nested/raw.bin")).unwrap(),
        [0, 255, 127, 3]
    );
    let review = w
        .prepare_entry_batch(
            EntryOperation::Trash,
            vec![
                "sources/group-copy".into(),
                "sources/group-copy/nested/broken.yaml".into(),
            ],
            None,
        )
        .unwrap();
    let result = w.apply_entry_batch(&review.token).unwrap();
    assert_eq!(result.items.len(), 1);
    assert_eq!(result.items[0].result.outcome, Outcome::Success);
    fs::create_dir(t.path().join("sources/group-copy")).unwrap();
    assert!(
        w.restore_source(result.items[0].receipt.as_ref().unwrap())
            .is_err()
    );
    assert!(t.path().join("sources/group").is_dir());
}
#[test]
fn folder_preflight_detects_changed_children_and_rejects_self_descendants_and_root() {
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    assert!(w.prepare_path_move("sources", "elsewhere").is_err());
    assert!(
        w.prepare_path_move("sources/group", "sources/group/nested/loop")
            .is_err()
    );
    assert!(
        w.prepare_entry_batch(
            EntryOperation::Copy,
            vec!["sources/group".into()],
            Some("sources/group/nested".into())
        )
        .is_err()
    );
    let r = w
        .prepare_path_move("sources/group", "sources/moved")
        .unwrap();
    fs::write(
        t.path().join("sources/group/nested/broken.yaml"),
        "changed\n",
    )
    .unwrap();
    assert_eq!(
        w.apply_path_move(&r.token).unwrap().outcome,
        Outcome::Conflict
    );
    assert!(t.path().join("sources/group").is_dir());
    assert!(!t.path().join("sources/moved").exists());
}
#[cfg(unix)]
#[test]
fn folder_operations_reject_symlink_children_without_touching_the_external_target() {
    let t = project();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret"), "keep").unwrap();
    std::os::unix::fs::symlink(outside.path(), t.path().join("sources/group/alias")).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    assert!(w.trash_source("sources/group").is_err());
    assert!(
        w.prepare_entry_batch(
            EntryOperation::Copy,
            vec!["sources/group".into()],
            Some("sources".into())
        )
        .is_err()
    );
    assert_eq!(
        fs::read_to_string(outside.path().join("secret")).unwrap(),
        "keep"
    );
}

#[test]
fn folder_dirty_guard_and_copy_keep_the_current_buffer_and_saved_bytes_separate() {
    let t = project();
    fs::create_dir(t.path().join("sources/records")).unwrap();
    fs::rename(
        t.path().join("sources/catalog-data.yaml"),
        t.path().join("sources/records/catalog-data.yaml"),
    )
    .unwrap();
    let saved = fs::read(t.path().join("sources/records/catalog-data.yaml")).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    let p = w
        .select("sources/records/catalog-data.yaml", 0, 32)
        .unwrap();
    w.edit_text(
        &p.source.unwrap(),
        p.revision,
        &p.rows[0].id,
        "name",
        "unsaved",
    )
    .unwrap();
    assert_eq!(
        w.trash_source("sources/records").unwrap_err().code,
        "E-PATH-DIRTY"
    );
    assert_eq!(
        w.prepare_path_move("sources/records", "sources/renamed")
            .unwrap_err()
            .code,
        "E-PATH-DIRTY"
    );
    let r = w
        .prepare_entry_batch(
            EntryOperation::Copy,
            vec!["sources/records".into()],
            Some("sources".into()),
        )
        .unwrap();
    assert_eq!(
        w.apply_entry_batch(&r.token).unwrap().items[0]
            .result
            .outcome,
        Outcome::Success
    );
    assert_eq!(
        fs::read(t.path().join("sources/records-copy/catalog-data.yaml")).unwrap(),
        saved
    );
    assert!(
        w.current_doc("sources/records/catalog-data.yaml")
            .unwrap()
            .bytes
            .contains("unsaved")
    );
    assert_eq!(w.dirty_paths(), ["sources/records/catalog-data.yaml"]);
}
#[test]
fn multi_move_preflights_every_destination_before_touching_the_first_entry() {
    let t = project();
    fs::create_dir_all(t.path().join("sources/a")).unwrap();
    fs::create_dir_all(t.path().join("sources/b")).unwrap();
    fs::write(t.path().join("sources/a/same.yaml"), "kind: invalid\n").unwrap();
    fs::write(t.path().join("sources/b/same.yaml"), "kind: invalid\n").unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    assert!(
        w.prepare_entry_batch(
            EntryOperation::Move,
            vec!["sources/a/same.yaml".into(), "sources/b/same.yaml".into()],
            Some("sources".into())
        )
        .is_err()
    );
    assert!(t.path().join("sources/a/same.yaml").exists());
    assert!(t.path().join("sources/b/same.yaml").exists());
    assert!(!t.path().join("sources/same.yaml").exists());
}
#[cfg(feature = "oracle-faults")]
#[test]
fn uncertain_batch_move_stops_the_remaining_entries_and_rechecks_without_rewriting() {
    use masterdata_engine::native::Fault;
    let t = project();
    let mut w = Workspace::open(t.path()).unwrap();
    let r = w.prepare_entry_batch(
        EntryOperation::Move,
        vec!["sources/group".into(), "sources/rarity.yaml".into()],
        Some("sources/group/nested".into()),
    );
    assert!(r.is_err());
    fs::create_dir(t.path().join("sources/destination")).unwrap();
    w.refresh_paths(&[t.path().join("sources/destination")]);
    let r = w
        .prepare_entry_batch(
            EntryOperation::Move,
            vec!["sources/group".into(), "sources/rarity.yaml".into()],
            Some("sources/destination".into()),
        )
        .unwrap();
    let result = w
        .apply_entry_batch_with_fault(&r.token, Fault::AfterCommitObservation)
        .unwrap();
    assert_eq!(result.items[0].result.outcome, Outcome::OutcomeUnknown);
    assert_eq!(result.items[1].result.outcome, Outcome::NotAttempted);
    assert!(w.apply_entry_batch(&r.token).is_err());
    let result = w.recheck_entry_batch(&r.token).unwrap();
    assert_eq!(result.items[0].result.outcome, Outcome::Success);
    assert_eq!(result.items[1].result.outcome, Outcome::NotAttempted);
    assert!(t.path().join("sources/rarity.yaml").exists());
    assert!(
        t.path()
            .join("sources/destination/group/nested/empty")
            .is_dir()
    );
}
