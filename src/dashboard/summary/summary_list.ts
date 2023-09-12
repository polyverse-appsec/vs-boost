import {
    analysisTypeCheckboxChanged,
    refreshUI,
} from "./main";

import { IBoostProjectData } from "../../data/boostprojectdata_interface";

export declare var boostprojectdata: IBoostProjectData;

export function summaryEnter(enter: any) {
    const row = enter.append("vscode-data-grid-row");

    const cell1 = row
        .append("vscode-data-grid-cell")
        .attr("grid-column", "1")
        .attr("class", "left-aligned");
    cell1
        .append("vscode-checkbox")
        .attr("checked", (d) => d.defaultChecked)
        .attr("analysis-check", true)
        .attr("id", (d: any) => "check-" + d.id)
        .text((d: any) => d.display)
        .on("change", (event) => {
            // You don't need to prevent the default action.
            // This will ensure that the default behavior of the checkbox (checking/unchecking) still occurs.
            // Refresh the UI after the default behavior has executed
            requestAnimationFrame(() => {
                const target = event.target as HTMLInputElement;

                // Extract the analysis type from the checkbox, and update the state
                const match = target.id.match(/check-(.+)/);
                if (match && match[1]) {
                    const analysisType = match[1];
                    analysisTypeCheckboxChanged(analysisType, target.checked);
                }                
            });
        });
    const cell2 = row
        .append("vscode-data-grid-cell")
        .attr("grid-column", "2")
        .style("text-align", "center");
    cell2.append("vscode-badge").call(badgeUpdate);

}

export function summaryUpdate(update: any) {
    update.select("vscode-badge").call(badgeUpdate);

    const checkboxUpdate = update.select("vscode-checkbox")
        .attr("checked", (d) => {
            return d.defaultChecked;
        });
}

function badgeUpdate(update: any) {
    update
        .attr("id", (d: any) => "badge-" + d.id)
        .text((d: any) => d.summary.analyzed + "/" + d.summary.total)
        .attr("class", (d: any) => {
            return (
                "boost-" + d.summary.status + " " + d.summary.jobStatusStatus ??
                ""
            );
        });
}
