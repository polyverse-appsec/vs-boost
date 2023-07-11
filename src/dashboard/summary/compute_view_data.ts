import { IBoostProjectData, JobStatus } from "../../boostprojectdata_interface";

import { ControllerOutputType } from "../../controllerOutputTypes";
import { BoostUserAnalysisType, displayGroupFriendlyName } from "../../userAnalysisType";

export interface AnalysisSectionSummary {
    analyzed: number;
    total: number;
    status: string;
    jobStatusStatus: string;    
};

export interface SummaryViewData {
    display: string;
    id: string;
    summary: AnalysisSectionSummary;
    defaultChecked: boolean;
};

export interface ProgressBarData {
    display: string;
    completedCells: number;
    issueCells: number;
    totalCells: number;
};

export interface DetailsViewData {
    sourceRelFile: string;
    notebookRelFile: string;
    progressBar: ProgressBarData[],
    jobStatus: JobStatus
};

export interface StatusViewData {
    busy: boolean;
    jobsRunning: number;
    jobsQueued: number;
    minutesRemaining: number
};

//compute the display summary of boostprojectdata
//these are the sections supported currently. Be sure to update this list
//if new analysis are done.
export const outputTypeToDisplayGroup = {
    documentation: [ControllerOutputType.explain, ControllerOutputType.flowDiagram],
    security: [ControllerOutputType.analyzeFunction],
    compliance: [ControllerOutputType.complianceFunction],
    deepcode: [
        ControllerOutputType.compliance,
        ControllerOutputType.blueprint,
        ControllerOutputType.analyze,
        ControllerOutputType.codeGuidelines,
    ],
};

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

export function summaryViewData(boostprojectdata: IBoostProjectData): SummaryViewData[] {
    //TODO: in the future, make the default check settings configuratble and/or remembered
    //in the state somewhere.
    const jobStatus = boostprojectdata.jobStatus;
    let summaryView = [
        {
            display: displayGroupFriendlyName.documentation,
            id: BoostUserAnalysisType.documentation,
            summary: mergeSummary(
                boostprojectdata,
                [ControllerOutputType.explain, ControllerOutputType.flowDiagram],
                jobStatus
            ),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.security,
            id: BoostUserAnalysisType.security,
            summary: mergeSummary(boostprojectdata, [ControllerOutputType.analyzeFunction], jobStatus),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.compliance,
            id: BoostUserAnalysisType.compliance,
            summary: mergeSummary(boostprojectdata, [ControllerOutputType.complianceFunction], jobStatus),
            defaultChecked: true,
        },
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
        },
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
                display: displayGroupFriendlyName[key],
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
            });
            data.progressBar.push(progressbardata);
        });

        detailsView.push(data);
    });

    //now go through the jobStatus and create entries for each of those files
    //that are not in the boostprojectdata.files
    Object.keys(jobstatus).forEach((file: string) => {
        //if the file is in the boostprojectdata.files, skip it
        if (boostprojectdata.files[file]) {
            return;
        }
        let data: DetailsViewData = {
            sourceRelFile: file,
            notebookRelFile: "",
            progressBar: [],
            jobStatus: jobstatus
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
                display: displayGroupFriendlyName[key],
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
                boostprojectdata.sectionSummary[analysisType].status === "completed" &&
                completed !== "incomplete"
            ) {
                completed = "completed";
            } else if (boostprojectdata.sectionSummary[analysisType].filesAnalyzed > 0 ){
                completed = "incomplete";
            }
        }
    });
    summary.status = completed;
    //it is possible that all of the analysis types are completed, but there are still remaining files to analyze
    if( summary.status === "completed" && summary.analyzed < summary.total) {
        summary.status = "incomplete";
    }
    //now go through the job status and see if any of the jobs are processing or queued
    //if processing, then we are processing and that overrides the queued state

    Object.keys(jobStatus).forEach((key) => {
        //first check to see if our AnalysisType is in the job status
        //this is an intersection of the AnalysisArray and the jobStatus.jobs set
        for ( const job of jobStatus[key].jobs ) {
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
        };
    });
    return summary;
}

export function statusViewData(boostprojectdata: IBoostProjectData): StatusViewData
{
    let busy = false;
    let jobsRunning = 0;
    let jobsQueued = 0;

    //if we have a job status, then we are busy
    if (boostprojectdata.jobStatus) {
        //now go through the job status and see if any of the jobs not completed
        Object.keys(boostprojectdata.jobStatus).forEach((key) => {
            if (boostprojectdata.jobStatus[key].status !== "completed") {
                busy = true;
            }
            if (boostprojectdata.jobStatus[key].status === "queued") {
                jobsQueued++;
            } else if (boostprojectdata.jobStatus[key].status === "processing") {
                jobsRunning++;
            }
        });
    }
    return {
        busy: busy,
        jobsRunning: jobsRunning,
        jobsQueued: jobsQueued,
        minutesRemaining: jobsQueued + jobsRunning//assume 1 minute per job
    };
}