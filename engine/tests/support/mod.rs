//! Temporary test Projects use the current config shape while the frozen oracle
//! retains its original bytes. YAML inputs and expected source bytes are copied
//! without normalization; production has no fixture compatibility mode.
use std::{fs, io, path::Path};

pub fn current_config(bytes: &[u8]) -> Vec<u8> {
    let text = std::str::from_utf8(bytes).unwrap();
    let mut output = String::new();
    let mut source_section = false;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            source_section = trimmed == "[sources]";
        }
        if source_section {
            if trimmed.starts_with("roots") {
                assert_eq!(
                    trimmed.replace(' ', ""),
                    "roots=[\"sources\"]",
                    "frozen test config has a nonstandard source setting"
                );
            }
        } else {
            output.push_str(line);
        }
    }
    output.into_bytes()
}

pub fn copy_file(from: impl AsRef<Path>, to: impl AsRef<Path>) -> io::Result<u64> {
    let (from, to) = (from.as_ref(), to.as_ref());
    if from
        .file_name()
        .is_some_and(|name| name == "masterdata.toml")
    {
        let bytes = current_config(&fs::read(from)?);
        fs::write(to, &bytes)?;
        Ok(bytes.len() as u64)
    } else {
        fs::copy(from, to)
    }
}

pub fn copy(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            copy(&entry.path(), &to.join(entry.file_name()))?;
        } else {
            copy_file(entry.path(), to.join(entry.file_name()))?;
        }
    }
    Ok(())
}
