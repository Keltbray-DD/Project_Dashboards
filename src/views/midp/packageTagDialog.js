// "Tag for package" dialog: adds one package tag to the selected files'
// Tags (or clears their package tags), shows progress and per-file
// failures with Retry, then hands off to Forma — copy the tag, open the
// Files tool, filter on it, Add to package. See data/packageTags.js.

import { projectFilesUrl } from "../../data/fileRows.js";
import { addPackageTag, clearPackageTags, isValidPackageTag, previewTagWrite, writeTags } from "../../data/packageTags.js";
import { h, icon, mount } from "../../ui/dom.js";
import { formatNumber } from "../../ui/format.js";
import { toast } from "../../ui/toast.js";

const files = (n) => `${formatNumber(n)} file${n === 1 ? "" : "s"}`;

// options:
//   rows        selected table rows (each a document's current file)
//   defaultTag  suggested tag (makePackageTag)
//   attrId      Forma attribute id of Tags
//   aps, projectId
//   onWritten   ([{ row, value }]) => void after each run, for the rows written
//   onShowTag   (tag) => void — filter the register to that tag
export function openPackageTagDialog({ rows, defaultTag, attrId, aps, projectId, onWritten, onShowTag }) {
  let running = false;

  const title = h("h2", {});
  const body = h("div", { class: "body" });
  const footer = h("footer", {});
  const dialog = h(
    "dialog",
    { class: "dialog package-tag" },
    h("header", {},
      h("div", {}, h("div", { class: "eyebrow" }, "Package tag"), title),
      h("button", { class: "close", type: "button", "aria-label": "Close", onclick: () => !running && dialog.close() }, "×")
    ),
    body,
    footer
  );
  dialog.addEventListener("cancel", (e) => running && e.preventDefault()); // Esc while writing
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && !running) dialog.close(); // backdrop
  });
  document.body.append(dialog);

  const close = () => dialog.close();
  const note = (level, ...children) =>
    h("div", { class: `pt-note ${level}` },
      icon({ ok: "circle-check", bad: "circle-exclamation", warn: "triangle-exclamation" }[level] || "circle-info"),
      h("span", {}, ...children));
  const tagList = (map) => [...map].map(([t, n], i) => [i ? ", " : "", h("b", { class: "mono" }, t), ` (${formatNumber(n)})`]);

  // ---------- confirm: add a tag ----------
  function showTagForm(tagValue = defaultTag) {
    title.textContent = `Tag ${files(rows.length)} for a package`;
    const input = h("input", { class: "input mono", type: "text", value: tagValue, maxlength: "64", spellcheck: "false" });
    const error = h("div", { class: "pt-error", hidden: true }, "Start with PKG- and use letters, numbers, - _ or . only — no spaces.");
    const notes = h("div", { class: "pt-notes" });
    const writeBtn = h("button", { class: "btn primary", type: "button" }, icon("tag"), "Add tag");

    const refresh = () => {
      const tag = input.value.trim();
      const valid = isValidPackageTag(tag);
      error.hidden = valid || tag === "";
      const p = previewTagWrite(rows, tag);
      writeBtn.disabled = !valid || p.change === 0;
      const out = [];
      if (valid) {
        if (p.inOther.size) out.push(note("info", "Some files are already tagged for another package and will keep that tag too: ", tagList(p.inOther), "."));
        if (p.same) out.push(note("info", `${files(p.same)} already have this tag and will be skipped.`));
        if (p.unknown) out.push(note("info", `${files(p.unknown)} haven't finished loading — their tags are read from Forma before writing.`));
      }
      mount(notes, out);
    };
    input.addEventListener("input", refresh);
    input.addEventListener("keydown", (e) => e.key === "Enter" && !writeBtn.disabled && writeBtn.click());
    writeBtn.addEventListener("click", () => {
      const tag = input.value.trim();
      run(addPackageTag(tag), tag);
    });

    mount(
      body,
      h("label", {}, "Package tag", input),
      error,
      h("div", { class: "muted" },
        "The tag is added to the Tags attribute of each selected file; any other tags they have are kept. Then, in Forma's Files tool, filter Tags on it, select all and use Add to package."),
      notes
    );
    mount(
      footer,
      h("button", { class: "link-btn pt-left", type: "button", onclick: () => showClearForm() }, "Remove package tags instead"),
      h("button", { class: "btn", type: "button", onclick: close }, "Cancel"),
      writeBtn
    );
    refresh();
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  }

  // ---------- confirm: clear package tags ----------
  function showClearForm() {
    title.textContent = `Remove package tags from ${files(rows.length)}`;
    const p = previewTagWrite(rows, null);
    const out = [h("div", {}, "Removes every package tag (PKG-…) from the selected files' Tags. Other tags are kept, and files already in a Forma package stay in it.")];
    if (p.inOther.size) out.push(note("warn", "Tags to remove: ", tagList(p.inOther), "."));
    if (p.same) out.push(note("info", `${files(p.same)} have no package tag and will be skipped.`));
    if (p.unknown) out.push(note("info", `${files(p.unknown)} haven't finished loading — their tags are read from Forma first.`));
    mount(body, out);
    mount(
      footer,
      h("button", { class: "btn", type: "button", onclick: () => showTagForm() }, "Back"),
      h("button", { class: "btn primary", type: "button", disabled: p.change === 0, onclick: () => run(clearPackageTags(), null) }, icon("eraser"), "Remove package tags")
    );
  }

  // ---------- writing ----------
  // tag: the tag being added, or null when clearing.
  async function run(change, tag, targets = rows, totals = { written: 0, skipped: 0 }) {
    running = true;
    const verb = tag ? "Adding tag" : "Removing package tags";
    const bar = h("span", { style: { width: "0%" } });
    const status = h("div", {}, `${verb} — reading current tags from Forma…`);
    mount(body, status, h("div", { class: "progress pt-progress" }, bar), h("div", { class: "muted" }, "Keep this window open until it finishes."));
    mount(footer, h("button", { class: "btn", type: "button", disabled: true }, "Close"));

    let result;
    try {
      result = await writeTags({
        aps,
        projectId,
        attrId,
        rows: targets,
        change,
        onProgress: ({ done, total, failed }) => {
          status.textContent = `${verb} — ${formatNumber(done)} of ${formatNumber(total)}${failed ? ` (${formatNumber(failed)} failed)` : ""}…`;
          bar.style.width = `${Math.round((done / total) * 100)}%`;
        },
      });
    } catch (err) {
      result = { written: [], skipped: [], failed: targets.map((row) => ({ row, reason: err.message })) };
    } finally {
      running = false;
    }
    if (result.written.length) onWritten(result.written);
    showResult(change, tag, { written: totals.written + result.written.length, skipped: totals.skipped + result.skipped.length }, result.failed);
  }

  // ---------- result ----------
  function showResult(change, tag, totals, failed) {
    const none = totals.written === 0 && failed.length > 0;
    title.textContent = tag ? (none ? "Couldn't add the tag" : "Package tag added") : none ? "Couldn't remove package tags" : "Package tags removed";
    const parts = [];
    if (totals.written) parts.push(note("ok", tag ? `Tagged ${files(totals.written)}.` : `Removed package tags from ${files(totals.written)}.`));
    if (totals.skipped) parts.push(note("info", `${files(totals.skipped)} ${tag ? "already had this tag" : "had no package tag"} — skipped.`));
    if (failed.length) {
      parts.push(note("bad", `${files(failed.length)} couldn't be updated:`));
      parts.push(
        h("div", { class: "pt-failed" },
          h("table", { class: "plain-table" },
            h("tbody", {}, failed.map((f) => h("tr", {}, h("td", { class: "doc-name", title: f.row.name }, f.row.name), h("td", { class: "muted" }, f.reason))))
          )
        )
      );
    }

    const tagged = tag && totals.written + totals.skipped > 0;
    if (tagged) {
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(tag);
          toast("Copied", `${tag} copied to the clipboard`);
        } catch {
          toast("Couldn't copy", "The browser blocked clipboard access.", { error: true });
        }
      };
      parts.push(
        h("div", { class: "pt-handoff" },
          h("div", { class: "pt-tag mono" }, tag),
          h("button", { class: "btn", type: "button", onclick: copy }, icon("copy", "regular"), "Copy tag"),
          h("a", { class: "btn", href: projectFilesUrl(projectId, rows[0]?.id), target: "_blank", rel: "noopener" }, icon("arrow-up-right-from-square"), "Open in Forma")
        ),
        h("ol", { class: "pt-steps" },
          h("li", {}, "In Forma's Files tool, filter ", h("b", {}, "Tags"), " on the tag above. Forma takes a few seconds to pick up new tags — if it finds nothing, wait 10–20 seconds and search again."),
          h("li", {}, "Select all the results."),
          h("li", {}, "Use ", h("b", {}, "Add to package"), " — a new or existing package. Putting the tag in the package name helps find it later.")
        )
      );
    }
    mount(body, parts);

    const retryBtn =
      failed.length > 0 &&
      h("button", { class: "btn", type: "button", onclick: () => run(change, tag, failed.map((f) => f.row), totals) }, icon("rotate"), "Retry failed");
    const showBtn =
      tagged &&
      h("button", { class: "btn", type: "button", onclick: () => { onShowTag(tag); close(); } }, icon("filter"), "Show tagged files");
    mount(footer, retryBtn, showBtn, h("button", { class: "btn primary", type: "button", onclick: close }, "Close"));
  }

  showTagForm();
  dialog.showModal();
}
