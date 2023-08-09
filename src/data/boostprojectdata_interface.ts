//IMPORTANT!!  This file is shared with webviews, which are packaged separately.
//do not import any depdencies or use any code that is not available in the webview

import { ControllerOutputType } from "../controllers/controllerOutputTypes";

export const noProjectOpenMessage =
    "Please open a project to chat with Sara, the Boost AI, about your project or analyze your project code.";
export const extensionNotFullyActivated =
    "Boost has not fully initialized. Some features may not be fully available yet. Please wait before using Boost Chat AI and analyzing your project.";
export const extensionFailedToActivate =
    "Boost encountered an error during startup. Please restart Visual Studio Code and try again. If the problem persists, please contact Polyverse Boost Support";

export interface AccountStatus {
    refreshed: boolean;
    enabled: boolean;
    status: string;
    trialRemaining: number;
    usageThisMonth: number;
    discountedUsage: number;
    balanceDue: number;
    couponType: string;
    created: string;
    creditCardLinked: boolean;
    org: string;
    owner: string;
}

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
    dataFormatVersion: string;
    summary: Summary;
    sectionSummary: {
        [key: string]: SectionSummary;
    };
    files: {
        [key: string]: FileSummaryItem;
    };
    jobStatus: JobStatus;
    account: AccountStatus;
}

export const emptyProjectData: IBoostProjectData = {
    dataFormatVersion: "0.0.0",
    summary: {
        projectName: "",
        summaryUrl: "",
        filesToAnalyze: 0,
        filesAnalyzed: 0,
    },
    sectionSummary: {
        archblueprintCode: {
            analysisType: ControllerOutputType.blueprint,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        explainCode: {
            analysisType: ControllerOutputType.explain,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        flowDiagram: {
            analysisType: ControllerOutputType.flowDiagram,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        bugAnalysis: {
            analysisType: ControllerOutputType.analyze,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        bugAnalysisList: {
            analysisType: ControllerOutputType.analyzeFunction,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        complianceCode: {
            analysisType: ControllerOutputType.compliance,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        complianceCodeList: {
            analysisType: ControllerOutputType.complianceFunction,
            status: BoostProcessingStatus.notStarted,
            completedCells: 0,
            errorCells: 0,
            issueCells: 0,
            totalCells: 0,
            filesAnalyzed: 0,
        },
        summary: {
            analysisType: ControllerOutputType.summary,
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
    account: {
        refreshed: false,
        enabled: false,
        status: "trial",
        trialRemaining: 0,
        usageThisMonth: 0,
        discountedUsage: 0,
        balanceDue: 0,
        couponType: "Intializing...",
        org: "Polyverse",
        owner: "support@polyverse.com",
        created: "",
        creditCardLinked: false,
    },
};
