// Shared by the website and MaiRis; transport stays with the host audio clock.
/** @typedef {{type: string, delta?: number}} ViewerAction */
/** @param {KeyboardEvent} event @returns {ViewerAction | null} */
export function viewerShortcut(event) {
  if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.code || event.key) {
    case 'Space': case ' ': return {type: 'toggle'};
    case 'ArrowLeft': return {type: 'seek', delta: event.shiftKey ? -5 : -1};
    case 'ArrowRight': return {type: 'seek', delta: event.shiftKey ? 5 : 1};
    case 'Home': case 'KeyR': case 'r': case 'R': return {type: 'restart'};
    case 'Escape': return {type: 'pause'};
    default: return null;
  }
}

const controls = '.pv-bubble,[data-editing="true"],input,textarea,select,button,a[href],summary,[role="textbox"],[role="slider"],[role="button"],[role="combobox"],[role="spinbutton"],[role="menuitem"]';
/** @param {KeyboardEvent} event */
export function keyboardOwnsInput(event) {
  if(event.key==='Escape' && 'padviewScrubbing' in document.documentElement.dataset)return true;
  const path = event.composedPath?.() || [event.target];
  return path.some(node => node?.nodeType === 1 &&
    !(node.matches('input[type="range"][data-viewer-transport]') && (event.code === 'Space' || event.key === ' ')) &&
    (node.isContentEditable || node.matches(controls)));
}

/** @param {{root: HTMLElement, enabled: (action: ViewerAction) => boolean, onAction: (action: ViewerAction) => void}} options */
export function bindViewerKeyboard({root, enabled, onAction}) {
  const host = root.ownerDocument.defaultView;
  const keydown = event => {
    const action = viewerShortcut(event);
    if (!action || event.defaultPrevented || keyboardOwnsInput(event)
        || root.ownerDocument.querySelector('dialog[open],[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]')) return;
    if (!enabled(action)) {
      if (action.type === 'toggle' && event.target?.matches?.('input[type="range"][data-viewer-transport]')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat || action.type === 'seek') onAction(action);
  };
  host.addEventListener('keydown', keydown, true);
  return () => host.removeEventListener('keydown', keydown, true);
}
