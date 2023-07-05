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
        .style("margin-left", "0px");
    cell2.append("vscode-badge").call(badgeUpdate);

    row.append("vscode-data-grid-cell")
        .attr("grid-column", "3")
        .attr("hidden", true)
        .attr("id", (d: any) => "job-" + d.id);
}

export function summaryUpdate(update: any) {
    update.selectAll("vscode-badge").call(badgeUpdate);
}

function badgeUpdate(update: any) {
    update
        .attr("id", (d: any) => "badge-" + d.id)
        .text((d: any) => d.summary.analyzed + "/" + d.summary.total)
        .attr("class", (d: any) => "boost-" + d.summary.status);
}
