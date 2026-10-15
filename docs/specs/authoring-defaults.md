# Authoring Defaults

Status: Approved

### AUTHORING-DEFAULT-001

明示Add Row / Array item / Custom / nullable materializeで、共有Rustがresolved shapeから初期値を構成する。primitiveはfalse / 0 / 空文字、nullableはnull、Arrayは空sequence、Customはfieldごとに再帰、Enumは定義済みzero優先（なければ宣言順先頭）、Flagsは[None]。nullableを明示materializeする場合だけrootのnull許容を外して初期値を作る。新規Custom fieldの一時initializerにも同じdefaultとFlags選択制御を使い、保存前の値は編集できる。既存sourceの暗黙defaultやvalidation semanticsを変更しない。opening/navigationだけでは生成しない。

### AUTHORING-DEFAULT-002

新recordのunique keyは全sourceのcurrent bufferを含むkey集合に衝突しない候補を共有Rustが選ぶ。composite keyとunique secondaryを含み、候補が尽きる等、安全に構成できなければoperationを拒否しbuffer/historyを保持する。frontendへ型解釈やkey allocationを複製しない。

### AUTHORING-DEFAULT-003

FlagsのNone選択は他の既知bitを解除し、bit選択はNoneを解除し、最後のbit解除はNoneへ戻す。各操作は一Undo単位。既存unknown memberは通常toggleだけで削除せず、明示修復と区別する。None単独の解除等のno-opはhistoryを増やさない。
