// "Send feedback" dialog — bug reports and feature requests to the
// Power Automate feedback flow (same payload as v1).

import { APP_NAME } from "../core/config.js";
import { sendFeedback } from "../api/powerAutomate.js";
import { h, icon } from "../ui/dom.js";
import { toast } from "../ui/toast.js";

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function openFeedback(user) {
  const type = h(
    "select",
    { class: "input", required: true },
    h("option", { value: "Bug" }, "Bug"),
    h("option", { value: "Feature" }, "Feature request"),
    h("option", { value: "Feedback" }, "General feedback")
  );
  const description = h("textarea", { required: true, placeholder: "What happened, or what would help?" });
  const email = h("input", { class: "input", type: "email", required: true, value: user?.email || "" });
  const screenshot = h("input", { type: "file", accept: "image/*" });
  const submit = h("button", { class: "btn primary", type: "submit" }, icon("paper-plane"), "Send");

  const dialog = h(
    "dialog",
    { class: "dialog" },
    h(
      "form",
      { method: "dialog" },
      h("header", {}, h("h2", {}, "Send feedback"), h("button", { class: "close", type: "button", "aria-label": "Close", onclick: () => dialog.close() }, "×")),
      h(
        "div",
        { class: "body" },
        h("label", {}, "Type", type),
        h("label", {}, "Description", description),
        h("label", {}, "Your email", email),
        h("label", {}, "Screenshot (optional)", screenshot)
      ),
      h("footer", {}, h("button", { class: "btn", type: "button", onclick: () => dialog.close() }, "Cancel"), submit)
    )
  );

  dialog.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await sendFeedback({
        tool: APP_NAME,
        type: type.value,
        description: description.value,
        userEmail: email.value,
        screenshotBase64: screenshot.files[0] ? await toDataUrl(screenshot.files[0]) : null,
      });
      toast("Thanks — feedback sent");
      dialog.close();
    } catch (err) {
      toast("Couldn't send feedback", err.message, { error: true });
      submit.disabled = false;
    }
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
