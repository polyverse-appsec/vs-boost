import {
  provideVSCodeDesignSystem,
  vsCodeButton
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton());

//to get a recompile
//another comment