//IMPORTANT!!  This file is shared with webviews, which are packaged separately.
//do not import any depdencies or use any code that is not available in the webview

export interface Summary {
    projectName: string;
    summaryUrl: string;
    filesToAnalyze: number;
    filesAnalyzed: number;
    //an optional issues arrary for *Boost* issues
    issues?: Array<any>;
}

export enum BoostProcessingStatus {
    completed = "completed",
    incomplete = "incomplete",
    processing = "processing",
    notStarted = "not-started",
}

export interface SectionSummary {
    analysisType: string;
    status: BoostProcessingStatus;
    errorCells: number;
    completedCells: number;
    totalCells: number;
    issueCells: number;
    filesAnalyzed: number;
    details?: Array<any>; // some sections, like security and compliance, will have a list of issues in the details section
}

export interface FileSummaryItem {
    sourceRelFile: string;
    notebookRelFile: string;
    totalCells: number;
    completedCells: number;
    errorCells: number;
    issueCells: number;
    sections: { [outputType: string]: SectionSummary };
}
export type JobStatus = {
    [relFile: string]: {
        status: "processing" | "queued" | "completed";
        jobs: string[];
    };
};

export interface IBoostProjectData {
    summary: Summary;
    sectionSummary: {
        [key: string]: SectionSummary;
    };
    files: {
        [key: string]: FileSummaryItem;
    };
    jobStatus: JobStatus;
}

export const emptyProjectData: IBoostProjectData = {
    summary: {
        projectName: "",
        summaryUrl: "",
        filesToAnalyze: 0,
        filesAnalyzed: 0,
    },
    sectionSummary: {
        blueprint: {
            analysisType: "blueprint",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        explain: {
            analysisType: "explain",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        flowDiagram: {
            analysisType: "flowDiagram",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        bugAnalyze: {
            analysisType: "bugAnalyze",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        bugAnalysisList: {
            analysisType: "bugAnalysisList",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        compliance: {
            analysisType: "compliance",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        complianceList: {
            analysisType: "complianceList",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        summary: {
            analysisType: "summary",
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
    },
    files: {},
    jobStatus: {},
};
