// Agentero's Word driver. Independent implementation using Word's scripting dictionary.
// Invoked by the Host with a private JSON input file; no user text is executable code.
ObjC.import("Foundation");

function run(argv) {
  let stage = "read";
  try {
    const input = JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null)));
    const word = Application("com.microsoft.Word");
    if (!word.running() || !word.documents.length) throw Error("word.noDocument");
    const doc = word.documents.byName(word.activeDocument.name());
    function text(value, label) {
      if (value === null) return "";
      if (typeof value !== "string") throw Error("Invalid Word property: " + label + " (" + typeof value + ")");
      return value;
    }
    function snapshot() {
      if (doc.readOnly()) throw Error("word.readOnly");
      if (doc.trackRevisions()) throw Error("word.trackChanges");
      // The prototype deliberately refuses stories it cannot safely enumerate.
      if (doc.footnotes.length || doc.endnotes.length) throw Error("word.notesUnsupported");
      stage = "read fields";
      const fields = [];
      for (let i = 0; i < doc.fields.length; i++) {
        const f = doc.fields[i];
        fields.push({ index: i, code: text(f.fieldCode.content(), "field code"), text: text(f.resultRange.content(), "field result"), start: f.fieldCode.startOfContent(), end: f.resultRange.endOfContent() });
      }
      stage = "read document";
      return { name: text(doc.name(), "name"), path: text(doc.fullName(), "path"), content: text(doc.textObject.content(), "document text"), fields,
        start: word.selection.selectionStart(), end: word.selection.selectionEnd(), story: String(word.selection.storyType()) };
    }
    const current = snapshot();
    if (input.action === "read") return JSON.stringify(current);
    const expected = input.snapshot;
    if (current.name !== expected.name || current.path !== expected.path || current.content !== expected.content || JSON.stringify(current.fields) !== JSON.stringify(expected.fields)) throw Error("word.documentChanged");
    if (current.start !== expected.start || current.end !== expected.end) throw Error("word.selectionChanged");
    // Resolve every target before touching the document. Work backwards so earlier
    // field offsets do not invalidate later ranges. Word owns persistence/Undo.
    const changes = input.changes.slice().sort((a, b) => b.index - a.index);
    for (const change of changes) {
      if (!current.fields[change.index]) throw Error("word.documentChanged");
    }
    stage = "update fields";
    for (const change of changes) {
      const field = doc.fields[change.index];
      field.fieldCode.content = change.code;
      field.resultRange.content = change.text;
      field.showCodes = false;
      if (field.resultRange.content() !== change.text) throw Error("word.insertFailed");
    }
    stage = "insert field";
    if (input.insert) {
      // Existing field updates before the insertion point change its offset.
      let position = expected.start;
      for (const change of changes) {
        const old = current.fields[change.index];
        if (old.end < expected.start) position += change.code.length - old.code.length + change.text.length - old.text.length;
      }
      const range = word.createRange(doc, { start: position, end: position });
      // Word creates ADDIN without a result separator. Start with a field that
      // has a result, then replace its instruction while retaining that range.
      word.createNewField({ textRange: range, fieldType: "field print date", preserveFormatting: false });
      let inserted = null;
      for (let i = 0; i < doc.fields.length; i++) {
        if (doc.fields[i].fieldCode.startOfContent() === position + 1) inserted = doc.fields[i];
      }
      if (!inserted) throw Error("word.insertFailed");
      inserted.fieldCode.content = input.insert.code;
      inserted.resultRange.content = input.insert.text;
      if (inserted.resultRange.content() !== input.insert.text) throw Error("word.insertFailed");
      inserted.showCodes = false;
      stage = "move cursor";
      const end = inserted.resultRange.endOfContent() + 1;
      word.selection.selectionStart = end;
      word.selection.selectionEnd = end;
    }
    stage = "activate";
    word.activate();
    return JSON.stringify({ ok: true });
  } catch (e) { throw Error(stage + ": " + e.message); }
}
