// Saves a file the person asked for (a settings or diagnostics export, the
// translation sheet) through a temporary download link.
function downloadTextFile(documentObj: Document, fileName: string, text: string, type: string): void {
  const view = documentObj.defaultView || window;
  const blob = new view.Blob([text], { type });
  const url = view.URL.createObjectURL(blob);
  const link = documentObj.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  documentObj.body.appendChild(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 2000);
}

function downloadJsonFile(documentObj: Document, fileName: string, payload: unknown): void {
  downloadTextFile(documentObj, fileName, JSON.stringify(payload, null, 2), 'application/json');
}

export { downloadJsonFile, downloadTextFile };
