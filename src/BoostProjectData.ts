import * as fs from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';

export const PROJECT_EXTENSION = ".boost-project";

export interface Summary {
    blueprintUrl: string;
    filesToAnalyze: number;
    filesAnalyzed: number;
}

export enum BoostProcessingStatus {
    completed = "completed",
    incomplete = "incomplete",
    processing = "processing",
    notStarted = "not-started"
}

export enum BoostAnalysisType {
    blueprint = "Blueprint",
    documentation = "Documentation",
    security = "Security Scan",
    compliance = "Compliance Scan"
}

export interface SectionSummary {
    analysis: BoostAnalysisType;
    status: BoostProcessingStatus;
    completed: number;
    total: number;
}

export interface Analysis {
    name: string;
    children: AnalysisNode[];
}

export interface AnalysisNode {
    name: string;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const sampleBoostProjectData : IBoostProjectData =
{
    summary: {
        blueprintUrl: "",
        filesToAnalyze: 42,
        filesAnalyzed: 0,
    },
    sectionSummary: [
        {
            analysis: BoostAnalysisType.blueprint,
            status: BoostProcessingStatus.completed,
            completed: 3,
            total: 6,
        },
        {
            analysis: BoostAnalysisType.documentation,
            status: BoostProcessingStatus.incomplete,
            completed: 3,
            total: 6,
        },
        {
            analysis: BoostAnalysisType.security,
            status: BoostProcessingStatus.processing,
            completed: 3,
            total: 6,
        },
        {
            analysis: BoostAnalysisType.compliance,
            status: BoostProcessingStatus.notStarted,
            completed: 3,
            total: 6,
        }
    ],
    securityAnalysis:
    [
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
        ],
    complianceAnalysis:
    [
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
        ],
    docAnalysis:
    [
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
};

const emptyProjectData : IBoostProjectData =
{
    summary: {
        blueprintUrl: "",
        filesToAnalyze: 0,
        filesAnalyzed: 0,
    },
    sectionSummary: [
        {
            analysis: BoostAnalysisType.blueprint,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            total: 0,
        },
        {
            analysis: BoostAnalysisType.documentation,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            total: 0,
        },
        {
            analysis: BoostAnalysisType.security,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            total: 0,
        },
        {
            analysis: BoostAnalysisType.compliance,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            total: 0,
        }
    ],
    securityAnalysis: [],
    complianceAnalysis: [],
    docAnalysis: []
};

export interface IBoostProjectData {
    summary: Summary;
    sectionSummary: SectionSummary[];
    securityAnalysis: Analysis[];
    complianceAnalysis: Analysis[];
    docAnalysis: Analysis[];
}

export class BoostProjectData implements IBoostProjectData {
    summary: Summary;
    sectionSummary: SectionSummary[];
    securityAnalysis: Analysis[];
    complianceAnalysis: Analysis[];
    docAnalysis: Analysis[];
  
    constructor() {
      this.summary = { blueprintUrl: '', filesToAnalyze: 0, filesAnalyzed: 0 };
      this.sectionSummary = [];
      this.securityAnalysis = [];
      this.complianceAnalysis = [];
      this.docAnalysis = [];
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
}