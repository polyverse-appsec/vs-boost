export enum AnalysisContextType {
    projectSummary = "projectSummary",
    userFocus = "userFocus",
    history = "history",
    related = "related",
}

export interface IAnalysisContextData {
    type: AnalysisContextType;
    data: string;
    name: string;
}
