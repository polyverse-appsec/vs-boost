import {
    provideVSCodeDesignSystem,
    vsCodeBadge,
    vsCodeButton,
    vsCodeDivider,
    vsCodeDataGrid,
    vsCodeDataGridCell,
    vsCodeDataGridRow,
    vsCodeCheckbox,
    vsCodeProgressRing,
    Button,
} from "@vscode/webview-ui-toolkit";
import * as d3 from "d3";

import { CountUp } from "countup.js";
import { detailsEnter, detailsUpdate } from "./details_list";
import { summaryEnter, summaryUpdate } from "./summary_list";
import {
    summaryViewData,
    detailsViewData,
    mapOutputTypeToSummary,
    JobStatus,
} from "./compute_view_data";

//declare the boostdata global variable
declare var boostdata: any;

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeBadge(),
    vsCodeDataGrid(),
    vsCodeDataGridCell(),
    vsCodeDataGridRow(),
    vsCodeCheckbox(),
    vsCodeProgressRing(),
    vsCodeDivider()
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

let jobStatus: JobStatus = {};

// Main function that gets executed once the webview DOM loads
function main() {
    refreshUI(boostdata);
    //now setup listeners
    setupListeners();
}

function setupListeners() {
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const runAnalysisButton = document.getElementById(
        "update-summary"
    ) as Button;
    runAnalysisButton?.addEventListener("click", handleAnalyzeAllClick);

    const deepCodeCheckbox = document.getElementById("check-deepcode");
    deepCodeCheckbox?.addEventListener("click", (event) => {
        setTimeout(refreshUI, 0);
    });
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

            // update the status field progress-text
            message.files.forEach((file: string) => {
                //create the jobs set if necessary then add message.job to it
                if (!jobStatus[file]) {
                    jobStatus[file] = {
                        status: "processing",
                        jobs: new Set(),
                    };
                }
                jobStatus[file].status = "processing";
                jobStatus[file].jobs.add(message.job);
            });

            debugger;
            refreshUI(boostdata);
            break;
        case "finishJob":
            boostdata = message.boostdata;

            message.files.forEach((file: string) => {
                //first remove the job from the list
                jobStatus[file].jobs?.delete(message.job);
                //if there are no more jobs, then set the status to finished
                if (jobStatus[file].jobs?.size === 0) {
                    jobStatus[file].status = "completed";
                }
            });

            debugger;
            refreshUI(boostdata);
            break;
        case "finishAllJobs":
            // hide the spinner
            spinner?.setAttribute("hidden", "");
            runbutton?.removeAttribute("hidden");
            jobStatus = {};
            refreshUI(boostdata);
            break;

        case "updateSummary":
            // update the progress summary
            if (progressText) {
                progressText.innerText = message.summary;
            }
            break;
        case "addQueue":
            // update the status field progress-text
            message.files.forEach((file: string) => {
                //create the jobs set if necessary then add message.job to it
                if (!jobStatus[file]) {
                    jobStatus[file] = {
                        status: "queued",
                        jobs: new Set(),
                    };
                }
                jobStatus[file].jobs.add(message.job);
                jobStatus[file].status = "queued";
            });
            refreshUI(boostdata);

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
    const analysisTypes = getAnalysisTypes();
    let skipFilter: string[] = [];

    //if deepcode is not the analysis type, hide the deepcode-specific stuff
    if (!analysisTypes.includes("deepcode")) {
        skipFilter.push("deepcode");
    }
    let summaryView = summaryViewData(boostdata, jobStatus);
    let detailsView = detailsViewData(boostdata, jobStatus, skipFilter);

    d3.select("#summarygrid")
        .selectAll("vscode-data-grid-row")
        .data(summaryView, (d: any) => d.id)
        .join(
            (enter) => summaryEnter(enter),
            (update) => summaryUpdate(update),
            (exit) => exit.remove()
        );

    d3.select("#detailsgrid")
        .selectAll("vscode-data-grid-row")
        .data(detailsView, (d: any) => d.boostNotebookFile)
        .join(
            (enter) => detailsEnter(enter),
            (update) => detailsUpdate(update),
            (exit) => exit.remove()
        );
}

function updateJobCounter(boostdata: any, message: any) {
    const job = mapOutputTypeToSummary(message.job);
    // first unhide the counter
    const counter = document.getElementById("job-" + job);
    counter?.removeAttribute("hidden");

    // if we don't have a job counter for this job, add it
    if (!jobCounters[job]) {
        jobCounters[job] = new CountUp("job-" + job, message.count, options);
    }
    //start the counter
    jobCounters[job].update(message.count);

    //start the counter
    jobCounters[job].update(message.count);

    // if count is now zero, hide the element
    if (message.count === 0) {
        const counter = document.getElementById("job-" + job);
        counter?.setAttribute("hidden", "");
    }
}
