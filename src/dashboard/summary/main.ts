import {
    provideVSCodeDesignSystem,
    vsCodeBadge,
    vsCodeButton,
    vsCodeDataGrid,
    vsCodeDataGridCell,
    vsCodeDataGridRow,
    vsCodeCheckbox,
    vsCodeProgressRing,
    Button,
} from "@vscode/webview-ui-toolkit";
import * as d3 from "d3";

import { CountUp } from "countup.js";
import { merge } from "lodash";

//declare the boostdata global variable
declare var boostdata: any;

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeBadge(),
    vsCodeDataGrid(),
    vsCodeDataGridCell(),
    vsCodeDataGridRow(),
    vsCodeCheckbox(),
    vsCodeProgressRing()
);

const vscode = acquireVsCodeApi();

let options = {
    useEasing: true,
    useGrouping: true,
    separator: ",",
    decimal: ".",
    formattingFn: (value) => {
        return value === 1 ? `${value} job running` : `${value} jobs running`;
    },
};

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);
window.addEventListener("message", handleIncomingSummaryMessage);

let jobCounters = {};
let queue = {};
let started = {};

// Main function that gets executed once the webview DOM loads
function main() {
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const howdyButton = document.getElementById("update-summary") as Button;
    howdyButton?.addEventListener("click", handleAnalyzeAllClick);
    refreshUI(boostdata);
}

// Callback function that is executed when the howdy button is clicked
function handleAnalyzeAllClick() {
    //TODO: we need to show what is checked in the grid.
    vscode.postMessage({
        command: "analyze_all",
        analysisTypes: getAnalysisTypes(),
    });
}

function handleIncomingSummaryMessage(event: MessageEvent) {
    const message = event.data; // The JSON data our extension sent
    const spinner = document.getElementById("job-progress");
    const runbutton = document.getElementById("update-summary");
    const progressText = document.getElementById(
        "progress-text"
    ) as HTMLElement;
    let text = "";

    switch (message.command) {
        case "addJobs":
            // set our spinner

            spinner?.removeAttribute("hidden");
            runbutton?.setAttribute("hidden", "");

            // first unhide the counter
            const counter = document.getElementById("job-" + message.job);
            counter?.removeAttribute("hidden");

            // if we don't have a job counter for this job, add it
            if (!jobCounters[message.job]) {
                jobCounters[message.job] = new CountUp(
                    "job-" + message.job,
                    message.count,
                    options
                );
            }
            //start the counter
            jobCounters[message.job].update(message.count);

            // update the status field progress-text

            text = "Now processing file: " + message.files[0];
            if (message.files.length > 1) {
                text = "Now processing files: " + message.files.join(", ");
            }
            //set the inner text of the progress-text div element
            if (progressText) {
                progressText.innerText = text;
            }

            //add the files to the started object
            message.files.forEach((file: string) => {
                if (!started[message.job]) {
                    started[message.job] = {};
                }
                started[message.job][file] = true;
            });

            break;
        case "finishJob":
            // if we don't have a job counter for this job, add it
            if (!jobCounters[message.job]) {
                jobCounters[message.job] = new CountUp(
                    "job-" + message.job,
                    0,
                    options
                );
            }
            //start the counter
            jobCounters[message.job].update(message.count);

            // if count is now zero, hide the element
            if (message.count === 0) {
                const counter = document.getElementById("job-" + message.job);
                counter?.setAttribute("hidden", "");

                //if we don't have any active jobs, now show the jobs that are queued up.
                //get the keys of the queue object
                //after five seconds, refresh the progress text
                setTimeout(() => {
                    refreshProgressText(progressText);
                }, 5000);
            }

            // update the status field progress-text

            text = "Finished processing file: " + message.file;

            if (message.error) {
                text =
                    "Error processing file: " +
                    message.file +
                    " - " +
                    message.error;
            }
            //set the inner text of the progress-text div element
            if (progressText) {
                progressText.innerText = text;
            }

            // now remove the files from the started and queued objects
            let file = message.file;
            if (started[message.job] && started[message.job][file]) {
                delete started[message.job][file];
                if (Object.keys(started[message.job]).length === 0) {
                    delete started[message.job];
                }
            }
            if (queue[message.job] && queue[message.job][file]) {
                delete queue[message.job][file];
                if (Object.keys(queue[message.job]).length === 0) {
                    delete queue[message.job];
                }
            }
            // now update boostdata and the badge *only* if we had not processed this file already.
            // we could have just processed some of the internal cells
            // TODO TODO TODO this needs to be with the real cell data too
            if (!boostdata.files[file]) {
                boostdata.files[file] = {
                    completed: 0,
                    error: 0,
                    sourceFile: file,
                    total: 0,
                };
            }
            let analyzedCount = 0;
            let newStatus = "";
            let oldStatus = "";
            if (boostdata.files[file].completed === 0) {
                boostdata.files[file].completed = 1; // TODO TODO TODO--this is wrong, we need the actual count of cells completed.
                let found = false;

                // Loop through the sectionSummary array
                for (let summary of boostdata.sectionSummary) {
                    // If an object with the matching analysisType is found,
                    // increment its filesAnalyzed field
                    if (summary.analysisType === message.job) {
                        summary.filesAnalyzed += message.count;
                        found = true;
                        analyzedCount = summary.filesAnalyzed;
                        if (
                            summary.filesAnalyzed ===
                            boostdata.summary.filesToAnalyze
                        ) {
                            summary.status = "completed";
                        } else if (summary.status !== "processing") {
                            oldStatus = summary.status;
                            summary.status = "processing";
                            newStatus = "processing";
                        }
                        break; // Exit the loop since the object has been found and updated
                    }
                }

                // If no matching object is found in the array,
                // create a new object and push it to the sectionSummary array
                if (!found) {
                    boostdata.sectionSummary.push({
                        analysisType: message.job,
                        filesAnalyzed: message.count,
                    });
                    analyzedCount = message.count;
                }

                const badge = document.getElementById("badge-" + message.job);
                if (badge) {
                    badge.innerText =
                        analyzedCount.toString() +
                        "/" +
                        boostdata.summary.filesToAnalyze;
                    //and now set the class to be boost-{newStatus}, first removing any existing class

                    if (newStatus) {
                        if (oldStatus) {
                            badge.classList.remove("boost-" + oldStatus);
                        }
                        badge.classList.add("boost-" + newStatus);
                    }
                }
            }

            //after five seconds, refresh the progress text
            setTimeout(() => {
                refreshProgressText(progressText);
            }, 5000);
            break;
        case "finishAllJobs":
            // hide the spinner
            spinner?.setAttribute("hidden", "");
            runbutton?.removeAttribute("hidden");
            queue = {};
            started = {};
            break;

        case "updateSummary":
            // update the progress summary
            if (progressText) {
                progressText.innerText = message.summary;
            }
            break;
        case "addQueue":
            if (progressText) {
                progressText.innerText =
                    "Queued " +
                    message.files.join(", ") +
                    " for processing in " +
                    message.ms / 1000 +
                    "seconds.";
            }
            //loop through each file and add to the queue
            message.files.forEach((file: string) => {
                if (!queue[message.job]) {
                    queue[message.job] = {};
                }
                queue[message.job][file] = message.ms;
            });
            break;
    }
}

//this function is called to clear out the 'finished' jobs text and show what is queued up.

function refreshProgressText(progressText: HTMLElement | null) {
    // if there are any started jobs, show those first.
    if (Object.keys(started).length > 0) {
        const keys = Object.keys(started);
        //loop the keys and show the files
        const files: string[] = [];
        keys.forEach((key: string) => {
            files.push(Object.keys(started[key]).join(", "));
        });
        const text = "Processing " + files.join(", ");
        if (progressText) {
            progressText.innerText = text;
        }
        return;
    }

    //otherwise, let's check the queue object
    if (Object.keys(queue).length > 0) {
        const keys = Object.keys(queue);
        //loop the keys and show the files
        const files: string[] = [];
        keys.forEach((key: string) => {
            files.push(Object.keys(queue[key]).join(", "));
        });
        const text =
            "Queued " +
            files.join(", ") +
            " in " +
            queue[keys[0]][files[0]] / 1000 +
            "seconds.";
        if (progressText) {
            progressText.innerText = text;
        }
        return;
    }
}

function getAnalysisTypes(): Array<string> {
    const analysisTypes: string[] = [];
    const checkboxes = document.querySelectorAll(
        "vscode-checkbox[analysis-check]"
    );

    checkboxes.forEach((checkbox: Element) => {
        const id: string | null = (checkbox as HTMLElement).getAttribute("id");
        const isChecked: boolean = (checkbox as HTMLElement).classList.contains(
            "checked"
        );
        if (id && isChecked) {
            const match = id.match(/check-(.+)/);
            if (match && match[1]) {
                analysisTypes.push(match[1]);
            }
        }
    });

    return analysisTypes;
}

function refreshUI(boostdata: any) {
    let summaryView = displaySummary(boostdata);
    d3.select("#summarygrid")
        .selectAll("vscode-data-grid-row")
            .data(summaryView, (d: any) => d.id)
            .join(
                (enter) => summaryEnter(enter),
                (update) => summaryUpdate(update),
                (exit) => exit.remove()
            );
}

function summaryEnter(enter: any) {
    const row = enter.append('vscode-data-grid-row');
                
    const cell1 = row.append('vscode-data-grid-cell').attr('grid-column', '1').attr('class', 'left-aligned');
    cell1.append('vscode-checkbox')
        .attr('checked', true)
        .attr('analysis-check', true)
        .attr('id', (d: any) => 'check-' + d.id)
        .text((d: any) => d.display);
    
    const cell2 = row.append('vscode-data-grid-cell').attr('grid-column', '2').style('margin-left', '0px');
    cell2.append('vscode-badge')
        .attr('class', (d: any) => 'boost-' + d.summary.status)
        .attr('id', (d: any) => 'badge-' + d.id)
        .text((d: any) => d.summary.analyzed + '/' + d.summary.total);
    
    row.append('vscode-data-grid-cell')
        .attr('grid-column', '3')
        .attr('hidden', true)
        .attr('id', (d: any) => 'job-' + d.id);
}

function summaryUpdate(update: any) {
    update.selectAll('analysis-label').text((d: any) => d.display);
}

//compute the display summary of boostdata
//these are the sections supported currently. Be sure to update this list
//if new analysis are done.
// "outputType": "guidelinesCode"
// "outputType": "explainCode"
// "outputType": "generatedCode"
// "outputType": "bugAnalysis"
// "outputType": "explainCode"
// "outputType": "generatedCode"
// "outputType": "explainCode"
// "outputType": "generatedCode"
// "outputType": "testGeneration"
// "outputType": "archblueprintCode"
// "outputType": "guidelinesCode"
// "outputType": "flowDiagram"
// "outputType": "bugAnalysisList"
// "outputType": "complianceList"
function displaySummary(boostdata: any) 
{
    let summaryView = [
        {
            display: "Documentation",
            id: "documentation",
            summary: mergeSummary(boostdata, ["explainCode", "flowDiagram"])
        },
        {
            display: "Security",
            id: "security",
            summary: mergeSummary(boostdata, ["bugAnalysisList"])
        },
        {
            display: "Compliance",
            id: "compliance",
            summary: mergeSummary(boostdata, ["complianceList"])
        },
        {
            display: "Deep Code Analysis",
            id: "deepcode",
            summary: mergeSummary(boostdata, ["guidelinesCode", "archblueprintCode", "bugAnalysis", "guidelinesCode"])
        }
    ];
    return summaryView;
}

function mergeSummary(boostdata: any, analysisTypes: string[]) {
    let summary = {
        analyzed: 0,
        total: boostdata.summary.filesToAnalyze,
        status: "not-started"
    };
    let completed = "not-started";
    analysisTypes.forEach((analysisType: string) => {
        if (boostdata.sectionSummary[analysisType]) {
            summary.analyzed = Math.max(boostdata.sectionSummary[analysisType].filesAnalyzed, summary.analyzed);
            //we have to see a steady string of completed to be completed.  if we see anything else, we are incomplete.
            if(boostdata.sectionSummary[analysisType].status === 'completed' && completed !== 'incomplete') {
                completed = "true";
            } else {
                completed = "incomplete";
            }
        }
    });
    summary.status = completed;
    return summary;
}
