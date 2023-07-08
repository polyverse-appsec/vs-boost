import { progressMeterEnter, progressMeterUpdate } from "./progress_meter";
import { vscode } from "./main";


export function detailsEnter(enter: any) {
    const row = enter.append("vscode-data-grid-row");

    const cell1 = row
        .append("vscode-data-grid-cell")
        .attr("grid-column", "1")
        .attr("class", (d) => "left-aligned " + d.jobStatus?.status ?? "")
        .append("a")
            .attr("href", (d) => d.notebookRelFile ? d.notebookRelFile : d.sourceRelFile)
            .on("click", openFile)
            .text((d: any) => d.sourceRelFile);

    progressMeterEnter(row);
}

export function detailsUpdate(update: any) {
    update.call(progressMeterUpdate);
}

function openFile(event) {
    const path = event.target.getAttribute("href");
    vscode.postMessage({
        command: 'open_file',
        file: path
    });
  }