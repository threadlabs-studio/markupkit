/** DOM input and request transport only; editing and operation policy stay in the owning model. */
export function connect(host, { signal }) {
  host.effect(() => {
    const view = host.props.view.value;
    if (view === null) { host.state.available = false; return; }
    if (view.schema !== "markupkit.text-editor.v1") throw new TypeError("Unsupported System UI text editor view schema");
    const appearance = view.appearance;
    if (!["system", "round"].includes(appearance.action) || !["system", "compact", "comfortable"].includes(appearance.spacing) || !["system", "serif"].includes(appearance.typography)) throw new TypeError("Unsupported System UI text editor appearance");
    host.state.available = host.hasResponder("editing");
  });
  function send(intent) {
    host.state.problem = "";
    host.request("editing", intent, { signal }).catch(error => {
      if (!signal.aborted) {
        host.state.problem = host.props.unavailable.value;
        console.error(error);
      }
    });
  }
  host.on("input", event => {
    const view = host.props.view.value;
    if (view && event.target.id === view.field.id && event.target.dataset.editorSession === view.sessionId) {
      send({ type: "edit", sessionId: view.sessionId, value: event.target.value });
    }
  });
  host.on("click", event => {
    const action = event.target.closest?.("[data-editor-intent]");
    const view = host.props.view.value;
    if (!view || !action || action.dataset.editorSession !== view.sessionId) return;
    const intent = action.dataset.editorIntent;
    send(intent === "save" ? { type: "save", sessionId: view.sessionId }
      : { type: "choose-leave", sessionId: view.sessionId, leaveId: action.dataset.editorLeave, choice: action.dataset.editorChoice });
  });
  return () => { host.state.available = false; };
}
