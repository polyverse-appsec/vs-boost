import { IBoostProjectData, JobStatus, AnalysisState } from "../../data/boostprojectdata_interface";

import {
    ControllerOutputType,
    outputTypeToDisplayGroup
} from "../../controllers/controllerOutputTypes";
import {
    BoostUserAnalysisType,
    DisplayGroupFriendlyName,
} from "../../data/userAnalysisType";

export interface AnalysisSectionSummary {
    analyzed: number;
    total: number;
    status: string;
    jobStatusStatus: string;
}

export interface SummaryViewData {
    display: string;
    id: string;
    summary: AnalysisSectionSummary;
    defaultChecked: boolean;
}

export interface ProgressBarData {
    display: string;
    completedCells: number;
    issueCells: number;
    totalCells: number;
    issueCount: number;
}

export interface DetailsViewData {
    sourceRelFile: string;
    notebookRelFile: string;
    progressBar: ProgressBarData[];
    jobStatus: JobStatus;
    progressStatus:
        | "completed"
        | "incomplete"
        | "not-started"
        | "processing"
        | "queued";
}

export interface StatusViewData {
    accountRefreshed: boolean;
    busy: boolean;
    jobsRunning: number;
    jobsQueued: number;
    minutesRemaining: number;
    filesTotal: number;
    spendLowerBound: number;
    spendUpperBound: number;
    accountStatus: string;
    couponRemaining: number;
    currentSpend: number;
    discountedUsage: number;
    analysisState: AnalysisState;
}


//find the summary for the given output type by searching through the outputTypeToDisplay structure
export function mapOutputTypeToSummary(outputType: string) {
    //loop through the outputTypeToDisplay structure and find the summary
    for (const [key, value] of Object.entries(outputTypeToDisplayGroup)) {
        if (value.toString().includes(outputType)) {
            return key;
        }
    }
    return "";
}

export function summaryViewData(
    boostprojectdata: IBoostProjectData,
    analysisTypes: string[],
): SummaryViewData[] {
    const jobStatus = boostprojectdata.jobStatus;
    let summaryView = [
        {
            display: DisplayGroupFriendlyName.documentation,
            id: BoostUserAnalysisType.documentation,
            summary: mergeSummary(
                boostprojectdata,
                [
                    ControllerOutputType.explain,
                    ControllerOutputType.flowDiagram,
                ],
                jobStatus
            ),
            defaultChecked: analysisTypes.includes("documentation"),
        },
        {
            display: DisplayGroupFriendlyName.security,
            id: BoostUserAnalysisType.security,
            summary: mergeSummary(
                boostprojectdata,
                [ControllerOutputType.analyzeFunction],
                jobStatus
            ),
            defaultChecked: analysisTypes.includes("security"),
        },
        {
            display: DisplayGroupFriendlyName.compliance,
            id: BoostUserAnalysisType.compliance,
            summary: mergeSummary(
                boostprojectdata,
                [ControllerOutputType.complianceFunction],
                jobStatus
            ),
            defaultChecked: analysisTypes.includes("compliance"),
        } /*
        {
            display: displayGroupFriendlyName.deepcode,
            id: "deepcode",
            summary: mergeSummary(
                boostprojectdata,
                [
                    ControllerOutputType.compliance,
                    ControllerOutputType.blueprint,
                    ControllerOutputType.analyze,
                    ControllerOutputType.codeGuidelines,
                ],
                jobStatus
            ),
            defaultChecked: false,
        },*/,
    ];
    return summaryView;
}

export function detailsViewData(
    boostprojectdata: any,
    skipFilter: string[] = []
): DetailsViewData[] {
    let detailsView: DetailsViewData[] = [];
    let jobstatus = boostprojectdata.jobStatus;

    Object.keys(boostprojectdata.files).forEach((file: string) => {
        let fileData = boostprojectdata.files[file];

        let data: DetailsViewData = {
            sourceRelFile: boostprojectdata.files[file].sourceRelFile,
            notebookRelFile: boostprojectdata.files[file].notebookRelFile,
            progressBar: [],
            jobStatus: jobstatus[file],
            progressStatus: "not-started",
        };

        //for each of the four display types, go through the mapping and get the completed
        //cells, total cells, and number of cells with issues
        Object.keys(outputTypeToDisplayGroup).forEach((key) => {
            //if the key is in the skip filter, skip it
            if (skipFilter.includes(key)) {
                return;
            }
            let sections = outputTypeToDisplayGroup[key];
            let progressbardata = {
                completedCells: 0,
                issueCells: 0,
                totalCells: 0,
                issueCount: 0,
                display: DisplayGroupFriendlyName[key],
            } as ProgressBarData;

            sections.forEach((section) => {
                progressbardata.completedCells = Math.max(
                    fileData.sections[section]?.completedCells ?? 0,
                    progressbardata.completedCells
                );
                progressbardata.issueCells = Math.max(
                    fileData.sections[section]?.issueCells ?? 0,
                    progressbardata.issueCells
                );
                progressbardata.totalCells = Math.max(
                    fileData.sections[section]?.totalCells ?? 0,
                    progressbardata.totalCells
                );
                //if the section has a details field, add the length of that to the issue count
                if (fileData.sections[section]?.details) {
                    progressbardata.issueCount +=
                        fileData.sections[section]?.details?.length;
                }
            });
            data.progressBar.push(progressbardata);

            if (
                progressbardata.completedCells > 0 &&
                progressbardata.completedCells === progressbardata.totalCells &&
                data.progressStatus !== "processing" &&
                data.progressStatus !== "incomplete"
            ) {
                data.progressStatus = "completed";
            } else if (
                progressbardata.completedCells > 0 ||
                progressbardata.issueCells > 0
            ) {
                data.progressStatus = "incomplete";
            }
        });

        detailsView.push(data);
    });

    //now go through the jobStatus and create entries for each of those files
    //that are not in the boostprojectdata.files
    Object.keys(jobstatus).forEach((file: string) => {
        //if the file is in the boostprojectdata.files, skip it, but update the progressStatus to show it's
        //being processed.
        if (boostprojectdata.files[file]) {
            //find it in the detailsView array and update the progressStatus
            let index = detailsView.findIndex((element) => {
                return (
                    element.sourceRelFile ===
                        boostprojectdata.files[file].sourceRelFile &&
                    element.notebookRelFile ===
                        boostprojectdata.files[file].notebookRelFile
                );
            });
            //if we're completed, we want that to take procedence over the processing state
            //except for the case of 'processing'.
            if (
                index !== -1 &&
                detailsView[index].progressStatus !== "completed" &&
                jobstatus[file].status !== "processing"
            ) {
                detailsView[index].progressStatus = jobstatus[file].status;
            }
            return;
        }
        let data: DetailsViewData = {
            sourceRelFile: file,
            notebookRelFile: "",
            progressBar: [],
            jobStatus: jobstatus[file],
            progressStatus: "not-started",
        };
        //for each of the four display types, go through the mapping and get the completed
        //cells, total cells, and number of cells with issues
        Object.keys(outputTypeToDisplayGroup).forEach((key) => {
            //if the key is in the skip filter, skip it
            if (skipFilter.includes(key)) {
                return;
            }
            let progressbardata = {
                completedCells: 0,
                issueCells: 0,
                totalCells: 1,
                display: DisplayGroupFriendlyName[key],
            } as ProgressBarData;
            data.progressBar.push(progressbardata);
        });
        detailsView.push(data);
    });
    return detailsView;
}

function mergeSummary(
    boostprojectdata: any,
    analysisTypes: string[],
    jobStatus: JobStatus
) {
    let summary = {
        analyzed: 0,
        total: boostprojectdata.summary.filesToAnalyze,
        status: "not-started",
        jobStatusStatus: "",
    };
    let completed = "not-started";
    analysisTypes.forEach((analysisType: string) => {
        if (boostprojectdata.sectionSummary[analysisType]) {
            summary.analyzed = Math.max(
                boostprojectdata.sectionSummary[analysisType].filesAnalyzed,
                summary.analyzed
            );
            //we have to see a steady string of completed to be completed.  if we see anything else, we are incomplete.
            if (
                boostprojectdata.sectionSummary[analysisType].status ===
                    "completed" &&
                completed !== "incomplete"
            ) {
                completed = "completed";
            } else if (
                boostprojectdata.sectionSummary[analysisType].filesAnalyzed > 0
            ) {
                completed = "incomplete";
            }
        }
    });
    summary.status = completed;
    //it is possible that all of the analysis types are completed, but there are still remaining files to analyze
    if (summary.status === "completed" && summary.analyzed < summary.total) {
        summary.status = "incomplete";
    }
    //now go through the job status and see if any of the jobs are processing or queued
    //if processing, then we are processing and that overrides the queued state

    Object.keys(jobStatus).forEach((key) => {
        //first check to see if our AnalysisType is in the job status
        //this is an intersection of the AnalysisArray and the jobStatus.jobs set
        for (const job of jobStatus[key].jobs) {
            if (analysisTypes.includes(job)) {
                //we have a job that is processing or queued, processing takes priority over queued
                if (jobStatus[key].status === "processing") {
                    summary.jobStatusStatus = jobStatus[key].status;
                } else if (
                    jobStatus[key].status === "queued" &&
                    summary.jobStatusStatus !== "processing"
                ) {
                    summary.jobStatusStatus = jobStatus[key].status;
                }
            }
        }
    });
    return summary;
}

export function statusViewData(
    boostprojectdata: IBoostProjectData,
    analysisTypes: string[],
    fileLimit: number
): StatusViewData {
    let busy = false;
    let jobsRunning = 0;
    let jobsQueued = 0;
    const numAnalyses = analysisTypes.length;

    // if we have a job status, then we are busy
    if (boostprojectdata.jobStatus) {
        // now go through the job status and see if any of the jobs not completed
        Object.keys(boostprojectdata.jobStatus).forEach((key) => {
            if (boostprojectdata.jobStatus[key].status !== "completed") {
                busy = true;
            }
            if (boostprojectdata.jobStatus[key].status === "queued") {
                jobsQueued++;
            } else if (
                boostprojectdata.jobStatus[key].status === "processing"
            ) {
                jobsRunning++;
            }
        });
    }

    let filesTotal = 0;
    if( fileLimit === 0 ) {
        filesTotal = boostprojectdata.summary.filesToAnalyze;
    } else {
        filesTotal = 5;
    }

    return {
        accountRefreshed: boostprojectdata.account.refreshed,
        busy: busy,
        jobsRunning: jobsRunning,
        jobsQueued: jobsQueued,
        minutesRemaining: jobsQueued + jobsRunning, //assume 1 minute per job
        filesTotal: filesTotal,
        spendLowerBound: filesTotal * 1 * numAnalyses,
        spendUpperBound: filesTotal * 1.5 * numAnalyses,
        accountStatus: boostprojectdata.account.status,
        couponRemaining: boostprojectdata.account.trialRemaining,
        currentSpend:
            boostprojectdata.account.usageThisMonth -
            boostprojectdata.account.discountedUsage,
        discountedUsage: boostprojectdata.account.discountedUsage,
        analysisState: boostprojectdata.uiState.analysisState,
    };
}
