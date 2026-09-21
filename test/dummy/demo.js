document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open-voice-control]");
  if (!trigger) return;
  window.VoiceControl?.close();
  trigger.focus();
  document.querySelector("#try-voice-control-dialog").showModal();
});
window.addEventListener("turbo:before-cache", () => {
  document.querySelector("#try-voice-control-dialog")?.close();
});
window.addEventListener("turbo:load", () => {
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      const widget = document.querySelector("voice-control-widget");
      widget.open();
      // A browser-action command may still be finishing when it clicks this button.
      window.queueMicrotask(() => widget.submit(button.dataset.command));
    });
  });
});
let toastTimer;
function toast(message) {
  const node = document.querySelector("#demo-toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 6000);
}
window.addEventListener("demo:tokens", ({ detail }) => {
  const counter = document.querySelector("#demo-token-count");
  if (counter) counter.textContent = detail.total.toLocaleString("en-US");
  const balance = document.getElementById(
    `demo-token-balance-${detail.user_id}`,
  );
  if (balance) {
    const updated = detail.balance;
    balance.dataset.tokenBalance = updated;
    balance.textContent = `${updated.toLocaleString("en-US")} tokens`;
  }
  toast(`Granted ${detail.amount} demo tokens to user ${detail.user_id}.`);
});
window.addEventListener("demo:plan", ({ detail }) => {
  const label = {
    free: "Free",
    premium: "Premium",
    premium_plus: "Premium Plus",
  }[detail.plan];
  document.querySelectorAll("[data-demo-plan]").forEach((element) => {
    element.textContent = label;
  });
  toast(`Your demo account is now on the ${label} plan.`);
});
window.addEventListener("demo:announcement", ({ detail }) =>
  toast(detail.text),
);
window.addEventListener("demo:discount", ({ detail }) => {
  const field = document.querySelector("#settings_discount_percent");
  if (field) field.value = detail.percent;
  toast(`Demo discount: ${detail.percent}%.`);
});
window.addEventListener("demo:notifications", ({ detail }) => {
  const field = document.querySelector("#settings_notifications");
  if (field) field.checked = detail.enabled;
  toast(`Notifications ${detail.enabled ? "enabled" : "disabled"}.`);
});
