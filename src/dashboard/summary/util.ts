import { vscode } from "./main";

export function openFile(event) {
    const path = event.target.getAttribute("href");
    openFileFromName(path);
}

export function openFileFromName(path: string) {
    vscode.postMessage({
        command: "open_file",
        file: path,
    });
}
