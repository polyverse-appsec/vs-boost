import {
  provideVSCodeDesignSystem,
  vsCodeBadge,
  vsCodeButton,
  vsCodeDataGrid,
  vsCodeDataGridCell,
  vsCodeDataGridRow,
  vsCodeCheckbox
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeBadge(), vsCodeDataGrid(), vsCodeDataGridCell(), vsCodeDataGridRow(), vsCodeCheckbox());
console.log('hello world XXYYZZ');
console.log("hello world XXYYZZ again");
//to get a recompile
//another comment
//try again