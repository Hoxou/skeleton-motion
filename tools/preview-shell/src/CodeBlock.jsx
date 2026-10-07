import React, { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Text from "@tiptap/extension-text";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import plaintext from "highlight.js/lib/languages/plaintext";
import xml from "highlight.js/lib/languages/xml";
import styles from "./CodeBlock.module.css";

// Only the grammars the exports use; the room ships as one self-contained file.
const lowlight = createLowlight({ javascript, plaintext, xml });

const CodeDocument = Document.extend({ content: "codeBlock" });

function toDoc(code, language) {
  return {
    type: "doc",
    content: [{ type: "codeBlock", attrs: { language }, content: code ? [{ type: "text", text: code }] : [] }],
  };
}

/**
 * Read-only, syntax-highlighted code view.
 *
 * @param {{ code: string, language: "javascript" | "xml" | "plaintext", label: string, className?: string }} props
 */
export default function CodeBlock({ className = "", code, label, language }) {
  const editor = useEditor({
    content: toDoc(code, language),
    editable: false,
    editorProps: { attributes: { "aria-label": label, "aria-readonly": "true", role: "textbox" } },
    extensions: [CodeDocument, Text, CodeBlockLowlight.configure({ lowlight })],
  });

  useEffect(() => {
    const block = editor?.state.doc.firstChild;
    // Skipping redundant updates keeps the reader's scroll position and text selection.
    if (!editor || (block?.textContent === code && block.attrs.language === language)) return;
    editor.commands.setContent(toDoc(code, language));
  }, [editor, code, language]);

  return <EditorContent className={`${styles.code} ${className}`} editor={editor} />;
}
