# GUI仕様: Workspace Explorer

Status: Approved

## 目的

Project内のsource workspaceをVS Codeに近いfile / folder treeとして左ペインに表示し、利用者が編集対象sourceを選択できるようにする。
Explorerはdomain treeではなくworkspace navigationであり、folder配置そのものへTable / Value Object / Enum等のsemantic meaningを追加しない。

## レイアウト（Layout）

### GUI-EXPLORER-001

Desktop authoring画面は左側にWorkspace Explorerを持たなければならない（MUST）。ExplorerはProject直下の固定`sources/`内のfile / folder hierarchyのみを密なtreeとして表示し、中央typed editorとは独立したnavigation surfaceとして扱う。folder展開、file選択、dirty / loading / error状態は該当行で識別できなければならない（MUST）。

固定`sources/`自体の冗長なfolder行を省略し、直下のfile / folderをtop levelのindentで表示する。表示省略によってphysical path、creation destination、selection identityを変更してはならない（MUST NOT）。

file / folderは密な全幅行とし、folderを先に自然順で並べる。通常のfilenameを一律に太字 / cardにせず、ellipsisとfull-path tooltip、控えめなdepth guideを使う。selected行はExplorerのfocus有無で強さを変え、keyboard focusは別のoutlineで示す。

`sources/`外の`.masterdata/output`、cache、generated artifact等をExplorerのsource treeへ暗黙に混在させてはならない（MUST NOT）。source配置と設定拒否は[PROJECT-SOURCE-003](../../specs/project-layout.md#project-source-003)に従う。Open失敗で現在のworkspace / dirty bufferを破棄しない。

### GUI-EXPLORER-002

fileを選択した場合、中央main areaはそのsource documentに対応するtyped editorまたはunsupported/read-only stateを表示しなければならない（MUST）。editor種別の判定はfolder名・folder位置ではなく、既存のsource semanticsとdocument kindに従わなければならない（MUST）。
Table schema sourceとそのTableのData sourceは[Unified Table Editor](../table-editor/spec.md)の同一Table面へrouteする。file選択は初期record setを指定するが、Explorerのtreeと選択表示はsource fileに徹する。

### GUI-EXPLORER-003

初期record authoring sliceでは、record Data documentを選択した場合に[Data Editor](../data-editor/spec.md)を開かなければならない（MUST）。現在のObjectiveで専用editorを持たないdocument kindまたは非Masterdata fileを、別kindとして誤解釈して編集可能にしてはならない（MUST NOT）。

省略した単一rootのインデントとleafの空の展開markerは残さない。同じ階層のfile / folderのiconとfilenameを揃え、leafに展開操作を残さない。source kind/categoryをshared inventoryから異なるiconとaccessibleな種別で識別し、未解決fileの種別を推測しない。

### GUI-EXPLORER-LAYOUT-004

Explorerはpointerとkeyboardで幅を変更できる。headerを固定しtree viewportだけをscrollする。長い一覧のrenderingはviewport相応にboundedとし、scroll中のancestor folderを表示してそこへ戻れる。通常のcollapse / revealとreduced motionは[GUI-SHELL-PRESENTATION-002](../app-shell.md#gui-shell-presentation-002)を維持する。幅のdragはpointerへ即座に追従し、keyboard操作でも同じ範囲を使う。

## 状態（States）

### GUI-EXPLORER-STATE-001

source data fileのdirty stateはfile単位でExplorerから識別可能でなければならない（MUST）。別fileのdirty stateは独立して表示・保持しなければならない（MUST）。

### GUI-EXPLORER-STATE-002

loading、save in progress、save failure、Conflict、Outcome Unknown等のsource stateは、単なるfile selectionと区別して識別できなければならない（MUST）。exact icon / colorは固定しないが、色だけを唯一の状態伝達手段にしてはならない（MUST NOT）。

### GUI-EXPLORER-STATE-003

cleanなsource fileが外部変更されて再読込された場合、Explorer selectionを可能な範囲で維持しなければならない（MUST）。dirty fileの外部変更はData Editorと[Source Record Edit](../../specs/source-edit.md)のConflict lifecycleへrouteし、dirty stateを暗黙に消してはならない（MUST NOT）。

### GUI-EXPLORER-STATE-004

rename / move実行中、Explorerはtarget source fileのpath mutationが進行中であることを識別可能にしなければならない（MUST）。Success前にdestination pathを確定したcurrent sourceとして編集可能に表示してはならない（MUST NOT）。

Success後はworkspaceをshared application authorityから更新し、selected / open target sourceをnew pathへ追従させなければならない（MUST）。old pathのclean editor snapshotをcurrent editable sourceとして残してはならず（MUST NOT）、unrelated dirty bufferは保持しなければならない（MUST）。

## 操作（Interactions）

### GUI-EXPLORER-INT-001

file selectionは対応するtyped editorを開かなければならない（MUST）。record / Tableのdomain selectionをfilesystem pathのsemantic identityとして扱ってはならない（MUST NOT）。

Explorer文脈からNew artifact / New folder、Refresh、Collapse、source Rename / Moveへ到達できなければならない（MUST）。生成とpath mutation、folder inventoryはshared application authorityへ委譲する。treeのArrow Up / Down / Left / Right、Home / End、Enter、Rename / Move shortcutはkeyboardで操作でき、選択fileから編集領域へfocusを移せなければならない（MUST）。

### GUI-EXPLORER-NAV-001

同一Project内のselectionは、backend completionを待たずExplorerのselected stateとmain surfaceのnew targetを反映する。fresh view待ちではnew targetとpending / unavailableを識別し、old source contentをnew targetのcurrent contentとして表示してはならない（MUST NOT）。rapid selectionではlatest targetだけをactiveにし、obsolete responseで巻き戻してはならない（MUST NOT）。selectionだけでdirty buffer、history、query state、schema draftを破棄してはならない（MUST NOT）。cached viewのediting capabilityを有効にする前にshared Applicationがrelevant sourceのfreshnessとcurrent projectionを確認する。

### GUI-EXPLORER-INT-002

folderはexpand / collapseできなければならず（MUST）、file / folder selectionとexpand stateを区別しなければならない（MUST）。folder名のclickはselectionとexpand / collapseを行い、twistieとLeft / Rightはexpand stateを操作する。矢印移動によるfocusだけではmain editorを切り替えない。通常のfile switchingだけを理由にdirty bufferのSave確認を出してはならない（MUST NOT）。

### GUI-EXPLORER-INT-003

Project切替、Project Reload、window close等、dirty bufferを失う可能性がある上位操作はData Editor specificationの`Save All` / `Don't Save` / `Cancel` lifecycleに従わなければならない（MUST）。Explorer独自の別unsaved-changes policyを実装してはならない（MUST NOT）。

### GUI-EXPLORER-INT-004

Explorer上端はNew fileのkind menu、New folder、Refresh、Collapse all、その他の全体操作を持つ。行 / 空白のcontext menuはその場所のpathをtargetに固定し、別fileのeditor selectionで対象を変えない。

同じfolder内のRenameはfile行のmenu / context menu / F2から、同じ行のfilename入力で開始する。初期選択は拡張子を除くstem。Enterは最新preflightを待って確定し、Escape、空入力の外側click、変更なしはCancel。入力済みの外側clickは確定し、validation / Conflict / Failureでは入力を保持する。IME compositionで誤確定しない。Outcome Unknownでは同じ行からold / new pathをRecheckでき、blind retry / Cancelで結果を隠さない。

Moveはfile menuまたはfile dragから既存のpath reviewを開く。dragのfolder / 空白destinationをformへ提案し、Applyまではpathを変更しない。folder自身のmutationや、外部fileのdropは提供しない。Rename / Moveは同じshared application operation、dirty guard、recovery lifecycleを使う。

Workspace Explorerはexisting Masterdata source fileに対するRename / Move actionを提供しなければならない（MUST）。destinationは固定`sources/`内のfolder / filenameとして指定できなければならず（MUST）、root selectorを出さない。表示上の基点は`ソース直下`とし、実際のpathは確認できるようにする。候補folderが1つならselectorにしない。

frontendはfolder配置またはfilenameからTable / Type identity changeを推測してはならない（MUST NOT）。

### GUI-EXPLORER-INT-005

target source fileがdirtyな場合、Rename / Move開始前に`Save` / `Don't Save` / `Cancel`を選択できなければならない（MUST）。

- `Save`: target fileだけを通常Saveし、Successした場合だけRename / Moveへ進む。Conflict / Failure / Outcome Unknownではpath mutationへ進まずlocal bufferを保持する。
- `Don't Save`: target fileのlocal dirty bufferを明示的に破棄してclean workspace sourceをrename / move対象とする。
- `Cancel`: path mutationを開始せずlocal bufferを保持する。

unrelated dirty filesへこの確認を適用してはならず（MUST NOT）、それらを暗黙Save / Discardしてはならない（MUST NOT）。

### GUI-EXPLORER-INT-006

Rename / Move成功後も、source documentはdocument kindとdeclared domain identityに従う同じtyped editorへrouteされなければならない（MUST）。case-only renameも通常のSuccess lifecycleを使用しなければならない（MUST）。

destination ConflictではOverwrite actionを提示してはならず（MUST NOT）、destination変更またはCancelへ戻れるようにしなければならない（MUST）。

### GUI-EXPLORER-INT-007

Explorerはpathのfilter、fileの名前 / shared categoryによるsort、active fileのReveal、relative / absolute pathのCopyを提供する。sortでもfolder先行を維持する。filterはshared inventoryの表示を絞り込むだけで、source、selection、main editor、dirty bufferを変更しない。filter解除で通常のexpand stateを復元する。Revealはfilterを解除しcurrent targetのancestorを展開してscroll / focusする。pathのCopyはdomain identityを推論・変更しない。

## キーボード（Keyboard）

### GUI-EXPLORER-KEY-001

Explorer treeはkeyboardだけでitem間移動、folder expand / collapse、file openを行えなければならない（MUST）。Arrow key / Enter等のplatform-standard tree interactionを基本とし、exact implementationが異なる場合も同等のkeyboard-only操作を失ってはならない（MUST NOT）。

Home / End、Page Up / Page Down、F2、文字入力によるtree item検索を提供する。Cmd/Ctrl+Shift+EはExplorerへ移動し、F6はmain editorとの往復、Explorer focus中のCmd/Ctrl+Fはfilterを開く。filename等のinput、menu、IME compositionへtreeのshortcutを横取りしない。

Save shortcutは現在activeなeditor/fileへ委譲し、Explorer focus中であることだけを理由に別fileを保存してはならない（MUST NOT）。

## フォーカス（Focus）

### GUI-EXPLORER-FOCUS-001

Explorerでfileを開いた場合、中央editorへ移動できる明確なkeyboard pathを持たなければならない（MUST）。editorからExplorerへ戻った場合は、可能な範囲で最後に選択していたtree itemへfocusを復元しなければならない（MUST）。

## 検証（Validation）

### GUI-EXPLORER-VAL-001

ExplorerはYAMLやdomain semanticsをfrontend独自にparse / validateしてはならない（MUST NOT）。document classification、validation、structured diagnosticはshared application/domain boundaryから受け取らなければならない（MUST）。

現在のfile / subtreeにdiagnosticがあることをExplorer上でbadge等により補助表示してよい（MAY）が、初期sliceではProblems panelがcanonical detail surfaceであり、Explorer badgeを必須にしない。

## エラー（Errors）

### GUI-EXPLORER-ERR-001

filesystem I/O、permission、path safety、source classification、external modification等でfileを開けない場合、既存のdirty bufferや他file selection stateを不必要に破壊してはならない（MUST NOT）。利用者が原因を確認できるstructured error stateを表示しなければならない（MUST）。

### GUI-EXPLORER-ERR-002

[Source Path Mutation](../../specs/source-path-mutation.md)の`Conflict`、`Failure`、`Outcome Unknown`をSuccessとして表示してはならない（MUST NOT）。Outcome Unknownではold / new両pathのactual stateをRecheck / Reloadできるrecovery pathを提示し、recheck前に同じRename / Moveを自動retryしてはならない（MUST NOT）。

Failure / Conflictによってunrelated dirty buffer、Explorer state、別source fileを不必要に破壊してはならない（MUST NOT）。

## アクセシビリティ（Accessibility）

### GUI-EXPLORER-A11Y-001

Treeとしてのrole、selection、expanded / collapsed、dirty、Conflict等のstateをassistive technologyから識別可能にしなければならない（MUST）。状態伝達を視覚上の色やiconだけに依存させてはならない（MUST NOT）。

## 参照artifact（Reference Artifacts）

None.

## Mutation boundary

creationは[Source Creation](../source-creation/spec.md)、file rename / moveは[Source Path Mutation](../../specs/source-path-mutation.md)が所有する。delete / duplicate、folder rename / move、multi-file transactionは追加contractが整った時点で別途仕様化する。未対応commandを実行可能なmenuとして提示しない。

## 未解決事項（Open Questions）

None identified for the current Explorer contract. Source file delete / duplicate、folder rename / move、diagnostic aggregation badge、favorite / recent source等は将来UXとして別途扱う。
