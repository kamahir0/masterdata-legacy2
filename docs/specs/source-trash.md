# Source Trash

Status: Approved

### SOURCE-TRASH-001

明示したexisting source fileまたはfolderをProject内のsource discovery外trashへ退避し、exact bytes、空folderを含む全内容、元path、identityと復元receiptを保持する。shared application/native境界が操作を所有する。対象と配下のdirtyだけまとめたSave/Don't Save/Cancel guardを適用し、他sourceのbufferを保持する。Recovery Requiredと未確認writeでは停止する。永久削除と自動purgeは提供しない。

### SOURCE-TRASH-002

退避と元pathへの復元はfresh source/parent identity、byte identity、symlink/root boundary、destination no-overwriteを確認する。occupiedな元pathへ復元してはならない。Success / Conflict / Failure / Outcome Unknownを区別し、Unknownではblind retryせず両pathを再確認する。receiptは再起動後も復元経路を持つ。Table/Typeの参照先contentを暗黙修正しない。成功後にinventory/diagnostics/selectionを更新する。
