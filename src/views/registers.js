// The two register views, built on the shared register view.

import { isDrawingRegisterRow } from "../data/registers.js";
import { registerView } from "./midp/index.js";

export const midpView = registerView({
  id: "midp",
  title: "MIDP",
  select: (docs) => docs,
  description: "one row per document, showing its current approved revision",
  exportName: "MIDP",
});

export const drawingRegisterView = registerView({
  id: "drawings",
  title: "Drawing Register",
  select: (docs) => docs.filter((d) => isDrawingRegisterRow(d.current)),
  description: "client-approved drawings (C revisions, DR form) and deliverables",
  exportName: "Drawing Register",
  columns: {
    // v1's Drawing Register columns: name, version, link, revision, folder,
    // description, title, status, issued date. The rest stay in Columns.
    hidden: new Set([
      "title_line_2",
      "title_line_3",
      "title_line_4",
      "form",
      "originator",
      "function",
      "spatial",
      "file_type",
      "activity_code",
      "series",
      "last_modified_user",
      "created_by_user",
    ]),
    titles: { last_modified_date: "Issued" },
  },
});
