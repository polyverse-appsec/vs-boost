import * as fs from 'fs';
import * as path from 'path';
import { BoostUserAnalysisType } from './extension';

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
}

export const sampleBoostProjectData: IBoostProjectData = {
    summary: {
        projectName: "Your Project",
        summaryUrl: "",
        filesToAnalyze: 42,
        filesAnalyzed: 0,
        issues: [],
    },
    sectionSummary: [
        {
            analysisType: "archblueprintCode",
            status: BoostProcessingStatus.completed,
            completed: 3,
            error: 0,
            total: 6,
            filesAnalyzed: 3
        },
        {
            analysisType: "compliance",
            status: BoostProcessingStatus.incomplete,
            completed: 3,
            error: 0,
            total: 6,
            filesAnalyzed: 3
        },
        {
            analysisType: "bugAnalysis",
            status: BoostProcessingStatus.processing,
            completed: 3,
            error: 0,
            total: 6,
            filesAnalyzed: 3
        },
        {
            analysisType: "explain",
            status: BoostProcessingStatus.notStarted,
            completed: 3,
            error: 0,
            total: 6,
            filesAnalyzed: 3
        },
        {
            analysisType: "summary",
            status: BoostProcessingStatus.notStarted,
            completed: 17,
            error: 5,
            total: 26,
            filesAnalyzed: 3
        }
    ],
    analysis: [
        {
            name: BoostUserAnalysisType.security,
            children: [
                {
                    name: 'Security Topic 1',
                    children: [
                        { name: 'Security Subtopic 1.1' },
                        { name: 'Security Subtopic 1.2' }
                    ]
                },
                {
                    name: 'Security Topic 2',
                    children: [
                        { name: 'Security Subtopic 2.1' },
                        { name: 'Security Subtopic 2.2' },
                        { name: 'Security Subtopic 2.3' }
                    ]
                }
            ]
        },
        {
            name: BoostUserAnalysisType.compliance,
            children: [
                {
                    name: 'Compliance Topic 1',
                    children: [
                        { name: 'Compliance Subtopic 1.1' },
                        { name: 'Compliance Subtopic 1.2' }
                    ]
                },
                {
                    name: 'Compliance Topic 2',
                    children: [
                        { name: 'Compliance Subtopic 2.1' },
                        { name: 'Compliance Subtopic 2.2' },
                        { name: 'Compliance Subtopic 2.3' }
                    ]
                }
            ]
        },
        {
            name: "explain",
            children: [
                {
                    name: 'Topic 1',
                    children: [
                        { name: 'Subtopic 1.1' },
                        { name: 'Subtopic 1.2' }
                    ]
                },
                {
                    name: 'Topic 2',
                    children: [
                        { name: 'Subtopic 2.1' },
                        { name: 'Subtopic 2.2' },
                        { name: 'Subtopic 2.3' }
                    ]
                }
            ]
        }
    ],
    files: {}
};

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