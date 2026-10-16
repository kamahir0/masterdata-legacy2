# Table Declaration Mutation仕様

Status: Approved

このownerは[Unified Table](../gui/table-editor/spec.md)の低頻度structural declaration authoringを定義する。[Table / Key](table-and-keys.md)、[Reference](index-and-reference.md)がdeclaration semanticsを所有する。Migration v1のoperation setを変更せず、[Migration safety](schema-migration.md)、[source preservation](source-edit.md)、[field declaration draft](field-declaration-mutation.md)と境界を分離する。承認記録は[仕様変更0054](../spec-changes/0054-table-declaration-authoring.md)。

## 規範要件

### TABLE-DECL-001

Table declaration authoringは、existing fieldのMessagePack key変更、Primary Keyのordered component置換、Secondary Keyのadd/edit/remove、Referenceのadd/edit/removeを提供する（MUST）。logical Table identityとschema sourceをshared serviceが解決し、既存entryはcaptured sourceのexact occurrenceで特定する（MUST）。MessagePack key、generated indexNo、Reference target、pathを別のlogical identityの代用にしない（MUST NOT）。

### TABLE-DECL-002

mutationは対象schema sourceの必要なdeclaration spansだけを変更する（MUST）。record source bytes、inline records、fields / sibling declarationsの非対象presentationを保持し、既存flow syntaxの安全な局所変更と新規block mappingは`SOURCE-EDIT-018`に従う。安全なsource location・ownership・postconditionを証明できなければfail closedとする（MUST）。table全体をgeneric serializeしてはならない（MUST NOT）。

### TABLE-DECL-003

操作はcurrent sourceと関連draftから構成し、[Ordinary Structural Authoring](structural-authoring.md)へ従う。既存dirtyをSave / Discardしてから編集することを要求せず、非対象のbuffer / historyを保持する。

### TABLE-DECL-004

new / changed declarationはshared canonical validatorで診断する。semantic errorや未解決dependencyは安全な局所編集を拒否する理由にしない。record valueを自動変換・修復せず、Buildのstrict validationを維持する。

### TABLE-DECL-005

編集は対象を明示してdraftへ適用し、一Undoで復元する。disk write、stale / conflict / Unknown / Recovery RequiredはSource EditとOrdinary Structural AuthoringのSave安全境界へ従う。

### TABLE-DECL-006

advanced Table detailは既存GUIのprogressive disclosureに従い、field MessagePack key、ordered Key components / uniqueness、Reference name / source fields / target / helper overrideを操作できる（MUST）。cardinality、optionality、effective C# helper名、diagnosticsはshared Rustのresolved presentationから示す（MUST）。詳細を開いたことだけでdirtyにせず、ordinary selectionのproject-wide workゼロ、bounded controls、single active editorを維持する。Frontendでdeclarationの意味を再構築しない（MUST NOT）。

## 受け入れ証拠

source exact bytes、flow / CRLF / quote / inline / sibling preservation、Key order / Reference resolution、dirty guard / stale closure / binding / fault / destructive authorization、actual Desktop detailとfinal Candidate consumerを照合する。record-level invalid draftをProject-wide error-free gateへ変えない。
