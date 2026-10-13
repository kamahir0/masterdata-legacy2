use masterdata_engine::{
    semantic::Type,
    type_migration::{self, Command},
};

fn proposal(underlying: &str, flags: bool, members: Vec<(String, String)>) -> (String, String) {
    let command = type_migration::suggest_enum_member(
        "NewMember",
        &Type::Enum {
            underlying: underlying.into(),
            flags,
            members,
        },
    )
    .unwrap();
    let Command::AddEnumMember { name, value, .. } = command else {
        panic!("wrong command")
    };
    (name, value)
}

#[test]
fn enum_defaults_skip_name_and_numeric_collisions_without_rounding_existing_ulong() {
    let (name, value) = proposal(
        "ulong",
        false,
        vec![
            ("NewMember2".into(), "0".into()),
            ("Maximum".into(), u64::MAX.to_string()),
            ("Three".into(), "3".into()),
        ],
    );
    assert_eq!((name, value), ("NewMember3".into(), "1".into()));
    assert_eq!(
        proposal(
            "long",
            false,
            vec![("Minimum".into(), i64::MIN.to_string())]
        )
        .1,
        "0"
    );
}

#[test]
fn flags_defaults_use_the_first_unused_bit_and_preserve_signed_sign_bit() {
    assert_eq!(
        proposal(
            "ulong",
            true,
            vec![
                ("None".into(), "0".into()),
                ("Low".into(), "1".into()),
                ("High".into(), (1_u64 << 63).to_string())
            ]
        )
        .1,
        "2"
    );
    for (underlying, width) in [("int", 32), ("long", 64)] {
        let members = (0..width - 1)
            .map(|bit| (format!("Bit{bit}"), (1_i128 << bit).to_string()))
            .collect();
        assert_eq!(
            proposal(underlying, true, members).1,
            (-(1_i128 << (width - 1))).to_string()
        );
    }
}

#[test]
fn exhausted_flags_and_non_enum_have_no_default_add_command() {
    for (underlying, width) in [("uint", 32), ("ulong", 64)] {
        let members = (0..width)
            .map(|bit| (format!("Bit{bit}"), (1_i128 << bit).to_string()))
            .collect();
        assert_eq!(
            type_migration::suggest_enum_member(
                "Full",
                &Type::Enum {
                    underlying: underlying.into(),
                    flags: true,
                    members
                }
            )
            .unwrap_err()
            .code,
            "E-TYPE-MIGRATION-PRECONDITION"
        );
    }
    assert!(
        type_migration::suggest_enum_member("Wrong", &Type::Custom { fields: vec![] }).is_err()
    );
}

#[test]
fn default_add_uses_a_saved_plan_and_rejects_changed_source_identity() {
    use masterdata_engine::{
        native::Outcome,
        workspace::{SelectionProjection, Workspace},
    };
    let temp = tempfile::tempdir().unwrap();
    std::fs::create_dir(temp.path().join("sources")).unwrap();
    std::fs::write(
        temp.path().join("masterdata.toml"),
        include_str!("../../fixtures/full/masterdata.toml"),
    )
    .unwrap();
    let source = "sources/enum.yaml";
    let bytes = "kind: type\nname: Choice\nenum:\n  underlying: ulong\n  members:\n    - name: Zero\n      value: 0\n";
    std::fs::write(temp.path().join(source), bytes).unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let SelectionProjection::Type(p) = w.select_view(source, 0, 32).unwrap() else {
        panic!("type required")
    };
    let command = w.default_enum_member(source, &p.identity).unwrap();
    assert_eq!(
        std::fs::read_to_string(temp.path().join(source)).unwrap(),
        bytes
    );
    let plan = w
        .prepare_type_migration(source, &p.identity, command.clone())
        .unwrap();
    std::fs::write(temp.path().join(source), format!("{bytes}\n# external\n")).unwrap();
    assert_eq!(
        w.apply_migration(&plan.token, false).unwrap_err().code,
        "E-MIGRATION-STALE"
    );
    assert_eq!(
        w.default_enum_member(source, &p.identity).unwrap_err().code,
        "E-MIGRATION-STALE"
    );
    let SelectionProjection::Type(p) = w.select_view(source, 0, 32).unwrap() else {
        panic!("type required")
    };
    let plan = w
        .prepare_type_migration(
            source,
            &p.identity,
            w.default_enum_member(source, &p.identity).unwrap(),
        )
        .unwrap();
    assert_eq!(
        w.apply_migration(&plan.token, false).unwrap().outcome,
        Outcome::Success
    );
}
