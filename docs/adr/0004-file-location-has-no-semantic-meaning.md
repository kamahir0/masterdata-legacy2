# ADR 0004: File locationはsemantic meaningを持たない

Status: Accepted

## 背景（Context）

Projectはtableを複数fileに分割しても、すべてのYAMLを1つのdirectoryに置いても、feature/teamごとに
fileを整理してもよい。directoryからtable identityを推測すると、無害なfile移動がsemantic changeになる。

## 決定（Decision）

Filesystem locationはdiscovery boundaryに過ぎない。各YAML fileが `kind` と `table` を宣言し、schema fieldと
将来のindex/reference declarationが残りの意味を担う。

## 結果（Consequences）

DiscoveryはProject直下の固定`sources/`をrecursiveにscanし、deterministicなprocessing/hash inputのためにpathをsortする。
source directory内でfileを移動してもtable identityは変わらない。[仕様変更0061](../spec-changes/0061-fixed-source-directory.md)で、不要なroot選択をなくすためscan boundaryを単一の固定directoryへ統一した。これは配下のfolder / filenameへdomain semanticsを与えることを意味しない。current traversalはcycle-safetyのinternal guardとして
symlink entryをfollowしない。source discoveryがsymlinkをfollowするかどうかは、別のproduct Open Questionである。
