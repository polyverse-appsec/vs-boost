export enum AnalysisContextType {
    projectSummary = "projectSummary",
    userFocus = "userFocus",
    history = "history",
    related = "related",
    training = "training",
}

export interface IAnalysisContextData {
    type: AnalysisContextType;
    data: any;
    name: string;
}
