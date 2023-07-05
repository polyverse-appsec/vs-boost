import { FileSummaryItem } from "../../boostprojectdata_interface";

export type JobStatus = {
    [key: string]: {
        status: "processing" | "queued" | "completed";
        jobs: Set<string>;
    };
};

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

export function summaryViewData(boostdata: any, jobStatus: JobStatus) {
    //TODO: in the future, make the default check settings configuratble and/or remembered
    //in the state somewhere.
    let summaryView = [
        {
            display: displayGroupFriendlyName.documentation,
            id: "documentation",
            summary: mergeSummary(
                boostdata,
                ["explainCode", "flowDiagram"],
                jobStatus
            ),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.security,
            id: "security",
            summary: mergeSummary(boostdata, ["bugAnalysisList"], jobStatus),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.compliance,
            id: "compliance",
            summary: mergeSummary(boostdata, ["complianceList"], jobStatus),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.deepcode,
            id: "deepcode",
            summary: mergeSummary(
                boostdata,
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

export interface ProgressBarData {
    display: string;
    completedCells: number;
    issueCells: number;
    totalCells: number;
}

export function detailsViewData(
    boostdata: any,
    jobstatus: JobStatus,
    skipFilter: string[] = []
) {
    let detailsView: {}[] = [];

    //first add any 'in progress' file to boostdata so we can display it
    //in the details view
    Object.keys(jobstatus).forEach((file: string) => {
        //see if the file is in boostdata.  If not, add it
        if (!boostdata.files[file]) {
            boostdata.files[file] = {
                sourceFile: file,
                totalCells: 1, //there will always be at least one cell
                completedCells: 0,
                errorCells: 0,
                issueCells: 0,
                sections: {},
            } as FileSummaryItem;
        }
    });
    Object.keys(boostdata.files).forEach((file: string) => {
        let fileData = boostdata.files[file] as FileSummaryItem;
        let fileSummary = {
            ...fileData,
            progressBar: [] as ProgressBarData[],
            jobstatus: jobstatus[file] ?? "",
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
            fileSummary.progressBar.push(progressbardata);
        });

        detailsView.push(fileSummary);
    });
    debugger;
    return detailsView;
}

function mergeSummary(
    boostdata: any,
    analysisTypes: string[],
    jobStatus: JobStatus
) {
    let summary = {
        analyzed: 0,
        total: boostdata.summary.filesToAnalyze,
        status: "not-started",
        jobStatusStatus: "",
    };
    let completed = "not-started";
    analysisTypes.forEach((analysisType: string) => {
        if (boostdata.sectionSummary[analysisType]) {
            summary.analyzed = Math.max(
                boostdata.sectionSummary[analysisType].filesAnalyzed,
                summary.analyzed
            );
            //we have to see a steady string of completed to be completed.  if we see anything else, we are incomplete.
            if (
                boostdata.sectionSummary[analysisType].status === "completed" &&
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
        jobStatus[key].jobs.forEach((job) => {
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
        });
    });

    return summary;
}
