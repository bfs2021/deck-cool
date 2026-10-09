"use client";

import { useEffect, useRef, useState } from "react";

const COPIED_MS = 2000;

/**
 * The install line and its copy button. The command reads and selects with no
 * script; the button is hidden until this island hydrates in a browser that
 * has a clipboard, so it never shows as a control that does nothing.
 */
export default function CopyInstall({ command }: { command: string }) {
  const [clipboard, setClipboard] = useState(false);
  const [label, setLabel] = useState("Copy");
  const [status, setStatus] = useState("");
  const code = useRef<HTMLElement>(null);
  const restore = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setClipboard(navigator.clipboard !== undefined);
    return () => clearTimeout(restore.current);
  }, []);

  function copy() {
    navigator.clipboard.writeText(command).then(
      () => {
        setLabel("Copied");
        setStatus(`Copied ${command} to the clipboard.`);
      },
      () => {
        setLabel("Press to select");
        setStatus("The clipboard refused. Select the command to copy it.");
        if (code.current === null) return;
        const range = document.createRange();
        range.selectNodeContents(code.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      },
    );
    clearTimeout(restore.current);
    restore.current = setTimeout(() => {
      setLabel("Copy");
      setStatus("");
    }, COPIED_MS);
  }

  return (
    <div className="pd-install">
      <code ref={code} className="pd-install__command">
        {command}
      </code>
      <button type="button" className="pd-install__copy" hidden={!clipboard} onClick={copy}>
        {label}
      </button>
      <span className="pd-visually-hidden" role="status">
        {status}
      </span>
    </div>
  );
}
