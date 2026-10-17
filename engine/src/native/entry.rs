//! Filesystem entry operations preserve bytes and empty directories without
//! requiring YAML/domain validity. Mutation uses the existing exclusive rename.
use super::*;

pub fn capture(root: &Path, roots: &[PathBuf], logical: &str) -> Result<Snapshot> {
    let path = checked_path(root, roots, logical)?;
    let metadata = fs::symlink_metadata(&path).map_err(io_error)?;
    if !metadata.is_dir() {
        return super::capture(root, roots, logical);
    }
    let file = path_identity(&path).map_err(io_error)?;
    let parent = path_identity(path.parent().unwrap()).map_err(io_error)?;
    let mut entries = Vec::new();
    fingerprint(root, roots, &path, &path, &mut entries)?;
    let bytes = serde_json::to_string(&entries)
        .map_err(|e| Error::new("E-PATH-SNAPSHOT", e.to_string()))?;
    if file != path_identity(&path).map_err(io_error)?
        || parent != path_identity(path.parent().unwrap()).map_err(io_error)?
    {
        return Err(Error::new(
            "E-SOURCE-CHANGED",
            "folder identity changed during read",
        ));
    }
    Ok(Snapshot {
        physical: path.canonicalize().map_err(io_error)?,
        path,
        content: content_identity(bytes.as_bytes()),
        bytes: bytes.into(),
        directory: true,
        file: Arc::new(file),
        parent: Arc::new(parent),
        permissions: metadata.permissions(),
    })
}
fn fingerprint(
    root: &Path,
    roots: &[PathBuf],
    base: &Path,
    path: &Path,
    entries: &mut Vec<(String, bool, String)>,
) -> Result<()> {
    let logical = path
        .strip_prefix(root)
        .map_err(|e| Error::new("E-PATH-SCOPE", e.to_string()))?
        .to_string_lossy()
        .replace('\\', "/");
    checked_path(root, roots, &logical)?;
    let meta = fs::symlink_metadata(path).map_err(io_error)?;
    if path_alias(&meta) {
        return Err(Error::new(
            "E-PATH-ALIAS",
            "symlink entry cannot authorize writes",
        ));
    }
    let name = path
        .strip_prefix(base)
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    if meta.is_dir() {
        entries.push((name, true, String::new()));
        let mut children = fs::read_dir(path)
            .map_err(io_error)?
            .collect::<std::io::Result<Vec<_>>>()
            .map_err(io_error)?;
        children.sort_by_key(|entry| entry.file_name());
        for child in children {
            fingerprint(root, roots, base, &child.path(), entries)?;
        }
    } else if meta.is_file() {
        let bytes = fs::read(path).map_err(io_error)?;
        checked_path(root, roots, &logical)?;
        entries.push((name, false, content_identity(&bytes)));
    } else {
        return Err(Error::new(
            "E-PATH-KIND",
            "ordinary file or folder required",
        ));
    }
    Ok(())
}
pub fn preflight(
    root: &Path,
    roots: &[PathBuf],
    logical: &str,
    expected: &Snapshot,
) -> Result<Snapshot> {
    let actual = capture(root, roots, logical)?;
    if !actual.matches(expected) {
        return Err(Error::new(
            "E-SOURCE-CONFLICT",
            "entry changed after preflight",
        ));
    }
    Ok(actual)
}

#[derive(Clone, Debug)]
pub struct CopyPlan {
    pub source: String,
    pub destination: String,
    original: Snapshot,
    transfer: MovePlan,
    _stage: Arc<tempfile::TempDir>,
}
fn copy_tree(root: &Path, roots: &[PathBuf], source: &Path, destination: &Path) -> Result<()> {
    let logical = source
        .strip_prefix(root)
        .map_err(|e| Error::new("E-PATH-SCOPE", e.to_string()))?
        .to_string_lossy()
        .replace('\\', "/");
    checked_path(root, roots, &logical)?;
    let metadata = fs::symlink_metadata(source).map_err(io_error)?;
    if path_alias(&metadata) {
        return Err(Error::new("E-PATH-ALIAS", "cannot copy a symlink"));
    }
    if metadata.is_dir() {
        fs::create_dir(destination).map_err(io_error)?;
        for child in fs::read_dir(source).map_err(io_error)? {
            let child = child.map_err(io_error)?;
            copy_tree(
                root,
                roots,
                &child.path(),
                &destination.join(child.file_name()),
            )?;
        }
    } else if metadata.is_file() {
        let mut input = fs::OpenOptions::new();
        input.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            input.custom_flags(libc::O_NOFOLLOW);
        }
        let mut input = input.open(source).map_err(io_error)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(io_error)?;
        std::io::copy(&mut input, &mut output).map_err(io_error)?;
        output.sync_all().map_err(io_error)?;
    } else {
        return Err(Error::new("E-PATH-KIND", "ordinary entry required"));
    }
    fs::set_permissions(destination, metadata.permissions()).map_err(io_error)?;
    Ok(())
}
pub fn prepare_copy(
    root: &Path,
    roots: &[PathBuf],
    source: &str,
    destination: &str,
) -> Result<CopyPlan> {
    let original = capture(root, roots, source)?;
    let selected = roots
        .iter()
        .find(|p| original.physical.starts_with(p))
        .ok_or_else(|| Error::new("E-PATH-SCOPE", "source root required"))?;
    let target = creation_path(root, selected, destination)?;
    if original.path == *selected || original.directory && target.starts_with(&original.path) {
        return Err(Error::new(
            "E-PATH-SCOPE",
            "cannot copy a root or copy a folder into itself",
        ));
    }
    match fs::symlink_metadata(&target) {
        Ok(_) => {
            return Err(Error::new(
                "E-PATH-CONFLICT",
                "destination exists; no overwrite",
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(io_error(e)),
    }
    let storage = storage_directory(root, "copies", true)?.unwrap();
    let stage = tempfile::Builder::new()
        .prefix("copy-")
        .tempdir_in(&storage)
        .map_err(io_error)?;
    let entry = stage.path().join("entry");
    copy_tree(root, roots, &original.path, &entry)?;
    preflight(root, roots, source, &original)?;
    let staged = entry
        .strip_prefix(root)
        .unwrap()
        .to_string_lossy()
        .replace('\\', "/");
    let base = capture(root, std::slice::from_ref(&storage), &staged)?;
    if base.bytes != original.bytes {
        return Err(Error::new(
            "E-SOURCE-CONFLICT",
            "copied contents differ from the captured source",
        ));
    }
    let transfer =
        super::path::prepare_transfer(root, &storage, selected, &staged, destination, &base)?;
    Ok(CopyPlan {
        source: source.into(),
        destination: destination.into(),
        original,
        transfer,
        _stage: Arc::new(stage),
    })
}
pub fn commit_copy(
    root: &Path,
    roots: &[PathBuf],
    plan: &CopyPlan,
    fault: Fault,
    authorize: impl FnOnce() -> Result<()>,
) -> WriteResult {
    let mut result = super::commit_move(&plan.transfer, fault, || {
        authorize()?;
        preflight(root, roots, &plan.source, &plan.original).map(|_| ())
    });
    result.source = plan.source.clone();
    result
}
pub fn observe_copy(plan: &CopyPlan) -> WriteResult {
    let mut result = super::observe_move(&plan.transfer);
    result.source = plan.source.clone();
    result
}

pub(crate) fn validate_copy(root: &Path, roots: &[PathBuf], plan: &CopyPlan) -> Result<()> {
    preflight(root, roots, &plan.source, &plan.original)?;
    plan.transfer.fresh()
}
