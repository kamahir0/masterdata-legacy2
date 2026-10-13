use masterdata_engine::{
    config::Operation,
    creation::Request,
    delivery::SavedConfig,
    instrument,
    native::{Fault, Outcome, publish::PublishPlan},
    project::{self, Project},
    workspace::Workspace,
};
use std::{collections::BTreeMap, fs, path::Path};

const HEADER: &str = "[project]\nid = 'fixed.sources'\nname = 'Fixed Sources'\nversion = '0.1.0'\n";
const BUILD: &str = "[build]\nartifact_dir = '.masterdata/output'\ncache = '.masterdata/cache'\n";
const YAML: &str = "# exact source bytes\nkind: schema\ntable: item\nfields:\n  - key: 0\n    name: id\n    type: int\nprimaryKey:\n  fields: [id]\nsecondaryKeys: []\nrecords:\n  - id: 1 # kept\n";
fn config(sources: &str) -> String {
    format!("{HEADER}{sources}{BUILD}")
}
fn project(sources: &str) -> tempfile::TempDir {
    let t = tempfile::tempdir().unwrap();
    fs::create_dir(t.path().join("sources")).unwrap();
    fs::write(t.path().join("masterdata.toml"), config(sources)).unwrap();
    fs::write(t.path().join("sources/item.yaml"), YAML).unwrap();
    t
}
fn tree(root: &Path) -> BTreeMap<String, Option<Vec<u8>>> {
    fn visit(root: &Path, path: &Path, result: &mut BTreeMap<String, Option<Vec<u8>>>) {
        for entry in fs::read_dir(path).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            let key = path.strip_prefix(root).unwrap().to_string_lossy().into();
            if path.is_dir() {
                result.insert(key, None);
                visit(root, &path, result);
            } else {
                result.insert(key, Some(fs::read(path).unwrap()));
            }
        }
    }
    let mut result = BTreeMap::new();
    visit(root, root, &mut result);
    result
}

#[test]
fn source_settings_omission_uses_only_the_fixed_directory() {
    // PROJECT-SOURCE-001 / 003: a sibling YAML tree is never discovered.
    let sources = "";
    let t = project(sources);
    fs::create_dir(t.path().join("other")).unwrap();
    fs::write(t.path().join("other/invalid.yaml"), "invalid: [").unwrap();
    let before = tree(t.path());
    let p = Project::open(t.path()).unwrap();
    assert_eq!(p.roots, [t.path().join("sources").canonicalize().unwrap()]);
    assert_eq!(p.sources.len(), 1);
    assert_eq!(p.sources["sources/item.yaml"].bytes.as_ref(), YAML);
    assert!(p.validate(None).unwrap().0.is_empty());
    assert_eq!(tree(t.path()), before);
}

#[test]
fn all_source_settings_fail_before_discovery_or_mutation_even_with_valid_sources() {
    for roots in [
        "['sources']",
        "[]",
        "['']",
        "['data']",
        "['./sources']",
        "['sources/']",
        "['sources', 'sources']",
        "['sources', '../outside']",
    ] {
        let t = project(&format!("[sources]\nroots = {roots}\n"));
        fs::create_dir_all(t.path().join(".masterdata/output")).unwrap();
        fs::write(t.path().join(".masterdata/output/sentinel"), "old artifact").unwrap();
        let before = tree(t.path());
        let (error, measured) = instrument::measure(|| Project::open(t.path()).unwrap_err());
        assert_eq!(error.code, "E-CONFIG-SOURCES-UNSUPPORTED", "{roots}");
        assert!(error.message.contains("sources/"));
        assert!(error.message.contains("not supported"));
        assert_eq!(measured.work.project_enumeration, 0);
        assert_eq!(measured.work.project_yaml_parse, 0);
        assert_eq!(Workspace::open(t.path()).err().unwrap().code, error.code);
        assert_eq!(SavedConfig::load(t.path()).err().unwrap().code, error.code);
        assert_eq!(
            PublishPlan::prepare(t.path()).err().unwrap().code,
            error.code
        );
        assert_eq!(tree(t.path()), before);
    }
}

#[test]
fn unknown_or_malformed_other_config_fields_keep_normal_config_diagnostics() {
    assert_eq!(
        project::config(&config("").replace("[build]", "[build]\nunknown = true"))
            .unwrap_err()
            .code,
        "E-CONFIG"
    );
    assert_eq!(
        project::config(
            &config("").replace("artifact_dir = '.masterdata/output'", "artifact_dir = 1")
        )
        .unwrap_err()
        .code,
        "E-CONFIG"
    );
    for source_setting in [
        "[sources]\n",
        "[sources]\nroots = 'sources'\n",
        "[sources]\nunknown = true\n",
    ] {
        assert_eq!(
            project::config(&config(source_setting)).unwrap_err().code,
            "E-CONFIG-SOURCES-UNSUPPORTED"
        );
    }
}

#[test]
fn fixed_directory_keeps_observed_spelling_on_case_insensitive_hosts() {
    let t = project("");
    fs::rename(t.path().join("sources"), t.path().join("Sources")).unwrap();
    if !t.path().join("sources").is_dir() {
        assert_eq!(
            Project::open(t.path()).unwrap_err().code,
            "E-SOURCE-DIRECTORY-MISSING"
        );
        return;
    }
    let mut w = Workspace::open(t.path()).unwrap();
    assert_eq!(w.read.source_directory_path(), "Sources");
    assert!(w.read.folders.contains("Sources"));
    assert_eq!(w.creation_choices()["roots"][0]["path"], "Sources");
    let request = Request {
        root: "sources".into(),
        path: "Sources/token.yaml".into(),
        artifact: w
            .creation_defaults("enum", "Sources/token.yaml", None)
            .unwrap(),
    };
    assert_eq!(w.create_source(&request).unwrap().outcome, Outcome::Success);
    assert!(w.read.sources.contains_key("Sources/token.yaml"));
    assert_eq!(
        w.path_move_choices("Sources/token.yaml").unwrap()["root"],
        "Sources"
    );
}

#[test]
fn missing_or_file_source_directory_is_never_created_or_treated_as_empty() {
    for is_file in [false, true] {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("masterdata.toml"), config("")).unwrap();
        if is_file {
            fs::write(t.path().join("sources"), "preserved file").unwrap();
        }
        let before = tree(t.path());
        assert_eq!(
            Project::open(t.path()).unwrap_err().code,
            "E-SOURCE-DIRECTORY-MISSING"
        );
        assert_eq!(
            Workspace::open(t.path()).err().unwrap().code,
            "E-SOURCE-DIRECTORY-MISSING"
        );
        assert_eq!(tree(t.path()), before);
    }
}

#[test]
fn creation_move_and_config_save_work_without_rewriting_source_settings() {
    let sources = "";
    let t = project(sources);
    let original = fs::read_to_string(t.path().join("masterdata.toml")).unwrap();
    let mut w = Workspace::open(t.path()).unwrap();
    assert_eq!(
        w.creation_choices()["roots"],
        serde_json::json!([{"root":"sources","path":"sources"}])
    );
    let mut request = Request {
        root: "sources".into(),
        path: "sources/token.yaml".into(),
        artifact: w
            .creation_defaults("enum", "sources/token.yaml", None)
            .unwrap(),
    };
    request.root = "other".into();
    assert_eq!(w.create_source(&request).unwrap_err().code, "E-PATH-SCOPE");
    request.root = "sources".into();
    assert_eq!(w.create_source(&request).unwrap().outcome, Outcome::Success);
    let bytes = fs::read(t.path().join(&request.path)).unwrap();
    let plan = w
        .prepare_path_move(&request.path, "sources/renamed.yaml")
        .unwrap();
    assert_eq!(
        w.apply_path_move(&plan.token).unwrap().outcome,
        Outcome::Success
    );
    assert_eq!(
        fs::read(t.path().join("sources/renamed.yaml")).unwrap(),
        bytes
    );
    w.edit_config(
        w.configuration.revision,
        Operation::AddProfile {
            name: "production".into(),
        },
    )
    .unwrap();
    assert_eq!(
        w.save_config(w.configuration.revision, Fault::None)
            .unwrap()
            .outcome,
        Outcome::Success
    );
    assert!(
        fs::read_to_string(t.path().join("masterdata.toml"))
            .unwrap()
            .starts_with(&original)
    );
    assert_eq!(
        fs::read_to_string(t.path().join("sources/item.yaml")).unwrap(),
        YAML
    );
}
