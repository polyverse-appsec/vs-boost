import * as d3 from "d3";
import { openFileFromName } from "./util";

const width = 100;
const height = 3;

export function progressMeterEnter(parent: d3.selection): d3.selection {
    // Create SVG
    const svg = parent
        .append("vscode-data-grid-cell")
        .attr("grid-column", "2")
        .attr("class", "left-aligned")
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr(
            "viewBox",
            (d) => "0 0 " + width + " " + d.progressBar.length * height
        )
        .attr("preserveAspectRatio", "xMinYMin meet");

    svg.append("defs")
        .append("clipPath")
        .attr("id", "rounded-corner-clip")
        .append("rect")
        .attr("width", width)
        .attr("height", (d) => d.progressBar.length * height) // Adjust the height to cover the entire group of bars
        .attr("rx", 2) // x radius for rounded corners
        .attr("ry", 2); // y radius for rounded corners

    const overarchingGroup = svg
        .append("g")
        .on("click", (event, d) =>
            openFileFromName(
                d.notebookRelFile ? d.notebookRelFile : d.sourceRelFile
            )
        )
        .attr("clip-path", "url(#rounded-corner-clip)");

    const groups = overarchingGroup
        .selectAll("g")
        .data((d) => d.progressBar)
        .join("g")
        .attr("transform", (d, i) => `translate(0, ${i * height})`)
        .call(addZoom)
        .call(barUpdate);

    return parent;
}

export function progressMeterUpdate(parent: d3.selection): d3.selection {
    const groups = parent.selectAll("g").data((d) => d.progressBar);
    groups.call(barUpdate);
    return groups;
}

function barUpdate(bar: d3.selection) {
    bar.each(function (pBarData, i) {
        const withoutIssues = pBarData.completedCells - pBarData.issueCells;
        const totalCells = pBarData.totalCells ? pBarData.totalCells : 1;
        let incomplete = pBarData.totalCells - pBarData.completedCells;
        if (incomplete === 0) {
            incomplete = 1;
        }

        const widthScale = d3
            .scaleLinear()
            .domain([0, totalCells])
            .range([0, width]);

        const groupData = [
            {
                width: widthScale(withoutIssues),
                color: "#28a745",
                label: `${pBarData.display} - ${
                    (withoutIssues / totalCells) * 100
                }% Completed`,
            },
            {
                width: widthScale(pBarData.issueCells),
                color: "#dc3545",
                label: `${pBarData.display} - ${
                    (pBarData.issueCells / totalCells) * 100
                }% Issues`,
            },
            {
                width: widthScale(incomplete),
                color: "#6c757d",
                label: `${pBarData.display} - ${
                    (incomplete / totalCells) * 100
                }% Incomplete`,
            },
        ];

        d3.select(this)
            .selectAll("rect")
            .data(groupData)
            .join("rect")
            .attr("x", (d, j) =>
                j === 0
                    ? 0
                    : groupData
                          .slice(0, j)
                          .reduce((acc, cur) => acc + cur.width, 0)
            )
            .attr("y", 0)
            .attr("width", (d) => d.width)
            .attr("height", height)
            .attr("fill", (d) => d.color)
            .append("title")
            .text((d) => d.label);
    });
}

function addZoom(parent: d3.selection) {
    parent
        .on("mouseover", function (event, d) {
            // Change the opacity
            d3.select(this).transition().duration(200).attr("opacity", 0.6);
        })
        .on("mouseout", function (event, d) {
            // Return the opacity and stroke back to normal
            d3.select(this).transition().duration(200).attr("opacity", 1);
        });
    return parent;
}
