import * as fs from "fs";
import * as path from "path";
import * as boostnb from "./jupyter_notebook";
import * as vscode from "vscode";

import { errorMimeType } from "../controllers/base_controller";
import { boostLogging } from "../utilities/boostLogging";
import { IncompatibleVersionException } from "./incompatibleVersionException";

export const PROJECT_EXTENSION = ".boost-project";

import {
    IBoostProjectData,
    Summary,
    SectionSummary,
    FileSummaryItem,
    emptyProjectData,
    BoostProcessingStatus,
    JobStatus,
    AccountStatus,
    UIState,
    AnalysisState
} from "./boostprojectdata_interface";
import { ControllerOutputType } from "../controllers/controllerOutputTypes";
import { BoostConfiguration } from "../extension/boostConfiguration";

const oldComplianceFunctionType = "complianceList";

export class BoostProjectData implements IBoostProjectData {
    dataFormatVersion: string;
    summary: Summary;
    sectionSummary: { [key: string]: SectionSummary };
    fsPath: string;
    files: {
        [filename: string]: FileSummaryItem;
    };
    jobStatus: JobStatus;
    account: AccountStatus;
    uiState: UIState;

    constructor() {
        this.dataFormatVersion = BoostConfiguration.version;
        this.summary = { ...emptyProjectData.summary };
        this.sectionSummary = {};
        this.fsPath = "";
        this.files = {};
        this.jobStatus = { ...emptyProjectData.jobStatus };
        this.account = { ...emptyProjectData.account };
        this.uiState = { ...emptyProjectData.uiState };
    }

    create(jsonString: string): void {
        const projectData = JSON.parse(jsonString) as BoostProjectData;
        Object.assign(this, projectData);
    }

    checkDataFormatVersion(dataVersion: string) {
        if (!dataVersion) {
            throw new IncompatibleVersionException(
                `Data Format version is undefined. Expected compatibility with ${BoostConfiguration.version}`
            );
        }

        const [majorData = 0, minorData = 0] = dataVersion
            .split(".")
            .map(Number);
        const [majorClient, minorClient] = BoostConfiguration.version
            .split(".")
            .map(Number);

        if (majorData !== majorClient || minorData !== minorClient) {
            throw new IncompatibleVersionException(
                `Data Format version is ${dataVersion}. Expected compatibility with ${BoostConfiguration.version}`
            );
        }
    }

    performCompatFixups(jsonString: string): string {
        const parsedJson = JSON.parse(jsonString, (key, value) => {
            if (key === "dataFormatVersion") {
                this.checkDataFormatVersion(value);
            } else if (
                key === "analysisType" &&
                value === oldComplianceFunctionType
            ) {
                return ControllerOutputType.complianceFunction;
            } else {
                return value;
            }
        });

        // Check and update the keys under sections in files
        if (parsedJson.files) {
            Object.values(parsedJson.files).forEach((file: any) => {
                if (file.sections && file.sections[oldComplianceFunctionType]) {
                    file.sections[ControllerOutputType.complianceFunction] =
                        file.sections[oldComplianceFunctionType];
                    delete file.sections[oldComplianceFunctionType];
                }
            });
        }

        // remove any transient job status
        this.jobStatus = { ...emptyProjectData.jobStatus };

        return parsedJson;
    }

    load(filePath: string): void {
        const jsonString = fs.readFileSync(filePath, "utf8");
        try {
            const parsedJson = this.performCompatFixups(jsonString);
            this.create(JSON.stringify(parsedJson));
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new SyntaxError(
                    `Could not parse project ${filePath} due to invalid JSON: ${e}`
                );
            } else {
                throw e;
            }
        }
        this.fsPath = filePath;
    }

    save(filename: string): void {
        // Create any necessary folders
        const folderPath = path.dirname(filename);
        fs.mkdirSync(folderPath, { recursive: true });

        this.fsPath = filename;

        // no need to persist the path into the file
        const { fsPath, jobStatus, ...dataWithoutFsPathAndJobStatus } = this;
        const projectDataJson = JSON.stringify(
            dataWithoutFsPathAndJobStatus,
            null,
            2
        );

        fs.writeFileSync(filename, projectDataJson, { encoding: "utf8" });
    }

    flushToFS(): void {
        this.save(this.fsPath);
    }

    public updateAccountStatusFromService(accountStatus: any) {
        //set the account fields from the accountStatus object. it's the same fields, only
        //snake case coming from the python server, so translate.
        this.account.refreshed = true;
        this.account.status = accountStatus.status;
        this.account.enabled = accountStatus.enabled;
        this.account.org = accountStatus.org;

        // we may have been passed minimal account info if there's an account lookup error
        //  so only set the fields if they're present
        // alternatively - we can clear all the unset fields, but for now, we'll just leave them
        if (accountStatus.trial_remaining !== undefined) {
            this.account.trialRemaining = accountStatus.trial_remaining;
        }
    
        if (accountStatus.usage_this_month !== undefined) {
            this.account.usageThisMonth = accountStatus.usage_this_month;
        }
    
        if (accountStatus.discounted_usage !== undefined) {
            this.account.discountedUsage = accountStatus.discounted_usage;
        }
    
        if (accountStatus.balance_due !== undefined) {
            this.account.balanceDue = accountStatus.balance_due;
        }
    
        if (accountStatus.coupon_type !== undefined) {
            this.account.couponType = accountStatus.coupon_type;
        }
    
        if (accountStatus.created !== undefined) {
            this.account.created = accountStatus.created;
        }
    
        if (accountStatus.credit_card_linked !== undefined) {
            this.account.creditCardLinked = accountStatus.credit_card_linked;
        }
    
        if (accountStatus.owner !== undefined) {
            this.account.owner = accountStatus.owner;
        }
    }

    private addFileSummaryToSectionSummaries(
        fileSummary: FileSummaryItem,
        previous: FileSummaryItem
    ): void {
        // first remove the previous file summary from the section summaries
        let sections = [];
        // if previous and fileSummary are the same object, then skip everything and put an error in the log
        if (previous === fileSummary) {
            boostLogging.error(
                "previous and fileSummary are the same object",
                false
            );
            return;
        }

        if (previous && previous.sections) {
            sections = Object.keys(previous.sections);
            sections.forEach((section) => {
                let sectionSummary = this.sectionSummary[section];
                if (!sectionSummary) {
                    this.sectionSummary[section] = {
                        ...fileSummary.sections[section],
                    };
                    sectionSummary = this.sectionSummary[section];
                }
                sectionSummary.totalCells -=
                    previous.sections[section].totalCells;
                sectionSummary.completedCells -=
                    previous.sections[section].completedCells;
                sectionSummary.errorCells -=
                    previous.sections[section].errorCells;
                sectionSummary.filesAnalyzed -= 1;
            });
        }        

        sections = Object.keys(fileSummary.sections);
        sections.forEach((section) => {
            let sectionSummary = this.sectionSummary[section];
            if (!sectionSummary) {
                this.sectionSummary[section] = {
                    ...fileSummary.sections[section],
                };
                sectionSummary = this.sectionSummary[section];
            }

            sectionSummary.totalCells +=
                fileSummary.sections[section].totalCells;
            sectionSummary.completedCells +=
                fileSummary.sections[section].completedCells;
            sectionSummary.errorCells +=
                fileSummary.sections[section].errorCells;
            sectionSummary.filesAnalyzed += 1;

            if (
                sectionSummary.completedCells === sectionSummary.totalCells
            ) {
                sectionSummary.status = BoostProcessingStatus.completed;
            } else if (sectionSummary.completedCells > 0) {
                sectionSummary.status = BoostProcessingStatus.incomplete;
            } else {
                sectionSummary.status = BoostProcessingStatus.notStarted;
            }
        });
    }

    updateWithFileSummary(
        fileSummary: FileSummaryItem,
        relativePath: string
    ): void {
        const previous = this.files[relativePath];
        this.addFileSummaryToSectionSummaries(fileSummary, previous);
        this.files[relativePath] = fileSummary;
        //now update the overall summary
        //if it's a new file i.e. no previous), then we update the filesAnalyzed count
        if (!previous) {
            this.summary.filesAnalyzed += 1;
        }
    }

    addJobs(job: string, relFiles: [string]) {
        this.setAnalysisState(AnalysisState.analyzing);
        relFiles.forEach((file: string) => {
            //create the jobs set if necessary then add message.job to it
            if (!this.jobStatus[file]) {
                this.jobStatus[file] = {
                    status: "processing",
                    jobs: [],
                };
            }
            this.jobStatus[file].status = "processing";
            if (!this.jobStatus[file].jobs.includes(job)) {
                this.jobStatus[file].jobs.push(job);
            }
        });
    }

    finishJob(
        job: string,
        relFile: string,
        summary: FileSummaryItem | null,
        error: Error | null
    ) {
        //update the file list
        if (summary) {
            this.updateWithFileSummary(summary, relFile);
        }
        //first remove the job from the list
        this.jobStatus[relFile].jobs = this.jobStatus[relFile].jobs.filter(
            (j) => j !== job
        );
        //if there are no more jobs, then remove the job from the jobStatus object.
        if (this.jobStatus[relFile].jobs?.length === 0) {
            delete this.jobStatus[relFile];
        }
    }

    finishAllJobs() {
        this.jobStatus = { ...emptyProjectData.jobStatus };
        this.setAnalysisState(AnalysisState.quiescent);
    }

    addQueue(jobs: string[], relFiles: string[]) {
        this.setAnalysisState(AnalysisState.analyzing);
        relFiles.forEach((file: string) => {
            //create the jobs set if necessary then add message.job to it
            if (!this.jobStatus[file]) {
                this.jobStatus[file] = {
                    status: "queued",
                    jobs: [],
                };
            }
            this.jobStatus[file].jobs = Array.from(
                new Set([...this.jobStatus[file].jobs, ...jobs])
            );
            this.jobStatus[file].status = "queued";
        });
    }

    setAnalysisState(state: AnalysisState) {
        this.uiState.analysisState = state;
    }

    static get default(): BoostProjectData {
        const boostProjectData = new BoostProjectData();
        Object.assign(boostProjectData, emptyProjectData);
        return boostProjectData;
    }
}

export function boostNotebookToFileSummaryItem(
    boostNotebook: boostnb.BoostNotebook
): FileSummaryItem {
    let workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri;

    const notebookRelFile =
        path.isAbsolute(boostNotebook.fsPath) && workspaceFolder
            ? path.relative(workspaceFolder.fsPath, boostNotebook.fsPath)
            : boostNotebook.fsPath;

    let summaryItem: FileSummaryItem = {
        sourceRelFile: boostNotebook.metadata.sourceFile as string,
        notebookRelFile: notebookRelFile,
        totalCells: boostNotebook.cells.length,
        completedCells: 0,
        errorCells: 0,
        issueCells: 0,
        sections: {},
    };

    boostNotebook.cells.forEach((cell) => {
        cell.outputs.forEach((output) => {
            let thisSection = summaryItem.sections[output.metadata.outputType];
            if (!thisSection) {
                thisSection = {
                    analysisType: output.metadata.outputType,
                    status: BoostProcessingStatus.notStarted,
                    completedCells: 0,
                    errorCells: 0,
                    issueCells: 0,
                    totalCells: boostNotebook.cells.length,
                    filesAnalyzed: 1,
                };
                summaryItem.sections[output.metadata.outputType] = thisSection;
            }
            output.items.forEach((outputItem) => {
                if (outputItem.mime === errorMimeType) {
                    thisSection.errorCells++;
                } else if (outputItem.data) {
                    thisSection.completedCells++;
                }
            });
            //now add the details if it exists on the output metadata.
            //if thisSection.details does not exist, then assign metadata.details to thisSection.details
            //otherwise merge the two arrays

            if (output.metadata.details && output.metadata.details.length > 0) {
                thisSection.issueCells++;
                if (!thisSection.details) {
                    thisSection.details = output.metadata.details;
                } else {
                    thisSection.details = thisSection.details.concat(
                        output.metadata.details
                    );
                }
            }
            //now set the status of the section
            if (thisSection.completedCells === thisSection.totalCells) {
                thisSection.status = BoostProcessingStatus.completed;
            } else if (thisSection.completedCells > 0) {
                thisSection.status = BoostProcessingStatus.incomplete;
            } else {
                thisSection.status = BoostProcessingStatus.notStarted;
            }
        });
    });

    //now go through and get the max value of all the section counts
    // An array of the property names you want to check for maximum values
    const propertiesToCheck = [
        "completedCells",
        "errorCells",
        "issueCells",
    ] as const;

    for (const sectionKey in summaryItem.sections) {
        const section = summaryItem.sections[sectionKey];

        propertiesToCheck.forEach((property) => {
            // Check if property exists in both summaryItem and section
            if (
                Object.prototype.hasOwnProperty.call(summaryItem, property) &&
                Object.prototype.hasOwnProperty.call(section, property)
            ) {
                summaryItem[property] = Math.max(
                    summaryItem[property],
                    section[property] || 0
                );
            }
        });
    }
    return summaryItem;
}

//NOTE! this will return a new FileSummaryItem object
export function boostNotebookFileToFileSummaryItem(
    file: vscode.Uri
): FileSummaryItem {
    const boostNotebook = new boostnb.BoostNotebook();
    boostNotebook.load(file.fsPath);
    return boostNotebookToFileSummaryItem(boostNotebook);
}
