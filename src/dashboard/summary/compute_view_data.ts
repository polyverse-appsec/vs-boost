import { FileSummaryItem } from "../../boostprojectdata_interface";
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

export function summaryViewData(boostdata: any) {
    //TODO: in the future, make the default check settings configuratble and/or remembered
    //in the state somewhere.
    let summaryView = [
        {
            display: displayGroupFriendlyName.documentation,
            id: "documentation",
            summary: mergeSummary(boostdata, ["explainCode", "flowDiagram"]),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.security,
            id: "security",
            summary: mergeSummary(boostdata, ["bugAnalysisList"]),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.compliance,
            id: "compliance",
            summary: mergeSummary(boostdata, ["complianceList"]),
            defaultChecked: true,
        },
        {
            display: displayGroupFriendlyName.deepcode,
            id: "deepcode",
            summary: mergeSummary(boostdata, [
                "guidelinesCode",
                "archblueprintCode",
                "bugAnalysis",
                "guidelinesCode",
            ]),
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

export function detailsViewData(boostdata: any, skipFilter: string[] = []) {
    let detailsView: {}[] = [];

    //in the files structure, the key is the boostnotebook, sourceFile has the original
    //file
    Object.keys(boostdata.files).forEach((file: string) => {
        let fileData = boostdata.files[file] as FileSummaryItem;
        let fileSummary = {
            ...fileData,
            progressBar: [] as ProgressBarData[],
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
    return detailsView;
}

export function mergeSummary(boostdata: any, analysisTypes: string[]) {
    let summary = {
        analyzed: 0,
        total: boostdata.summary.filesToAnalyze,
        status: "not-started",
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
    return summary;
}
