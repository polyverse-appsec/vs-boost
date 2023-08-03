import { vscode } from "./main";

export function openFile(event) {
    const path = event.target.getAttribute("href");
    vscode.postMessage({
        command: "open_file",
        file: path,
    });
}
