//! Recoverable source-only removal. The same exclusive rename primitive and
//! fresh file/parent checks protect ordinary moves, archiving and restoration.
use super::*;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    pub source: String,
    pub stored: String,
    content: String,
    file: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub source: String,
    pub state: String,
}
fn stamp(snapshot: &Snapshot) -> Result<String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let Identity::Unix(file) = snapshot.file.as_ref();
        let m = file.as_file().metadata().map_err(io_error)?;
        Ok(format!("{}:{}", m.dev(), m.ino()))
    }
    #[cfg(windows)]
    {
        let Identity::Windows {
            volume,
            id,
            created,
        } = snapshot.file.as_ref();
        Ok(format!("{volume}:{id:?}:{created}"))
    }
}
fn directory(root: &Path, create: bool) -> Result<Option<PathBuf>> {
    let mut path = root.to_path_buf();
    for part in [".masterdata", "trash"] {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && create => {
                fs::create_dir(&path).map_err(io_error)?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(io_error(e)),
            Ok(m) if path_alias(&m) || !m.is_dir() => {
                return Err(Error::new(
                    "E-PATH-ALIAS",
                    "trash must be an ordinary Project directory",
                ));
            }
            Ok(_) => {}
        }
        let logical = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        checked_path(root, &[root.to_path_buf()], &logical)?;
    }
    Ok(Some(path.canonicalize().map_err(io_error)?))
}
fn read(root: &Path, trash: &Path, id: &str) -> Result<Receipt> {
    if !id.starts_with("entry-") || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(Error::new("E-TRASH-RECEIPT", "invalid receipt"));
    }
    let logical = format!(".masterdata/trash/{id}/receipt.json");
    let file = checked_path(root, &[trash.to_path_buf()], &logical)?;
    let receipt: Receipt = serde_json::from_slice(&fs::read(file).map_err(io_error)?)
        .map_err(|e| Error::new("E-TRASH-RECEIPT", e.to_string()))?;
    if receipt.id != id || receipt.stored != format!(".masterdata/trash/{id}/source.yaml") {
        return Err(Error::new("E-TRASH-RECEIPT", "receipt path mismatch"));
    }
    Ok(receipt)
}
fn matches(snapshot: &Snapshot, receipt: &Receipt) -> bool {
    snapshot.content == receipt.content && stamp(snapshot).is_ok_and(|s| s == receipt.file)
}
fn marker(receipt: &Receipt) -> (String, String) {
    (
        format!(".masterdata/trash/{}/restored", receipt.id),
        format!("{}\n{}\n", receipt.content, receipt.file),
    )
}
fn retired(root: &Path, trash: &Path, receipt: &Receipt) -> bool {
    let (path, bytes) = marker(receipt);
    capture(root, std::slice::from_ref(&trash.to_path_buf()), &path)
        .is_ok_and(|s| s.bytes.as_ref() == bytes)
}
fn finish_restore(root: &Path, roots: &[PathBuf], trash: &Path, receipt: &Receipt) -> Result<()> {
    if retired(root, trash, receipt) {
        return Ok(());
    }
    let (path, bytes) = marker(receipt);
    let result = create_exclusive(root, trash, &path, Some(&bytes), Fault::None, || {
        if capture(root, roots, &receipt.source).is_ok_and(|s| matches(&s, receipt)) {
            Ok(())
        } else {
            Err(Error::new(
                "E-SOURCE-CONFLICT",
                "restored source changed before confirmation",
            ))
        }
    });
    if result.outcome == Outcome::Success || retired(root, trash, receipt) {
        Ok(())
    } else {
        Err(Error::new("E-OUTCOME-UNKNOWN", result.message))
    }
}
pub fn entries(root: &Path, roots: &[PathBuf]) -> Result<Vec<Entry>> {
    let Some(trash) = directory(root, false)? else {
        return Ok(vec![]);
    };
    let mut result = vec![];
    for item in fs::read_dir(&trash).map_err(io_error)? {
        let item = item.map_err(io_error)?;
        if !item.file_type().map_err(io_error)?.is_dir() {
            continue;
        }
        let id = item.file_name().to_string_lossy().to_string();
        let receipt = read(root, &trash, &id)?;
        let stored = capture(root, std::slice::from_ref(&trash), &receipt.stored);
        let original = capture(root, roots, &receipt.source);
        let state = if retired(root, &trash, &receipt) {
            "Restored"
        } else if stored.as_ref().is_ok_and(|s| matches(s, &receipt)) {
            if fs::symlink_metadata(root.join(&receipt.source)).is_ok() {
                "Conflict"
            } else {
                "Stored"
            }
        } else if original.as_ref().is_ok_and(|s| matches(s, &receipt)) {
            finish_restore(root, roots, &trash, &receipt)?;
            "Restored"
        } else {
            "OutcomeUnknown"
        };
        result.push(Entry {
            id,
            source: receipt.source,
            state: state.into(),
        });
    }
    result.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(result)
}
pub fn archive(
    root: &Path,
    roots: &[PathBuf],
    source: &str,
    expected: &Snapshot,
    authorize: impl FnOnce() -> Result<()>,
) -> Result<(Receipt, WriteResult)> {
    archive_with_fault(root, roots, source, expected, Fault::None, authorize)
}
pub fn archive_with_fault(
    root: &Path,
    roots: &[PathBuf],
    source: &str,
    expected: &Snapshot,
    fault: Fault,
    authorize: impl FnOnce() -> Result<()>,
) -> Result<(Receipt, WriteResult)> {
    let base = preflight(root, roots, source, expected)?;
    let source_root = roots
        .iter()
        .find(|r| base.physical.starts_with(r))
        .ok_or_else(|| Error::new("E-PATH-SCOPE", "source root required"))?;
    let trash = directory(root, true)?.unwrap();
    let entry = tempfile::Builder::new()
        .prefix("entry-")
        .tempdir_in(&trash)
        .map_err(io_error)?;
    let id = entry
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let receipt = Receipt {
        stored: format!(".masterdata/trash/{id}/source.yaml"),
        id,
        source: source.into(),
        content: base.content.clone(),
        file: stamp(&base)?,
    };
    let plan =
        super::path::prepare_transfer(root, source_root, &trash, source, &receipt.stored, &base)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(entry.path().join("receipt.json"))
        .map_err(io_error)?;
    file.write_all(
        &serde_json::to_vec(&receipt).map_err(|e| Error::new("E-TRASH-RECEIPT", e.to_string()))?,
    )
    .map_err(io_error)?;
    file.sync_all().map_err(io_error)?;
    // A preflight/receipt failure must not leave an unreadable empty entry.
    // Keep recovery data only once complete, before a rename can take effect.
    let _retained = entry.keep();
    let result = commit_move(&plan, fault, authorize);
    Ok((receipt, result))
}
pub fn restore(
    root: &Path,
    roots: &[PathBuf],
    id: &str,
    authorize: impl FnOnce() -> Result<()>,
) -> Result<(String, WriteResult)> {
    let trash =
        directory(root, false)?.ok_or_else(|| Error::new("E-TRASH-RECEIPT", "trash is empty"))?;
    let receipt = read(root, &trash, id)?;
    let snapshot = capture(root, std::slice::from_ref(&trash), &receipt.stored)?;
    if !matches(&snapshot, &receipt) {
        return Err(Error::new(
            "E-SOURCE-CONFLICT",
            "trashed file changed; original is preserved",
        ));
    }
    let destination = root.join(relative_safe(&receipt.source)?);
    let destination_root = roots
        .iter()
        .find(|r| destination.starts_with(r))
        .ok_or_else(|| Error::new("E-PATH-SCOPE", "restore escaped source root"))?;
    let plan = super::path::prepare_transfer(
        root,
        &trash,
        destination_root,
        &receipt.stored,
        &receipt.source,
        &snapshot,
    )?;
    let mut result = commit_move(&plan, Fault::None, authorize);
    // A completed restoration must stay completed after the user edits it.
    // Re-inferring history from today's original bytes would later report an
    // ordinary edit as an uncertain deletion and block unrelated authoring.
    if result.outcome == Outcome::Success
        && let Err(error) = finish_restore(root, roots, &trash, &receipt)
    {
        result.outcome = Outcome::OutcomeUnknown;
        result.message = error.to_string();
    }
    Ok((receipt.source, result))
}
