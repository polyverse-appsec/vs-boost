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
    issues: string[];
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

export interface Analysis {
    name: string;
    children: AnalysisNode[];
}

export interface AnalysisNode {
    name: string;
    children?: AnalysisNode[];
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
    sectionSummary: SectionSummary[];
    analysis: Analysis[];
    files: {
        [filename: string]: FileSummaryItem;
    };
}

export const emptyProjectData: IBoostProjectData = {
    summary: {
        projectName: "",
        summaryUrl: "",
        filesToAnalyze: 0,
        filesAnalyzed: 0,
        issues: [],
    },
    sectionSummary: [
        {
            analysisType: "blueprint",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        {
            analysisType: "explain",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        {
            analysisType: "flowDiagram",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        {
            analysisType: "bugAnalyze",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        {
            analysisType: "compliance",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        },
        {
            analysisType: "summary",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
            filesAnalyzed: 0
        }
    ],
    analysis: [
        {
            name: "bugAnalyze",
            children: [],
        },
        {
            name: "compliance",
            children: [],
        },
        {
            name: "archblueprintCode",
            children: [],
        },
        {
            name: "flowDiagram",
            children: [],
        },
        {
            name: "explain",
            children: [],
        },
        {
            name: "summary",
            children: [],
        }
    ],
    files: {}
};

export class BoostProjectData implements IBoostProjectData {
    summary: Summary;
    sectionSummary: SectionSummary[];
    analysis: [];
    fsPath: string;
    files: {
        [filename: string]: FileSummaryItem;
    };

    constructor() {
        this.summary = { projectName: '', summaryUrl: '', filesToAnalyze: 0, filesAnalyzed: 0, issues: [] };
        this.sectionSummary = [];
        this.analysis = [];
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
        });
    });

    return summaryItem;
}

export function boostNotebookFileToFileSummaryItem(file: vscode.Uri): FileSummaryItem {
    const boostNotebook = new boostnb.BoostNotebook();
    boostNotebook.load(file.fsPath);
    return boostNotebookToFileSummaryItem(boostNotebook);
}

