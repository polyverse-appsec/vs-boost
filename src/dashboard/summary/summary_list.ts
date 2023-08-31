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
        .text((d: any) => d.display);

    const cell2 = row
        .append("vscode-data-grid-cell")
        .attr("grid-column", "2")
        .style("text-align", "center");
    cell2.append("vscode-badge").call(badgeUpdate);
}

export function summaryUpdate(update: any) {
    update.select("vscode-badge").call(badgeUpdate);

    const checkboxUpdate = update.select("vscode-checkbox")
        .attr("checked", (d) => d.defaultChecked)
        .attr("analysis-check", true)
        .attr("id", (d: any) => "check-" + d.id)
        .text((d: any) => d.display);
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
