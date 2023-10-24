
import { AnalysisTypesState } from './boostprojectdata_interface';

export interface ProjectContextData {
    projectSummary: {
        project: string | null;
        files: {
            total: number | null;
            analyzed: number | null;
            ignored: number | null;
        };
        analysisState: string | null;
        analysisMode: string | null;
        types: AnalysisTypesState | null;
        issues: any[];
    };
    account: any;
    analysisSummary: {
        keys: string[];
        [key: string]: (string | number | null)[] | string[];
    };
    analyzedFiles: {
        [fileName: string]: string;
    };
}
