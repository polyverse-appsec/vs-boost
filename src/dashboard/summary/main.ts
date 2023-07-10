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
import * as _ from 'lodash';
import { detailsEnter, detailsUpdate } from "./details_list";
import { summaryEnter, summaryUpdate } from "./summary_list";
import {
    summaryViewData,
    detailsViewData,
    statusViewData,
    StatusViewData
} from "./compute_view_data";

import { JobStatus, IBoostProjectData } from "../../boostprojectdata_interface";
import Typewritter from 'typewriter-effect/dist/core';
import { type } from "os";

//declare the boostprojectdata global variable
declare var boostprojectdata: IBoostProjectData;

let typewriter = new Typewritter('#progress-text',{
    delay: 5,
    cursor: ""
});

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

export const vscode = acquireVsCodeApi();

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

const slowRefreshUI = _.debounce(refreshUI, 1000, {leading: true});

// Main function that gets executed once the webview DOM loads
function main() {
    refreshUI(boostprojectdata);
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
        case "refreshUI":        
            boostprojectdata = message.boostprojectdata;
            slowRefreshUI(message.boostprojectdata);
            break;

        case "finishAllJobs":
            //this could just be refreshUI, but keeping the command
            //in here for now in case we ever need to do something different
            //when all jobs are finished.
            boostprojectdata = message.boostprojectdata;
            slowRefreshUI(boostprojectdata);
            break;
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

function refreshUI(boostprojectdata: IBoostProjectData) {
    const analysisTypes = getAnalysisTypes();
    let skipFilter: string[] = [];

    //if deepcode is not the analysis type, hide the deepcode-specific stuff
    if (!analysisTypes.includes("deepcode")) {
        skipFilter.push("deepcode");
    }
    let summaryView = summaryViewData(boostprojectdata);
    let detailsView = detailsViewData(boostprojectdata, skipFilter);
    let statusView = statusViewData(boostprojectdata);

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
        .data(detailsView, (d: any) => (d) => d.notebookRelFile ? d.notebookRelFile : d.sourceRelFile)
        .join(
            (enter) => detailsEnter(enter),
            (update) => detailsUpdate(update),
            (exit) => exit.remove()
        );

    refreshSpinner(statusView);
    refreshProgressText(statusView);
}

function refreshSpinner(statusView: StatusViewData) {
    const spinner = document.getElementById("job-progress");
    const runbutton = document.getElementById("update-summary");
    // set our spinner

    if( statusView.busy ){
        spinner?.removeAttribute("hidden");
        runbutton?.setAttribute("hidden", "");
    } else {
        //for finish
        spinner?.setAttribute("hidden", "");
        runbutton?.removeAttribute("hidden");
    }
}

function refreshProgressText(statusData: StatusViewData){
    const progressText = document.getElementById(
        "progress-text"
    ) as HTMLElement;
    let remaining = "";
    let text = "";

    //get the current text of the progress text
    let existingText = progressText.innerText;

    if( statusData.busy === true){
        if( statusData.minutesRemaining > 60 ) {
            remaining = `${Math.round(statusData.minutesRemaining / 60)} hours`;
        } else {
            remaining = `${statusData.minutesRemaining} minutes`;
        }
        let filesText = statusData.jobsRunning === 1 ? "file" : "files";
        let queuesText = statusData.jobsQueued === 1 ? "file" : "files";
        let processingText = statusData.jobsRunning === 0 ? "preparing its analysis" : `processing ${statusData.jobsRunning} ${filesText}`;
        text = `Sara (the Boost AI) is ${processingText} right now, with ${statusData.jobsQueued} ${queuesText} queued. ETA ${remaining}. You can continue to use Visual Studio Code in the meantime.`;
        //if there is no existing text, type it in
        if( existingText === "" || existingText === undefined){
            typewriter.typeString(text)
            .start();
        } else {
            progressText.innerText = text;
        }
    } else if ( existingText !== "" || existingText !== undefined) {
        //if we are not busy, and there is text, clear it out slowly to avoid ui jitty
        typewriter.deleteAll(1)
        .pauseFor(1000)
        .start();
    }
    // otherwise, do nothing! 
    
}
