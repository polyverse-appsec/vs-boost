import { FileSummaryItem, IBoostProjectData, JobStatus } from "../../boostprojectdata_interface";


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
    jobstatus: JobStatus
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

export const outputTypeToDisplayGroup = {
    documentation: ["explainCode", "flowDiagram"],
    security: ["bugAnalysisList"],
    compliance: ["complianceList"],
    deepcode: [
        "guidelinesCode",
        "archblueprintCode",
        "bugAnalysis",
        "guidelinesCode",
    ],
};

export const displayGroupFriendlyName = {
    documentation: "Documentation",
    security: "Security",
    compliance: "Compliance",
    deepcode: "Deep Code Analysis",
};

//find the summary for the given output type by searching through the outputTypeToDisplay structure
export function mapOutputTypeToSummary(outputType: string) {
    //loop through the outputTypeToDisplay structure and find the summary
    for (const [key, value] of Object.entries(outputTypeToDisplayGroup)) {
        if (value.includes(outputType)) {
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
            id: "documentation",
            summary: mergeSummary(
                boostprojectdata,
                ["explainCode", "flowDiagram"],
                jobStatus
            ),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.security,
            id: "security",
            summary: mergeSummary(boostprojectdata, ["bugAnalysisList"], jobStatus),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.compliance,
            id: "compliance",
            summary: mergeSummary(boostprojectdata, ["complianceList"], jobStatus),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.deepcode,
            id: "deepcode",
            summary: mergeSummary(
                boostprojectdata,
                [
                    "guidelinesCode",
                    "archblueprintCode",
                    "bugAnalysis",
                    "guidelinesCode",
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
            jobstatus: jobstatus,
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
            jobstatus: jobstatus
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
                completed = "true";
            } else {
                completed = "incomplete";
            }
        }
    });
    summary.status = completed;
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
            } else if (boostprojectdata.jobStatus[key].status === "queued") {
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
        minutesRemaining: jobsQueued //assume 1 minute per job
    };
}