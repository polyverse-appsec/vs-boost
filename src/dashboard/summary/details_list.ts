import { progressMeterEnter, progressMeterUpdate } from "./progress_meter";

export function detailsEnter(enter: any) {
    const row = enter.append("vscode-data-grid-row");

    const cell1 = row
        .append("vscode-data-grid-cell")
        .attr("grid-column", "1")
        .attr("class", (d) => "left-aligned " + d.jobStatus?.status ?? "")
        .text((d: any) => d.sourceFile);

    progressMeterEnter(row);
}

export function detailsUpdate(update: any) {
    update.call(progressMeterUpdate);
}
