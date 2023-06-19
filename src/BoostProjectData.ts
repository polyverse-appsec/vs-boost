import * as fs from 'fs';
import { type } from 'os';
import * as path from 'path';
import * as vscode from 'vscode'; 

export const PROJECT_EXTENSION = ".boost-project";

export interface Summary {
    summaryUrl: string;
    filesToAnalyze: number;
    filesAnalyzed: number;
    issues: string [];
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
}

export interface Analysis {
    name: string;
    children: AnalysisNode[];
}

export interface AnalysisNode {
    name: string;
    children?: AnalysisNode[];
}

export const sampleBoostProjectData: IBoostProjectData = {
    summary: {
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
        },
        {
            analysisType: "compliance",
            status: BoostProcessingStatus.incomplete,
            completed: 3,
            error: 0,
            total: 6,
        },
        {
            analysisType: "bugAnalysis",
            status: BoostProcessingStatus.processing,
            completed: 3,
            error: 0,
            total: 6,
        },
        {
            analysisType: "explain",
            status: BoostProcessingStatus.notStarted,
            completed: 3,
            error: 0,
            total: 6,
        },
        {
            analysisType: "summary",
            status: BoostProcessingStatus.notStarted,
            completed: 17,
            error: 5,
            total: 26,
        }
    ],
    analysis: [
        {
            name: "security",
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
            name: "compliance",
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
    ]
};

export interface IBoostProjectData {
    summary: Summary;
    sectionSummary: SectionSummary[];
    analysis: Analysis[];
}

export const emptyProjectData: IBoostProjectData = {
    summary: {
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
        },
        {
            analysisType: "explain",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        },
        {
            analysisType: "flowDiagram",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        },
        {
            analysisType: "bugAnalyze",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        },
        {
            analysisType: "compliance",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        },
        {
            analysisType: "summary",
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
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
    ]
};

export class BoostProjectData implements IBoostProjectData {
    summary: Summary;
    sectionSummary: SectionSummary[];
    analysis: [];
  
    constructor() {
      this.summary = { summaryUrl: '', filesToAnalyze: 0, filesAnalyzed: 0, issues: [] };
      this.sectionSummary = [];
      this.analysis = [];
    }
  
    create(jsonString: string): void {
      const projectData = JSON.parse(jsonString) as BoostProjectData;
      Object.assign(this, projectData);
    }
  
    load(filePath: string): void {
      const jsonString = fs.readFileSync(filePath, 'utf8');
      this.create(jsonString);
    }
  
    save(filename: string): void {
      const projectDataJson = JSON.stringify(this, null, 2);
  
      // Create any necessary folders
      const folderPath = path.dirname(filename);
      fs.mkdirSync(folderPath, { recursive: true });
  
      fs.writeFileSync(filename, projectDataJson, { encoding: 'utf8' });
    }

    static get default(): BoostProjectData {
        const boostProjectData = new BoostProjectData();
        Object.assign(boostProjectData, emptyProjectData);
        return boostProjectData;
    }
};