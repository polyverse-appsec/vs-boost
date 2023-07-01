import * as fs from 'fs';
import * as path from 'path';
import { BoostUserAnalysisType } from './extension';
import * as boostnb from './jupyter_notebook';
import * as vscode from 'vscode';
import { errorMimeType } from './base_controller';

export const PROJECT_EXTENSION = ".boost-project";

export interface Summary {
    projectName: string
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
    notStarted = "not-started"
}

export interface SectionSummary {
    analysisType: string;
    status: BoostProcessingStatus;
    error: number;
    completed: number;
    total: number;
    filesAnalyzed: number;
    details?: Array<any>; // some sections, like security and compliance, will have a list of issues in the details section
}


export interface FileSummaryItem {
    sourceFile: string;
    total: number;
    completed: number;
    error: number;
    sections: {[key: string]: SectionSummary};
}

export interface IBoostProjectData {
    summary: Summary;
    sectionSummary: {
        [key: string]: SectionSummary;
    },
    files: {
        [key: string]: FileSummaryItem;
    };
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
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        explain: {
            analysisType: "explain",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        flowDiagram: {
            analysisType: "flowDiagram",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        bugAnalyze: {
            analysisType: "bugAnalyze",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        compliance: {
            analysisType: "compliance",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        summary: {
            analysisType: "summary",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        }
    },
    files: {}
};

export class BoostProjectData implements IBoostProjectData {
    summary: Summary;
    sectionSummary: {[key: string]: SectionSummary};
    fsPath: string;
    files: {
        [filename: string]: FileSummaryItem;
    };

    constructor() {
        this.summary = { ...emptyProjectData.summary };
        this.sectionSummary = {};
        //loop through the keys of the emptyProjectData.sectionSummary object and copy the values to the new object
        Object.keys(emptyProjectData.sectionSummary).forEach((key) => {
            this.sectionSummary[key] = { ...emptyProjectData.sectionSummary[key] };
        });
        this.fsPath = '';
        this.files = {};
    }

    create(jsonString: string): void {
        const projectData = JSON.parse(jsonString) as BoostProjectData;
        Object.assign(this, projectData);
    }

    load(filePath: string): void {
        const jsonString = fs.readFileSync(filePath, 'utf8');
        try {
            this.create(jsonString);
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new SyntaxError(`Could not parse notebook ${filePath} due to invalid JSON: ${e}`);
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
        const { fsPath, ...dataWithoutFsPath } = this;
        const projectDataJson = JSON.stringify(dataWithoutFsPath, null, 2);

        fs.writeFileSync(filename, projectDataJson, { encoding: 'utf8' });
    }

    flushToFS(): void {
        this.save(this.fsPath);
    }
    addFileSummaryToSectionSummaries(fileSummary: FileSummaryItem): void {
        const sections = Object.keys(fileSummary.sections);
        sections.forEach((section) => {
            const sectionSummary = this.sectionSummary[section];
            if (sectionSummary) {
                sectionSummary.total += fileSummary.sections[section].total;
                sectionSummary.completed += fileSummary.sections[section].completed;
                sectionSummary.error += fileSummary.sections[section].error;
                sectionSummary.filesAnalyzed++;
                if(sectionSummary.completed === sectionSummary.total){
                    sectionSummary.status = BoostProcessingStatus.completed;
                } else if(sectionSummary.completed > 0){
                    sectionSummary.status = BoostProcessingStatus.incomplete;
                } else {
                    sectionSummary.status = BoostProcessingStatus.notStarted;
                }
            }
        });
    }

    static get default(): BoostProjectData {
        const boostProjectData = new BoostProjectData();
        Object.assign(boostProjectData, emptyProjectData);
        return boostProjectData;
    }
};

export function boostNotebookToFileSummaryItem(boostNotebook: boostnb.BoostNotebook): FileSummaryItem
{
    let summaryItem: FileSummaryItem = {
        sourceFile: boostNotebook.metadata.filename as string,
        total: 0,
        completed: 0,
        error: 0,
        sections: {}
    };

    boostNotebook.cells.forEach((cell) => {
        cell.outputs.forEach((output) => {
            let thisSection = summaryItem.sections[output.metadata.outputType];
            if (!thisSection) {
                thisSection = {
                    analysisType: output.metadata.outputType,
                    status: BoostProcessingStatus.notStarted,
                    completed: 0,
                    error: 0,
                    total: 0,
                    filesAnalyzed: 1
                };
                summaryItem.sections[output.metadata.outputType] = thisSection;
            }
            output.items.forEach((outputItem) => {
                thisSection.total++;
                summaryItem.total++;
                if (outputItem.mime === errorMimeType) {
                    thisSection.error++;
                    summaryItem.error++;
                } else if (outputItem.data) {
                    thisSection.completed++;
                    summaryItem.completed++;
                }
            });
            //now add the details if it exists on the output metadata.
            //if thisSection.details does not exist, then assign metadata.details to thisSection.details
            //otherwise merge the two arrays

            if (output.metadata.details) {
                if(!thisSection.details ){
                    thisSection.details = output.metadata.details;
                } else {
                    thisSection.details = thisSection.details.concat(output.metadata.details);
                }
            }
            //now set the status of the section
            if( thisSection.completed === thisSection.total){
                thisSection.status = BoostProcessingStatus.completed;
            } else if(thisSection.completed > 0){
                thisSection.status = BoostProcessingStatus.incomplete;
            } else {   
                thisSection.status = BoostProcessingStatus.notStarted;
            }
        });
    });

    return summaryItem;
}

export function boostNotebookFileToFileSummaryItem(file: vscode.Uri): FileSummaryItem {
    const boostNotebook = new boostnb.BoostNotebook();
    boostNotebook.load(file.fsPath);
    return boostNotebookToFileSummaryItem(boostNotebook);
}

