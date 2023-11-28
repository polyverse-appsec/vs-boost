//IMPORTANT!!  This file is shared with webviews, which are packaged separately.
//do not import any depdencies or use any code that is not available in the webview

import { ControllerOutputType } from "../controllers/controllerOutputTypes";

export const noProjectOpenMessage =
    "Please open a project for Sara, the Boost AI, to help secure, optimize, modernize and supercharge your architecture and code.";
export const extensionNotFullyActivated =
    "Boost has not fully initialized. Some features may not be fully available yet. Please wait before using Boost Chat AI and analyzing your project.";
export const extensionFailedToActivate =
    "Boost encountered an error during startup. Please restart Visual Studio Code and try again. If the problem persists, please contact Polyverse Boost Support";

export enum AnalysisState {
    quiescent = "quiescent",
    preparing = "preparing",
    analyzing = "analyzing",
    cancelling = "cancelling",
}

export interface SummaryViewState {
    analysisTypesState: AnalysisTypesState;
    analysisMode: string;
}

export interface AnalysisTypesState {
    security: boolean;
    compliance: boolean;
    documentation: boolean;
}

export interface ActivityBarState {
    summaryViewState: SummaryViewState;
}

//this is where we should remember UI state like which analysis were selected, etc. 
export interface UIState {
    analysisState: AnalysisState;
    activityBarState: ActivityBarState;
}

export interface ProjectSettings {
    fileLimit: number;
}

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
    lastOperationCost: number;
    batchOperationCost: number;
}

export interface Summary {
    projectName: string;
    summaryUrl: string;
    filesToAnalyze: number;
    filesAnalyzed: number;
    // an optional issues array for *Boost* issues
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
    settings: ProjectSettings;
    uiState: UIState;
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
        status: "",
        trialRemaining: 0,
        usageThisMonth: 0,
        discountedUsage: 0,
        lastOperationCost: 0,
        batchOperationCost: 0,
        balanceDue: 0,
        couponType: "",
        org: "",
        owner: "",
        created: "",
        creditCardLinked: false,
    },
    settings: {
        fileLimit: 0
    },
    uiState: {
        analysisState: AnalysisState.quiescent,
        activityBarState: {
            summaryViewState: {
                analysisMode: "analyze-all-mode",
                analysisTypesState: {
                    security: true,
                    compliance: true,
                    documentation: true,
                }
            },
        },
    },
};
