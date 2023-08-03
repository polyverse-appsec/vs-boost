import { progressMeterEnter, progressMeterUpdate } from "./progress_meter";
import { openFile } from "./util";

export function detailsEnter(enter: any) {
    const row = enter
        .append("vscode-data-grid-row")
        .attr("class", (d) => d.jobStatus?.status ?? "completed");

    const cell1 = row
        .append("vscode-data-grid-cell")
        .attr("grid-column", "1")
        .attr("class", (d) => "left-aligned")
        .append("a")
        .attr("href", (d) =>
            d.notebookRelFile ? d.notebookRelFile : d.sourceRelFile
        )
        .on("click", openFile)
        .text((d: any) => d.sourceRelFile);

    return progressMeterEnter(row);
}

export function detailsUpdate(update: any) {
    update.attr("class", (d) => d.jobStatus?.status ?? "completed");
    update.call(progressMeterUpdate);
    return update;
}
