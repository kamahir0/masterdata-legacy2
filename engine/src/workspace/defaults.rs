use super::*;
use crate::semantic::{Key, Type, Types};
use crate::source::{Node, render_block};

pub(super) fn value(shape: &Shape, types: &Types) -> Result<Value> {
    if shape.nullable {
        return Ok(Value::Null);
    }
    if shape.array {
        return Ok(Value::Sequence(vec![]));
    }
    match shape.category.as_str() {
        "custom" => Ok(Value::Mapping(
            shape
                .fields
                .iter()
                .map(|(f, s)| Ok((f.name.clone(), value(s, types)?)))
                .collect::<Result<_>>()?,
        )),
        "flags" => Ok(Value::Sequence(vec![Value::Text("None".into())])),
        "enum" => {
            let Some(Type::Enum { members, .. }) = types.get(&shape.type_name) else {
                return Err(Error::new("E-TYPE-UNRESOLVED", &shape.type_name));
            };
            let symbol = members
                .iter()
                .find(|(_, n)| n.parse::<i128>() == Ok(0))
                .or_else(|| members.first())
                .ok_or_else(|| Error::new("E-ENUM-MEMBER", "Enum has no member"))?;
            Ok(Value::Text(symbol.0.clone()))
        }
        _ => Ok(
            match shape.underlying.as_deref().unwrap_or(&shape.type_name) {
                "string" => Value::Text(String::new()),
                "bool" => Value::Literal("false".into()),
                "float" | "double" => Value::Literal("0.0".into()),
                _ => Value::Literal("0".into()),
            },
        ),
    }
}
fn signature(
    node: &Node,
    key: &Key,
    table: &Table,
    types: &Types,
) -> Option<Vec<semantic::KeyPart>> {
    key.fields
        .iter()
        .map(|name| {
            let field = table.fields.iter().find(|f| &f.name == name)?;
            let value = semantic::interpret(field, node.get(name)?, types).ok()?;
            semantic::key_part(&value, field, types).ok()
        })
        .collect()
}

fn candidate(field: &Field, mut index: usize, types: &Types) -> Result<(Value, usize)> {
    let mut shape = semantic::shape(field, types)?;
    shape.nullable = false;
    if shape.category == "enum" {
        let count = shape.members.len();
        if count == 0 {
            return Err(Error::new("E-DEFAULT-KEY", "Enum has no candidate"));
        }
        let result = Value::Text(shape.members[index % count].clone());
        index /= count;
        return Ok((result, index));
    }
    let base = shape.underlying.as_deref().unwrap_or(&shape.type_name);
    if base == "bool" {
        return Ok((
            Value::Literal(
                if index.is_multiple_of(2) {
                    "false"
                } else {
                    "true"
                }
                .into(),
            ),
            index / 2,
        ));
    }
    if base == "string" {
        return Ok((
            Value::Text(if index == 0 {
                String::new()
            } else {
                index.to_string()
            }),
            0,
        ));
    }
    semantic::integer_value(&index.to_string(), base)
        .map_err(|e| Error::new("E-DEFAULT-KEY", e.message))?;
    Ok((Value::Literal(index.to_string()), 0))
}
impl Workspace {
    pub(super) fn new_record_value(&self, table: &Table, types: &Types) -> Result<Value> {
        let keys = std::iter::once(&table.primary)
            .chain(table.secondary.iter().filter(|k| !k.non_unique))
            .collect::<Vec<_>>();
        let mut used = vec![BTreeSet::new(); keys.len()];
        let mut count: usize = 0;
        for source in self
            .read
            .sources
            .values()
            .filter(|s| s.binding.as_deref() == Some(&table.name))
        {
            let doc = self.current_doc(&source.path)?;
            let Some(records) = doc.root.get("records") else {
                continue;
            };
            for row in records.items()? {
                count += 1;
                for (i, key) in keys.iter().enumerate() {
                    if let Some(key) = signature(&row.value, key, table, types) {
                        used[i].insert(key);
                    }
                }
            }
        }
        let mut fields = table
            .fields
            .iter()
            .map(|f| Ok((f.name.clone(), value(&semantic::shape(f, types)?, types)?)))
            .collect::<Result<Vec<_>>>()?;
        let limit = (count + 1)
            .saturating_mul(keys.len().max(1))
            .saturating_mul(2);
        for _ in 0..=limit {
            let doc = Document::parse(format!(
                "{}\n",
                render_block(&Value::Mapping(fields.clone()), 0, "\n")?
            ))?;
            let conflict = keys.iter().enumerate().find(|(i, key)| {
                signature(&doc.root, key, table, types).is_none_or(|s| used[*i].contains(&s))
            });
            let Some((at, key)) = conflict else {
                return Ok(Value::Mapping(fields));
            };
            let mut found = false;
            // Try beyond a dense 0-based key set before searching its holes;
            // parsing every occupied candidate made Add scale with its max ID.
            'candidate: for ordinal in std::iter::once(count).chain(0..=count + 1) {
                let mut n = ordinal;
                let mut proposal = fields.clone();
                for name in key.fields.iter().rev() {
                    let field = table
                        .fields
                        .iter()
                        .find(|f| &f.name == name)
                        .ok_or_else(|| Error::new("E-DEFAULT-KEY", "key field missing"))?;
                    let (v, next) = match candidate(field, n, types) {
                        Ok(value) => value,
                        Err(_) if ordinal == count && count > 0 => continue 'candidate,
                        Err(error) => return Err(error),
                    };
                    n = next;
                    proposal.iter_mut().find(|(f, _)| f == name).unwrap().1 = v;
                }
                if n != 0 {
                    continue;
                }
                let doc = Document::parse(format!(
                    "{}\n",
                    render_block(&Value::Mapping(proposal.clone()), 0, "\n")?
                ))?;
                if signature(&doc.root, key, table, types).is_some_and(|s| !used[at].contains(&s)) {
                    fields = proposal;
                    found = true;
                    break;
                }
            }
            if !found {
                return Err(Error::new(
                    "E-DEFAULT-KEY",
                    "重複しないキーを割り当てられません。既存レコードを確認してください。",
                ));
            }
        }
        Err(Error::new(
            "E-DEFAULT-KEY",
            "unique key constraints cannot be satisfied",
        ))
    }
}
