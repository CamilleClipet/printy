type Dismiss = () => boolean;

interface Entry {
  id: symbol;
  priority: number;
  dismiss: Dismiss;
}

const entries: Entry[] = [];

export function registerNativeBackDismiss(priority: number, dismiss: Dismiss): () => void {
  const entry = { id: Symbol('native-back-dismiss'), priority, dismiss };
  entries.push(entry);
  return () => {
    const index = entries.findIndex((candidate) => candidate.id === entry.id);
    if (index >= 0) entries.splice(index, 1);
  };
}

export function dismissRegisteredNativeOverlay(): boolean {
  const topmost = entries.slice().sort((a, b) => b.priority - a.priority)[0];
  return topmost?.dismiss() ?? false;
}
