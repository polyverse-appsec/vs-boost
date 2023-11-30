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
    vsCodePanels,
    vsCodePanelTab,
    vsCodePanelView,
    vsCodeLink,
    vsCodeRadio,
    vsCodeRadioGroup,
    Button,
} from "@vscode/webview-ui-toolkit";
import * as d3 from "d3";
import * as _ from "lodash";
import { detailsEnter, detailsUpdate } from "./details_list";
import { summaryEnter, summaryUpdate } from "./summary_list";
import {
    summaryViewData,
    detailsViewData,
    statusViewData,
    StatusViewData,
} from "./compute_view_data";
import { openFile } from "./util";

import {
    IBoostProjectData,
    AnalysisState,
    AnalysisTypesState,
} from "../../data/boostprojectdata_interface";
    // https://github.com/tameemsafi/typewriterjs
import Typewritter from "typewriter-effect/dist/core";
import { BoostUserAnalysisType } from "../../data/userAnalysisType";

//declare the boostprojectdata global variable
export declare var boostprojectdata: IBoostProjectData;

let typewriter = new Typewritter("#progress-text", {
    delay: 2,
    cursor: "",
});

provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeBadge(),
    vsCodeDataGrid(),
    vsCodeDataGridCell(),
    vsCodeDataGridRow(),
    vsCodeCheckbox(),
    vsCodeProgressRing(),
    vsCodeDivider(),
    vsCodePanels(),
    vsCodePanelTab(),
    vsCodePanelView(),
    vsCodeRadio(),
    vsCodeRadioGroup(),
    vsCodeLink()
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

const slowRefreshUI = _.debounce(refreshUI, 1000, { leading: true });

// Main function that gets executed once the webview DOM loads
function main() {
    try {
        vscode.postMessage({ command: "refreshUI"});

        //now setup listeners
        setupListeners();
    } catch (error) {
        console.error(`Error in Summary Dashboard:main: ${error.message}: ${error.stack}`);
    }
}

function setupListeners() {
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const runAnalysisButton = document.getElementById(
        "update-summary"
    ) as Button;
    runAnalysisButton?.addEventListener("click", () => {
        handleAnalyzeAllClick(boostprojectdata);
    });

    // Listen for the DOMContentLoaded event to check initially
    checkDashboardWideEnough();
    // Listen for the resize event to check on webview resize
    window.addEventListener("resize", checkDashboardWideEnough);

    const blueprintLink = document.getElementById(
        "blueprint-link"
    ) as HTMLAnchorElement;
    blueprintLink?.addEventListener("click", openFile);

    const guidelinesLink = document.getElementById(
        "guidelines-link"
    ) as HTMLAnchorElement;
    guidelinesLink?.addEventListener("click", openFile);

    const showDashboardButton = document.getElementById(
        "show_dashboard_button"
    ) as Button;
    showDashboardButton?.addEventListener("click", showDashboardTab);

    const showDashboardLinks = document.querySelectorAll(".show_dashboard");
    showDashboardLinks.forEach((link) => {
        link.addEventListener("click", showDashboardTab);
    });

    const analyzeAllMode = document.getElementById("analyze-all-mode") as HTMLInputElement;
    const top5Mode = document.getElementById("top5-mode") as HTMLInputElement;
    const processNext1 = document.getElementById("process-next-1") as HTMLInputElement;
    const processNext5 = document.getElementById("process-next-5") as HTMLInputElement;

    const analysisModeButtons : HTMLElement[] = [analyzeAllMode, top5Mode, processNext1, processNext5];
    analysisModeButtons.forEach((button) => {
        // Attach event listeners to both radio buttons to detect changes
        button.addEventListener("change", (event) => {
            requestAnimationFrame(() => {
                const target = event.target as HTMLInputElement;
                if (!target?.checked) {
                    return;
                }

                handleAnalyzeModeCheck(target.id, boostprojectdata);

            });
        });
    });
}

function showDashboardTab() {
    requestAnimationFrame(() => {
        // we just need to set the 'activeid' of the panel equal to "tab-dashboard"
        const vscodePanels = document.querySelector("#main_panel") as HTMLElement;
        // set the attribute activeid
        vscodePanels.setAttribute("activeid", "tab-dashboard");
    });
}

// Define a function to check if the vscode-panels element is rendered
const checkDashboardWideEnough = (): void => {
    requestAnimationFrame(() => {
        const vscodePanels: HTMLElement | null =
            document.querySelector("vscode-panels");

        if (!vscodePanels) {
            return;
        }

        const resizeAlert: HTMLElement | null =
            document.querySelector("#resize_alert");
        if (vscodePanels.scrollWidth > vscodePanels.clientWidth) {
            //get the resize_alert element and hide it
            if (resizeAlert) {
                resizeAlert.style.display = "block";
            }
        } else {
            //get the resize_alert element and show it
            if (resizeAlert) {
                resizeAlert.style.display = "none";
            }
        }
    });
};

export function analysisTypeCheckboxChanged(analysisType: string, checked: boolean) {
    vscode.postMessage({
        command: "analysis_type_changed",
        analysisType: analysisType,
        checked: checked,
    });
}

// Callback function that is executed when the howdy button is clicked
function handleAnalyzeAllClick(boostprojectdata: IBoostProjectData) {
    refreshAnalysisState(AnalysisState.preparing);
    vscode.postMessage({
        command: "analyze_all",
        analysisTypes: getAnalysisTypes(boostprojectdata.uiState.activityBarState.summaryViewState.analysisTypesState),
        fileLimit: getFileLimit(),
    });
}

function handleAnalyzeModeCheck(choice: string, boostprojectdata: IBoostProjectData) {
    vscode.postMessage({
        command: "analyze_mode_changed",
        choice: choice,
    });
}

function handleIncomingSummaryMessage(event: MessageEvent) {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
        case "refreshUI":
            boostprojectdata = message.boostprojectdata;
            slowRefreshUI(message.boostprojectdata);
            break;
    }
}

function getFileLimit(): number {
    //get the limit from the UI
    let fileLimit = 0;
    const top5Mode = document.getElementById("top5-mode") as HTMLInputElement;
    const processNext1 = document.getElementById("process-next-1") as HTMLInputElement;
    const processNext5 = document.getElementById("process-next-5") as HTMLInputElement;
    if (top5Mode.checked) {
        fileLimit = 5;
    } else if (processNext1.checked) {
        fileLimit = 1;
    } else if (processNext5.checked) {
        fileLimit = 5;
    }
    return fileLimit;
}

/* <vscode-checkbox
    role="checkbox"
    aria-checked="true"
    aria-required="false"
    aria-disabled="false"
    tabindex="0"
    aria-label="Checkbox"
    checked=""
    analysis-check="true"
    id="check-documentation"
    current-value="on"
    current-checked="true"
    class="checked"
>
    Documentation
</vscode-checkbox>;
 */
function getAnalysisTypes(analysisTypesState: AnalysisTypesState): Array<string> {
    const analysisTypes: string[] = [];

    //if there are no checkboxes, we are in the initial default state
    //so just return the persisted analysis types state
    for (const [key, value] of Object.entries(analysisTypesState)) {
        if (value) {
            analysisTypes.push(BoostUserAnalysisType[key as keyof typeof BoostUserAnalysisType]);
        }
    }
    return analysisTypes;
}

function refreshUI(boostprojectdata: IBoostProjectData) {
    const analysisTypes = getAnalysisTypes(boostprojectdata.uiState.activityBarState.summaryViewState.analysisTypesState);
    let skipFilter: string[] = [];

    //if deepcode is not the analysis type, hide the deepcode-specific stuff
    if (!analysisTypes.includes("deepcode")) {
        skipFilter.push("deepcode");
    }

    setAnalysisMode(boostprojectdata);

    //get the fileLimit
    const fileLimit = getFileLimit();

    let summaryView = summaryViewData(boostprojectdata, analysisTypes);
    let detailsView = detailsViewData(boostprojectdata, skipFilter);
    let statusView = statusViewData(boostprojectdata, analysisTypes, fileLimit);

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
        .data(detailsView, (d: any) =>
            d.notebookRelFile ? d.notebookRelFile : d.sourceRelFile
        )
        .join(
            (enter) => detailsEnter(enter),
            (update) => detailsUpdate(update),
            (exit) => exit.remove()
        )
        .sort((a: any, b: any) => {
            const statuses = {
                processing: 1,
                completed: 2,
                incomplete: 3,
                queued: 4,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "not-started": 5,
            };
            const aStatus = a.progressStatus;
            const bStatus = b.progressStatus;
            // Compare statuses first
            if (statuses[aStatus] !== statuses[bStatus]) {
                return statuses[aStatus] - statuses[bStatus];
            }

            // If statuses are equal, compare filenames
            let fileA = a.notebookRelFile ? a.notebookRelFile : a.sourceRelFile;
            let fileB = b.notebookRelFile ? b.notebookRelFile : b.sourceRelFile;
            return d3.ascending(fileA, fileB);
        })
        .transition()
        .duration(100);

    refreshSpinner(statusView.analysisState);
    refreshProgressText(statusView);
}

function refreshSpinner(analysisState: AnalysisState) {
    const spinner = document.getElementById("job-progress");
    const runbutton = document.getElementById("update-summary") as HTMLButtonElement;

    switch (analysisState) {
        case AnalysisState.preparing:
        case AnalysisState.analyzing:
            spinner!.removeAttribute("hidden");
            runbutton!.innerText = "Cancel Analysis";
            runbutton!.style.backgroundColor = "green";
            runbutton!.disabled = false;
            // runbutton?.setAttribute("hidden", "");
            break;
        case AnalysisState.cancelling:
            spinner!.setAttribute("hidden", "");
            runbutton!.innerText = "Canceling Analysis";
            runbutton!.style.backgroundColor = "yellow";
            runbutton!.disabled = true;
            break;
        case AnalysisState.quiescent:
            //for finish
            spinner!.setAttribute("hidden", "");
            runbutton!.innerText = "Run Selected Analysis";
            runbutton!.style.backgroundColor = "";
            // runbutton!.removeAttribute("hidden");
            runbutton!.disabled = false;
            break;
    }
}

let currentProgressText = "";

function refreshProgressText(statusData: StatusViewData) {
    if (statusData.analysisState === AnalysisState.preparing) {
        return refreshAnalysisState(statusData.analysisState);
    }

    /*
    const progressText = document.getElementById(
        "progress-text"
    ) as HTMLElement;
    */
    let remaining = "";

    const oldText = currentProgressText;
    if (!statusData.busy) {
        refreshPrediction(statusData);
        if (oldText !== currentProgressText) {
            vscode.postMessage({ command: "refreshUI"});
        }
        return;
    }

    if (statusData.minutesRemaining > 60) {
        remaining = `${Math.round(statusData.minutesRemaining / 60)} hours`;
    } else {
        remaining = `${statusData.minutesRemaining} minutes`;
    }
    let filesText = statusData.jobsRunning === 1 ? "file" : "files";
    let queuesText = statusData.jobsQueued === 1 ? "file" : "files";
    let processingText =
        statusData.jobsRunning === 0
            ? "preparing her analysis"
            : `processing ${statusData.jobsRunning} ${filesText}`;
    const text = `Sara (the Boost AI) is ${processingText} right now, with ${statusData.jobsQueued} ${queuesText} queued. ETA ${remaining}. You can continue to use Visual Studio Code in the meantime.`;

    if (oldText === text) {
        return;
    }

    currentProgressText = text;

    // if there is no existing text, type it in
    if (oldText) {
        typewriter.stop().deleteAll(1).typeString(text).start();
    } else {
        typewriter.stop().deleteAll(1).pasteString(text).start();
    }
}

function refreshPrediction(statusData: StatusViewData) {
    // if we don't have refreshed account info (and no account status), don't do anything
    //      unless we don't have existing text... then go generate it (and don't exit early)
    if (!statusData.accountRefreshed && !statusData.accountStatus && currentProgressText) {
        return;
    }

    if (!statusData.accountStatus) {
        const unknownPrediction = `Sara needs to refresh your account information before she assess analysis cost and time. Please update your account info.`;
        if (currentProgressText === unknownPrediction) {
            return;
        }
        currentProgressText = unknownPrediction;
        typewriter.
            stop().
            deleteAll(1)
            .pauseFor(300)
            .typeString(unknownPrediction)
            .start();
        return;
    }

    let predictionStart = `Sara expects the analysis to cost between`;
    let predictionFinish =
        ` $${statusData.spendLowerBound.toFixed(
            2
        )} and $${statusData.spendUpperBound.toFixed(2)}.`;
    if (statusData.accountRefreshed) {
        predictionFinish += ` Your account is ${
            statusData.accountStatus
        } and you have spent $${statusData.currentSpend.toFixed(
            2
        )} so far this month.`;
        if (statusData.couponRemaining > 0) {
            predictionFinish += ` You have $${statusData.couponRemaining.toFixed(
                2
            )} of a free trial remaining ($${statusData.discountedUsage.toFixed(
                2
            )} used already).`;
        }
    }
    
    const newText = `${predictionStart}${predictionFinish}`;
    // if the text is the same, don't do anything
    if (currentProgressText === newText) {
        return;
        
/* disabled code since existingText is not accurate reflection of current typewriter state
    } else if (currentProgressText.startsWith(predictionStart) &&
               newText.startsWith(predictionStart)) {
        // if the text starts with the prediction start, just update the prediction finish
        typewriter
            .stop()
            .deleteAll(1)
            .pasteString(predictionStart)
            .start()
            .pauseFor(100)
            .typeString("...")
            .pauseFor(500)
            .deleteChars(3)
            .typeString(predictionFinish)
            .start();
*/
    } else {

        currentProgressText = newText;

        typewriter.
            stop().
            deleteAll(1)
            .pauseFor(300)
            .typeString(predictionStart)
            .pauseFor(100)
            .typeString("...")
            .pauseFor(500)
            .deleteChars(3)
            .typeString(predictionFinish)
            .start();
    }
}

function refreshAnalysisState(analysisState: AnalysisState) {
    if (analysisState !== AnalysisState.preparing) {
        // the progress field will be updated by the refreshProgressText function
        return;
    }

    refreshSpinner(analysisState);
    const progressText = document.getElementById(
        "progress-text"
    ) as HTMLElement;

    const prepareText = "Sara is preparing the analysis. This may take a few minutes.";

    // get the current text of the progress text, delete it if it exists
    if (prepareText === currentProgressText) {
        return;
    }

    currentProgressText = prepareText;

    typewriter.stop().deleteAll(1).typeString(
            currentProgressText
        )
        .start();
}

function setAnalysisMode(boostprojectdata: IBoostProjectData) {
    const defaultAnalysisMode : string = boostprojectdata.uiState.activityBarState.summaryViewState.analysisMode;
    const checkedMode = document.getElementById(
        defaultAnalysisMode? defaultAnalysisMode : "top5-mode"
        ) as HTMLInputElement;

    checkedMode.setAttribute('current-checked', 'true');
}
